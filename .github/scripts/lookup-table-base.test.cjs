const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const script = path.join(__dirname, 'lookup-table-base.sh');
function lookup(mode, seed = '') {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cube-table-lookup-'));
  try {
    const calls = path.join(directory, 'calls');
    const output = path.join(directory, 'output');
    fs.writeFileSync(output, '');
    fs.writeFileSync(path.join(directory, 'docker'), `#!/bin/sh
printf '%s\\n' "$*" >> "$CALLS"
if [ "$3" = inspect ]; then
  case "$MODE" in
    found) exit 0;;
    missing) echo 'manifest unknown: not found' >&2; exit 1;;
    denied) echo 'unauthorized: authentication required' >&2; exit 1;;
    timeout) echo 'TLS handshake timeout' >&2; exit 1;;
  esac
fi
exit 0
`, {mode: 0o755});
    const result = spawnSync('bash', [script], {encoding: 'utf8', env: {...process.env,
      PATH: directory + path.delimiter + process.env.PATH, MODE: mode, CALLS: calls,
      GITHUB_OUTPUT: output, TABLES_TAG: 'versioned-base', TABLES_SEED: seed}});
    if (result.error) throw result.error;
    return {code: result.status, calls: fs.readFileSync(calls, 'utf8'), output: fs.readFileSync(output, 'utf8')};
  } finally {fs.rmSync(directory, {recursive: true, force: true});}
}
test('existing table version skips building and seeding', () => {
  const result = lookup('found', 'published-solver');
  assert.equal(result.code, 0);
  assert.equal(result.output, 'exists=true\n');
  assert.doesNotMatch(result.calls, /create/);
});
test('identical published table inputs seed a version without table downloads', () => {
  const result = lookup('missing', 'published-solver');
  assert.equal(result.code, 0);
  assert.equal(result.output, 'exists=true\n');
  assert.match(result.calls, /create --prefer-index=false --tag versioned-base published-solver/);
});
test('new table inputs schedule a build only on a genuine registry miss', () => {
  const result = lookup('missing');
  assert.equal(result.code, 0);
  assert.equal(result.output, 'exists=false\n');
  assert.doesNotMatch(result.calls, /create/);
  for (const mode of ['denied', 'timeout']) {
    const failure = lookup(mode, 'published-solver');
    assert.equal(failure.code, 1);
    assert.equal(failure.output, '');
    assert.doesNotMatch(failure.calls, /create/);
  }
});
