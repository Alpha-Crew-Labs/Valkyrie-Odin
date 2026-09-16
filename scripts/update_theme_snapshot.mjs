import fs from 'node:fs/promises';
import path from 'node:path';

const OUT=path.join(process.cwd(),'prototype','valkyrie-v3','data','theme-pulse.json');
const BASE='https://stock.naver.com/api/domestic/market/theme';
const RANK='https://stock.naver.com/api/stockSecurity/rankings/v2/domestic/themes';
const UA='Mozilla/5.0 (compatible; VALKYRIE-ResearchOS/1.0; +https://alpha-crew-labs.github.io/Valkyrie-Odin/)';

function n(v){if(typeof v==='number')return Number.isFinite(v)?v:null;if(v===null||v===undefined||v==='')return null;const x=Number(String(v).replace(/[^0-9+\-.]/g,''));return Number.isFinite(x)?x:null;}
async function fetchJson(url,timeout=12000){const ctl=new AbortController();const t=setTimeout(()=>ctl.abort(),timeout);try{const r=await fetch(url,{headers:{accept:'application/json,text/plain,*/*','user-agent':UA},cache:'no-store',signal:ctl.signal});if(!r.ok)throw new Error(`${r.status} ${r.statusText}`);return await r.json();}finally{clearTimeout(t);}}
function findArray(root,pred){const q=[root],seen=new Set();while(q.length){const x=q.shift();if(!x||typeof x!=='object'||seen.has(x))continue;seen.add(x);if(Array.isArray(x)&&x.some(pred))return x;const vals=Array.isArray(x)?x:Object.values(x);for(const v of vals)if(v&&typeof v==='object')q.push(v);}return [];}
function stockRows(raw){return findArray(raw,x=>x&&x.itemcode!=null&&x.itemname!=null);}
function normLead(x){const src=Array.isArray(x?.topByChangeRate)?x.topByChangeRate:(Array.isArray(x?.leadingItem)?x.leadingItem:[]);return src.slice(0,2).map(r=>({code:String(r?.code??r?.itemcode??r?.itemCode??''),name:String(r?.name??r?.itemname??r?.itemName??'')})).filter(z=>z.code||z.name);}
function normTheme(x){const id=x?.code??x?.no;return {no:String(id??''),name:String(x?.name??''),changeRate:n(x?.changeRate),riseCnt:n(x?.risingCount??x?.riseCnt),fallCnt:n(x?.fallingCount??x?.fallCnt),steadyCnt:n(x?.unchangedCount??x?.steadyCnt),leadingItem:normLead(x),thistime:x?.updatedAt??x?.thistime??x?.localTradedAt??null};}
function normStock(x){let ch=n(x.prevChangeRate);const gb=String(x.upDownGb??'');if(ch!==null&&(/5|down|fall|하락/i.test(gb)))ch=-Math.abs(ch);else if(ch!==null&&(/2|up|rise|상승/i.test(gb)))ch=Math.abs(ch);return {code:String(x.itemcode??''),name:String(x.itemname??''),price:n(x.nowPrice),changePrice:n(x.prevChangePrice),changeRate:ch,tradeVolume:n(x.tradeVolume),tradeAmount:n(x.tradeAmount),marketStatus:x.marketStatus??null};}

async function fetchAllThemes(){
  const all=[],seen=new Set();let cursor='',pages=0;
  do{
    const url=`${RANK}?sortType=changeRate&size=100&excludeCodes=25&period=daily${cursor?`&cursor=${encodeURIComponent(cursor)}`:''}`;
    const raw=await fetchJson(url);const rows=Array.isArray(raw?.items)?raw.items:[];let added=0;
    for(const r of rows){const id=String(r?.code??'');if(id&&!seen.has(id)){seen.add(id);all.push(normTheme(r));added++;}}
    pages++;
    cursor=raw?.hasNext===true&&raw?.cursor&&added>0?String(raw.cursor):'';
  }while(cursor&&pages<8);
  return {themes:all,pages};
}
async function fetchStocks(no){
  const raw=await fetchJson(`${BASE}/${encodeURIComponent(no)}/stocklist?marketType=ALL&orderType=quantTop&startIdx=0&pageSize=20`);
  return stockRows(raw).map(normStock).filter(x=>x.code&&x.name).sort((a,b)=>(b.tradeAmount||0)-(a.tradeAmount||0)).slice(0,20);
}

const {themes,pages}=await fetchAllThemes();
const ranked=themes.filter(x=>x.changeRate!==null).sort((a,b)=>b.changeRate-a.changeRate);
const top=ranked.filter(x=>x.changeRate>0).slice(0,5);
const bottom=ranked.filter(x=>x.changeRate<0).sort((a,b)=>a.changeRate-b.changeRate).slice(0,5);
if(themes.length<50||!top.length||!bottom.length)throw new Error(`Incomplete public theme universe: ${themes.length} rows / ${top.length} gainers / ${bottom.length} losers; no fabricated fallback will be written`);
const selected=[...top.slice(0,4),...bottom.slice(0,4)];
const constituents={};
await Promise.all(selected.map(async t=>{try{constituents[t.no]=await fetchStocks(t.no);}catch(e){console.log(`theme ${t.no} constituents pending: ${e.message}`);constituents[t.no]=[];}}));
const payload={ok:true,mode:'GITHUB_ACTIONS_PUBLIC_SNAPSHOT',provider:'Naver/Npay Securities public read-only theme API',generatedAt:new Date().toISOString(),themesCount:themes.length,pages,hasGainers:top.length>0,hasLosers:bottom.length>0,themes,top,bottom,constituents,sources:{ranking:`${RANK}?sortType=changeRate&size=100&excludeCodes=25&period=daily&cursor={cursor}`,stocklist:`${BASE}/{no}/stocklist?marketType=ALL&orderType=quantTop&startIdx=0&pageSize=20`}};
await fs.mkdir(path.dirname(OUT),{recursive:true});
await fs.writeFile(OUT,`${JSON.stringify(payload,null,2)}\n`,'utf8');
console.log(`Wrote ${OUT}`);
console.log(JSON.stringify({generatedAt:payload.generatedAt,themesCount:themes.length,pages,top:top.map(x=>({no:x.no,name:x.name,changeRate:x.changeRate})),bottom:bottom.map(x=>({no:x.no,name:x.name,changeRate:x.changeRate})),constituentThemes:Object.keys(constituents).length},null,2));
