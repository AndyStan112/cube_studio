const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {SERVICES, imageName, readImages, renderImages, validateImages} = require('./release-images.cjs');
const {createPlan, changedServices, changedFiles, tableKey, loadBaseline, selectImages} = require('./release-plan.cjs');
const sha = 'a'.repeat(40), old = 'b'.repeat(40), key = 'c'.repeat(64);
const images = Object.fromEntries(SERVICES.map((name, i) => [name, `${imageName(name)}@sha256:${String(i + 1).repeat(64)}`]));
const baseline = {source: old, deployment: 'd'.repeat(40), images};
const manifest = fs.readFileSync(path.join(__dirname, '../../deploy/app/kustomization.yaml'), 'utf8');
const plan = options => createPlan({sha, baseline, tablesKey: key, seedKey: key, ...options});

test('frontend-only change reuses the exact backend and solver digests', () => {
  const result = plan({files: ['frontend/src/lib/cameraVision.ts']});
  assert.deepEqual(result.build, ['frontend']);
  assert.equal(result.images.frontend, `${imageName('frontend')}:${sha}`);
  assert.equal(result.images.backend, images.backend);
  assert.equal(result.images.solver, images.solver);
  assert.equal(result.tables.seed, images.solver);
});
test('selects affected services, shared build changes, configuration-only releases and bootstrap', () => {
  assert.deepEqual(changedServices(['backend/app/main.py', 'solver/src/main.rs']), ['backend', 'solver']);
  assert.deepEqual(changedServices(['compose.yaml', 'deploy/app/frontend.yaml', '.github/workflows/release.yaml']), []);
  assert.deepEqual(changedServices(['.github/workflows/build-image.yaml']), SERVICES);
  assert.deepEqual(plan({baseline: null}).build, SERVICES);
  assert.deepEqual(plan({files: [], force: true}).build, SERVICES);
  const config = plan({files: ['deploy/app/frontend.yaml']});
  assert.deepEqual(config.build, []);
  assert.deepEqual(config.images, images);
});
test('new digests are required only for selected builds and integration keeps all other pins', () => {
  const p = plan({files: ['frontend/src/App.tsx']});
  assert.throws(() => selectImages(p, {}), /Missing built frontend/);
  assert.throws(() => selectImages(p, {frontend: 'evil/image:latest'}), /Missing built/);
  assert.deepEqual(selectImages(p, {frontend: images.frontend}), images);
  assert.deepEqual(selectImages(plan({files: []}), {}), images);
});
test('manifest publication round-trips mixed legacy tags and digests by service name', () => {
  const mixed = {...images, backend: `${imageName('backend')}:${old}`};
  const rendered = renderImages(manifest, mixed);
  assert.deepEqual(readImages(rendered), mixed);
  assert.equal((rendered.match(/digest: sha256:/g) || []).length, 2);
  assert.equal((rendered.match(/newTag:/g) || []).length, 1);
  for (const value of ['latest', sha.slice(0, 7), 'other-registry/image@sha256:' + '1'.repeat(64)])
    assert.throws(() => validateImages({...images, frontend: value}), /Invalid pinned/);
  assert.throws(() => renderImages(manifest.replace('cube-backend', 'cube-frontend'), images), /three named/);
  assert.throws(() => renderImages(manifest.replace('cube_studio-backend', 'other-backend'), images), /repository/);
  assert.throws(() => readImages(manifest + '\n    digest: sha256:' + 'f'.repeat(64)), /three named/);
});
function baselineApi(record, deployed = renderImages(manifest, images)) {
  return {rest: {git: {getRef: async () => ({data: {object: {sha: baseline.deployment}}})},
    repos: {getContent: async ({path}) => {
      if (path === 'deploy/release.json' && !record) throw Object.assign(Error('missing'), {status: 404});
      return {data: {content: Buffer.from(path === 'deploy/release.json' ? JSON.stringify(record) : deployed).toString('base64')}};
    }}}};
}
test('reads the last successful deployment record, not the previous push', async () => {
  const result = await loadBaseline(baselineApi({schema: 1, source: old, images}), {repo: {owner: 'AndyStan112', repo: 'cube_studio'}});
  assert.equal(result.source, old);
  assert.equal(result.deployment, baseline.deployment);
  assert.deepEqual(result.images, images);
});
test('migrates the old release format and fails closed on corrupt/mismatched metadata', async () => {
  const ctx = {repo: {owner: 'AndyStan112', repo: 'cube_studio'}};
  const legacy = Object.fromEntries(SERVICES.map(name => [name, `${imageName(name)}:${old}`]));
  assert.equal((await loadBaseline(baselineApi(null, renderImages(manifest, legacy)), ctx)).source, old);
  assert.equal((await loadBaseline(baselineApi(null), ctx)).source, null);
  await assert.rejects(loadBaseline(baselineApi({schema: 1, source: old, images: legacy}), ctx), /disagree/);
  await assert.rejects(loadBaseline(baselineApi({schema: 9, source: old, images}), ctx), /Invalid release/);
  const missing = {rest: {git: {getRef: async () => {throw Object.assign(Error('missing'), {status: 404});}}}};
  assert.equal(await loadBaseline(missing, ctx), null);
});
test('table base changes only for engine/table preparation inputs, not runtime code', () => {
  const docker = `FROM python:3.13-slim-bookworm AS nxn\nARG NXN_REVISION=abc\nRUN fetch "$NXN_REVISION"\nRUN python /opt/nxn/prepare.py\nFROM nxn\nCOPY nxn /opt/nxn\n`;
  const files = {'solver/Dockerfile': docker, 'solver/nxn/prepare.py': 'download tables', 'solver/nxn/tables.json': '["one"]'};
  const hash = overrides => tableKey(p => Buffer.from({...files, ...overrides}[p]));
  const before = hash({});
  assert.equal(hash({'solver/Dockerfile': docker.replace('COPY nxn /opt/nxn', 'COPY nxn /opt/new-path')}), before);
  assert.equal(hash({'solver/Dockerfile': docker.replace('AS nxn\n', 'AS nxn-tables\n').replace('FROM nxn\n', 'FROM rust:1 AS build\nCOPY src /src\nFROM remote-base\n')}), before);
  assert.notEqual(hash({'solver/Dockerfile': docker.replace('NXN_REVISION=abc', 'NXN_REVISION=def')}), before);
  assert.notEqual(hash({'solver/nxn/prepare.py': 'new downloader'}), before);
  assert.notEqual(hash({'solver/nxn/tables.json': '["two"]'}), before);
  assert.equal(plan({seedKey: '0'.repeat(64)}).tables.seed, null);
  const stored = {key, image: `${imageName('solver')}@sha256:${'e'.repeat(64)}`};
  const reuse = plan({baseline: {...baseline, tables: stored}});
  assert.equal(reuse.tables.image, stored.image);
  assert.equal(reuse.tables.seed, stored.image);
  assert.throws(() => tableKey(() => Buffer.from('FROM scratch')), /stage is missing/);
});
test('diffs include failed intervening changes and both ends of cross-service renames', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cube-release-plan-'));
  const git = (...args) => execFileSync('git', args, {cwd: directory, encoding: 'utf8'}).trim();
  const commit = message => {git('add', '.');git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', message);return git('rev-parse', 'HEAD');};
  try {
    git('init', '-q');fs.mkdirSync(path.join(directory, 'frontend'));fs.writeFileSync(path.join(directory, 'frontend/file'), 'original');
    const released = commit('released');
    fs.writeFileSync(path.join(directory, 'frontend/file'), 'failed release edit');commit('failed push');
    fs.mkdirSync(path.join(directory, 'backend'));fs.renameSync(path.join(directory, 'frontend/file'), path.join(directory, 'backend/file'));
    const current = commit('move after failed push');
    assert.deepEqual(changedFiles(released, current, directory).sort(), ['backend/file', 'frontend/file']);
  } finally {fs.rmSync(directory, {recursive: true, force: true});}
});
