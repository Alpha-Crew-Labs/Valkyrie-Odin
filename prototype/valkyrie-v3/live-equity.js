/* VALKYRIE · Live Korean Equity Intelligence
 * Live layer: KOSPI/KOSDAQ index + investor flow + breadth from the user-owned Vercel proxy.
 * Research layer: date-stamped public DART/FSC processed data from aikstockdata.
 * Structural IPO/CB signals remain owned by equity-yc.js.
 */
(function(){
  'use strict';

  var ENDPOINT='https://ipo-market-report.vercel.app/api/equity-pulse';
  var POLL_MS=70000;
  var LIVE={status:'idle',data:null,error:null,lastFetch:0,timer:null};
  window.VALKYRIE_LIVE_EQUITY=LIVE;

  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function num(v,digits){if(v===null||v===undefined||!isFinite(Number(v)))return '—';return Number(v).toFixed(digits==null?0:digits);}
  function signed(v,digits){if(v===null||v===undefined||!isFinite(Number(v)))return '—';var n=Number(v),s=n>0?'+':'';return s+n.toFixed(digits==null?0:digits);}
  function flow(v){if(v===null||v===undefined||!isFinite(Number(v)))return '—';var n=Math.round(Number(v));return (n>0?'+':'')+n.toLocaleString('ko-KR')+'억';}
  function won(v){if(v===null||v===undefined||!isFinite(Number(v)))return '—';var n=Number(v);if(Math.abs(n)>=1e12)return (n/1e12).toFixed(1)+'조';if(Math.abs(n)>=1e8)return Math.round(n/1e8).toLocaleString('ko-KR')+'억';return Math.round(n).toLocaleString('ko-KR');}
  function hhmm(iso){if(!iso)return '—';var d=new Date(iso);if(isNaN(d.getTime()))return String(iso);return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}).format(d);}
  function shortDate(raw){var s=String(raw||'').replace(/[^0-9]/g,'');return s.length>=8?s.slice(4,6)+'.'+s.slice(6,8):'—';}
  function tone(v){return Number(v)>0?'gr':Number(v)<0?'rd':'';}
  function pulseTone(regime){return regime==='RISK-ON'?'gr':regime==='RISK-OFF'?'rd':'am';}
  function market(d,code){return d&&d.markets&&d.markets[code]?d.markets[code]:null;}

  function cardByTitle(title){
    var cards=document.querySelectorAll('#pane .cd');
    for(var i=0;i<cards.length;i++){
      var t=cards[i].querySelector('.cdt');
      if(t&&t.textContent.trim()===title)return cards[i];
    }
    return null;
  }

  function marketRow(code,m){
    if(!m)return '<div class="liveq-market"><div class="liveq-marketname">'+code+'</div><div class="liveq-marketmiss">FEED PENDING</div></div>';
    var idx=m.index||{},fl=m.flow||{},br=m.breadth||{},p=m.pulse||{};
    var breadth=(br.advancers!=null&&br.decliners!=null)?Number(br.advancers).toLocaleString('ko-KR')+' / '+Number(br.decliners).toLocaleString('ko-KR'):'—';
    return '<div class="liveq-market">'+
      '<div class="liveq-markettop"><div><span class="liveq-marketname">'+code+'</span><strong>'+esc(idx.level==null?'—':Number(idx.level).toLocaleString('ko-KR',{minimumFractionDigits:2,maximumFractionDigits:2}))+'</strong></div><b class="'+tone(idx.changePct)+'">'+esc(signed(idx.changePct,2))+'%</b></div>'+
      '<div class="liveq-marketpulse"><span class="'+pulseTone(p.regime)+'">'+esc(p.regime||'—')+' · '+esc(p.score==null?'—':p.score+'/100')+'</span><em>'+esc(idx.marketStatus||'LIVE')+'</em></div>'+
      '<div class="liveq-marketgrid"><span>외국인 <b class="'+tone(fl.foreign)+'">'+esc(flow(fl.foreign))+'</b></span><span>기관 <b class="'+tone(fl.institution)+'">'+esc(flow(fl.institution))+'</b></span><span>상승/하락 <b>'+esc(breadth)+'</b></span><span>거래대금 <b>'+esc(won(idx.tradedValue))+'</b></span></div>'+
    '</div>';
  }

  function liveCardHtml(){
    var d=LIVE.data;
    if(LIVE.status==='loading'&&!d){
      return '<div class="cd liveq"><div class="cdh"><span class="cdt">LIVE MARKET · KOREA</span><span class="cdo">연결 중</span></div><div class="liveq-loading">KOSPI · KOSDAQ · 수급 데이터를 불러오는 중</div></div>';
    }
    if(!d||!d.ok){
      return '<div class="cd liveq degraded"><div class="cdh"><span class="cdt">LIVE MARKET · KOREA</span><span class="cdo">DEGRADED</span></div><div class="liveq-signal"><span>LIVE FEED</span><strong class="am">일시 연결 실패</strong></div><div class="note">IPO · CB 구조적 시그널과 Snapshot은 유지됩니다. 다음 폴링에서 자동 재시도합니다.</div></div>';
    }
    var kp=market(d,'KOSPI'),kd=market(d,'KOSDAQ'),p=d.pulse||{};
    return '<div class="cd liveq" id="cd_live_equity">'+
      '<div class="cdh"><span class="cdt">LIVE MARKET · KOREA</span><span class="cdo">'+esc(hhmm(d.fetchedAt))+' FETCH</span></div>'+
      '<div class="liveq-signal"><span>COMPOSITE RISK APPETITE</span><strong class="'+pulseTone(p.regime)+'">'+esc(p.regime||'—')+' · '+esc(p.score==null?'—':p.score+'/100')+'</strong></div>'+
      '<div class="liveq-markets">'+marketRow('KOSPI',kp)+marketRow('KOSDAQ',kd)+'</div>'+
      '<div class="note liveq-note"><b>KOSPI와 KOSDAQ을 분리</b>해서 봅니다. 대형주와 성장·Risk Capital의 방향이 엇갈리면 Composite는 중립으로 내려갑니다.</div>'+
      '<div class="liveq-source"><i></i><span>NAVER STOCK · KRX/Koscom 재배포</span><em>~70s</em></div>'+
    '</div>';
  }

  function growthRow(item){
    if(!item)return '';
    var op=item.operatingIncomeYoyPct;
    var opText=op==null?(item.status||'—'):signed(op,1)+'%';
    return '<div class="fundq-row"><span><b>'+esc(item.name||item.code||'—')+'</b><em>'+esc(item.code||'')+'</em></span><span>매출 '+esc(signed(item.revenueYoyPct,1))+'%</span><span>영익 '+esc(opText)+'</span><strong>'+esc(item.score==null?'—':num(item.score,1))+'</strong></div>';
  }

  function fundamentalCardHtml(){
    var r=LIVE.data&&LIVE.data.research;
    if(!r||!r.ok){
      return '<div class="cd fundq degraded" id="cd_fundamental_live"><div class="cdh"><span class="cdt">EQUITY FUNDAMENTAL PULSE</span><span class="cdo">DATA PENDING</span></div><div class="note">공개 DART/FSC Research feed를 불러오지 못했습니다. Live 시장 시그널과 IPO/CB 데이터는 계속 동작합니다.</div></div>';
    }
    var e=r.earnings||{},hl=r.highsLows52w||{},mb=r.marketBreadth||{};
    var growth=Array.isArray(r.growthTop)?r.growthTop:[];
    var freshness=(r.stale?'STALE · ':'AS-OF · ')+shortDate(r.quoteAsOf);
    return '<div class="cd fundq'+(r.stale?' stale':'')+'" id="cd_fundamental_live">'+
      '<div class="cdh"><span class="cdt">EQUITY FUNDAMENTAL PULSE</span><span class="cdo">'+esc(freshness)+'</span></div>'+
      '<div class="fundq-signal"><span>DART EARNINGS BREADTH</span><strong>'+esc(e.improveRatePct==null?'—':num(e.improveRatePct,0)+'%')+'</strong><em>'+esc(e.reportedN==null?'—':Number(e.reportedN).toLocaleString('ko-KR')+'개')+'</em></div>'+
      '<div class="fundq-grid">'+
        '<div><span>흑자전환</span><b>'+esc(e.turnaroundCount==null?'—':Number(e.turnaroundCount).toLocaleString('ko-KR')+'개')+'</b></div>'+
        '<div><span>52주 신고가 / 신저가</span><b>'+esc(hl.n_high==null?'—':hl.n_high)+' / '+esc(hl.n_low==null?'—':hl.n_low)+'</b></div>'+
        '<div><span>시장 상승비중</span><b>'+esc(mb.advance_ratio_ex_flat_pct==null?'—':num(mb.advance_ratio_ex_flat_pct,1)+'%')+'</b></div>'+
        '<div><span>데이터 기준</span><b>'+esc(shortDate(r.quoteAsOf))+'</b></div>'+
      '</div>'+
      '<div class="fundq-head">실적 성장 상위 · 실제 DART 수치</div>'+
      '<div class="fundq-list">'+growth.slice(0,3).map(growthRow).join('')+'</div>'+
      '<div class="note fundq-note">'+(r.stale?'<b>시세 기준일이 오래되어 Live 점수에는 반영하지 않습니다.</b> ':'')+'펀더멘털은 실시간 가격이 아니라 <b>DART 실적·공시 기반 Research Layer</b>로 사용합니다.</div>'+
      '<div class="liveq-source"><i></i><span>AIKSTOCKDATA · DART / 금융위 가공</span><em>'+esc(shortDate(r.quoteAsOf))+'</em></div>'+
    '</div>';
  }

  function patchNodes(){
    var d=LIVE.data;if(!d||!d.ok||typeof NEL==='undefined')return;
    var kp=market(d,'KOSPI'),kd=market(d,'KOSDAQ'),p=d.pulse||{};
    var kpi=kp&&kp.index||{},kdi=kd&&kd.index||{},kdf=kd&&kd.flow||{};
    if(NEL.eq_val&&NEL.eq_val.s){NEL.eq_val.s.textContent='KOSDAQ '+(kdi.level==null?'—':Number(kdi.level).toFixed(2))+' · '+signed(kdi.changePct,2)+'%';}
    if(NEL.eq_ipo&&NEL.eq_ipo.s){NEL.eq_ipo.s.textContent='외 '+flow(kdf.foreign)+' · 기관 '+flow(kdf.institution);}
    if(typeof si!=='undefined'&&si===4&&typeof shocked==='function'&&!shocked()&&NEL.sig_equity){
      NEL.sig_equity.v.textContent=p.regime||'NEUTRAL';
      var kr=kp&&kp.pulse?kp.pulse.regime:'—',qr=kd&&kd.pulse?kd.pulse.regime:'—';
      NEL.sig_equity.s.textContent='KOSPI '+kr+' · KOSDAQ '+qr;
      NEL.sig_equity.st.textContent='LIVE + STRUCT';
      if(NEL.sig_equity.bf&&p.score!=null)NEL.sig_equity.bf.setAttribute('width',(TW-20)*Number(p.score)/100);
      var bf3=document.getElementById('bf3');
      if(bf3){var ipo=(window.VALKYRIE_YC_EQUITY&&window.VALKYRIE_YC_EQUITY.ipo&&window.VALKYRIE_YC_EQUITY.ipo.signal)||'SELECTIVE';bf3.textContent='주식 '+(p.regime||'NEUTRAL')+' · KOSDAQ '+qr+' · IPO '+ipo.split(' · ')[0];}
    }
    var fd=document.getElementById('fd');
    if(fd){fd.textContent=hhmm(kdi.localTradedAt||kpi.localTradedAt||d.fetchedAt)+' KOSPI/KOSDAQ FEED OK · NAVER/KRX';}
  }

  function enhanceEquity(){
    if(typeof curTab==='undefined'||curTab!=='EQUITY')return;
    var liveCard=cardByTitle('할인율 민감도')||cardByTitle('LIVE MARKET · KOREA')||document.getElementById('cd_live_equity');
    if(liveCard){var holder=document.createElement('div');holder.innerHTML=liveCardHtml();liveCard.replaceWith(holder.firstElementChild);}
    var fund=cardByTitle('IPO FUNDAMENTAL SCORE')||cardByTitle('EQUITY FUNDAMENTAL PULSE')||document.getElementById('cd_fundamental_live');
    if(fund){var holder2=document.createElement('div');holder2.innerHTML=fundamentalCardHtml();fund.replaceWith(holder2.firstElementChild);}
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
    }catch(err){LIVE.status='error';LIVE.error=String(err&&err.message||err);LIVE.lastFetch=Date.now();}
    enhanceEquity();patchNodes();
  }

  var originalPaneRender=window.paneRender;
  if(typeof originalPaneRender==='function'){
    window.paneRender=function(){originalPaneRender.apply(this,arguments);enhanceEquity();};
  }

  document.addEventListener('visibilitychange',function(){if(!document.hidden)refresh(true);});
  window.addEventListener('focus',function(){refresh(false);});
  LIVE.timer=setInterval(function(){if(!document.hidden)refresh(false);},POLL_MS);
  refresh(true);
})();
