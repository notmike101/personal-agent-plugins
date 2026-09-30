const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8').replace(/^\uFEFF/, ''));
const omp = read('.omp-plugin/marketplace.json');
const codex = read('.agents/plugins/marketplace.json');
assert.equal(omp.name, 'personal-agent-plugins');
assert.equal(codex.name, omp.name);
assert.deepEqual(codex.plugins.map(p => p.name).sort(), omp.plugins.map(p => p.name).sort());
for (const entry of omp.plugins) {
  const other = codex.plugins.find(p => p.name === entry.name);
  assert.equal(other.source.source, 'local');
  assert.equal(other.source.path, entry.source);
  const dir = entry.source;
  const a = read(`${dir}/.claude-plugin/plugin.json`);
  const b = read(`${dir}/.codex-plugin/plugin.json`);
  const pkg = read(`${dir}/package.json`);
  const lock = read(`${dir}/package-lock.json`);
  for (const manifest of [a, b, pkg, lock]) {
    assert.equal(manifest.name, entry.name);
    assert.equal(manifest.version, entry.version);
  }
  assert.equal(lock.packages[''].version, entry.version);
  assert.deepEqual(lock.packages[''].dependencies, pkg.dependencies);
  assert.equal(a.skills, b.skills);
  assert(fs.existsSync(path.join(root, dir, a.skills, entry.name, 'SKILL.md')));
}
console.log('Codex and OMP catalogs, paths, manifests, and versions agree.');
