import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const dir=path.join(root,'prototype','valkyrie-v3');
const required=[
  'index.html','styles.css','mobile.css','data-core.js','view.js','interaction.js',
  'quant-hk.js','quant-hk.css','equity-yc.js','equity-yc.css','live-equity.js','live-equity.css','live-equity-extra.css',
  'theme-equity.js','theme-equity.css','market-strip.js','market-strip.css','domain-ui.js','domain-ui.css',
  'data/equity-pulse.json','data/research-insights.json','README.md'
];
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
const marketTape=fs.readFileSync(path.join(dir,'market-strip.js'),'utf8');
const domainUi=fs.readFileSync(path.join(dir,'domain-ui.js'),'utf8');
const researchSnapshot=fs.readFileSync(path.join(dir,'data','research-insights.json'),'utf8');
const equityCollector=fs.readFileSync(path.join(root,'scripts','update_equity_snapshot.mjs'),'utf8');
const researchCollector=fs.readFileSync(path.join(root,'scripts','update_research_insights.mjs'),'utf8');
const researchWorkflow=fs.readFileSync(path.join(root,'.github','workflows','research-insights.yml'),'utf8');

assert(html.includes('VALKYRIE v3 — Research Intelligence System · v2.6 Baseline'),'approved v2.6 baseline title is present');
assert(html.includes("script-src 'self'"),'CSP restricts scripts to local assets');
assert(html.includes("style-src 'self'"),'CSP restricts styles to local assets');
const allowedOrigins=['https://polling.finance.naver.com','https://m.stock.naver.com','https://scanner.tradingview.com','https://aikstockdata.com'];
for(const origin of allowedOrigins)assert(html.includes(origin),`CSP allows approved live origin: ${origin}`);
assert(html.includes("connect-src 'self'"),'CSP retains same-origin access for fallback snapshots');
assert(!/ipo-market-report\.vercel\.app/i.test(html+liveEquity),'core live runtime has no IPO Market Report Vercel dependency');
assert(!/cb-zero-finder\.vercel\.app/i.test(html+liveEquity),'core live runtime has no CB Zero Finder Vercel dependency');
let liveWithoutAllowed=liveEquity;for(const origin of allowedOrigins)liveWithoutAllowed=liveWithoutAllowed.split(origin).join('');
assert(!/https?:\/\//i.test(liveWithoutAllowed),'live Equity runtime has no unapproved external API origin');

for(const endpoint of [
  'https://polling.finance.naver.com/api/realtime/domestic/index/KOSPI',
  'https://polling.finance.naver.com/api/realtime/domestic/index/KOSDAQ',
  'https://m.stock.naver.com/api/index/KOSPI/integration',
  'https://m.stock.naver.com/api/index/KOSDAQ/integration',
  'https://scanner.tradingview.com/korea/scan',
  'https://aikstockdata.com/data/public/today.json',
  'https://aikstockdata.com/data/public/index.json',
  'https://aikstockdata.com/data/public/disclosures_intraday.json'
]) assert(liveEquity.includes(endpoint),`direct Equity runtime integrates ${endpoint.split('/').slice(-2).join('/')}`);
assert(liveEquity.includes("snapshot:'./data/equity-pulse.json'"),'GitHub Pages Equity snapshot remains a same-origin fallback');
assert(liveEquity.includes("mode:'DIRECT_API'"),'direct API is the primary Equity runtime mode');
assert(liveEquity.includes("'SNAPSHOT_FALLBACK'"),'last-good Equity snapshot fallback is explicit');
assert(liveEquity.includes('POLL_MS=70000'),'live market polling follows the Naver realtime cadence');
assert(liveEquity.includes('RESEARCH_MS=300000'),'public structural research polling cadence is separately bounded');

assert(html.includes('./styles.css?v=2601'),'baseline stylesheet is versioned');
for(const asset of ['data-core.js','view.js'])assert(html.includes(`./${asset}?v=2601`),`${asset} is wired and versioned`);
assert(html.includes('./interaction.js?v=2606'),'interaction.js current integration build is wired');
assert(html.includes('./quant-hk.js?v=2603')&&html.includes('./quant-hk.css?v=2603'),'HK Quant integration is wired');
assert(html.includes('./equity-yc.js?v=2606')&&html.includes('./equity-yc.css?v=2606'),'Equity research insight layer is wired');
assert(html.includes('./live-equity.js?v=2609')&&html.includes('./live-equity.css?v=2606')&&html.includes('./live-equity-extra.css?v=2607'),'direct live Korean Equity integration is wired');
assert(html.includes('./market-strip.js?v=2610')&&html.includes('./market-strip.css?v=2610'),'market tape integration is wired');
assert(html.includes('./domain-ui.js?v=2614')&&html.includes('./domain-ui.css?v=2614'),'domain-aware navigation layer is wired');

for(const upstream of [
  'polling.finance.naver.com/api/realtime/domestic/index/KOSPI',
  'polling.finance.naver.com/api/realtime/domestic/index/KOSDAQ',
  'm.stock.naver.com/api/index/KOSPI/integration',
  'm.stock.naver.com/api/index/KOSDAQ/integration'
]) assert(equityCollector.includes(upstream),`fallback collector preserves ${upstream}`);
assert(!/vercel\.app/i.test(equityCollector),'core Equity fallback collector has no Vercel dependency');
assert(equityCollector.includes("'data', 'equity-pulse.json'"),'fallback collector writes the Pages same-origin data file');
assert(equityCollector.includes('dealTrendInfo')&&equityCollector.includes('foreignValue')&&equityCollector.includes('institutionalValue'),'fallback collector normalizes Naver investor flow');
assert(equityCollector.includes('riseCount')&&equityCollector.includes('fallCount'),'fallback collector normalizes Naver market breadth');
assert(equityCollector.includes('GITHUB_ACTIONS_SNAPSHOT'),'fallback collector identifies snapshot mode');

assert(hkQuant.includes('Quant Macro Terminal Pro'),'HK Quant snapshot integration is preserved');
assert(ycEquity.includes("SNAPSHOT='./data/research-insights.json'"),'IPO/CB cards read a same-origin aggregate research snapshot');
assert(ycEquity.includes('IPO MARKET REPORT')&&ycEquity.includes('CB ZERO FINDER'),'IPO/CB research surfaces are preserved');
assert(ycEquity.includes('AVG RETURN')&&ycEquity.includes('ZERO · ZERO'),'IPO/CB surfaces show decision-useful aggregate insights instead of disclosure lists');
assert(!/AIKSTOCKDATA|disclosures_intraday\.json|eventRows\(/i.test(ycEquity),'IPO/CB insight cards no longer render DART event-feed lists');
assert(!/fetchJson\(['"]https?:\/\/[^'"]*vercel\.app/i.test(ycEquity),'browser research cards do not fetch Vercel at runtime');
assert(ycEquity.includes('ipo-market-report.vercel.app')&&ycEquity.includes('cb-zero-finder.vercel.app'),'source products remain optional outbound detail links');
assert(researchCollector.includes('ipo-market-report.vercel.app/report.pdf')&&researchCollector.includes('cb-zero-finder.vercel.app/api/cb-latest'),'scheduled collector samples both user-provided public research products');
assert(researchCollector.includes("'data', 'research-insights.json'")&&researchCollector.includes('runtimeDependency: \'NONE\''),'scheduled collector writes only a same-origin aggregate snapshot');
assert(researchWorkflow.includes("cron: '23 0,8 * * 1-5'"),'research insight refresh is scheduled twice per weekday');
assert(/"runtimeDependency"\s*:\s*"NONE"/.test(researchSnapshot),'research snapshot declares no browser runtime dependency');

assert(marketTape.includes('REFRESH_MS=60000'),'market tape retries direct public Naver/Npay data every minute');
for(const state of ["label:'LIVE'","label:'10M'","label:'DELAY'","label:'STALE'","label:'WAIT'"])assert(marketTape.includes(state),`market tape exposes concise freshness state ${state.match(/'([^']+)'/)[1]}`);
assert(marketTape.includes("SNAPSHOT='./data/market-strip.json'"),'market tape retains same-origin last-good fallback');
assert(domainUi.includes("tags[0].textContent='SHOCK'")&&domainUi.includes("tags[1].textContent='FLOW'")&&domainUi.includes("tags[2].textContent='DECISION'"),'decision brief headings are concise');
assert(domainUi.includes("addEventListener('wheel'")&&domainUi.includes('applyNodeZoom'),'node wheel focus is wired');
assert(domainUi.includes('chain(nodeId)')||domainUi.includes('chain(id)'),'node wheel focus uses the causal relation graph');
assert(domainUi.includes('window.declutterValkyrie=declutter'),'runtime declutter pass is installed');
assert(domainUi.includes(".replace(/정희강")&&domainUi.includes(".replace(/정훈")&&domainUi.includes(".replace(/김유찬"),'runtime declutter removes repeated full owner names');
for(const owner of ['정희강','정훈','김유찬']){
  const count=(html.match(new RegExp(owner,'g'))||[]).length;
  assert(count===1,`${owner} appears exactly once in static body chrome (found ${count})`);
}

assert(liveEquity.includes('EQUITY FUNDAMENTAL PULSE'),'hardcoded IPO score is replaced by a real fundamental pulse at runtime');
assert(liveEquity.includes('if(!r||!r.ok)return')&&liveEquity.includes('cd fundq degraded'),'fundamental API failure returns the degraded card instead of a fake sample company score');
assert(liveEquity.includes('TRADINGVIEW SCANNER')&&liveEquity.includes('TV SCANNER'),'TradingView direct scanner evidence is rendered');
assert(liveEquity.includes('AIKSTOCKDATA')&&liveEquity.includes('DART/FSC'),'direct public research source is disclosed');
assert(liveEquity.includes('Research 기준일이 오래'),'stale structural research is explicitly excluded from the live score');
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

for(const owner of ['정희강','정훈','김유찬'])assert(data.includes(`o:'${owner}'`),`${owner} domain ownership remains in the model metadata`);
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
assert(interaction.includes('/kospi|kosdaq|주식|시장|equity/i'),'command router recognizes broader Equity intent');
assert(interaction.includes("window.VALKYRIE_LIVE_EQUITY.status==='ready'"),'demo feed does not overwrite a ready live feed');

for(const text of ['DECISION LOG','IPO MARKET REPORT','CB ZERO FINDER','IPO FUNDAMENTAL SCORE','DATA VINTAGE','PIT'])assert(view.includes(text),`research surface preserved: ${text}`);
assert(view.includes('적중률 지표는 사용하지 않습니다'),'Decision Log avoids hit-ratio framing');
assert(view.includes('크레딧')&&view.includes('CB 조달 조건'),'rates-to-equity funding transmission is explained');
assert(liveEquity.includes('LIVE MARKET · KOREA')&&liveEquity.includes('KOSPI')&&liveEquity.includes('KOSDAQ'),'live Equity surface covers both Korean markets');
assert(liveEquity.includes('KOSDAQ - KOSPI')&&liveEquity.includes('rel.regime'),'relative KOSDAQ-vs-KOSPI regime is rendered');
assert(liveEquity.includes('RISK-ON')&&liveEquity.includes('RISK-OFF')&&liveEquity.includes('NEUTRAL'),'live Equity pulse exposes market-regime states');
assert(liveEquity.includes('외국인')&&liveEquity.includes('기관')&&liveEquity.includes('상승/하락'),'live Equity pulse exposes flow and breadth evidence');
assert(liveEquity.includes('esc(d.mode)'),'the feed mode (direct vs snapshot fallback) is disclosed on the live card header');

const htmlIds=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
const runtime=data+'\n'+view+'\n'+interaction;
for(const m of runtime.matchAll(/\$\(['"]([^'"]+)['"]\)/g)){
  const id=m[1];
  if(['cd_sc','cd_cr','cd_ipo','cd_cb','dlb'].includes(id))continue;
  assert(htmlIds.has(id),`static runtime DOM id exists: #${id}`);
}

if(failed){console.error('\nVALKYRIE v3 v2.6-baseline validation FAILED.');process.exit(1);}
console.log('\nVALKYRIE v3 v2.6-baseline validation PASSED.');
