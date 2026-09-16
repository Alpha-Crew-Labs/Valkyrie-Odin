import fs from 'node:fs/promises';
import path from 'node:path';

const OUT = path.join(process.cwd(), 'prototype', 'valkyrie-v3', 'data', 'market-strip.json');
const URL = 'https://stock.naver.com/api/securityService/integration/indicators?indicatorCodes=KOSPI%2CKOSDAQ%2CKPI200%2C.DJI%2C.IXIC%2C.INX%2CFX_USDKRW%2CGCcv1%2CCLcv1';
const UA = 'Mozilla/5.0 (compatible; VALKYRIE-ResearchOS/1.0; +https://alpha-crew-labs.github.io/Valkyrie-Odin/)';
const SPECS = [
  ['KOSPI','코스피'],['KOSDAQ','코스닥'],['KPI200','코스피 200'],['.DJI','다우존스'],['.INX','S&P 500'],
  ['FX_USDKRW','미국 USD'],['.IXIC','나스닥 종합'],['GCcv1','국제 금'],['CLcv1','WTI'],
].map(([code,label])=>({code,label}));

function toNumber(value){
  if(typeof value==='number') return Number.isFinite(value)?value:null;
  if(value===null||value===undefined||value==='') return null;
  const parsed=Number(String(value).replace(/[^0-9+\-.]/g,''));
  return Number.isFinite(parsed)?parsed:null;
}
function codeOf(o){return o&&(o.itemCode||o.reutersCode||o.symbolCode||o.code||o.indexCode||o.marketIndexCd||null);}
function directionOf(o){
  if(!o) return '';
  for(const raw of [o.fluctuationsType,o.compareToPreviousPrice,o.compareToPreviousClosePriceType,o.direction,o.changeType]){
    const v=raw&&typeof raw==='object'?(raw.name||raw.text||raw.code||''):raw;
    if(v) return String(v);
  }
  return '';
}
function signed(value,direction){
  const n=toNumber(value); if(n===null) return null;
  const d=String(direction||'');
  if(/FALL|DOWN|하락|LOWER|MINUS/i.test(d)) return -Math.abs(n);
  if(/RISE|UP|상승|HIGHER|PLUS/i.test(d)) return Math.abs(n);
  return n;
}
function collectObjects(root){
  const out=[],queue=[root],seen=new Set();
  while(queue.length){
    const cur=queue.shift();
    if(!cur||typeof cur!=='object'||seen.has(cur)) continue;
    seen.add(cur);
    if(codeOf(cur)) out.push(cur);
    if(Array.isArray(cur)) queue.push(...cur);
    else for(const v of Object.values(cur)) if(v&&typeof v==='object') queue.push(v);
  }
  return out;
}
function normalizeRow(row,spec){
  if(!row) return {code:spec.code,label:spec.label,price:null,change:null,changePct:null,localTradedAt:null};
  const dir=directionOf(row);
  return {
    code:spec.code,
    label:spec.label,
    price:toNumber(row.currentPriceRaw ?? row.currentPrice ?? row.closePriceRaw ?? row.closePrice ?? row.calcPrice ?? row.price),
    change:signed(row.compareToPreviousClosePriceRaw ?? row.compareToPreviousClosePrice ?? row.fluctuations ?? row.change,dir),
    changePct:signed(row.fluctuationsRatioRaw ?? row.fluctuationsRatio ?? row.changeRate ?? row.changePct ?? row.rate,dir),
    localTradedAt:row.localTradedAt ?? row.localTradeTime ?? row.updatedAt ?? null,
  };
}
async function fetchJson(url,timeout=12000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  try{
    const response=await fetch(url,{headers:{accept:'application/json,text/plain,*/*','user-agent':UA},signal:controller.signal,cache:'no-store'});
    if(!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json();
  }finally{clearTimeout(timer);}
}

const payloadRaw=await fetchJson(URL);
const objects=collectObjects(payloadRaw);
const items=SPECS.map(spec=>{
  const hit=objects.find(o=>String(codeOf(o))===spec.code);
  return normalizeRow(hit,spec);
});
const valid=items.filter(item=>item.price!==null).length;
if(valid<5) throw new Error(`Naver indicators returned only ${valid} usable rows`);

const payload={
  ok:true,
  generatedAt:new Date().toISOString(),
  provider:'NAVER/Npay Stock public read-only market data',
  mode:'GITHUB_ACTIONS_SNAPSHOT',
  sourceUrl:URL,
  items,
};
await fs.mkdir(path.dirname(OUT),{recursive:true});
await fs.writeFile(OUT,`${JSON.stringify(payload,null,2)}\n`,'utf8');
console.log(`Wrote ${OUT}`);
console.log(JSON.stringify({generatedAt:payload.generatedAt,validRows:valid,codes:items.filter(x=>x.price!==null).map(x=>x.code)},null,2));

// Keep the ontology's current macro/rates inputs alive on the same schedule as the market tape.
// This writes only public-source values and fails closed when a metric cannot be resolved.
await import('./update_core_snapshot.mjs');
