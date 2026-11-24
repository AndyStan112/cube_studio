const { createHash } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { SERVICES, imageName, validateImages, validateTables, readImages } = require("./release-images.cjs");

function tableKey(read) {
  const dockerfile = read("solver/Dockerfile").toString();
  const lines = dockerfile.split(/\r?\n/);
  const start = lines.findIndex(line => /^FROM python:\S+ AS nxn(?:-tables)?$/.test(line));
  if (start < 0) throw new Error("Pinned NxN table stage is missing");
  let end = lines.findIndex((line, i) => i > start && /^FROM /.test(line));
  if (end < 0) end = lines.length;
  const stage = lines.slice(start, end).filter(line => line.trim() && !line.trim().startsWith("#"))
    .join("\n").replace(/ AS nxn(?:-tables)?\n/, " AS nxn-tables\n");
  const hash = createHash("sha256");
  const firstStage = lines.findIndex(line => /^FROM /.test(line));
  hash.update(lines.slice(0, firstStage).filter(line => /^ARG /.test(line) && !/^ARG SOLVER_TABLES_IMAGE[= ]/.test(line)).join("\n"));
  hash.update(stage);
  for (const path of ["solver/nxn/prepare.py", "solver/nxn/tables.json"])
    hash.update(path).update("\0").update(read(path)).update("\0");
  return hash.digest("hex");
}
function changedServices(files) {
  if (files.includes(".github/workflows/build-image.yaml")) return SERVICES;
  return SERVICES.filter(service => files.some(path => path.startsWith(`${service}/`)));
}
function changedFiles(base, head, cwd) {
  // No rename detection: moving a file across services affects both contexts.
  return execFileSync("git", ["diff", "--no-renames", "--name-only", "-z", base, head, "--"],
    {cwd, encoding: "utf8", maxBuffer: 16 * 1024 * 1024}).split("\0").filter(Boolean);
}
function createPlan({ sha, baseline = null, files = [], force = false, tablesKey, seedKey }) {
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error("Invalid release source SHA");
  if (!/^[a-f0-9]{64}$/.test(tablesKey)) throw new Error("Invalid table version");
  if (baseline) validateImages(baseline.images);
  const build = force || !baseline ? SERVICES : changedServices(files);
  const images = Object.fromEntries(SERVICES.map(service => [service,
    build.includes(service) ? `${imageName(service)}:${sha}` : baseline.images[service]]));
  return {schema: 1, source: sha, baseline: baseline?.deployment ?? null, build, images,
    tables: {key: tablesKey, tag: `${imageName("solver")}:tables-${tablesKey}`,
      seed: baseline && seedKey === tablesKey
        ? baseline.tables?.key === tablesKey ? baseline.tables.image : baseline.images.solver
        : null,
      image: baseline?.tables?.key === tablesKey ? baseline.tables.image : null}};
}
async function loadBaseline(github, context) {
  const args = context.repo;
  let deployment;
  try { deployment = (await github.rest.git.getRef({...args, ref: "heads/deployments"})).data.object.sha; }
  catch (error) {if (error.status === 404) return null; throw error;}
  async function content(path) {
    const {data} = await github.rest.repos.getContent({...args, path, ref: deployment});
    return Buffer.from(data.content, "base64").toString("utf8");
  }
  const images = readImages(await content("deploy/app/kustomization.yaml"));
  try {
    const record = JSON.parse(await content("deploy/release.json"));
    if (record.schema !== 1 || !/^[a-f0-9]{40}$/.test(record.source)) throw new Error("Invalid release record");
    validateImages(record.images);
    validateTables(record.tables);
    if (SERVICES.some(service => record.images[service] !== images[service])) throw new Error("Release record and manifests disagree");
    return {...record, deployment};
  } catch (error) {
    if (error.status !== 404) throw error;
    // Migrate the old all-images-at-one-commit format without rebuilding them.
    const versions = SERVICES.map(service => images[service].split(":").at(-1));
    const source = versions.every(value => value === versions[0]) && /^[a-f0-9]{40}$/.test(versions[0]) ? versions[0] : null;
    return {source, images, deployment};
  }
}
async function planRelease({github, context, core}) {
  if (context.ref !== "refs/heads/master") throw new Error("Releases must come from master");
  const baseline = await loadBaseline(github, context);
  const read = path => readFileSync(path);
  const key = tableKey(read);
  const requested = context.payload?.inputs?.rebuild_all;
  let files = [], force = requested === true || requested === "true", seedKey;
  if (baseline?.source) {
    try {
      files = changedFiles(baseline.source, context.sha);
      seedKey = tableKey(path => execFileSync("git", ["show", `${baseline.source}:${path}`]));
    } catch {force = true; core.notice("Previous source unavailable; rebuilding all services safely");}
  } else force = true;
  const plan = createPlan({sha: context.sha, baseline, files, force, tablesKey: key, seedKey});
  for (const service of SERVICES) core.setOutput(service, String(plan.build.includes(service)));
  core.setOutput("plan", JSON.stringify(plan));
  core.notice(`Build: ${plan.build.join(", ") || "none"}; reuse all other pinned images`);
  return plan;
}
function selectImages(plan, built) {
  const images = {...plan.images};
  for (const service of plan.build) {
    if (!built[service]?.startsWith(`${imageName(service)}@sha256:`)) throw new Error(`Missing built ${service} digest`);
    images[service] = built[service];
  }
  return validateImages(images);
}
module.exports = { tableKey, changedServices, changedFiles, createPlan, loadBaseline, planRelease, selectImages };
