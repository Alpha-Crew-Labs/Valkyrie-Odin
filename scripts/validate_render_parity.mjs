import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const dir=path.join(root,'prototype','valkyrie-v3');
const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
const pages=fs.readFileSync(path.join(root,'.github','workflows','pages.yml'),'utf8');
const tape=fs.readFileSync(path.join(dir,'market-strip.js'),'utf8');
const theme=fs.readFileSync(path.join(dir,'theme-equity.js'),'utf8');
const liveCore=fs.readFileSync(path.join(dir,'live-core.js'),'utf8');
const coreCollector=fs.readFileSync(path.join(root,'scripts','update_core_snapshot.mjs'),'utf8');
const bokCollector=fs.readFileSync(path.join(root,'scripts','update_bok_rate.mjs'),'utf8');
const tapeCollector=fs.readFileSync(path.join(root,'scripts','update_market_strip_snapshot.mjs'),'utf8');
const equityCollector=fs.readFileSync(path.join(root,'scripts','update_equity_snapshot.mjs'),'utf8');
const themeCollector=fs.readFileSync(path.join(root,'scripts','update_theme_snapshot.mjs'),'utf8');
let failed=false;
const assert=(cond,msg)=>{if(cond)console.log(`✓ ${msg}`);else{console.error(`✗ ${msg}`);failed=true;}};

function collectTextFiles(base){
  const out=[];
  for(const entry of fs.readdirSync(base,{withFileTypes:true})){
    const p=path.join(base,entry.name);
    if(entry.isDirectory())out.push(...collectTextFiles(p));
    else if(/\.(?:js|html|css|json|md)$/i.test(entry.name))out.push({path:p,text:fs.readFileSync(p,'utf8')});
  }
  return out;
}

const runtimeFiles=collectTextFiles(dir);
const runtimeText=runtimeFiles.map(x=>x.text).join('\n');
const collectorText=[coreCollector,bokCollector,tapeCollector,equityCollector,themeCollector].join('\n');

