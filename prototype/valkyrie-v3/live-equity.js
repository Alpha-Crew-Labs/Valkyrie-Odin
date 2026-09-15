/* VALKYRIE · Live Korean Equity Intelligence
 * Runtime is same-origin only. GitHub Actions refreshes data/equity-pulse.json.
 * Upstream collector: Naver Finance / KRX-Koscom redistributed market data only.
 * IPO Market Report and CB Zero Finder remain independent structural layers in equity-yc.js.
 */
(function(){
  'use strict';

  var ENDPOINT='./data/equity-pulse.json';
  var POLL_MS=300000;
  var LIVE={status:'idle',data:null,error:null,lastFetch:0,timer:null,mode:'GITHUB_ACTIONS_SNAPSHOT'};
  window.VALKYRIE_LIVE_EQUITY=LIVE;

  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function signed(v,digits){if(v===null||v===undefined||!isFinite(Number(v)))return '—';var n=Number(v),s=n>0?'+':'';return s+n.toFixed(digits==null?0:digits);}
  function flow(v){if(v===null||v===undefined||!isFinite(Number(v)))return '—';var n=Math.round(Number(v));return (n>0?'+':'')+n.toLocaleString('ko-KR')+'억';}
  function won(v){if(v===null||v===undefined||!isFinite(Number(v)))return '—';var n=Number(v);if(Math.abs(n)>=1e12)return (n/1e12).toFixed(1)+'조';if(Math.abs(n)>=1e8)return Math.round(n/1e8).toLocaleString('ko-KR')+'억';return Math.round(n).toLocaleString('ko-KR');}
  function hhmm(iso){if(!iso)return '—';var d=new Date(iso);if(isNaN(d.getTime()))return String(iso);return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}).format(d);}
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
      '<div class="liveq-marketpulse"><span class="'+pulseTone(p.regime)+'">'+esc(p.regime||'—')+' · '+esc(p.score==null?'—':p.score+'/100')+'</span><em>'+esc(idx.marketStatus||'SNAPSHOT')+'</em></div>'+
      '<div class="liveq-marketgrid"><span>외국인 <b class="'+tone(fl.foreign)+'">'+esc(flow(fl.foreign))+'</b></span><span>기관 <b class="'+tone(fl.institution)+'">'+esc(flow(fl.institution))+'</b></span><span>상승/하락 <b>'+esc(breadth)+'</b></span><span>거래대금 <b>'+esc(won(idx.tradedValue))+'</b></span></div>'+
    '</div>';
  }

  function liveCardHtml(){
    var d=LIVE.data;
    if(LIVE.status==='loading'&&!d){
      return '<div class="cd liveq"><div class="cdh"><span class="cdt">LIVE MARKET · KOREA</span><span class="cdo">연결 중</span></div><div class="liveq-loading">KOSPI · KOSDAQ · 수급 Snapshot 로딩</div></div>';
    }
    if(!d||!d.ok){
      return '<div class="cd liveq degraded" id="cd_live_equity"><div class="cdh"><span class="cdt">LIVE MARKET · KOREA</span><span class="cdo">DEGRADED</span></div><div class="liveq-signal"><span>MARKET SNAPSHOT</span><strong class="am">데이터 갱신 대기</strong></div><div class="note">Live 시장 데이터만 일시 중단됩니다. IPO Market Report · CB Zero Finder · Replay · Stress는 독립적으로 유지됩니다.</div></div>';
    }
    var kp=market(d,'KOSPI'),kd=market(d,'KOSDAQ'),p=d.pulse||{},rel=d.relative||{};
    var relText=rel.kosdaqMinusKospiPctPoint==null?'—':signed(rel.kosdaqMinusKospiPctPoint,2)+'%p';
    return '<div class="cd liveq" id="cd_live_equity">'+
      '<div class="cdh"><span class="cdt">LIVE MARKET · KOREA</span><span class="cdo">'+esc(hhmm(d.generatedAt))+' SNAPSHOT</span></div>'+
      '<div class="liveq-signal"><span>COMPOSITE RISK APPETITE</span><strong class="'+pulseTone(p.regime)+'">'+esc(p.regime||'—')+' · '+esc(p.score==null?'—':p.score+'/100')+'</strong></div>'+
      '<div class="liveq-rel"><span>KOSDAQ - KOSPI</span><b class="'+tone(rel.kosdaqMinusKospiPctPoint)+'">'+esc(relText)+'</b><em>'+esc(rel.regime||'N/A')+'</em></div>'+
      '<div class="liveq-markets">'+marketRow('KOSPI',kp)+marketRow('KOSDAQ',kd)+'</div>'+
      '<div class="note liveq-note">지수 · 외국인/기관 수급 · 상승/하락 종목수만 <b>Naver 공개 시장 데이터</b>에서 수집합니다. IPO/CB 데이터와는 연결된 API가 아닙니다.</div>'+
      '<div class="liveq-source"><i></i><span>GITHUB ACTIONS · NAVER/KRX</span><em>~10m SNAPSHOT</em></div>'+
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
      if(bf3){
        var ipo=(window.VALKYRIE_YC_EQUITY&&window.VALKYRIE_YC_EQUITY.ipo&&window.VALKYRIE_YC_EQUITY.ipo.signal)||'SELECTIVE';
        bf3.textContent='주식 '+(p.regime||'NEUTRAL')+' · KOSDAQ '+qr+' · IPO '+ipo.split(' · ')[0];
      }
    }
    var fd=document.getElementById('fd');
    if(fd){fd.textContent=hhmm(kdi.localTradedAt||kpi.localTradedAt||d.generatedAt)+' KOSPI/KOSDAQ SNAPSHOT · NAVER/KRX';}
  }

  function enhanceEquity(){
    if(typeof curTab==='undefined'||curTab!=='EQUITY')return;
    var liveCard=cardByTitle('할인율 민감도')||cardByTitle('LIVE MARKET · KOREA')||document.getElementById('cd_live_equity');
    if(liveCard){var holder=document.createElement('div');holder.innerHTML=liveCardHtml();liveCard.replaceWith(holder.firstElementChild);}
    patchNodes();
  }

  async function refresh(force){
    if(!force&&Date.now()-LIVE.lastFetch<60000)return;
    LIVE.status='loading';LIVE.error=null;
    if(typeof curTab!=='undefined'&&curTab==='EQUITY')enhanceEquity();
    try{
      var response=await fetch(ENDPOINT+'?t='+Date.now(),{cache:'no-store',headers:{accept:'application/json'}});
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
