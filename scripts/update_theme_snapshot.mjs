import fs from 'node:fs/promises';
import path from 'node:path';

const OUT=path.join(process.cwd(),'prototype','valkyrie-v3','data','theme-pulse.json');
const BASE='https://stock.naver.com/api/domestic/market/theme';
const UA='Mozilla/5.0 (compatible; VALKYRIE-ResearchOS/1.0; +https://alpha-crew-labs.github.io/Valkyrie-Odin/)';

function n(v){if(typeof v==='number')return Number.isFinite(v)?v:null;if(v===null||v===undefined||v==='')return null;const x=Number(String(v).replace(/[^0-9+\-.]/g,''));return Number.isFinite(x)?x:null;}
async function fetchJson(url,timeout=12000){const ctl=new AbortController();const t=setTimeout(()=>ctl.abort(),timeout);try{const r=await fetch(url,{headers:{accept:'application/json,text/plain,*/*','user-agent':UA},cache:'no-store',signal:ctl.signal});if(!r.ok)throw new Error(`${r.status} ${r.statusText}`);return await r.json();}finally{clearTimeout(t);}}
function findArray(root,pred){const q=[root],seen=new Set();while(q.length){const x=q.shift();if(!x||typeof x!=='object'||seen.has(x))continue;seen.add(x);if(Array.isArray(x)&&x.some(pred))return x;const vals=Array.isArray(x)?x:Object.values(x);for(const v of vals)if(v&&typeof v==='object')q.push(v);}return [];}
function themeRows(raw){return findArray(raw,x=>x&&x.no!=null&&x.name!=null&&x.changeRate!=null);}
function stockRows(raw){return findArray(raw,x=>x&&x.itemcode!=null&&x.itemname!=null);}
function normLead(x){const src=Array.isArray(x?.leadingItem)?x.leadingItem:[];return src.slice(0,2).map(r=>({code:String(r?.itemcode??r?.itemCode??r?.code??''),name:String(r?.itemname??r?.itemName??r?.name??'')})).filter(z=>z.code||z.name);}
function normTheme(x){return {no:String(x.no),name:String(x.name??''),changeRate:n(x.changeRate),riseCnt:n(x.riseCnt),fallCnt:n(x.fallCnt),steadyCnt:n(x.steadyCnt),leadingItem:normLead(x),thistime:x.thistime??x.localTradedAt??null};}
function normStock(x){let ch=n(x.prevChangeRate);const gb=String(x.upDownGb??'');if(ch!==null&&(/5|down|fall|하락/i.test(gb)))ch=-Math.abs(ch);else if(ch!==null&&(/2|up|rise|상승/i.test(gb)))ch=Math.abs(ch);return {code:String(x.itemcode??''),name:String(x.itemname??''),price:n(x.nowPrice),changePrice:n(x.prevChangePrice),changeRate:ch,tradeVolume:n(x.tradeVolume),tradeAmount:n(x.tradeAmount),marketStatus:x.marketStatus??null};}

async function fetchAllThemes(){
  const all=[],seen=new Set(),pageSize=100;
  for(let start=0;start<500;start+=pageSize){
    const raw=await fetchJson(`${BASE}/list?startIdx=${start}&pageSize=${pageSize}&sortType=changeRate`);
    const rows=themeRows(raw);let added=0;
    for(const r of rows){const id=String(r.no);if(!seen.has(id)){seen.add(id);all.push(normTheme(r));added++;}}
    if(rows.length<pageSize||added===0)break;
  }
  return all;
}
async function fetchStocks(no){
  const raw=await fetchJson(`${BASE}/${encodeURIComponent(no)}/stocklist?marketType=ALL&orderType=quantTop&startIdx=0&pageSize=20`);
  return stockRows(raw).map(normStock).filter(x=>x.code&&x.name).slice(0,20);
}

const themes=await fetchAllThemes();
if(themes.length<10)throw new Error(`Only ${themes.length} theme rows resolved; no fabricated fallback will be written`);
const ranked=themes.filter(x=>x.changeRate!==null).sort((a,b)=>b.changeRate-a.changeRate);
const top=ranked.filter(x=>x.changeRate>0).slice(0,5);
const bottom=ranked.filter(x=>x.changeRate<0).sort((a,b)=>a.changeRate-b.changeRate).slice(0,5);
const selected=[...top.slice(0,4),...bottom.slice(0,4)];
const constituents={};
await Promise.all(selected.map(async t=>{try{constituents[t.no]=await fetchStocks(t.no);}catch(e){console.log(`theme ${t.no} constituents pending: ${e.message}`);constituents[t.no]=[];}}));
const payload={ok:true,mode:'GITHUB_ACTIONS_PUBLIC_SNAPSHOT',provider:'Naver/Npay Securities public read-only theme API',generatedAt:new Date().toISOString(),themesCount:themes.length,themes,top,bottom,constituents,sources:{list:`${BASE}/list?startIdx={start}&pageSize=100&sortType=changeRate`,stocklist:`${BASE}/{no}/stocklist?marketType=ALL&orderType=quantTop&startIdx=0&pageSize=20`}};
await fs.mkdir(path.dirname(OUT),{recursive:true});
await fs.writeFile(OUT,`${JSON.stringify(payload,null,2)}\n`,'utf8');
console.log(`Wrote ${OUT}`);
console.log(JSON.stringify({generatedAt:payload.generatedAt,themesCount:themes.length,top:top.map(x=>({no:x.no,name:x.name,changeRate:x.changeRate})),bottom:bottom.map(x=>({no:x.no,name:x.name,changeRate:x.changeRate})),constituentThemes:Object.keys(constituents).length},null,2));