// Hard rule: production data must be public/read-only and keyless.
assert(!/https?:\/\/[^\s'"`]*(?:vercel\.app|vercel\.com)/i.test(runtimeText),'v3 runtime has no Vercel dependency or Vercel data endpoint');
assert(!/(?:process\.env|x-api-key|api[_-]?key\s*[:=]|client[_-]?secret\s*[:=]|access[_-]?token\s*[:=]|authorization\s*[:=]\s*['"`]?bearer)/i.test(collectorText),'public-data collectors require no personal API key, token, or secret');
assert(pages.includes("cron: '*/10 0-7 * * 1-5'")&&pages.includes("cron: '7 * * * *'"),'public data auto-refreshes every 10 minutes in KR market hours and hourly otherwise');

const hasInline=/\sstyle="/i.test(html);
assert(!hasInline || html.includes("style-src 'self' 'unsafe-inline'"),'CSP preserves inline-style parity with downloadable HTML');
assert(html.includes('https://stock.naver.com'),'CSP allows Naver/Npay Stock live indicator and theme origin');
assert(html.includes('./market-strip.css?v=2610&rev=__BUILD_REV__'),'market tape stylesheet uses deploy-time revision placeholder');
assert(html.includes('./market-strip.js?v=2610&rev=__BUILD_REV__'),'market tape runtime uses deploy-time revision placeholder');
assert(html.includes('./theme-equity.css?v=2613&rev=__BUILD_REV__'),'theme stylesheet uses deploy-time revision placeholder');
assert(html.includes('./theme-equity.js?v=2613&rev=__BUILD_REV__'),'theme runtime uses deploy-time revision placeholder');
assert(html.includes('id="marketStrip"')&&html.includes('id="marketStripTrack"'),'market tape DOM is part of the canonical page shell');

const assets=[
  'styles.css?v=2601','mobile.css?v=2602','quant-hk.css?v=2603','equity-yc.css?v=2606',
  'live-equity.css?v=2606','live-equity-extra.css?v=2607','theme-equity.css?v=2613','market-strip.css?v=2610',
  'data-core.js?v=2601','view.js?v=2601','interaction.js?v=2606','quant-hk.js?v=2603',
  'equity-yc.js?v=2606','live-equity.js?v=2609','theme-equity.js?v=2613','market-strip.js?v=2610'
];
for(const asset of assets)assert(html.includes(`./${asset}&rev=__BUILD_REV__`),`canonical asset shares deploy revision: ${asset}`);
assert(!/currentdownload-|rev=[0-9a-f]{7,40}/i.test(html),'source HTML does not pin a stale fixed render revision');
assert(pages.includes("s/__BUILD_REV__/${BUILD_REV}/g"),'Pages deploy replaces render revision with the current commit');
assert(pages.includes("grep -q '__BUILD_REV__' _site/v3/index.html"),'Pages deploy fails if a revision placeholder leaks to production');
assert(pages.includes('update_market_strip_snapshot.mjs'),'Pages deploy refreshes the market tape snapshot fallback');
assert(pages.includes('update_theme_snapshot.mjs'),'Pages deploy refreshes the public theme snapshot');
assert(pages.includes("'scripts/update_core_snapshot.mjs'")&&pages.includes("'scripts/update_bok_rate.mjs'"),'Pages deploy watches live core and BOK collector changes');

assert(tape.includes('securityService/integration/indicators'),'market tape reads the consolidated Naver/Npay indicators endpoint');
for(const code of ['KOSPI','KOSDAQ','KPI200','.DJI','.INX','FX_USDKRW','.IXIC','GCcv1','CLcv1'])assert(tape.includes(code),`market tape includes ${code}`);
assert(tape.includes("SNAPSHOT='./data/market-strip.json'"),'market tape has same-origin last-good public snapshot fallback');
assert(tape.includes("mode:'DATA_PENDING'"),'market tape fails closed to DATA PENDING instead of fake live data');
for(const fake of ['6,711.45','815.47','52,093.11','7,585.73','25,981.57','4,365.00','104.71'])assert(!tape.includes(fake),`market tape does not hardcode display price ${fake}`);

assert(theme.includes("BASE='https://stock.naver.com/api/domestic/market/theme'")&&theme.includes("RANK='https://stock.naver.com/api/stockSecurity/rankings/v2/domestic/themes'"),'Equity theme runtime uses public Naver/Npay ranking and constituent APIs');
assert(theme.includes('sortType=changeRate&size=100&excludeCodes=25&period=daily')&&theme.includes('raw&&raw.hasNext===true')&&theme.includes('raw.cursor'),'theme runtime cursor-paginates the full daily theme universe');
assert(theme.includes("'/stocklist?marketType=ALL&orderType=quantTop"),'theme runtime reads selected theme constituents');
assert(theme.includes("SNAPSHOT='./data/theme-pulse.json'"),'theme runtime has same-origin public snapshot fallback');
assert(theme.includes("STATE.mode='DATA_PENDING'")||theme.includes("mode:'DATA_PENDING'"),'theme runtime fails closed to DATA PENDING');
assert(theme.includes('!r.top.length||!r.bottom.length'),'theme runtime rejects incomplete universes without both gainers and losers');
assert(themeCollector.includes('stockSecurity/rankings/v2/domestic/themes')&&themeCollector.includes('raw?.hasNext===true')&&themeCollector.includes('raw?.cursor'),'theme collector cursor-paginates public Naver/Npay rankings');
assert(themeCollector.includes('/stocklist?marketType=ALL&orderType=quantTop'),'theme collector refreshes real constituent stocks');
assert(themeCollector.includes('!top.length||!bottom.length')&&themeCollector.includes('no fabricated fallback'),'theme collector refuses snapshots that lack gainers or losers and never fabricates fallback data');

assert(tape.includes("live-core.js?v=2611"),'market tape loads the live ontology bridge with the deploy revision');
assert(liveCore.includes("SNAPSHOT='./data/core-live.json'"),'live ontology reads the same-origin public-data snapshot');
assert(liveCore.includes("MODEL · PUBLIC FEED PENDING")&&liveCore.includes('STRUCTURAL SNAPSHOT'),'unsupported ontology outputs stay explicitly tagged instead of being faked live');
assert(tapeCollector.includes("import('./update_core_snapshot.mjs')"),'scheduled market-tape refresh also refreshes the ontology live snapshot');
assert(tapeCollector.includes("import('./update_bok_rate.mjs')"),'scheduled refresh also resolves the BOK policy rate');
for(const endpoint of ['bondList?countryCode=USA','bondList?countryCode=KOR','standardInterestList','domesticInterestList'])assert(coreCollector.includes(endpoint),`core collector includes Naver/Npay ${endpoint}`);
for(const series of ['CPIAUCSL','NGDPRSAXDCKRQ','GDPC1','DFF','STLFSI4'])assert(coreCollector.includes(series),`core collector includes public FRED series ${series}`);
assert(coreCollector.includes('disclosures_intraday.json'),'core collector includes the public DART disclosure feed');
assert(coreCollector.includes('if(liveCount<4)throw'),'core collector fails closed when too few public metrics resolve');
assert(bokCollector.includes('standardInterestList')&&bokCollector.includes('keeping DATA PENDING'),'BOK collector uses public Naver/Npay data and fails closed');

if(failed){console.error('\nVALKYRIE render-parity validation FAILED.');process.exit(1);}
console.log('\nVALKYRIE render-parity validation PASSED.');
