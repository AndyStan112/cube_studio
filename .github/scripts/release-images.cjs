const SERVICES = ["frontend", "backend", "solver"];
const imageName = service => `ghcr.io/andystan112/cube_studio-${service}`;

function validateImages(images) {
  if (!images || Object.keys(images).sort().join() !== [...SERVICES].sort().join())
    throw new Error("Expected exactly frontend, backend and solver images");
  for (const service of SERVICES) {
    const reference = images[service];
    const prefix = imageName(service);
    if (typeof reference !== "string" || !(
      reference.startsWith(`${prefix}@sha256:`) && /^[a-f0-9]{64}$/.test(reference.slice(prefix.length + 8)) ||
      reference.startsWith(`${prefix}:`) && /^[a-f0-9]{40}$/.test(reference.slice(prefix.length + 1))
    )) throw new Error(`Invalid pinned ${service} image`);
  }
  return images;
}
function validateTables(tables) {
  if (tables == null) return;
  const prefix = `${imageName("solver")}@sha256:`;
  if (!/^[a-f0-9]{64}$/.test(tables.key) ||
      typeof tables.image !== "string" || !tables.image.startsWith(prefix) ||
      !/^[a-f0-9]{64}$/.test(tables.image.slice(prefix.length)))
    throw new Error("Invalid pinned table base");
}

// Deliberately accept only this repository's small, controlled image stanza.
// Unexpected shapes fail closed instead of changing the wrong image.
const stanza = /^([ \t]*)- name: cube-(frontend|backend|solver)\r?\n([ \t]*)newName: (\S+)\r?\n\3(newTag|digest): (\S+)/gm;
function imageBlocks(manifest) {
  const blocks = [...manifest.matchAll(stanza)];
  if (blocks.length !== 3 || new Set(blocks.map(block => block[2])).size !== 3 ||
      (manifest.match(/^[ \t]*(?:newTag|digest):/gm) || []).length !== 3 ||
      (manifest.match(/^[ \t]*newName:/gm) || []).length !== 3)
    throw new Error("Expected three named image references");
  for (const block of blocks) if (block[4] !== imageName(block[2])) throw new Error("Unexpected image repository");
  return blocks;
}
function readImages(manifest) {
  const images = Object.fromEntries(imageBlocks(manifest).map(block => [block[2],
    `${block[4]}${block[5] === "digest" ? "@" : ":"}${block[6]}`]));
  return validateImages(images);
}
function renderImages(manifest, images) {
  validateImages(images);
  imageBlocks(manifest);
  return manifest.replace(stanza, (_, indent, service, fields) => {
    const image = images[service], digest = image.includes("@");
    const value = image.slice(imageName(service).length + 1);
    return `${indent}- name: cube-${service}\n${fields}newName: ${imageName(service)}\n${fields}${digest ? "digest" : "newTag"}: ${value}`;
  });
}
module.exports = { SERVICES, imageName, validateImages, validateTables, readImages, renderImages };
