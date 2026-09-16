import fs from 'node:fs/promises';
import path from 'node:path';

const OUT=path.join(process.cwd(),'prototype','valkyrie-v3','data','core-live.json');
const UA='Mozilla/5.0 (compatible; VALKYRIE-ResearchOS/1.0; +https://alpha-crew-labs.github.io/Valkyrie-Odin/)';
const URLS=[
  'https://m.stock.naver.com/front-api/marketIndex/standardInterestList',
  'https://m.stock.naver.com/front-api/marketIndex/majors',
];
function num(v){if(typeof v==='number')return Number.isFinite(v)?v:null;if(v===null||v===undefined||v==='')return null;const n=Number(String(v).replace(/[^0-9+\-.]/g,''));return Number.isFinite(n)?n:null;}
async function json(url){const r=await fetch(url,{headers:{accept:'application/json,text/plain,*/*','user-agent':UA},cache:'no-store'});if(!r.ok)throw new Error(`${r.status} ${r.statusText}`);return r.json();}
function records(root){const q=[root],out=[],seen=new Set();while(q.length){const x=q.shift();if(!x||typeof x!=='object'||seen.has(x))continue;seen.add(x);if(!Array.isArray(x))out.push(x);if(Array.isArray(x))q.push(...x);else q.push(...Object.values(x));}return out;}
function korea(o){const s=JSON.stringify(o).toLowerCase();return s.includes('한국')||s.includes('korea')||s.includes('대한민국')||/"(?:countrycode|nationtype|nationcode)"\s*:\s*"kor"/i.test(s);}
function rate(o){for(const k of ['baseRate','standardInterestRate','interestRate','rate','closePriceRaw','closePrice','value']){const n=num(o?.[k]);if(n!==null&&n>=0&&n<=30)return n;}return null;}
let hit=null,source=null;
for(const u of URLS){try{const raw=await json(u);for(const r of records(raw)){if(!korea(r))continue;const v=rate(r);if(v!==null){hit=v;source=u;break;}}if(hit!==null)break;}catch(e){console.log(`BOK source failed ${u}: ${e.message}`);}}
if(hit===null)throw new Error('BOK public rate unresolved; keeping DATA PENDING');
const payload=JSON.parse(await fs.readFile(OUT,'utf8'));
payload.metrics=payload.metrics||{};
payload.metrics.bokBaseRate=hit;
payload.sources=payload.sources||{};
payload.sources.bokBaseRate='Naver/Npay public standard interest rate';
payload.providerStatus=payload.providerStatus||{};
payload.providerStatus.bokRate='ok';
payload.liveMetricCount=Object.values(payload.metrics).filter(v=>v!==null&&Number.isFinite(Number(v))).length;
payload.bokRateSourceUrl=source;
await fs.writeFile(OUT,`${JSON.stringify(payload,null,2)}\n`,'utf8');
console.log(JSON.stringify({bokBaseRate:hit,source,liveMetricCount:payload.liveMetricCount},null,2));
