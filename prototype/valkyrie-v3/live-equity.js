/* VALKYRIE · Live Equity Market Pulse
 * Additive layer: keeps the v2.6 ontology and YC structural IPO/CB signals intact.
 * Live feed comes from the user-owned IPO Market Report Vercel proxy, which normalizes
 * public Naver Stock market data (KRX/Koscom redistributed market data).
 */
(function(){
  'use strict';

  var ENDPOINT='https://ipo-market-report.vercel.app/api/equity-pulse';
  var POLL_MS=70000;
  var LIVE={status:'idle',data:null,error:null,lastFetch:0,timer:null};
  window.VALKYRIE_LIVE_EQUITY=LIVE;

  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function signed(v,digits){
    if(v===null||v===undefined||!isFinite(Number(v)))return '—';
    var n=Number(v),s=n>0?'+':'';
    return s+n.toFixed(digits==null?0:digits);
  }
  function flow(v){
    if(v===null||v===undefined||!isFinite(Number(v)))return '—';
    var n=Math.round(Number(v));
    return (n>0?'+':'')+n.toLocaleString('ko-KR')+'억';
  }
  function won(v){
    if(v===null||v===undefined||!isFinite(Number(v)))return '—';
    var n=Number(v);
    if(Math.abs(n)>=1e12)return (n/1e12).toFixed(1)+'조';
    if(Math.abs(n)>=1e8)return Math.round(n/1e8).toLocaleString('ko-KR')+'억';
    return Math.round(n).toLocaleString('ko-KR');
  }
  function hhmm(iso){
    if(!iso)return '—';
    var d=new Date(iso);if(isNaN(d.getTime()))return String(iso);
    return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}).format(d);
  }
  function tone(v){return Number(v)>0?'gr':Number(v)<0?'rd':'';}
  function pulseTone(regime){return regime==='RISK-ON'?'gr':regime==='RISK-OFF'?'rd':'am';}

  function cardByTitle(title){
    var cards=document.querySelectorAll('#pane .cd');
    for(var i=0;i<cards.length;i++){
      var t=cards[i].querySelector('.cdt');
      if(t&&t.textContent.trim()===title)return cards[i];
    }
    return null;
  }

  function patchNodes(){
    var d=LIVE.data;if(!d||!d.ok||typeof NEL==='undefined')return;
    var idx=d.index||{},fl=d.flow||{},p=d.pulse||{};
    if(NEL.eq_val&&NEL.eq_val.s){
      NEL.eq_val.s.textContent='KOSDAQ '+(idx.level==null?'—':Number(idx.level).toFixed(2))+' · '+signed(idx.changePct,2)+'% · '+(idx.marketStatus||'LIVE');
    }
    if(NEL.eq_ipo&&NEL.eq_ipo.s){
      NEL.eq_ipo.s.textContent='외국인 '+flow(fl.foreign)+' · 기관 '+flow(fl.institution);
    }
    if(NEL.sig_equity&&NEL.sig_equity.st&&p.regime){
      NEL.sig_equity.st.textContent='LIVE '+p.regime;
    }
    var fd=document.getElementById('fd');
    if(fd){fd.textContent=hhmm(idx.localTradedAt||d.fetchedAt)+' KOSDAQ FEED OK · NAVER/KRX';}
  }

  function liveCardHtml(){
    var d=LIVE.data;
    if(LIVE.status==='loading'&&!d){
      return '<div class="cd liveq"><div class="cdh"><span class="cdt">LIVE MARKET PULSE</span><span class="cdo">연결 중</span></div><div class="liveq-loading">KOSDAQ · 수급 데이터를 불러오는 중</div></div>';
    }
    if(!d||!d.ok){
      return '<div class="cd liveq degraded"><div class="cdh"><span class="cdt">LIVE MARKET PULSE</span><span class="cdo">DEGRADED</span></div><div class="liveq-signal"><span>LIVE FEED</span><strong class="am">일시 연결 실패</strong></div><div class="note">IPO · CB 구조적 시그널은 유지됩니다. Live feed는 다음 폴링에서 자동 재시도합니다.</div></div>';
    }
    var idx=d.index||{},fl=d.flow||{},br=d.breadth||{},p=d.pulse||{};
    var discount='—',fin='—';
    try{var o=calc();discount=o.eq_val.toFixed(1)+'%';fin=Math.round(o.eq_fin)+'%';}catch(e){}
    var breadthText=(br.advancers!=null&&br.decliners!=null)?Number(br.advancers).toLocaleString('ko-KR')+' / '+Number(br.decliners).toLocaleString('ko-KR'):'—';
    var session=(idx.marketStatus||'LIVE')+' · '+hhmm(idx.localTradedAt||d.fetchedAt);
    return '<div class="cd liveq" id="cd_live_equity">'+
      '<div class="cdh"><span class="cdt">LIVE MARKET PULSE</span><span class="cdo">'+esc(session)+'</span></div>'+
      '<div class="liveq-hero"><div><span>KOSDAQ</span><strong>'+esc(idx.level==null?'—':Number(idx.level).toFixed(2))+'</strong></div><b class="'+tone(idx.changePct)+'">'+esc(signed(idx.changePct,2))+'%</b></div>'+
      '<div class="liveq-signal"><span>MARKET PULSE</span><strong class="'+pulseTone(p.regime)+'">'+esc(p.regime||'—')+' · '+esc(p.score==null?'—':p.score+'/100')+'</strong></div>'+
      '<div class="liveq-grid">'+
        '<div><span>외국인 순매수</span><b class="'+tone(fl.foreign)+'">'+esc(flow(fl.foreign))+'</b></div>'+
        '<div><span>기관 순매수</span><b class="'+tone(fl.institution)+'">'+esc(flow(fl.institution))+'</b></div>'+
        '<div><span>상승 / 하락</span><b>'+esc(breadthText)+'</b></div>'+
        '<div><span>거래대금</span><b>'+esc(won(idx.tradedValue))+'</b></div>'+
      '</div>'+
      '<div class="liveq-struct">'+
        '<span>구조적 할인율 <b>'+esc(discount)+'</b></span><span>적자·차입 비중 <b>'+esc(fin)+'</b></span>'+
      '</div>'+
      '<div class="note liveq-note">지수·수급은 약 70초 주기로 갱신 · '+esc(fl.basisLabel||'당일')+' 기준. <b>Live Pulse는 시장 위험선호 보조지표</b>이며 IPO/CB 구조적 시그널을 대체하지 않습니다.</div>'+
      '<div class="liveq-source"><i></i><span>NAVER STOCK · KRX/Koscom 재배포</span><em>'+esc(hhmm(d.fetchedAt))+' FETCH</em></div>'+
    '</div>';
  }

  function enhanceEquity(){
    if(typeof curTab==='undefined'||curTab!=='EQUITY')return;
    var card=cardByTitle('할인율 민감도')||document.getElementById('cd_live_equity');
    if(card){
      var holder=document.createElement('div');holder.innerHTML=liveCardHtml();
      var replacement=holder.firstElementChild;
      card.replaceWith(replacement);
    }
    patchNodes();
  }

  async function refresh(force){
    if(!force&&Date.now()-LIVE.lastFetch<30000)return;
    LIVE.status='loading';LIVE.error=null;
    if(typeof curTab!=='undefined'&&curTab==='EQUITY')enhanceEquity();
    try{
      var response=await fetch(ENDPOINT,{cache:'no-store',headers:{accept:'application/json'}});
      if(!response.ok)throw new Error('HTTP '+response.status);
      var data=await response.json();
      if(!data||!data.ok)throw new Error(data&&data.error?data.error:'invalid payload');
      LIVE.data=data;LIVE.status='ready';LIVE.lastFetch=Date.now();
    }catch(err){
      LIVE.status='error';LIVE.error=String(err&&err.message||err);LIVE.lastFetch=Date.now();
    }
    enhanceEquity();patchNodes();
  }

  var originalPaneRender=window.paneRender;
  if(typeof originalPaneRender==='function'){
    window.paneRender=function(){
      originalPaneRender.apply(this,arguments);
      enhanceEquity();
    };
  }

  document.addEventListener('visibilitychange',function(){if(!document.hidden)refresh(true);});
  window.addEventListener('focus',function(){refresh(false);});
  LIVE.timer=setInterval(function(){if(!document.hidden)refresh(false);},POLL_MS);
  refresh(true);
})();
