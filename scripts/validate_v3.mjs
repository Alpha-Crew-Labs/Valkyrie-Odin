import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const dir=path.join(root,'prototype','valkyrie-v3');
const required=['index.html','styles.css','mobile.css','data-core.js','view.js','interaction.js','quant-hk.js','quant-hk.css','equity-yc.js','equity-yc.css','live-equity.js','live-equity.css','README.md'];
let failed=false;
const assert=(cond,msg)=>{if(cond)console.log(`✓ ${msg}`);else{console.error(`✗ ${msg}`);failed=true;}};

for(const file of required)assert(fs.existsSync(path.join(dir,file)),`v3 baseline file exists: ${file}`);
if(failed)process.exit(1);

const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
const css=fs.readFileSync(path.join(dir,'styles.css'),'utf8');
const data=fs.readFileSync(path.join(dir,'data-core.js'),'utf8');
const view=fs.readFileSync(path.join(dir,'view.js'),'utf8');
const interaction=fs.readFileSync(path.join(dir,'interaction.js'),'utf8');
const hkQuant=fs.readFileSync(path.join(dir,'quant-hk.js'),'utf8');
const ycEquity=fs.readFileSync(path.join(dir,'equity-yc.js'),'utf8');
const liveEquity=fs.readFileSync(path.join(dir,'live-equity.js'),'utf8');

const approvedLiveOrigin='https://ipo-market-report.vercel.app';
const htmlWithoutApprovedOrigin=html.split(approvedLiveOrigin).join('');
assert(html.includes('VALKYRIE v3 — Research Intelligence System · v2.6 Baseline'),'approved v2.6 baseline title is present');
assert(html.includes("script-src 'self'"),'CSP restricts scripts to local assets');
assert(html.includes("style-src 'self'"),'CSP restricts styles to local assets');
assert(html.includes(`connect-src ${approvedLiveOrigin}`),'CSP allows the approved live-equity API origin');
assert(!/https?:\/\//i.test(htmlWithoutApprovedOrigin),'v3 shell has no unapproved external HTTP runtime dependency');
assert(html.includes('./styles.css?v=2601'),'baseline stylesheet is versioned');
for(const asset of ['data-core.js','view.js','interaction.js'])assert(html.includes(`./${asset}?v=2601`),`${asset} is wired and versioned`);
assert(html.includes('./quant-hk.js?v=2603')&&html.includes('./quant-hk.css?v=2603'),'HK Quant integration is wired');
assert(html.includes('./equity-yc.js?v=2604')&&html.includes('./equity-yc.css?v=2604'),'YC structural Equity integration is wired');
assert(html.includes('./live-equity.js?v=2605')&&html.includes('./live-equity.css?v=2605'),'live Equity integration is wired');
assert(liveEquity.includes(`${approvedLiveOrigin}/api/equity-pulse`),'live Equity integration uses only the approved proxy endpoint');
assert(!/https?:\/\//i.test(liveEquity.split(`${approvedLiveOrigin}/api/equity-pulse`).join('')),'live Equity runtime has no second external endpoint');
assert(hkQuant.includes('Quant Macro Terminal Pro'),'HK Quant snapshot integration is preserved');
assert(ycEquity.includes('IPO Market Report')&&ycEquity.includes('CB Zero Finder'),'YC IPO/CB structural integration is preserved');
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
const stressUi=['data-s="ust">UST +50bp','data-s="cr">CREDIT +40bp','data-s="bok">BOK +25bp','data-s="all">복합 스트레스'];
for(const preset of stressUi)assert(html.includes(preset),`stress preset UI is wired: ${preset.split('>')[1]}`);
assert(interaction.includes("if(k==='ust')SH.ust+=50")&&interaction.includes("if(k==='cr')SH.cr+=40")&&interaction.includes("if(k==='bok')SH.bok+=25"),'stress preset engine applies deterministic shock magnitudes');
assert(interaction.includes('TEMPORAL ACCESS')&&interaction.includes('TIMELINE RESTORED'),'temporal replay sequence is preserved');

for(const text of ['DECISION LOG','IPO MARKET REPORT','CB ZERO FINDER','DATA VINTAGE','PIT'])assert(view.includes(text),`research surface preserved: ${text}`);
assert(view.includes('정희강 · Quant')&&view.includes('정훈 · 국고3Y 대비')&&view.includes('김유찬 · 운영중'),'team-domain ownership is explicit');
assert(view.includes('적중률 지표는 사용하지 않습니다'),'Decision Log avoids hit-ratio framing');
assert(view.includes('크레딧')&&view.includes('CB 조달 조건'),'rates-to-equity funding transmission is explained');
assert(liveEquity.includes('LIVE MARKET PULSE')&&liveEquity.includes('RISK-ON')&&liveEquity.includes('RISK-OFF'),'live Equity pulse exposes market-regime states');
assert(liveEquity.includes('외국인')&&liveEquity.includes('기관')&&liveEquity.includes('상승 / 하락'),'live Equity pulse exposes flow and breadth evidence');
assert(liveEquity.includes("POLL_MS=70000"),'live Equity polling cadence is explicit');
assert(liveEquity.includes('DEGRADED')&&liveEquity.includes('구조적 시그널은 유지'),'live Equity feed has a graceful structural-signal fallback');

const htmlIds=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
const runtime=data+'\n'+view+'\n'+interaction;
for(const m of runtime.matchAll(/\$\(['"]([^'"]+)['"]\)/g)){
  const id=m[1];
  if(['cd_sc','cd_cr','cd_ipo','cd_cb','dlb'].includes(id))continue;
  assert(htmlIds.has(id),`static runtime DOM id exists: #${id}`);
}

if(failed){console.error('\nVALKYRIE v3 v2.6-baseline validation FAILED.');process.exit(1);}
console.log('\nVALKYRIE v3 v2.6-baseline validation PASSED.');
