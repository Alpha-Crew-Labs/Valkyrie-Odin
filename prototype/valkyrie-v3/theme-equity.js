/* VALKYRIE · Naver/Npay live theme intelligence
 * Public keyless read-only endpoints only.
 * Cursor-ranked theme universe -> selected theme constituents.
 * Direct first; same-origin public snapshot fallback; never fabricated live data.
 */
(function(){
  'use strict';

  var BASE='https://stock.naver.com/api/domestic/market/theme';
  var RANK='https://stock.naver.com/api/stockSecurity/rankings/v2/domestic/themes';
  var SNAPSHOT='./data/theme-pulse.json';
  var REFRESH_MS=120000;
  var STATE={status:'idle',mode:'DATA_PENDING',themes:[],top:[],bottom:[],selected:null,stocks:[],stocksStatus:'idle',generatedAt:null,error:null,timer:null};
  window.VALKYRIE_THEME_EQUITY=STATE;

  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function n(v){if(typeof v==='number')return isFinite(v)?v:null;if(v===null||v===undefined||v==='')return null;var x=Number(String(v).replace(/[^0-9+\-.]/g,''));return isFinite(x)?x:null;}
  function pct(v){var x=n(v);return x===null?'—':(x>0?'+':'')+x.toFixed(2)+'%';}
  function price(v){var x=n(v);return x===null?'—':Math.round(x).toLocaleString('ko-KR');}
  function amount(v){var x=n(v);if(x===null)return '—';if(Math.abs(x)>=1e12)return (x/1e12).toFixed(1)+'조';if(Math.abs(x)>=1e8)return Math.round(x/1e8).toLocaleString('ko-KR')+'억';return Math.round(x).toLocaleString('ko-KR');}
  function tone(v){var x=n(v);return x===null?'':x>0?'up':x<0?'down':'flat';}
  function stamp(v){if(!v)return '—';var d=new Date(v);if(isNaN(d.getTime()))return String(v);try{return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(d);}catch(e){return String(v);}}

  async function fetchJson(url,timeout){
    var ctl=new AbortController(),t=setTimeout(function(){ctl.abort();},timeout||8000);
    try{var r=await fetch(url,{cache:'no-store',credentials:'omit',mode:'cors',signal:ctl.signal,headers:{accept:'application/json,text/plain,*/*'}});if(!r.ok)throw new Error('HTTP '+r.status);return await r.json();}
    finally{clearTimeout(t);}
  }
  function findArray(root,pred){
    var q=[root],seen=[];
    while(q.length){var x=q.shift();if(!x||typeof x!=='object'||seen.indexOf(x)>=0)continue;seen.push(x);if(Array.isArray(x)&&x.some(pred))return x;var vals=Array.isArray(x)?x:Object.keys(x).map(function(k){return x[k];});for(var i=0;i<vals.length;i++)if(vals[i]&&typeof vals[i]==='object')q.push(vals[i]);}
    return [];
  }
  function stockRows(raw){return findArray(raw,function(x){return x&&x.itemcode!=null&&x.itemname!=null;});}
  function normLead(x){
    var src=Array.isArray(x&&x.topByChangeRate)?x.topByChangeRate:(Array.isArray(x&&x.leadingItem)?x.leadingItem:[]),a=[];
    for(var i=0;i<src.length;i++){var r=src[i]||{};a.push({code:String(r.code||r.itemcode||r.itemCode||''),name:r.name||r.itemname||r.itemName||''});}
    return a.filter(function(z){return z.code||z.name;}).slice(0,2);
  }
  function normTheme(x){
    var id=x&&x.code!=null?x.code:x&&x.no;
    return {no:String(id==null?'':id),name:String(x&&x.name||''),changeRate:n(x&&x.changeRate),riseCnt:n(x&&(x.risingCount!=null?x.risingCount:x.riseCnt)),fallCnt:n(x&&(x.fallingCount!=null?x.fallingCount:x.fallCnt)),steadyCnt:n(x&&(x.unchangedCount!=null?x.unchangedCount:x.steadyCnt)),leadingItem:normLead(x),thistime:x&&(x.updatedAt||x.thistime||x.localTradedAt)||null};
  }
  function normStock(x){
    var ch=n(x.prevChangeRate),gb=String(x.upDownGb==null?'':x.upDownGb);
    if(ch!==null&&(/5|down|fall|하락/i.test(gb)))ch=-Math.abs(ch);else if(ch!==null&&(/2|up|rise|상승/i.test(gb)))ch=Math.abs(ch);
    return {code:String(x.itemcode||''),name:String(x.itemname||''),price:n(x.nowPrice),changePrice:n(x.prevChangePrice),changeRate:ch,tradeVolume:n(x.tradeVolume),tradeAmount:n(x.tradeAmount),marketStatus:x.marketStatus||null};
  }
  function uniqThemes(rows){var m={};rows.forEach(function(x){var t=normTheme(x);if(t.no&&t.name)m[t.no]=t;});return Object.keys(m).map(function(k){return m[k];});}
  function rank(themes){
    var a=themes.filter(function(x){return x.changeRate!==null;}).slice().sort(function(a,b){return b.changeRate-a.changeRate;});
    return {top:a.filter(function(x){return x.changeRate>0;}).slice(0,5),bottom:a.filter(function(x){return x.changeRate<0;}).slice().sort(function(a,b){return a.changeRate-b.changeRate;}).slice(0,5)};
  }
  async function directThemes(){
    var all=[],seen={},cursor='',pages=0;
    do{
      var url=RANK+'?sortType=changeRate&size=100&excludeCodes=25&period=daily'+(cursor?'&cursor='+encodeURIComponent(cursor):'');
      var raw=await fetchJson(url,9000),rows=Array.isArray(raw&&raw.items)?raw.items:[],added=0;
      for(var i=0;i<rows.length;i++){var id=String(rows[i]&&rows[i].code||'');if(id&&!seen[id]){seen[id]=1;all.push(rows[i]);added++;}}
      pages++;
      if(raw&&raw.hasNext===true&&raw.cursor&&added>0){cursor=String(raw.cursor);}else{cursor='';}
    }while(cursor&&pages<8);
    var themes=uniqThemes(all),r=rank(themes);
    if(themes.length<50||!r.top.length||!r.bottom.length)throw new Error('incomplete theme universe: '+themes.length+' rows / '+r.top.length+' gainers / '+r.bottom.length+' losers');
    return themes;
  }
  async function snapshot(){var p=await fetchJson(SNAPSHOT+'?t='+Date.now(),5000);if(!p||p.ok!==true||!Array.isArray(p.themes)||p.themes.length<50)throw new Error('theme snapshot unavailable');return p;}
  async function directStocks(no){
    var all=[],seen={},pageSize=100;
    for(var start=0;start<200;start+=pageSize){
      var raw=await fetchJson(BASE+'/'+encodeURIComponent(no)+'/stocklist?marketType=ALL&orderType=quantTop&startIdx='+start+'&pageSize='+pageSize);
      var rows=stockRows(raw),added=0;
      for(var i=0;i<rows.length;i++){var code=String(rows[i].itemcode||'');if(code&&!seen[code]){seen[code]=1;all.push(normStock(rows[i]));added++;}}
      if(rows.length<pageSize||added===0)break;
    }
    if(!all.length)throw new Error('constituents unavailable');
    return all.sort(function(a,b){return (b.tradeAmount||0)-(a.tradeAmount||0);});
  }
  function fallbackStocks(no){var c=STATE.snapshotConstituents||{};return Array.isArray(c[String(no)])?c[String(no)].map(function(x){return {code:String(x.code||''),name:String(x.name||''),price:n(x.price),changePrice:n(x.changePrice),changeRate:n(x.changeRate),tradeVolume:n(x.tradeVolume),tradeAmount:n(x.tradeAmount),marketStatus:x.marketStatus||null};}):[];}

  function themeButton(t,side){
    var lead=(t.leadingItem||[]).map(function(x){return x.name;}).filter(Boolean).join(' · ');
    return '<button type="button" class="themeq-row '+tone(t.changeRate)+(STATE.selected&&STATE.selected.no===t.no?' on':'')+'" data-theme-no="'+esc(t.no)+'">'
      +'<span class="themeq-rank">'+(side==='up'?'▲':'▼')+'</span><span class="themeq-name"><b>'+esc(t.name)+'</b><small>'+esc(lead||((t.riseCnt==null?'—':t.riseCnt)+'↑ · '+(t.fallCnt==null?'—':t.fallCnt)+'↓'))+'</small></span>'
      +'<strong>'+esc(pct(t.changeRate))+'</strong><em>'+esc((t.riseCnt==null?'—':t.riseCnt)+'↑ '+(t.steadyCnt==null?'—':t.steadyCnt)+'→ '+(t.fallCnt==null?'—':t.fallCnt)+'↓')+'</em></button>';
  }
  function stockRow(s,i){return '<div class="themeq-stock"><span class="themeq-stock-rank">'+String(i+1).padStart(2,'0')+'</span><span class="themeq-stock-name"><b>'+esc(s.name)+'</b><small>'+esc(s.code)+'</small></span><span class="themeq-stock-price">'+esc(price(s.price))+'</span><strong class="'+tone(s.changeRate)+'">'+esc(pct(s.changeRate))+'</strong><em>'+esc(amount(s.tradeAmount))+'</em></div>';}
  function emptyStock(msg){return '<div class="themeq-empty">'+esc(msg)+'</div>';}
  function render(){
    var root=document.getElementById('themePulse');if(!root)return;
    var sel=STATE.selected,stocks=STATE.stocks||[];
    var top=STATE.top.length?STATE.top.map(function(t){return themeButton(t,'up');}).join(''):emptyStock('강세 테마 DATA PENDING');
    var bottom=STATE.bottom.length?STATE.bottom.map(function(t){return themeButton(t,'down');}).join(''):emptyStock('약세 테마 DATA PENDING');
    var stockHtml=STATE.stocksStatus==='loading'?emptyStock('구성 종목 불러오는 중…'):stocks.length?stocks.slice(0,12).map(stockRow).join(''):emptyStock(STATE.stocksStatus==='error'?'구성 종목 DATA PENDING':'테마를 선택하세요');
    root.innerHTML='<div class="themeq-head"><div><span>THEME FLOW</span><b>NAVER PAY SECURITIES · PUBLIC</b></div><div class="themeq-meta"><i class="'+(STATE.mode==='DIRECT_API'?'live':'')+'"></i>'+esc(STATE.mode==='DIRECT_API'?'DIRECT':'SNAPSHOT')+' · '+esc(stamp(STATE.generatedAt))+'</div></div>'
      +'<div class="themeq-body"><div class="themeq-lists"><section><div class="themeq-title"><b>오늘 강세 테마</b><span>TOP 5</span></div>'+top+'</section><section><div class="themeq-title"><b>오늘 약세 테마</b><span>BOTTOM 5</span></div>'+bottom+'</section></div>'
      +'<section class="themeq-detail"><div class="themeq-detail-head"><div><span>선택 테마 구성 종목</span><b>'+(sel?esc(sel.name):'DATA PENDING')+'</b></div><strong class="'+(sel?tone(sel.changeRate):'')+'">'+(sel?esc(pct(sel.changeRate)):'—')+'</strong></div>'
      +(sel?'<div class="themeq-breadth"><span>상승 <b class="up">'+esc(sel.riseCnt==null?'—':sel.riseCnt)+'</b></span><span>보합 <b>'+esc(sel.steadyCnt==null?'—':sel.steadyCnt)+'</b></span><span>하락 <b class="down">'+esc(sel.fallCnt==null?'—':sel.fallCnt)+'</b></span><em>거래대금 상위 구성종목</em></div>':'')
      +'<div class="themeq-stock-head"><span>#</span><span>종목</span><span>현재가</span><span>등락률</span><span>거래대금</span></div><div class="themeq-stocks">'+stockHtml+'</div></section></div>'
      +'<div class="themeq-foot">테마 수익률·상승/하락 종목수·구성종목은 Naver/Npay 공개 read-only API 기준 · 전체 cursor 테마 유니버스 · 개인 API/Vercel/가짜 fallback 없음</div>';
    var buttons=root.querySelectorAll('[data-theme-no]');for(var i=0;i<buttons.length;i++)buttons[i].addEventListener('click',function(){selectTheme(this.getAttribute('data-theme-no'));});
  }
  function mount(){
    if(typeof curTab==='undefined'||curTab!=='EQUITY')return;
    var pane=document.getElementById('pane');if(!pane)return;
    var root=document.getElementById('themePulse');if(!root){root=document.createElement('section');root.id='themePulse';root.className='themeq';pane.appendChild(root);}render();
  }
  async function selectTheme(no){
    var t=STATE.themes.find(function(x){return x.no===String(no);});if(!t)return;
    STATE.selected=t;STATE.stocks=[];STATE.stocksStatus='loading';mount();
    try{STATE.stocks=await directStocks(t.no);STATE.stocksStatus='ready';}
    catch(e){var fb=fallbackStocks(t.no);STATE.stocks=fb;STATE.stocksStatus=fb.length?'snapshot':'error';}
    mount();
  }
  function applyThemes(themes,mode,generatedAt,constituents){
    STATE.themes=themes;var r=rank(themes);STATE.top=r.top;STATE.bottom=r.bottom;STATE.mode=mode;STATE.generatedAt=generatedAt||new Date().toISOString();STATE.snapshotConstituents=constituents||{};STATE.status='ready';STATE.error=null;
    var keep=STATE.selected&&themes.find(function(x){return x.no===STATE.selected.no;});STATE.selected=keep||STATE.top[0]||STATE.bottom[0]||null;mount();if(STATE.selected)selectTheme(STATE.selected.no);
  }
  async function load(){
    STATE.status='loading';
    try{var themes=await directThemes();applyThemes(themes,'DIRECT_API',new Date().toISOString(),{});}
    catch(e){
      try{var s=await snapshot();applyThemes(s.themes.map(normTheme),'SNAPSHOT_FALLBACK',s.generatedAt,s.constituents||{});}
      catch(e2){STATE.status='error';STATE.mode='DATA_PENDING';STATE.error=String(e2&&e2.message||e2);STATE.themes=[];STATE.top=[];STATE.bottom=[];STATE.selected=null;STATE.stocks=[];STATE.stocksStatus='error';mount();}
    }
  }
  function wrapPane(){
    var base=window.paneRender;if(typeof base!=='function'||base.__themeWrapped)return;
    var fn=function(){var r=base.apply(this,arguments);mount();return r;};fn.__themeWrapped=true;window.paneRender=fn;
  }

  wrapPane();load();STATE.timer=setInterval(load,REFRESH_MS);
})();
