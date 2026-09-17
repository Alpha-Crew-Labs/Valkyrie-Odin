/* VALKYRIE MARKET TAPE
   Direct-first Naver/Npay public indicators with same-origin last-good snapshot fallback.
   Browser polls direct data every minute; fallback snapshot is refreshed by GitHub Actions.
 */
(function(){
  'use strict';

  var ENDPOINT='https://stock.naver.com/api/securityService/integration/indicators?indicatorCodes=KOSPI%2CKOSDAQ%2CKPI200%2C.DJI%2C.IXIC%2C.INX%2CFX_USDKRW%2CGCcv1%2CCLcv1';
  var SNAPSHOT='./data/market-strip.json';
  var REFRESH_MS=60000;
  var SPECS=[
    {code:'KOSPI',label:'코스피'},
    {code:'KOSDAQ',label:'코스닥'},
    {code:'KPI200',label:'코스피200'},
    {code:'.DJI',label:'다우'},
    {code:'.INX',label:'S&P500'},
    {code:'FX_USDKRW',label:'USD/KRW'},
    {code:'.IXIC',label:'나스닥'},
    {code:'GCcv1',label:'금'},
    {code:'CLcv1',label:'WTI'}
  ];

  function $(id){return document.getElementById(id);}
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function num(v){if(typeof v==='number')return Number.isFinite(v)?v:null;if(v===null||v===undefined||v==='')return null;var n=Number(String(v).replace(/[^0-9+\-.]/g,''));return Number.isFinite(n)?n:null;}
  function codeOf(o){return o&&(o.itemCode||o.reutersCode||o.symbolCode||o.code||o.indexCode||o.marketIndexCd||null);}
  function directionOf(o){
    if(!o)return '';
    var c=[o.fluctuationsType,o.compareToPreviousPrice,o.compareToPreviousClosePriceType,o.direction,o.changeType];
    for(var i=0;i<c.length;i++){var v=c[i];if(v&&typeof v==='object')v=v.name||v.text||v.code||'';if(v)return String(v);}return '';
  }
  function signed(value,direction){var n=num(value);if(n===null)return null;var d=String(direction||'');if(/FALL|DOWN|하락|LOWER|MINUS/i.test(d))return -Math.abs(n);if(/RISE|UP|상승|HIGHER|PLUS/i.test(d))return Math.abs(n);return n;}
  function collectObjects(root){var out=[],queue=[root],seen=new Set();while(queue.length){var cur=queue.shift();if(!cur||typeof cur!=='object'||seen.has(cur))continue;seen.add(cur);if(codeOf(cur))out.push(cur);if(Array.isArray(cur))queue.push.apply(queue,cur);else Object.keys(cur).forEach(function(k){var v=cur[k];if(v&&typeof v==='object')queue.push(v);});}return out;}
  function normalizeRow(row,spec){
    if(!row)return {code:spec.code,label:spec.label,price:null,change:null,changePct:null,localTradedAt:null};
    var dir=directionOf(row);
    return {code:spec.code,label:spec.label,price:num(row.currentPriceRaw!=null?row.currentPriceRaw:(row.currentPrice!=null?row.currentPrice:(row.closePriceRaw!=null?row.closePriceRaw:(row.closePrice!=null?row.closePrice:(row.calcPrice!=null?row.calcPrice:row.price))))),change:signed(row.compareToPreviousClosePriceRaw!=null?row.compareToPreviousClosePriceRaw:(row.compareToPreviousClosePrice!=null?row.compareToPreviousClosePrice:(row.fluctuations!=null?row.fluctuations:row.change)),dir),changePct:signed(row.fluctuationsRatioRaw!=null?row.fluctuationsRatioRaw:(row.fluctuationsRatio!=null?row.fluctuationsRatio:(row.changeRate!=null?row.changeRate:(row.changePct!=null?row.changePct:row.rate))),dir),localTradedAt:row.localTradedAt||row.localTradeTime||row.updatedAt||null};
  }
  function normalizePayload(payload){
    if(payload&&Array.isArray(payload.items)&&payload.items.some(function(x){return x&&x.code;})){
      return SPECS.map(function(s){var hit=payload.items.find(function(x){return x&&x.code===s.code;});return hit?{code:s.code,label:s.label,price:num(hit.price),change:num(hit.change),changePct:num(hit.changePct),localTradedAt:hit.localTradedAt||null}:normalizeRow(null,s);});
    }
    var objects=collectObjects(payload);return SPECS.map(function(s){return normalizeRow(objects.find(function(o){return String(codeOf(o))===s.code;}),s);});
  }
  function validCount(items){return items.filter(function(x){return x.price!==null;}).length;}
  function fmt(v){return v===null?'—':Number(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});}
  function fmtSigned(v){if(v===null)return '—';var x=Number(v);return (x>0?'+':'')+x.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});}
  function fmtPct(v){if(v===null)return '—';var x=Number(v);return (x>0?'+':'')+x.toFixed(2)+'%';}
  function cls(x){if(x.price===null)return 'pending';if((x.changePct||0)>0)return 'up';if((x.changePct||0)<0)return 'down';return 'flat';}
  function itemHtml(x){var c=cls(x),change=x.change===null&&x.changePct===null?'—':fmtSigned(x.change)+' '+fmtPct(x.changePct);return '<span class="market-strip-item '+c+'"><span class="market-strip-name">'+esc(x.label)+'</span><span class="market-strip-price">'+esc(fmt(x.price))+'</span><i class="market-strip-dot"></i><span class="market-strip-change">'+esc(change)+'</span></span><span class="market-strip-sep"></span>';}
  function state(mode,stamp){
    if(mode==='DIRECT_API')return {label:'LIVE',key:'live'};
    if(mode!=='SNAPSHOT_FALLBACK')return {label:'WAIT',key:'pending'};
    var t=stamp?new Date(stamp).getTime():NaN,age=Number.isFinite(t)?Date.now()-t:Infinity;
    if(age<=20*60000)return {label:'10M',key:'fresh'};
    if(age<=2*3600000)return {label:'DELAY',key:'delay'};
    return {label:'STALE',key:'stale'};
  }
  function render(items,mode,stamp){
    var track=$('marketStripTrack'),source=$('marketStripSource'),strip=$('marketStrip');if(!track)return;
    var group=items.map(itemHtml).join('');track.innerHTML='<div class="market-strip-group">'+group+'</div><div class="market-strip-group" aria-hidden="true">'+group+'</div>';
    var st=state(mode,stamp);if(strip)strip.setAttribute('data-state',st.key);
    var brand=document.querySelector('.market-strip-brand span');if(brand)brand.textContent='MKT';
    if(source){source.textContent=st.label;source.title=(mode==='DIRECT_API'?'Naver/Npay direct public market data':'Naver/Npay public snapshot')+(stamp?' · '+stamp:'');}
  }
  async function fetchJson(url){var r=await fetch(url,{cache:'no-store',credentials:'omit',headers:{accept:'application/json,text/plain,*/*'}});if(!r.ok)throw new Error(r.status+' '+r.statusText);return r.json();}
  async function load(){
    try{
      var direct=await fetchJson(ENDPOINT),items=normalizePayload(direct);if(validCount(items)<5)throw new Error('insufficient direct indicator rows');
      var now=new Date().toISOString();render(items,'DIRECT_API',now);window.VALKYRIE_MARKET_TAPE={status:'ready',mode:'DIRECT_API',items:items,updatedAt:now};return;
    }catch(directError){
      try{
        var snap=await fetchJson(SNAPSHOT+'?t='+Date.now()),snapItems=normalizePayload(snap);if(!snap||snap.ok!==true||validCount(snapItems)<5)throw new Error('snapshot unavailable');
        render(snapItems,'SNAPSHOT_FALLBACK',snap.generatedAt||null);window.VALKYRIE_MARKET_TAPE={status:'ready',mode:'SNAPSHOT_FALLBACK',items:snapItems,updatedAt:snap.generatedAt||null,directError:String(directError&&directError.message||directError)};return;
      }catch(snapshotError){
        var pending=SPECS.map(function(s){return normalizeRow(null,s);});render(pending,'DATA_PENDING',null);window.VALKYRIE_MARKET_TAPE={status:'pending',mode:'DATA_PENDING',directError:String(directError&&directError.message||directError),snapshotError:String(snapshotError&&snapshotError.message||snapshotError)};
      }
    }
  }

  load();setInterval(load,REFRESH_MS);

  var selfSrc=(document.currentScript&&document.currentScript.src)||'',rev='';
  try{rev=new URL(selfSrc,location.href).searchParams.get('rev')||'';}catch(e){}
  var core=document.createElement('script');core.src='./live-core.js?v=2611'+(rev?'&rev='+encodeURIComponent(rev):'');core.async=false;document.head.appendChild(core);

  /* Keep bundled demo cards hidden until live-core has rendered either verified public values or explicit PENDING state. */
  var coreGate=setInterval(function(){
    var s=window.VALKYRIE_LIVE_CORE;
    if(s&&(s.status==='ready'||s.status==='error')){
      if(document.body)document.body.classList.add('core-ready');
      clearInterval(coreGate);
    }
  },40);
})();
