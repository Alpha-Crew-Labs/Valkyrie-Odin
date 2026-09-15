import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const proto = path.join(root, 'prototype', 'valkyrie-v2.5');
const required = ['index.html', 'styles.css', 'bootstrap.js', 'data.js', 'core.js', 'view.js', 'interaction.js'];

function assert(condition, message) {
  if (!condition) {
    console.error(`✗ ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`✓ ${message}`);
  }
}

for (const file of required) assert(fs.existsSync(path.join(proto, file)), `v2.5 file exists: ${file}`);
if (process.exitCode) process.exit(process.exitCode);

const index = fs.readFileSync(path.join(proto, 'index.html'), 'utf8');
for (const ref of ['./styles.css', './bootstrap.js', './data.js', './core.js', './view.js', './interaction.js']) {
  assert(index.includes(ref), `v2.5 index references ${ref}`);
}
assert(!/https?:\/\//i.test(index), 'v2.5 index has no external HTTP runtime dependency');
assert(index.includes("script-src 'self'"), "v2.5 CSP restricts scripts to 'self'");
assert(index.includes("style-src 'self' 'unsafe-inline'"), "v2.5 CSP allows the local stylesheet");
assert(index.includes('Motion System v2.5'), 'v2.5 title marker is present');

const htmlIds = new Set([...index.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
const runtimeFiles = ['core.js', 'view.js', 'interaction.js'];
const runtimeStaticIds = new Set();
for (const file of runtimeFiles) {
  const src = fs.readFileSync(path.join(proto, file), 'utf8');
  for (const m of src.matchAll(/getElementById\(["']([^"']+)["']\)/g)) runtimeStaticIds.add(m[1]);
}
const generatedAtRuntime = new Set(['n_sig_rates','sdl1','sdl2','sdt']);
for (const id of [...runtimeStaticIds].sort()) {
  assert(htmlIds.has(id) || generatedAtRuntime.has(id), `runtime DOM id is available: #${id}`);
}

assert(/class="[^"]*chip[^"]*"[^>]*data-q="[^"]+"[^>]*data-n="[^"]+"/.test(index), 'command chips expose data-q and data-n');
assert((index.match(/class="[^"]*tab[^"]*"[^>]*data-t="(?:MACRO|RATES|EQUITY)"/g) || []).length === 3, 'three domain tabs expose data-t');

const source = fs.readFileSync(path.join(proto, 'data.js'), 'utf8');
const sandbox = { console };
vm.createContext(sandbox);
try {
  vm.runInContext(source, sandbox, { filename: 'data.js' });
  console.log('✓ v2.5 data.js evaluates in isolated VM');
} catch (error) {
  console.error(error.stack || error.message);
  process.exit(1);
}

const { NODES, EDGES, SNAPS, META } = sandbox;
assert(Array.isArray(NODES) && NODES.length === 16, `v2.5 has exactly 16 objects (found ${NODES?.length})`);
assert(Array.isArray(EDGES) && EDGES.length === 22, `v2.5 has exactly 22 relations (found ${EDGES?.length})`);
assert(Array.isArray(SNAPS) && SNAPS.length === 5, `v2.5 has exactly 5 snapshots (found ${SNAPS?.length})`);

const ids = new Set(NODES.map((n) => n.id));
assert(ids.size === NODES.length, 'v2.5 object IDs are unique');
for (const [edgeId, from, to, sign] of EDGES) {
  assert(ids.has(from), `${edgeId} source exists: ${from}`);
  assert(ids.has(to), `${edgeId} target exists: ${to}`);
  assert(sign === 'POS' || sign === 'NEG', `${edgeId} sign is supported: ${sign}`);
}

const terminals = NODES.filter((n) => n.T);
assert(terminals.length === 3, 'v2.5 has three terminal signals');
for (const node of NODES.filter((n) => !n.T)) assert(Boolean(META[node.id]), `metadata exists for ${node.id}`);
for (const snap of SNAPS) {
  assert(Boolean(snap.d), 'snapshot has date');
  for (const node of NODES.filter((n) => !n.T)) assert(Boolean(snap.v?.[node.id]), `${snap.d} has state for ${node.id}`);
  for (const node of terminals) {
    const signal = snap.sig?.[node.id];
    assert(Boolean(signal), `${snap.d} has signal ${node.id}`);
    assert(Number.isFinite(signal?.c) && signal.c >= 0 && signal.c <= 100, `${snap.d} ${node.id} confidence is 0–100`);
  }
}
assert(SNAPS.at(-1)?.d === '2026-09-30', 'latest bundled demo snapshot is 2026-09-30');

if (process.exitCode) {
  console.error('\nVALKYRIE v2.5 validation FAILED.');
  process.exit(process.exitCode);
}
console.log('\nVALKYRIE v2.5 validation PASSED.');
