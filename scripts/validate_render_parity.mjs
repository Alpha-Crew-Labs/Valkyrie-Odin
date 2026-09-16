import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const dir=path.join(root,'prototype','valkyrie-v3');
const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
const pages=fs.readFileSync(path.join(root,'.github','workflows','pages.yml'),'utf8');
const tape=fs.readFileSync(path.join(dir,'market-strip.js'),'utf8');
let failed=false;
const assert=(cond,msg)=>{if(cond)console.log(`✓ ${msg}`);else{console.error(`✗ ${msg}`);failed=true;}};

const hasInline=/\sstyle="/i.test(html);
assert(!hasInline || html.includes("style-src 'self' 'unsafe-inline'"),'CSP preserves inline-style parity with downloadable HTML');
assert(html.includes('https://stock.naver.com'),'CSP allows Naver/Npay Stock live indicator origin');
assert(html.includes('./market-strip.css?v=2610&rev=__BUILD_REV__'),'market tape stylesheet uses deploy-time revision placeholder');
assert(html.includes('./market-strip.js?v=2610&rev=__BUILD_REV__'),'market tape runtime uses deploy-time revision placeholder');
assert(html.includes('id="marketStrip"')&&html.includes('id="marketStripTrack"'),'market tape DOM is part of the canonical page shell');

const assets=[
  'styles.css?v=2601','mobile.css?v=2602','quant-hk.css?v=2603','equity-yc.css?v=2606',
  'live-equity.css?v=2606','live-equity-extra.css?v=2607','market-strip.css?v=2610',
  'data-core.js?v=2601','view.js?v=2601','interaction.js?v=2606','quant-hk.js?v=2603',
  'equity-yc.js?v=2606','live-equity.js?v=2609','market-strip.js?v=2610'
];
for(const asset of assets)assert(html.includes(`./${asset}&rev=__BUILD_REV__`),`canonical asset shares deploy revision: ${asset}`);
assert(!/currentdownload-|rev=[0-9a-f]{7,40}/i.test(html),'source HTML does not pin a stale fixed render revision');
assert(pages.includes("s/__BUILD_REV__/${BUILD_REV}/g"),'Pages deploy replaces render revision with the current commit');
assert(pages.includes("grep -q '__BUILD_REV__' _site/v3/index.html"),'Pages deploy fails if a revision placeholder leaks to production');
assert(pages.includes('update_market_strip_snapshot.mjs'),'Pages deploy refreshes the market tape snapshot fallback');

assert(tape.includes('securityService/integration/indicators'),'market tape reads the consolidated Naver/Npay indicators endpoint');
for(const code of ['KOSPI','KOSDAQ','KPI200','.DJI','.INX','FX_USDKRW','.IXIC','GCcv1','CLcv1'])assert(tape.includes(code),`market tape includes ${code}`);
assert(tape.includes("SNAPSHOT='./data/market-strip.json'"),'market tape has same-origin last-good snapshot fallback');
assert(tape.includes("mode:'DATA_PENDING'"),'market tape fails closed to DATA PENDING instead of fake live data');
for(const fake of ['6,711.45','815.47','52,093.11','7,585.73','25,981.57','4,365.00','104.71'])assert(!tape.includes(fake),`market tape does not hardcode display price ${fake}`);

if(failed){console.error('\nVALKYRIE render-parity validation FAILED.');process.exit(1);}
console.log('\nVALKYRIE render-parity validation PASSED.');
