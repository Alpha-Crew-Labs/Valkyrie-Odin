import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const dir=path.join(root,'prototype','valkyrie-v3');
const required=['index.html','styles.css','data-core.js','view.js','interaction.js','README.md'];
let failed=false;
const assert=(cond,msg)=>{if(cond)console.log(`✓ ${msg}`);else{console.error(`✗ ${msg}`);failed=true;}};

for(const file of required)assert(fs.existsSync(path.join(dir,file)),`v3 baseline file exists: ${file}`);
if(failed)process.exit(1);

const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
const css=fs.readFileSync(path.join(dir,'styles.css'),'utf8');
const data=fs.readFileSync(path.join(dir,'data-core.js'),'utf8');
const view=fs.readFileSync(path.join(dir,'view.js'),'utf8');
const interaction=fs.readFileSync(path.join(dir,'interaction.js'),'utf8');

assert(html.includes('VALKYRIE v3 — Research Intelligence System · v2.6 Baseline'),'approved v2.6 baseline title is present');
assert(html.includes("script-src 'self'"),'CSP restricts scripts to local assets');
assert(html.includes("style-src 'self'"),'CSP restricts styles to local assets');
assert(!/https?:\/\//i.test(html),'v3 shell has no external HTTP runtime dependency');
assert(html.includes('./styles.css?v=2601'),'baseline stylesheet is versioned');
for(const asset of ['data-core.js','view.js','interaction.js'])assert(html.includes(`./${asset}?v=2601`),`${asset} is wired and versioned`);
assert(!html.includes('ontology.js')&&!html.includes('motion-v31')&&!html.includes('motion-v32')&&!html.includes('localize-v32'),'retired v3.2 runtime assets are not loaded');

const ndBlock=(data.match(/var ND=\{([\s\S]*?)\n\};\nvar EG=/)||[])[1]||'';
const edgeBlock=(data.match(/var EG=\[([\s\S]*?)\n\];\nvar FM=/)||[])[1]||'';
const snapBlock=(data.match(/var SNAP=\[([\s\S]*?)\n\];\nvar AV=/)||[])[1]||'';
const objectIds=[...ndBlock.matchAll(/^\s*([a-z][a-z0-9_]*)\s*:\s*\{/gm)].map(m=>m[1]);
const edgeCount=(edgeBlock.match(/\['[a-z0-9_]+','[a-z0-9_]+'/g)||[]).length;
const snapshotCount=(snapBlock.match(/\{d:'2026-/g)||[]).length;
assert(objectIds.length===16,`v3 has exactly 16 objects (found ${objectIds.length})`);
assert(new Set(objectIds).size===16,'v3 object IDs are unique');
assert(edgeCount===22,`v3 has exactly 22 causal relations (found ${edgeCount})`);
assert(snapshotCount===5,`v3 has exactly 5 temporal snapshots (found ${snapshotCount})`);

for(const owner of ['정희강','정훈','김유찬'])assert(data.includes(`o:'${owner}'`),`${owner} domain objects are present`);
for(const id of ['mac_krcpi','mac_bok','sig_macro','rat_ust','rat_ktb','rat_credit','sig_rates','eq_val','eq_cb','eq_ipo','sig_equity'])assert(objectIds.includes(id),`core object exists: ${id}`);
assert(data.includes("['rat_credit','eq_cb',.61,1]"),'credit-to-CB cross-domain relation is preserved');
assert(data.includes('SHARED')&&data.includes('DURATION'),'shared duration concept link is rendered');

assert(css.includes('@keyframes flA')&&css.includes('@keyframes flB'),'dual hydro-flow animations are preserved');
assert(css.includes('stroke-dashoffset'),'hydro flow uses directional stroke motion');
assert(css.includes('.eg.hot'),'active causal paths have accelerated hot state');

for(const fn of ['signature','replay','shock','command'])assert(new RegExp(`function ${fn}\\(`).test(interaction),`interaction exists: ${fn}()`);
assert(interaction.includes("UST +50bp")&&interaction.includes("CREDIT +40bp")&&interaction.includes("BOK +25bp"),'deterministic stress presets are wired');
assert(interaction.includes('TEMPORAL ACCESS')&&interaction.includes('TIMELINE RESTORED'),'temporal replay sequence is preserved');

for(const text of ['DECISION LOG','IPO MARKET REPORT','CB ZERO FINDER','DATA VINTAGE','PIT'])assert(view.includes(text),`research surface preserved: ${text}`);
assert(view.includes('정희강 · Quant')&&view.includes('정훈 · 국고3Y 대비')&&view.includes('김유찬 · 운영중'),'team-domain ownership is explicit');
assert(view.includes('적중률 지표는 사용하지 않습니다'),'Decision Log avoids hit-ratio framing');
assert(view.includes('크레딧')&&view.includes('CB 조달 조건'),'rates-to-equity funding transmission is explained');

const htmlIds=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
const runtime=data+'\n'+view+'\n'+interaction;
for(const m of runtime.matchAll(/\$\(['"]([^'"]+)['"]\)/g)){
  const id=m[1];
  if(['cd_sc','cd_cr','cd_ipo','cd_cb','dlb'].includes(id))continue; // dynamically rendered workspace IDs
  assert(htmlIds.has(id),`static runtime DOM id exists: #${id}`);
}

if(failed){console.error('\nVALKYRIE v3 v2.6-baseline validation FAILED.');process.exit(1);}
console.log('\nVALKYRIE v3 v2.6-baseline validation PASSED.');
