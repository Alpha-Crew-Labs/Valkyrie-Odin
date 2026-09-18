/* VALKYRIE · Live Korean Equity Intelligence
 * Direct-API first: Naver market data + TradingView Korea scanner + aikstockdata/DART research.
 * GitHub Pages data/equity-pulse.json is last-good fallback only.
 * Structural IPO/CB signals remain owned by equity-yc.js.
 */
(function(){
  'use strict';

  var API={
    snapshot:'./data/equity-pulse.json',
    naver:{
      KOSPI:{
        realtime:'https://polling.finance.naver.com/api/realtime/domestic/index/KOSPI',
        integration:'https://m.stock.naver.com/api/index/KOSPI/integration'
      },
      KOSDAQ:{
        realtime:'https://polling.finance.naver.com/api/realtime/domestic/index/KOSDAQ',
        integration:'https://m.stock.naver.com/api/index/KOSDAQ/integration'
      }
    },
    tv:'https://scanner.tradingview.com/korea/scan',
    aik:{
      today:'https://aikstockdata.com/data/public/today.json',
      index:'https://aikstockdata.com/data/public/index.json',
      intraday:'https://aikstockdata.com/data/public/disclosures_intraday.json'
    }
  };
  var POLL_MS=70000;
  var RESEARCH_MS=300000;
  var LIVE={status:'idle',data:null,error:null,lastFetch:0,lastResearchFetch:0,timer:null,researchTimer:null,mode:'DIRECT_API',providers:{}};
  window.VALKYRIE_LIVE_EQUITY=LIVE;

  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function toNumber(v){if(typeof v==='number')return isFinite(v)?v:null;if(v===null||v===undefined)return null;var n=Number(String(v).replace(/[^0-9+\-.]/g,''));return isFinite(n)?n:null;}
  function num(v,d){return v===null||v===undefined||!isFinite(Number(v))?'—':Number(v).toFixed(d==null?0:d);}
  function signed(v,d){if(v===null||v===undefined||!isFinite(Number(v)))return '—';var n=Number(v);return (n>0?'+':'')+n.toFixed(d==null?0:d);}
  function flow(v){if(v===null||v===undefined||!isFinite(Number(v)))return '—';var n=Math.round(Number(v));return (n>0?'+':'')+n.toLocaleString('ko-KR')+'억';}
  function won(v){if(v===null||v===undefined||!isFinite(Number(v)))return '—';var n=Number(v);if(Math.abs(n)>=1e12)return (n/1e12).toFixed(1)+'조';if(Math.abs(n)>=1e8)return Math.round(n/1e8).toLocaleString('ko-KR')+'억';return Math.round(n).toLocaleString('ko-KR');}
  function hhmm(v){if(!v)return '—';var d=new Date(v);if(isNaN(d.getTime()))return String(v);return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}).format(d);}
  function shortDate(v){var s=String(v||'').replace(/[^0-9]/g,'');return s.length>=8?s.slice(4,6)+'.'+s.slice(6,8):'—';}
  function tone(v){return Number(v)>0?'gr':Number(v)<0?'rd':'';}
  function pulseTone(v){return v==='RISK-ON'?'gr':v==='RISK-OFF'?'rd':'am';}
  function market(d,code){return d&&d.markets&&d.markets[code]?d.markets[code]:null;}
  function nowIso(){return new Date().toISOString();}

  async function fetchJson(url,opt){
    opt=opt||{};var ctl=new AbortController(),timer=setTimeout(function(){ctl.abort();},opt.timeout||8000);
    try{
      var init={method:opt.method||'GET',mode:'cors',credentials:'omit',cache:'no-store',signal:ctl.signal,headers:Object.assign({accept:'application/json,text/plain,*/*'},opt.headers||{})};
      if(opt.body!==undefined)init.body=typeof opt.body==='string'?opt.body:JSON.stringify(opt.body);
      var r=await fetch(url,init);if(!r.ok)throw new Error('HTTP '+r.status);return await r.json();
    }finally{clearTimeout(timer);}
  }
  async function safe(name,fn){try{return {name:name,ok:true,value:await fn()};}catch(e){return {name:name,ok:false,value:null,error:String(e&&e.message||e)};}}

  function queueFind(root,keys){
    var q=[root],seen=[];
    while(q.length){var x=q.shift();if(!x||typeof x!=='object'||seen.indexOf(x)>=0)continue;seen.push(x);var ok=true;for(var i=0;i<keys.length;i++)if(!Object.prototype.hasOwnProperty.call(x,keys[i])){ok=false;break;}if(ok)return x;var vals=Array.isArray(x)?x:Object.keys(x).map(function(k){return x[k];});q=q.concat(vals);}
    return null;
  }
  function pick(root,keys){
    var q=[root],seen=[];
    while(q.length){var x=q.shift();if(!x||typeof x!=='object'||seen.indexOf(x)>=0)continue;seen.push(x);for(var i=0;i<keys.length;i++){if(Object.prototype.hasOwnProperty.call(x,keys[i])){var n=toNumber(x[keys[i]]);if(n!==null)return n;}}var vals=Array.isArray(x)?x:Object.keys(x).map(function(k){return x[k];});q=q.concat(vals);}
    return null;
  }

  function normalizeRealtime(code,raw){
    var row=(raw&&raw.datas&&raw.datas[0])||(raw&&raw.result&&raw.result.areas&&raw.result.areas[0]&&raw.result.areas[0].datas&&raw.result.areas[0].datas[0])||{};
    var pct=toNumber(row.fluctuationsRatioRaw!=null?row.fluctuationsRatioRaw:(row.fluctuationsRatio!=null?row.fluctuationsRatio:row.cr));
    var direction=(row.compareToPreviousPrice&&row.compareToPreviousPrice.name)||row.risefall||row.fluctuationsType||'';
    if(pct!==null&&/FALL|하락|LOW|5/i.test(String(direction)))pct=-Math.abs(pct);
    return {code:code,level:toNumber(row.closePriceRaw!=null?row.closePriceRaw:row.closePrice),change:toNumber(row.compareToPreviousClosePriceRaw!=null?row.compareToPreviousClosePriceRaw:row.compareToPreviousClosePrice),changePct:pct,open:toNumber(row.openPriceRaw!=null?row.openPriceRaw:row.openPrice),high:toNumber(row.highPriceRaw!=null?row.highPriceRaw:row.highPrice),low:toNumber(row.lowPriceRaw!=null?row.lowPriceRaw:row.lowPrice),tradedValue:toNumber(row.accumulatedTradingValueRaw!=null?row.accumulatedTradingValueRaw:row.accumulatedTradingValue),tradedVolume:toNumber(row.accumulatedTradingVolumeRaw!=null?row.accumulatedTradingVolumeRaw:row.accumulatedTradingVolume),marketStatus:row.marketStatus||row.ms||null,localTradedAt:row.localTradedAt||null,source:'NAVER DIRECT'};
  }
  function normalizeIntegration(raw){
    var trend=(raw&&raw.dealTrendInfo)||queueFind(raw,['personalValue','foreignValue','institutionalValue'])||{};
    var a=pick(raw,['riseCount','risingStockCount','riseStockCount','upStockCount','advanceCount','advancers']);
    var d=pick(raw,['fallCount','fallingStockCount','fallStockCount','downStockCount','declineCount','decliners']);
    var u=pick(raw,['steadyCount','unchangedStockCount','steadyStockCount','flatStockCount','unchangedCount']);
    var dir=(a||0)+(d||0);
    return {flow:{basisLabel:trend.bizdate||trend.localTradedAt||null,personal:toNumber(trend.personalValue),foreign:toNumber(trend.foreignValue),institution:toNumber(trend.institutionalValue),unit:'억원'},breadth:(a===null&&d===null&&u===null)?null:{advancers:a,decliners:d,unchanged:u,advanceDeclineRatio:dir?(a||0)/dir:null}};
  }
  function buildPulse(idx,fl,br){
    var s=50,reasons=[];
    if(idx&&idx.changePct!==null){s+=Math.max(-22,Math.min(22,idx.changePct*6));reasons.push(idx.code+' '+signed(idx.changePct,2)+'%');}
    var smart=(fl&&fl.foreign||0)+(fl&&fl.institution||0);
    if(fl&&(fl.foreign!==null||fl.institution!==null)){s+=smart>0?10:smart<0?-10:0;reasons.push('외+기 '+Math.round(smart)+'억');}
    if(br&&br.advanceDeclineRatio!==null&&br.advanceDeclineRatio!==undefined){s+=Math.max(-10,Math.min(10,(br.advanceDeclineRatio-.5)*24));reasons.push('상승비중 '+Math.round(br.advanceDeclineRatio*100)+'%');}
    s=Math.max(0,Math.min(100,Math.round(s)));return {score:s,regime:s>=63?'RISK-ON':s<=37?'RISK-OFF':'NEUTRAL',reasons:reasons};
  }
  function mergeMarket(code,rt,intg,fallback){
    var idx=rt&&rt.level!==null?rt:(fallback&&fallback.index?fallback.index:null),fl=intg&&intg.flow?intg.flow:(fallback&&fallback.flow?fallback.flow:{foreign:null,institution:null,personal:null}),br=intg&&intg.breadth?intg.breadth:(fallback&&fallback.breadth?fallback.breadth:null);
    if(idx&&!idx.source)idx.source=rt&&rt.level!==null?'NAVER DIRECT':'SNAPSHOT FALLBACK';
    return idx?{index:idx,flow:fl,breadth:br,pulse:buildPulse(idx,fl,br)}:null;
  }

  var TV_COLUMNS=['name','description','close','change','volume','Value.Traded','relative_volume_10d_calc','market_cap_basic','price_earnings_ttm','price_book_fq','RSI','Perf.W','Perf.1M','Perf.3M','sector'];
  function tvBody(){return {filter:[],options:{lang:'ko'},symbols:{query:{types:[]},tickers:[]},columns:TV_COLUMNS,sort:{sortBy:'Value.Traded',sortOrder:'desc'},range:[0,100]};}
  function normalizeScanner(raw){
    if(!raw||!Array.isArray(raw.data))return {ok:false,error:'scanner_unavailable'};
    var rows=raw.data.map(function(row){var d=Array.isArray(row&&row.d)?row.d:[],x={};for(var i=0;i<TV_COLUMNS.length;i++)x[TV_COLUMNS[i]]=d[i];var sym=String(row&&row.s||'');return {symbol:sym,code:String(x.name||sym.split(':').pop()||'').replace(/^A/,''),name:x.description||x.name||sym,close:toNumber(x.close),changePct:toNumber(x.change),volume:toNumber(x.volume),tradedValue:toNumber(x['Value.Traded']),relativeVolume10d:toNumber(x.relative_volume_10d_calc),marketCap:toNumber(x.market_cap_basic),per:toNumber(x.price_earnings_ttm),pbr:toNumber(x.price_book_fq),rsi:toNumber(x.RSI),perf1w:toNumber(x['Perf.W']),perf1m:toNumber(x['Perf.1M']),perf3m:toNumber(x['Perf.3M']),sector:x.sector||'기타'};}).filter(function(x){return x.close!==null;});
    var rsi=rows.filter(function(x){return x.rsi!==null;}),m1=rows.filter(function(x){return x.perf1m!==null;}),sectors={};rows.forEach(function(x){if(x.changePct===null)return;var k=x.sector||'기타';if(!sectors[k])sectors[k]=[];sectors[k].push(x.changePct);});
    var sec=Object.keys(sectors).map(function(k){var a=sectors[k];return {sector:k,avgChangePct:a.reduce(function(s,v){return s+v;},0)/a.length,n:a.length};}).sort(function(a,b){return b.avgChangePct-a.avgChangePct;});
    return {ok:true,provider:'TradingView direct',rowsN:rows.length,topTurnover:rows.slice().sort(function(a,b){return (b.tradedValue||0)-(a.tradedValue||0);}).slice(0,10),technical:{rsi60SharePct:rsi.length?rsi.filter(function(x){return x.rsi>=60;}).length/rsi.length*100:null,positive1mSharePct:m1.length?m1.filter(function(x){return x.perf1m>0;}).length/m1.length*100:null},sectors:sec.slice(0,5)};
  }

  function dateAge(raw){var s=String(raw||'').replace(/[^0-9]/g,'');if(s.length<8)return null;var d=new Date(s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6,8)+'T00:00:00+09:00');return isNaN(d.getTime())?null:Math.max(0,Math.floor((Date.now()-d.getTime())/86400000));}
  function normalizeIntraday(raw){var e=Array.isArray(raw&&raw.events)?raw.events:(Array.isArray(raw)?raw:[]);return {count:e.length,preOpen:e.filter(function(x){return x&&x.session==='pre_open';}).length,intraday:e.filter(function(x){return x&&x.session==='intraday';}).length,afterClose:e.filter(function(x){return x&&x.session==='after_close';}).length,top:e.slice(0,6)};}
  function normalizeResearch(today,indexMeta,intraday){
    if(!today||typeof today!=='object')return {ok:false,error:'research_unavailable'};
    var asof=today.quote_as_of||today.as_of||null,age=dateAge(asof),stale=age!==null?age>4:false;
    var es=today.earnings_stats||{};
    return {ok:true,provider:'aikstockdata direct',source:today.source||'DART · 금융위원회',quoteAsOf:asof,generatedKst:today.generated_kst||(indexMeta&&indexMeta.generated_kst)||null,disclosureThrough:today.disclosure_through||null,ageDays:age,stale:stale,marketBreadth:today.market_breadth||null,highsLows52w:today.highs_lows_52w||null,earnings:{reportedN:toNumber(today.earnings_reported_n!=null?today.earnings_reported_n:es.reported_n),improveRatePct:toNumber(today.earnings_improve_rate_pct!=null?today.earnings_improve_rate_pct:es.improve_rate_pct),turnaroundCount:toNumber(today.earnings_turnaround_n!=null?today.earnings_turnaround_n:(today.earnings_turnaround&&today.earnings_turnaround.count)),scope:es.scope||null},growthTop:(Array.isArray(today.growth_top3)?today.growth_top3:[]).slice(0,3).map(function(x){return {name:x&&x.name||null,code:x&&x.code||null,score:toNumber(x&&x.score),revenueYoyPct:toNumber(x&&x.revenue_yoy_pct),operatingIncomeYoyPct:toNumber(x&&x.operating_income_yoy_pct),status:x&&x.status||null};}),topDisclosures:(Array.isArray(today.top_disclosures)?today.top_disclosures:[]).slice(0,5),intraday:normalizeIntraday(intraday)};
  }

  async function snapshot(){var r=await safe('snapshot',function(){return fetchJson(API.snapshot+'?t='+Date.now(),{timeout:5000});});return r.ok&&r.value&&r.value.ok?r.value:null;}
  async function marketDirect(fallback){
    var tasks=[];['KOSPI','KOSDAQ'].forEach(function(code){tasks.push(safe(code+'_rt',function(){return fetchJson(API.naver[code].realtime);}));tasks.push(safe(code+'_int',function(){return fetchJson(API.naver[code].integration);}));});
    var r=await Promise.all(tasks),map={};r.forEach(function(x){map[x.name]=x;});var markets={};['KOSPI','KOSDAQ'].forEach(function(code){var rt=map[code+'_rt'].ok?normalizeRealtime(code,map[code+'_rt'].value):null,intg=map[code+'_int'].ok?normalizeIntegration(map[code+'_int'].value):null;markets[code]=mergeMarket(code,rt,intg,fallback&&fallback.markets&&fallback.markets[code]);});
    return {markets:markets,providers:{naverRealtime:map.KOSPI_rt.ok&&map.KOSDAQ_rt.ok,naverIntegration:map.KOSPI_int.ok&&map.KOSDAQ_int.ok},errors:r.filter(function(x){return !x.ok;}).map(function(x){return x.name+': '+x.error;})};
  }
  async function scannerDirect(){var r=await safe('tv',function(){return fetchJson(API.tv,{method:'POST',headers:{'content-type':'text/plain;charset=UTF-8'},body:tvBody(),timeout:9000});});return r.ok?normalizeScanner(r.value):{ok:false,error:r.error};}
  async function researchDirect(){var r=await Promise.all([safe('today',function(){return fetchJson(API.aik.today);}),safe('index',function(){return fetchJson(API.aik.index);}),safe('intraday',function(){return fetchJson(API.aik.intraday);})]);var m={};r.forEach(function(x){m[x.name]=x;});return {research:m.today.ok?normalizeResearch(m.today.value,m.index.ok?m.index.value:null,m.intraday.ok?m.intraday.value:null):{ok:false,error:m.today.error||'research_unavailable'},ok:m.today.ok,errors:r.filter(function(x){return !x.ok;}).map(function(x){return x.name+': '+x.error;})};}
  function combinePulse(markets){var vals=['KOSPI','KOSDAQ'].map(function(k){return markets[k]&&markets[k].pulse?markets[k].pulse.score:null;}).filter(function(v){return v!==null;});var s=vals.length?Math.round(vals.reduce(function(a,b){return a+b;},0)/vals.length):50;return {score:s,regime:s>=63?'RISK-ON':s<=37?'RISK-OFF':'NEUTRAL'};}
  function relative(markets){var a=markets.KOSPI&&markets.KOSPI.index&&markets.KOSPI.index.changePct,b=markets.KOSDAQ&&markets.KOSDAQ.index&&markets.KOSDAQ.index.changePct,d=(a!==null&&a!==undefined&&b!==null&&b!==undefined)?b-a:null;return {kosdaqMinusKospiPctPoint:d,regime:d===null?'N/A':d>=.5?'RISK-CAPITAL LEADS':d<=-.5?'LARGE-CAP LEADS':'BALANCED'};}

  function cardByTitle(title){var cards=document.querySelectorAll('#pane .cd');for(var i=0;i<cards.length;i++){var t=cards[i].querySelector('.cdt');if(t&&t.textContent.trim()===title)return cards[i];}return null;}
  function marketRow(code,m){if(!m)return '<div class="liveq-market"><div class="liveq-marketname">'+code+'</div><div class="liveq-marketmiss">FEED PENDING</div></div>';var idx=m.index||{},fl=m.flow||{},br=m.breadth||{},p=m.pulse||{},breadth=(br&&br.advancers!=null&&br.decliners!=null)?Number(br.advancers).toLocaleString('ko-KR')+' / '+Number(br.decliners).toLocaleString('ko-KR'):'—';return '<div class="liveq-market"><div class="liveq-markettop"><div><span class="liveq-marketname">'+code+'</span><strong>'+esc(idx.level==null?'—':Number(idx.level).toLocaleString('ko-KR',{minimumFractionDigits:2,maximumFractionDigits:2}))+'</strong></div><b class="'+tone(idx.changePct)+'">'+esc(signed(idx.changePct,2))+'%</b></div><div class="liveq-marketpulse"><span class="'+pulseTone(p.regime)+'">'+esc(p.regime||'—')+' · '+esc(p.score==null?'—':p.score+'/100')+'</span><em>'+esc(idx.source||idx.marketStatus||'—')+'</em></div><div class="liveq-marketgrid"><span>외국인 <b class="'+tone(fl&&fl.foreign)+'">'+esc(flow(fl&&fl.foreign))+'</b></span><span>기관 <b class="'+tone(fl&&fl.institution)+'">'+esc(flow(fl&&fl.institution))+'</b></span><span>상승/하락 <b>'+esc(breadth)+'</b></span><span>거래대금 <b>'+esc(won(idx.tradedValue))+'</b></span></div></div>';}
  function scannerInline(s){if(!s||!s.ok||!s.topTurnover||!s.topTurnover.length)return '<div class="scannerline muted">TRADINGVIEW SCANNER · DIRECT API PENDING</div>';var rows=s.topTurnover.slice(0,3).map(function(x){return '<span><b>'+esc(x.name||x.code||'—')+'</b> <em class="'+tone(x.changePct)+'">'+esc(signed(x.changePct,1))+'%</em></span>';}).join('');return '<div class="scannerline"><i></i><strong>거래대금 TOP</strong>'+rows+'</div>';}
  function providerText(){var p=LIVE.providers||{},a=[];a.push(p.naverRealtime?'NAVER LIVE':'NAVER FALLBACK');a.push(p.naverIntegration?'FLOW LIVE':'FLOW FALLBACK');a.push(p.tv?'TV LIVE':'TV PENDING');return a.join(' · ');}
  function liveCardHtml(){var d=LIVE.data;if(LIVE.status==='loading'&&!d)return '<div class="cd liveq"><div class="cdh"><span class="cdt">LIVE MARKET · KOREA</span><span class="cdo">DIRECT API 연결 중</span></div><div class="liveq-loading">NAVER · TRADINGVIEW · FALLBACK 동기화</div></div>';if(!d||!d.ok)return '<div class="cd liveq degraded" id="cd_live_equity"><div class="cdh"><span class="cdt">LIVE MARKET · KOREA</span><span class="cdo">DEGRADED</span></div><div class="note">공개 API와 Snapshot 모두 갱신 대기 중입니다. IPO/CB 구조적 시그널은 유지됩니다.</div></div>';var kp=market(d,'KOSPI'),kd=market(d,'KOSDAQ'),p=d.pulse||{},rel=d.relative||{},relText=rel.kosdaqMinusKospiPctPoint==null?'—':signed(rel.kosdaqMinusKospiPctPoint,2)+'%p';return '<div class="cd liveq" id="cd_live_equity"><div class="cdh"><span class="cdt">LIVE MARKET · KOREA</span><span class="cdo">'+esc(hhmm(d.generatedAt))+' · '+esc(d.mode)+'</span></div><div class="liveq-signal"><span>COMPOSITE RISK APPETITE</span><strong class="'+pulseTone(p.regime)+'">'+esc(p.regime||'—')+' · '+esc(p.score==null?'—':p.score+'/100')+'</strong></div><div class="liveq-rel"><span>KOSDAQ - KOSPI</span><b class="'+tone(rel.kosdaqMinusKospiPctPoint)+'">'+esc(relText)+'</b><em>'+esc(rel.regime||'N/A')+'</em></div><div class="liveq-markets">'+marketRow('KOSPI',kp)+marketRow('KOSDAQ',kd)+'</div>'+scannerInline(d.scanner)+'<div class="liveq-source"><i></i><span>'+esc(providerText())+'</span><em>70s</em></div></div>';}

  function growthRow(x){if(!x)return '';var op=x.operatingIncomeYoyPct,opText=op==null?(x.status||'—'):signed(op,1)+'%';return '<div class="fundq-row"><span><b>'+esc(x.name||x.code||'—')+'</b><em>'+esc(x.code||'')+'</em></span><span>매출 '+esc(signed(x.revenueYoyPct,1))+'%</span><span>영익 '+esc(opText)+'</span><strong>'+esc(x.score==null?'—':num(x.score,1))+'</strong></div>';}
  function disclosureLine(r){var i=r&&r.intraday||{};if(i.count==null)return '';return '<div class="fundq-event"><span>DART EVENT PULSE</span><b>'+esc(i.count)+'건</b><em>장중 '+esc(i.intraday||0)+' · 장후 '+esc(i.afterClose||0)+'</em></div>';}
  function scannerStats(s){if(!s||!s.ok)return '<div class="fundq-scanner"><span>TV SCANNER</span><b>DIRECT PENDING</b><b>—</b><em>CORS/UPSTREAM</em></div>';var t=s.technical||{},sector=s.sectors&&s.sectors.length?s.sectors[0]:null;return '<div class="fundq-scanner"><span>TV SCANNER</span><b>RSI≥60 '+esc(t.rsi60SharePct==null?'—':num(t.rsi60SharePct,0)+'%')+'</b><b>1M+ '+esc(t.positive1mSharePct==null?'—':num(t.positive1mSharePct,0)+'%')+'</b><em>'+esc(sector?sector.sector+' '+signed(sector.avgChangePct,1)+'%':'SECTOR PENDING')+'</em></div>';}
  function fundamentalCardHtml(){var d=LIVE.data||{},r=d.research,s=d.scanner;if(!r||!r.ok)return '<div class="cd fundq degraded" id="cd_fundamental_live"><div class="cdh"><span class="cdt">EQUITY FUNDAMENTAL PULSE</span><span class="cdo">DIRECT API PENDING</span></div><div class="note">DART/FSC Research feed 갱신 대기 중.</div>'+scannerStats(s)+'</div>';var e=r.earnings||{},hl=r.highsLows52w||{},mb=r.marketBreadth||{},growth=Array.isArray(r.growthTop)?r.growthTop:[],fresh=(r.stale?'STALE · ':'AS-OF · ')+shortDate(r.quoteAsOf);return '<div class="cd fundq'+(r.stale?' stale':'')+'" id="cd_fundamental_live"><div class="cdh"><span class="cdt">EQUITY FUNDAMENTAL PULSE</span><span class="cdo">'+esc(fresh)+'</span></div><div class="fundq-signal"><span>DART EARNINGS BREADTH</span><strong>'+esc(e.improveRatePct==null?'—':num(e.improveRatePct,0)+'%')+'</strong><em>'+esc(e.reportedN==null?'—':Number(e.reportedN).toLocaleString('ko-KR')+'개')+'</em></div><div class="fundq-grid"><div><span>흑자전환</span><b>'+esc(e.turnaroundCount==null?'—':Number(e.turnaroundCount).toLocaleString('ko-KR')+'개')+'</b></div><div><span>52주 신고가 / 신저가</span><b>'+esc(hl&&hl.n_high==null?'—':hl.n_high)+' / '+esc(hl&&hl.n_low==null?'—':hl.n_low)+'</b></div><div><span>시장 상승비중</span><b>'+esc(mb&&mb.advance_ratio_ex_flat_pct==null?'—':num(mb.advance_ratio_ex_flat_pct,1)+'%')+'</b></div><div><span>Research 기준</span><b>'+esc(shortDate(r.quoteAsOf))+'</b></div></div>'+disclosureLine(r)+scannerStats(s)+'<div class="fundq-head">실적 성장 상위 · DART/FSC 실제 수치</div><div class="fundq-list">'+growth.map(growthRow).join('')+'</div>'+(r.stale?'<div class="note fundq-note"><b>Research 기준일이 오래되어 Live 점수에는 반영하지 않습니다.</b></div>':'')+'<div class="liveq-source"><i></i><span>DIRECT API · AIKSTOCKDATA · DART/FSC</span><em>'+esc(shortDate(r.quoteAsOf))+'</em></div></div>';}

  function patchNodes(){var d=LIVE.data;if(!d||!d.ok||typeof NEL==='undefined')return;var kp=market(d,'KOSPI'),kd=market(d,'KOSDAQ'),p=d.pulse||{},rel=d.relative||{},kdf=kd&&kd.flow||{},kpb=kp&&kp.breadth||{},kdb=kd&&kd.breadth||{},bs=[];if(kpb.advanceDeclineRatio!=null)bs.push(Number(kpb.advanceDeclineRatio));if(kdb.advanceDeclineRatio!=null)bs.push(Number(kdb.advanceDeclineRatio));var avg=bs.length?bs.reduce(function(a,b){return a+b;},0)/bs.length*100:null;if(typeof shocked==='function'&&!shocked()){if(NEL.eq_fin){if(NEL.eq_fin.v&&avg!=null)NEL.eq_fin.v.textContent=Math.round(avg)+'%';if(NEL.eq_fin.s)NEL.eq_fin.s.textContent='KOSPI·KOSDAQ 상승비중';}if(NEL.eq_val){if(NEL.eq_val.v&&rel.kosdaqMinusKospiPctPoint!=null)NEL.eq_val.v.textContent=signed(rel.kosdaqMinusKospiPctPoint,2)+'%p';if(NEL.eq_val.s)NEL.eq_val.s.textContent='KOSDAQ vs KOSPI 상대강도';}if(NEL.eq_ipo&&NEL.eq_ipo.s)NEL.eq_ipo.s.textContent='외 '+flow(kdf.foreign)+' · 기관 '+flow(kdf.institution);if(typeof si!=='undefined'&&si===4&&NEL.sig_equity){NEL.sig_equity.v.textContent=p.regime||'NEUTRAL';NEL.sig_equity.s.textContent='DIRECT LIVE · CONF '+(p.score||50)+'%';NEL.sig_equity.st.textContent='LIVE';if(NEL.sig_equity.bf&&p.score!=null)NEL.sig_equity.bf.setAttribute('width',(TW-20)*Number(p.score)/100);}}
    var fd=document.getElementById('fd');if(fd)fd.textContent=hhmm(d.generatedAt)+' DIRECT EQUITY · '+providerText();}
  function enhanceEquity(){if(typeof curTab==='undefined'||curTab!=='EQUITY')return;var live=cardByTitle('할인율 민감도')||cardByTitle('LIVE MARKET · KOREA')||document.getElementById('cd_live_equity');if(live){var h=document.createElement('div');h.innerHTML=liveCardHtml();live.replaceWith(h.firstElementChild);}var fund=cardByTitle('IPO FUNDAMENTAL SCORE')||cardByTitle('EQUITY FUNDAMENTAL PULSE')||document.getElementById('cd_fundamental_live');if(fund){var f=document.createElement('div');f.innerHTML=fundamentalCardHtml();fund.replaceWith(f.firstElementChild);}patchNodes();}

  async function refreshMarket(force){if(!force&&Date.now()-LIVE.lastFetch<45000)return;LIVE.status='loading';if(typeof curTab!=='undefined'&&curTab==='EQUITY')enhanceEquity();var fb=await snapshot(),m=await marketDirect(fb),s=await scannerDirect(),markets=m.markets,pulse=combinePulse(markets);LIVE.providers={naverRealtime:!!m.providers.naverRealtime,naverIntegration:!!m.providers.naverIntegration,tv:!!s.ok,aik:LIVE.providers.aik||false};LIVE.data=Object.assign({},LIVE.data||{},{ok:!!(markets.KOSPI||markets.KOSDAQ),generatedAt:nowIso(),mode:(m.providers.naverRealtime?'DIRECT_API':'SNAPSHOT_FALLBACK'),markets:markets,pulse:pulse,relative:relative(markets),scanner:s,errors:(m.errors||[]).concat(s.ok?[]:['tv: '+s.error])});LIVE.status=LIVE.data.ok?'ready':'error';LIVE.lastFetch=Date.now();enhanceEquity();patchNodes();}
  async function refreshResearch(force){if(!force&&Date.now()-LIVE.lastResearchFetch<RESEARCH_MS-10000)return;var r=await researchDirect();LIVE.providers.aik=!!r.ok;if(!LIVE.data)LIVE.data={ok:false,generatedAt:nowIso(),mode:'DIRECT_API',markets:{},pulse:{score:50,regime:'NEUTRAL'},relative:{regime:'N/A'}};LIVE.data.research=r.research;LIVE.data.generatedAt=nowIso();LIVE.lastResearchFetch=Date.now();enhanceEquity();}
  async function refreshAll(force){await Promise.all([refreshMarket(force),refreshResearch(force)]);}

  var originalPaneRender=window.paneRender;if(typeof originalPaneRender==='function'){window.paneRender=function(){originalPaneRender.apply(this,arguments);enhanceEquity();};}
  document.addEventListener('visibilitychange',function(){if(!document.hidden)refreshAll(true);});window.addEventListener('focus',function(){refreshAll(false);});LIVE.timer=setInterval(function(){if(!document.hidden)refreshMarket(false);},POLL_MS);LIVE.researchTimer=setInterval(function(){if(!document.hidden)refreshResearch(false);},RESEARCH_MS);refreshAll(true);
})();