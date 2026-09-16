import fs from 'node:fs/promises';
import path from 'node:path';

const OUT = path.join(process.cwd(), 'prototype', 'valkyrie-v3', 'data', 'core-live.json');
const EQUITY = path.join(process.cwd(), 'prototype', 'valkyrie-v3', 'data', 'equity-pulse.json');
const UA = 'Mozilla/5.0 (compatible; VALKYRIE-ResearchOS/1.0; +https://alpha-crew-labs.github.io/Valkyrie-Odin/)';

const URLS = {
  usaBonds: 'https://m.stock.naver.com/front-api/marketIndex/bondList?countryCode=USA',
  korBonds: 'https://m.stock.naver.com/front-api/marketIndex/bondList?countryCode=KOR',
  policy: 'https://m.stock.naver.com/front-api/marketIndex/standardInterestList',
  domestic: 'https://m.stock.naver.com/front-api/marketIndex/domesticInterestList',
  dart: 'https://aikstockdata.com/data/public/disclosures_intraday.json',
  fred: (id) => `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(id)}`,
};

function num(v){
  if(typeof v==='number') return Number.isFinite(v)?v:null;
  if(v===null||v===undefined||v==='') return null;
  const n=Number(String(v).replace(/[^0-9+\-.]/g,''));
  return Number.isFinite(n)?n:null;
}
function kstStamp(){
  const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).formatToParts(new Date());
  const o={}; for(const p of parts)o[p.type]=p.value;
  return `${o.year}-${o.month}-${o.day} ${o.hour}:${o.minute}:${o.second}`;
}
async function fetchText(url,timeout=10000){
  const ctl=new AbortController(); const timer=setTimeout(()=>ctl.abort(),timeout);
  try{
    const r=await fetch(url,{headers:{accept:'text/plain,text/csv,application/json,*/*','user-agent':UA},signal:ctl.signal,cache:'no-store'});
    if(!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return await r.text();
  } finally { clearTimeout(timer); }
}
async function fetchJson(url,timeout=10000){ return JSON.parse(await fetchText(url,timeout)); }
async function safe(name,fn){ try{return {name,ok:true,value:await fn()};}catch(e){return {name,ok:false,value:null,error:String(e?.message||e)};} }

function records(root){
  const out=[],q=[root],seen=new Set();
  while(q.length){
    const x=q.shift(); if(!x||typeof x!=='object'||seen.has(x))continue; seen.add(x);
    if(!Array.isArray(x)) out.push(x);
    if(Array.isArray(x)) q.push(...x); else q.push(...Object.values(x));
  }
  return out;
}
function textOf(o){
  return [o?.name,o?.korName,o?.localName,o?.symbolName,o?.description,o?.reutersCode,o?.symbolCode,o?.code,o?.ticker,o?.maturity,o?.term].filter(Boolean).join(' ').toLowerCase();
}
function valueOf(o){
  const keys=['closePriceRaw','closePrice','currentPrice','value','rate','interestRate','yield','price','last','baseRate'];
  for(const k of keys){const n=num(o?.[k]);if(n!==null)return n;}
  return null;
}
function findMetric(root,pred){
  for(const r of records(root)){ if(pred(r,textOf(r))){const v=valueOf(r);if(v!==null)return {value:v,row:r};} }
  return null;
}
function matchAny(text,arr){return arr.some(x=>text.includes(String(x).toLowerCase()));}
function bond(root,codes,names){return findMetric(root,(r,t)=>matchAny(t,codes)||matchAny(t,names));}
function policy(root,countryTerms){return findMetric(root,(r,t)=>matchAny(t,countryTerms)&&(/기준|policy|base|interest|금리/.test(t)));}
function domesticAA(root){
  return findMetric(root,(r,t)=>(t.includes('aa-')||t.includes('aa−')||t.includes('aa－')) && (t.includes('3년')||t.includes('3y')||t.includes('3 year')) && (t.includes('회사채')||t.includes('corporate')));
}
function parseFred(csv,id){
  const lines=csv.trim().split(/\r?\n/); const rows=[];
  for(let i=1;i<lines.length;i++){
    const p=lines[i].split(','); if(p.length<2)continue; const v=num(p[1]); if(v!==null)rows.push({date:p[0],value:v});
  }
  if(!rows.length)throw new Error(`${id}: no observations`);
  return rows;
}
function yoy(rows,lag){
  if(rows.length<=lag)return null; const a=rows[rows.length-1],b=rows[rows.length-1-lag];
  return b.value===0?null:{value:(a.value/b.value-1)*100,date:a.date,baseDate:b.date};
}
function latest(rows){const x=rows[rows.length-1];return {value:x.value,date:x.date};}
function stressIndex(z){return Math.max(0,Math.min(100,Math.round(50+12*z)));}
function eventList(raw){
  if(Array.isArray(raw))return raw;
  for(const k of ['events','data','items','disclosures'])if(Array.isArray(raw?.[k]))return raw[k];
  return [];
}
function countEvents(raw,re){
  const es=eventList(raw),hits=[];
  for(const e of es){const s=JSON.stringify(e);if(re.test(s))hits.push(e);}
  return {count:hits.length,total:es.length};
}

const tasks=await Promise.all([
  safe('usaBonds',()=>fetchJson(URLS.usaBonds)),
  safe('korBonds',()=>fetchJson(URLS.korBonds)),
  safe('policy',()=>fetchJson(URLS.policy)),
  safe('domestic',()=>fetchJson(URLS.domestic)),
  safe('dart',()=>fetchJson(URLS.dart)),
  safe('usCpi',()=>fetchText(URLS.fred('CPIAUCSL'))),
  safe('krGdp',()=>fetchText(URLS.fred('NGDPRSAXDCKRQ'))),
  safe('usGdp',()=>fetchText(URLS.fred('GDPC1'))),
  safe('fedFunds',()=>fetchText(URLS.fred('DFF'))),
  safe('stress',()=>fetchText(URLS.fred('STLFSI4'))),
  safe('breakeven10y',()=>fetchText(URLS.fred('T10YIE'))),
  safe('ust2yFred',()=>fetchText(URLS.fred('DGS2'))),
  safe('ust10yFred',()=>fetchText(URLS.fred('DGS10'))),
  safe('vix',()=>fetchText(URLS.fred('VIXCLS'))),
  safe('hyOas',()=>fetchText(URLS.fred('BAMLH0A0HYM2'))),
  safe('broadDollar',()=>fetchText(URLS.fred('DTWEXBGS'))),
]);
const R=Object.fromEntries(tasks.map(x=>[x.name,x]));

const us10=R.usaBonds.ok?bond(R.usaBonds.value,['us10yt=rr','us10y'],['미국 국채 10년','미국채 10년','10-year','10 year']):null;
const kr3=R.korBonds.ok?bond(R.korBonds.value,['kr3yt=rr','kr3y'],['한국 국채 3년','국고채 3년','국고 3년','3-year']):null;
const kr10=R.korBonds.ok?bond(R.korBonds.value,['kr10yt=rr','kr10y'],['한국 국채 10년','국고채 10년','국고 10년','10-year']):null;
const bok=R.policy.ok?policy(R.policy.value,['한국','korea','bok','한국은행']):null;
const aaYield=R.domestic.ok?domesticAA(R.domestic.value):null;

let usCpi=null,krGdp=null,usGdp=null,fedFunds=null,stress=null,breakeven10y=null,ust2yFred=null,ust10yFred=null,vix=null,hyOas=null,broadDollar=null;
try{if(R.usCpi.ok)usCpi=yoy(parseFred(R.usCpi.value,'CPIAUCSL'),12);}catch{}
try{if(R.krGdp.ok)krGdp=yoy(parseFred(R.krGdp.value,'NGDPRSAXDCKRQ'),4);}catch{}
try{if(R.usGdp.ok)usGdp=yoy(parseFred(R.usGdp.value,'GDPC1'),4);}catch{}
try{if(R.fedFunds.ok)fedFunds=latest(parseFred(R.fedFunds.value,'DFF'));}catch{}
try{if(R.stress.ok){const z=latest(parseFred(R.stress.value,'STLFSI4'));stress={z:z.value,index:stressIndex(z.value),date:z.date};}}catch{}
try{if(R.breakeven10y.ok)breakeven10y=latest(parseFred(R.breakeven10y.value,'T10YIE'));}catch{}
try{if(R.ust2yFred.ok)ust2yFred=latest(parseFred(R.ust2yFred.value,'DGS2'));}catch{}
try{if(R.ust10yFred.ok)ust10yFred=latest(parseFred(R.ust10yFred.value,'DGS10'));}catch{}
try{if(R.vix.ok)vix=latest(parseFred(R.vix.value,'VIXCLS'));}catch{}
try{if(R.hyOas.ok)hyOas=latest(parseFred(R.hyOas.value,'BAMLH0A0HYM2'));}catch{}
try{if(R.broadDollar.ok)broadDollar=latest(parseFred(R.broadDollar.value,'DTWEXBGS'));}catch{}

let equity=null;
try{equity=JSON.parse(await fs.readFile(EQUITY,'utf8'));}catch{}
const breadth=equity?.markets?.KOSDAQ?.breadth?.advanceDeclineRatio;
const rel=equity?.relative?.kosdaqMinusKospiPctPoint;
const risk=equity?.markets?.KOSDAQ?.pulse?.score ?? equity?.pulse?.score ?? null;
const dartCb=R.dart.ok?countEvents(R.dart.value,/(전환사채|교환사채|신주인수권부사채|전환가액|리픽싱)/i):null;
const dartIpo=R.dart.ok?countEvents(R.dart.value,/(신규상장|상장예비심사|기업공개|수요예측|공모주|증권신고서\(지분증권\))/i):null;

const metrics={
  krRealGdpYoy:krGdp?.value??null,
  usCpiYoy:usCpi?.value??null,
  fedFunds:fedFunds?.value??null,
  bokBaseRate:bok?.value??null,
  ust10y:us10?.value??null,
  ust2yFred:ust2yFred?.value??null,
  ust10yFred:ust10yFred?.value??null,
  ust2s10sBp:(ust2yFred&&ust10yFred)?(ust10yFred.value-ust2yFred.value)*100:null,
  breakeven10y:breakeven10y?.value??null,
  vix:vix?.value??null,
  usHyOasPct:hyOas?.value??null,
  usHyOasBp:hyOas?hyOas.value*100:null,
  broadDollarIndex:broadDollar?.value??null,
  ktb3y:kr3?.value??null,
  ktb10y:kr10?.value??null,
  ktb3s10sBp:(kr3&&kr10)?(kr10.value-kr3.value)*100:null,
  creditAa3yYield:aaYield?.value??null,
  creditAa3ySpreadBp:(aaYield&&kr3)?(aaYield.value-kr3.value)*100:null,
  usRealGdpYoy:usGdp?.value??null,
  financialStressZ:stress?.z??null,
  financialStressIndex:stress?.index??null,
  kosdaqBreadthPct:breadth===null||breadth===undefined?null:breadth*100,
  kosdaqRelativePctPoint:rel??null,
  kosdaqRiskScore:risk??null,
  dartCbEvents:dartCb?.count??null,
  dartIpoEvents:dartIpo?.count??null,
};
const liveCount=Object.values(metrics).filter(v=>v!==null&&Number.isFinite(Number(v))).length;
const payload={
  ok:liveCount>0,
  mode:'PUBLIC_API_SNAPSHOT',
  generatedAt:new Date().toISOString(),
  generatedAtKst:kstStamp(),
  liveMetricCount:liveCount,
  metrics,
  observationDates:{
    usCpi:usCpi?.date??null,
    krGdp:krGdp?.date??null,
    usGdp:usGdp?.date??null,
    fedFunds:fedFunds?.date??null,
    financialStress:stress?.date??null,
    breakeven10y:breakeven10y?.date??null,
    ust2yFred:ust2yFred?.date??null,
    ust10yFred:ust10yFred?.date??null,
    vix:vix?.date??null,
    usHyOas:hyOas?.date??null,
    broadDollar:broadDollar?.date??null,
    equity:equity?.generatedAt??null,
  },
  eventPulse:{cb:dartCb,ipo:dartIpo},
  sources:{
    krRealGdpYoy:'FRED / IMF IFS · NGDPRSAXDCKRQ',
    usCpiYoy:'FRED / BLS · CPIAUCSL',
    fedFunds:'FRED · DFF',
    breakeven10y:'FRED · T10YIE',
    ust2yFred:'FRED / Federal Reserve H.15 · DGS2',
    ust10yFred:'FRED / Federal Reserve H.15 · DGS10',
    vix:'FRED / CBOE · VIXCLS',
    usHyOas:'FRED / ICE BofA · BAMLH0A0HYM2',
    broadDollarIndex:'FRED / Federal Reserve H.10 · DTWEXBGS',
    bokBaseRate:'Naver/Npay standardInterestList',
    ust10y:'Naver/Npay bondList USA',
    ktb3y:'Naver/Npay bondList KOR',
    ktb10y:'Naver/Npay bondList KOR',
    creditAa3y:'Naver/Npay domesticInterestList',
    usRealGdpYoy:'FRED / BEA · GDPC1',
    financialStress:'FRED · STLFSI4 (mapped to 0-100 as 50 + 12z)',
    equity:'Naver/KRX equity-pulse snapshot',
    dart:'aikstockdata public DART disclosure feed',
  },
  providerStatus:Object.fromEntries(tasks.map(x=>[x.name,x.ok?'ok':x.error])),
};

await fs.mkdir(path.dirname(OUT),{recursive:true});
await fs.writeFile(OUT,`${JSON.stringify(payload,null,2)}\n`,'utf8');
console.log(`Wrote ${OUT}`);
console.log(JSON.stringify({generatedAtKst:payload.generatedAtKst,liveMetricCount:liveCount,metrics,providerStatus:payload.providerStatus},null,2));
if(liveCount<4)throw new Error(`Only ${liveCount} public metrics resolved; keep previous deployed fallback`);
