const test = require("node:test");
const assert = require("node:assert/strict");
const publish = require("./publish-deployment.cjs");
const sourceSha = "a".repeat(40);
const {SERVICES, imageName, readImages} = require("./release-images.cjs");
const fs = require("node:fs"), path = require("node:path");
const template = fs.readFileSync(path.join(__dirname, "../../deploy/app/kustomization.yaml"), "utf8");
const images = Object.fromEntries(SERVICES.map((service, i) => [service, `${imageName(service)}@sha256:${String(i + 1).repeat(64)}`]));
function fixture({
  exists = true,
  same = false,
  truncated = false,
  manifest = template,
  changed = false,
} = {}) {
  const writes = [];
  const context = {
    ref: "refs/heads/master",
    sha: sourceSha,
    repo: { owner: "owner", repo: "repo" },
  };
  const blob = (path) => ({
    path,
    mode: "100644",
    type: "blob",
    sha: "source-blob",
  });
  const github = {
    rest: {
      repos: {
        getContent: async ({ ref }) => {
          assert.equal(ref, sourceSha);
          return {
            data: { content: Buffer.from(manifest).toString("base64") },
          };
        },
      },
      git: {
        getTree: async ({ tree_sha }) => {
          assert.equal(tree_sha, sourceSha);
          return {
            data: {
              truncated,
              tree: [
                blob("deploy/app/kustomization.yaml"),
                blob("deploy/app/nested/service.yaml"),
                blob(".github/workflows/release.yaml"),
                blob("backend/app/main.py"),
              ],
            },
          };
        },
        getRef: async () => {
          if (!exists)
            throw Object.assign(new Error("missing"), { status: 404 });
          return { data: { object: { sha: changed ? "concurrent-release" : "previous-release" } } };
        },
        getCommit: async () => ({
          data: { tree: { sha: same ? "new-tree" : "old-tree" } },
        }),
        createTree: async (input) => {
          writes.push(["tree", input]);
          return { data: { sha: "new-tree" } };
        },
        createCommit: async (input) => {
          writes.push(["commit", input]);
          return { data: { sha: "new-release" } };
        },
        updateRef: async (input) => {
          writes.push(["update", input]);
        },
        createRef: async (input) => {
          writes.push(["create", input]);
        },
      },
    },
  };
  return { github, context, core: { notice() {} }, writes, tested: {schema: 1, source: sourceSha, baseline: exists ? "previous-release" : null, images} };
}
test("publishes the tested manifest snapshot only to deployments", async () => {
  const f = fixture();
  await publish(f);
  const tree = f.writes.find(([type]) => type === "tree")[1];
  assert.equal(tree.base_tree, undefined); // Old/deleted manifests cannot linger.
  assert.deepEqual(
    tree.tree.map((entry) => entry.path),
    ["deploy/app/kustomization.yaml", "deploy/app/nested/service.yaml", "deploy/release.json"],
  );
  assert.equal(tree.tree[0].sha, undefined);
  assert.deepEqual(readImages(tree.tree[0].content), images);
  const record = JSON.parse(tree.tree[2].content);
  assert.equal(record.source, sourceSha);
  assert.deepEqual(record.images, images);
  assert.equal(tree.tree[1].sha, "source-blob");
  const commit = f.writes.find(([type]) => type === "commit")[1];
  assert.deepEqual(commit.parents, ["previous-release"]);
  assert.match(commit.message, /^chore\(deploy\): /);
  const update = f.writes.find(([type]) => type === "update")[1];
  assert.equal(update.ref, "heads/deployments");
  assert.equal(update.force, false);
});
test("creates an independent deployment branch automatically on first release", async () => {
  const f = fixture({ exists: false });
  await publish(f);
  assert.deepEqual(f.writes.find(([type]) => type === "commit")[1].parents, []);
  assert.equal(
    f.writes.find(([type]) => type === "create")[1].ref,
    "refs/heads/deployments",
  );
});
test("rerunning the same release creates no additional commit", async () => {
  const f = fixture({ same: true });
  await publish(f);
  assert.deepEqual(
    f.writes.map(([type]) => type),
    ["tree"],
  );
});
test("rejects incomplete source or malformed image references before publishing", async () => {
  for (const options of [
    { truncated: true },
    { manifest: "newTag: only-one\n" },
  ]) {
    const f = fixture(options);
    await assert.rejects(publish(f));
    assert.equal(f.writes.length, 0);
  }
  const f = fixture();
  f.context.ref = "refs/heads/deployments";
  await assert.rejects(publish(f), /master/);
  assert.equal(f.writes.length, 0);
});

test("refuses a stale baseline or a release that did not test these images", async () => {
  const stale = fixture({changed: true});
  await assert.rejects(publish(stale), /changed after image selection/);
  assert.equal(stale.writes.length, 0);
  const untested = fixture();
  untested.tested.source = 'wrong-source';
  await assert.rejects(publish(untested), /tested image selection/);
  assert.equal(untested.writes.length, 0);
  const mutable = fixture();
  mutable.tested.images = {...images, frontend: imageName('frontend') + ':master'};
  await assert.rejects(publish(mutable), /Invalid pinned/);
  assert.equal(mutable.writes.length, 0);
  const badTables = fixture();
  badTables.tested.tables = {key: 'a'.repeat(64), image: 'untrusted/base:latest'};
  await assert.rejects(publish(badTables), /Invalid pinned table/);
  assert.equal(badTables.writes.length, 0);
});
