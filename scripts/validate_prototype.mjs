import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const proto = path.join(root, 'prototype', 'valkyrie-v2');

function fail(message) {
  console.error(`✗ ${message}`);
  process.exitCode = 1;
}

function ok(message) {
  console.log(`✓ ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
  else ok(message);
}

const requiredFiles = ['index.html', 'styles.css', 'data.js', 'system.js', 'runtime.js'];
for (const file of requiredFiles) {
  assert(fs.existsSync(path.join(proto, file)), `required prototype file exists: ${file}`);
}

if (process.exitCode) process.exit(process.exitCode);

const index = fs.readFileSync(path.join(proto, 'index.html'), 'utf8');
for (const ref of ['./styles.css', './data.js', './system.js', './runtime.js']) {
  assert(index.includes(ref), `index references ${ref}`);
}
assert(!/https?:\/\//i.test(index), 'reference prototype has no external HTTP dependency');
assert(index.includes("script-src 'self'"), 'prototype CSP restricts scripts to local files');

const source = fs.readFileSync(path.join(proto, 'data.js'), 'utf8');
const sandbox = { console };
vm.createContext(sandbox);
try {
  vm.runInContext(source, sandbox, { filename: 'data.js' });
  ok('data.js evaluates in isolated Node VM');
} catch (error) {
  fail(`data.js evaluation failed: ${error.stack || error.message}`);
  process.exit(process.exitCode || 1);
}

const { NODES, EDGES, SNAPS, META, SIGMETA } = sandbox;
assert(Array.isArray(NODES), 'NODES is an array');
assert(Array.isArray(EDGES), 'EDGES is an array');
assert(Array.isArray(SNAPS), 'SNAPS is an array');
assert(NODES.length === 16, `current ontology has exactly 16 objects (found ${NODES.length})`);
assert(EDGES.length === 22, `current ontology has exactly 22 relations (found ${EDGES.length})`);
assert(SNAPS.length === 5, `demo has exactly 5 deterministic snapshots (found ${SNAPS.length})`);

const nodeIds = NODES.map((n) => n.id);
const nodeSet = new Set(nodeIds);
assert(nodeSet.size === nodeIds.length, 'all object IDs are unique');

const edgeIds = EDGES.map((e) => e[0]);
assert(new Set(edgeIds).size === edgeIds.length, 'all relation IDs are unique');

for (const edge of EDGES) {
  const [edgeId, from, to, sign] = edge;
  assert(nodeSet.has(from), `${edgeId} source exists: ${from}`);
  assert(nodeSet.has(to), `${edgeId} target exists: ${to}`);
  assert(sign === 'POS' || sign === 'NEG', `${edgeId} has supported sign: ${sign}`);
}

const terminals = NODES.filter((n) => n.T).map((n) => n.id);
const ordinary = NODES.filter((n) => !n.T).map((n) => n.id);
assert(terminals.length === 3, `three terminal signals exist (found ${terminals.length})`);

for (const id of ordinary) {
  assert(Boolean(META[id]), `metadata exists for object ${id}`);
}
for (const id of terminals) {
  assert(Boolean(SIGMETA[id]), `signal metadata exists for ${id}`);
}

const snapshotDates = new Set();
for (const snap of SNAPS) {
  assert(Boolean(snap.d), 'snapshot has a date');
  assert(!snapshotDates.has(snap.d), `snapshot date is unique: ${snap.d}`);
  snapshotDates.add(snap.d);

  for (const id of ordinary) {
    assert(Boolean(snap.v?.[id]), `${snap.d} contains object state ${id}`);
  }
  for (const id of terminals) {
    assert(Boolean(snap.sig?.[id]), `${snap.d} contains terminal signal ${id}`);
    const confidence = snap.sig?.[id]?.c;
    assert(Number.isFinite(confidence) && confidence >= 0 && confidence <= 100,
      `${snap.d} ${id} confidence is within 0–100`);
  }
}

const latest = SNAPS.at(-1);
assert(latest?.d === '2026-09-30', `latest bundled demo snapshot is 2026-09-30 (found ${latest?.d})`);

if (process.exitCode) {
  console.error('\nVALKYRIE prototype validation FAILED.');
  process.exit(process.exitCode);
}

console.log('\nVALKYRIE prototype validation PASSED.');
