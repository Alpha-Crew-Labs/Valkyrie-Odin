/* VALKYRIE · Live Korean Equity Intelligence
 * Runtime is same-origin only. GitHub Actions refreshes data/equity-pulse.json.
 * Upstream collector: Naver/KRX-Koscom, TradingView Korea, Yahoo fallback, aikstockdata/DART.
 * Structural IPO/CB signals remain owned by equity-yc.js.
 */
(function(){
  'use strict';

  var ENDPOINT='./data/equity-pulse.json';
  var POLL_MS=300000;
  var LIVE={status:'idle',data:null,error:null,lastFetch:0,timer:null,mode:'GITHUB_ACTIONS_SNAPSHOT'};
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
  function stamp(d){return d&&(d.generatedAt||d.fetchedAt)||null;}

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
      '<div class="liveq-marketpulse"><span class="'+pulseTone(p.regime)+'">'+esc(p.regime||'—')+' · '+esc(p.score==null?'—':p.score+'/100')+'</span><em>'+esc(idx.source||idx.marketStatus||'SNAPSHOT')+'</em></div>'+
      '<div class="liveq-marketgrid"><span>외국인 <b class="'+tone(fl.foreign)+'">'+esc(flow(fl.foreign))+'</b></span><span>기관 <b class="'+tone(fl.institution)+'">'+esc(flow(fl.institution))+'</b></span><span>상승/하락 <b>'+esc(breadth)+'</b></span><span>거래대금 <b>'+esc(won(idx.tradedValue))+'</b></span></div>'+
    '</div>';
  }

  function scannerInline(scanner){
    if(!scanner||!scanner.ok||!Array.isArray(scanner.topTurnover)||!scanner.topTurnover.length){
      return '<div class="scannerline muted">TRADINGVIEW SCANNER · PENDING</div>';
    }
    var rows=scanner.topTurnover.slice(0,3).map(function(x){
      return '<span><b>'+esc(x.name||x.code||'—')+'</b> <em class="'+tone(x.changePct)+'">'+esc(signed(x.changePct,1))+'%</em></span>';
    }).join('');
    return '<div class="scannerline"><i></i><strong>거래대금 TOP</strong>'+rows+'</div>';
  }

  function liveCardHtml(){
    var d=LIVE.data;
    if(LIVE.status==='loading'&&!d){
      return '<div class="cd liveq"><div class="cdh"><span class="cdt">LIVE MARKET · KOREA</span><span class="cdo">연결 중</span></div><div class="liveq-loading">GitHub Snapshot · KOSPI · KOSDAQ · 수급 · Scanner 로딩</div></div>';
    }
    if(!d||!d.ok){
      return '<div class="cd liveq degraded"><div class="cdh"><span class="cdt">LIVE MARKET · KOREA</span><span class="cdo">DEGRADED</span></div><div class="liveq-signal"><span>MARKET SNAPSHOT</span><strong class="am">첫 데이터 갱신 대기</strong></div><div class="note">IPO · CB 구조적 시그널은 유지됩니다. GitHub Actions가 다음 Snapshot을 생성하면 자동 복구됩니다.</div></div>';
    }
    var kp=market(d,'KOSPI'),kd=market(d,'KOSDAQ'),p=d.pulse||{},rel=d.relative||{};
    var relText=rel.kosdaqMinusKospiPctPoint==null?'—':signed(rel.kosdaqMinusKospiPctPoint,2)+'%p';
    return '<div class="cd liveq" id="cd_live_equity">'+
      '<div class="cdh"><span class="cdt">LIVE MARKET · KOREA</span><span class="cdo">'+esc(hhmm(stamp(d)))+' SNAPSHOT</span></div>'+
      '<div class="liveq-signal"><span>COMPOSITE RISK APPETITE</span><strong class="'+pulseTone(p.regime)+'">'+esc(p.regime||'—')+' · '+esc(p.score==null?'—':p.score+'/100')+'</strong></div>'+
      '<div class="liveq-rel"><span>KOSDAQ - KOSPI</span><b class="'+tone(rel.kosdaqMinusKospiPctPoint)+'">'+esc(relText)+'</b><em>'+esc(rel.regime||'N/A')+'</em></div>'+
      '<div class="liveq-markets">'+marketRow('KOSPI',kp)+marketRow('KOSDAQ',kd)+'</div>'+
      scannerInline(d.scanner)+
      '<div class="note liveq-note">대형주(KOSPI)와 Risk Capital(KOSDAQ)을 분리하고 <b>상대강도·수급·Breadth·거래대금 Scanner</b>를 함께 봅니다.</div>'+
      '<div class="liveq-source"><i></i><span>GITHUB ACTIONS · NAVER · TV · YAHOO</span><em>~5m</em></div>'+
    '</div>';
  }

  function growthRow(item){
    if(!item)return '';
    var op=item.operatingIncomeYoyPct;
    var opText=op==null?(item.status||'—'):signed(op,1)+'%';
    return '<div class="fundq-row"><span><b>'+esc(item.name||item.code||'—')+'</b><em>'+esc(item.code||'')+'</em></span><span>매출 '+esc(signed(item.revenueYoyPct,1))+'%</span><span>영익 '+esc(opText)+'</span><strong>'+esc(item.score==null?'—':num(item.score,1))+'</strong></div>';
  }

  function companyRow(item){
    var d=item&&item.detail||{},name=d.name||item.name||item.code||'—';
    return '<div class="fundq-row company"><span><b>'+esc(name)+'</b><em>'+esc(item.code||'')+'</em></span><span>PER '+esc(d.per==null?'—':num(d.per,1))+'</span><span>PBR '+esc(d.pbr==null?'—':num(d.pbr,2))+'</span><strong class="'+tone(item.changePct)+'">'+esc(signed(item.changePct,1))+'%</strong></div>';
  }

  function disclosureLine(r){
    var intr=r&&r.intraday||{};
    if(intr.count==null)return '';
    return '<div class="fundq-event"><span>DART EVENT PULSE</span><b>'+esc(intr.count)+'건</b><em>장중 '+esc(intr.intraday||0)+' · 장후 '+esc(intr.afterClose||0)+'</em></div>';
  }

  function scannerStats(scanner){
    if(!scanner||!scanner.ok)return '';
    var tech=scanner.technical||{},sector=Array.isArray(scanner.sectors)&&scanner.sectors.length?scanner.sectors[0]:null;
    return '<div class="fundq-scanner">'+
      '<span>TV SCANNER</span>'+
      '<b>RSI≥60 '+esc(tech.rsi60SharePct==null?'—':num(tech.rsi60SharePct,0)+'%')+'</b>'+
      '<b>1M+ '+esc(tech.positive1mSharePct==null?'—':num(tech.positive1mSharePct,0)+'%')+'</b>'+
      '<em>'+esc(sector?sector.sector+' '+signed(sector.avgChangePct,1)+'%':'SECTOR PENDING')+'</em>'+
    '</div>';
  }

  function fundamentalCardHtml(){
    var d=LIVE.data||{},r=d.research,scanner=d.scanner,companies=Array.isArray(d.companies)?d.companies:[];
    if(!r||!r.ok){
      return '<div class="cd fundq degraded" id="cd_fundamental_live"><div class="cdh"><span class="cdt">EQUITY FUNDAMENTAL PULSE</span><span class="cdo">DATA PENDING</span></div><div class="note">DART/FSC Research feed가 아직 없습니다. Live 시장 시그널과 IPO/CB 데이터는 계속 동작합니다.</div>'+scannerStats(scanner)+'</div>';
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
      disclosureLine(r)+
      scannerStats(scanner)+
      (companies.length?'<div class="fundq-head">거래대금 상위 · 자동 기업 Snapshot</div><div class="fundq-list">'+companies.slice(0,3).map(companyRow).join('')+'</div>':'')+
      '<div class="fundq-head">실적 성장 상위 · 실제 DART 수치</div>'+
      '<div class="fundq-list">'+growth.slice(0,3).map(growthRow).join('')+'</div>'+
      '<div class="note fundq-note">'+(r.stale?'<b>Research 기준일이 오래되면 Live 점수에는 반영하지 않습니다.</b> ':'')+'Naver·TradingView·aikstockdata를 <b>GitHub Actions에서 사전 수집</b>하므로 브라우저는 외부 API를 직접 호출하지 않습니다.</div>'+
      '<div class="liveq-source"><i></i><span>AIKSTOCKDATA · DART/FSC + TV SCANNER</span><em>'+esc(shortDate(r.quoteAsOf))+'</em></div>'+
    '</div>';
  }

  function patchNodes(){
    var d=LIVE.data;if(!d||!d.ok||typeof NEL==='undefined')return;
    var kp=market(d,'KOSPI'),kd=market(d,'KOSDAQ'),p=d.pulse||{},rel=d.relative||{};
    var kpb=kp&&kp.breadth||{},kdb=kd&&kd.breadth||{},kdf=kd&&kd.flow||{};
    var bs=[];if(kpb.advanceDeclineRatio!=null)bs.push(Number(kpb.advanceDeclineRatio));if(kdb.advanceDeclineRatio!=null)bs.push(Number(kdb.advanceDeclineRatio));
    var avgBreadth=bs.length?bs.reduce(function(a,b){return a+b;},0)/bs.length*100:null;
    if(typeof shocked==='function'&&!shocked()){
      if(NEL.eq_fin){if(NEL.eq_fin.v&&avgBreadth!=null)NEL.eq_fin.v.textContent=Math.round(avgBreadth)+'%';if(NEL.eq_fin.s)NEL.eq_fin.s.textContent='KOSPI·KOSDAQ 상승비중';}
      if(NEL.eq_val){if(NEL.eq_val.v&&rel.kosdaqMinusKospiPctPoint!=null)NEL.eq_val.v.textContent=signed(rel.kosdaqMinusKospiPctPoint,2)+'%p';if(NEL.eq_val.s)NEL.eq_val.s.textContent='KOSDAQ vs KOSPI 상대강도';}
      if(NEL.eq_ipo&&NEL.eq_ipo.s)NEL.eq_ipo.s.textContent='외 '+flow(kdf.foreign)+' · 기관 '+flow(kdf.institution);
      if(typeof si!=='undefined'&&si===4&&NEL.sig_equity){
        NEL.sig_equity.v.textContent=p.regime||'NEUTRAL';
        var kr=kp&&kp.pulse?kp.pulse.regime:'—',qr=kd&&kd.pulse?kd.pulse.regime:'—';
        NEL.sig_equity.s.textContent='KOSPI '+kr+' · KOSDAQ '+qr;NEL.sig_equity.st.textContent='LIVE + STRUCT';
        if(NEL.sig_equity.bf&&p.score!=null)NEL.sig_equity.bf.setAttribute('width',(TW-20)*Number(p.score)/100);
        var bf3=document.getElementById('bf3');if(bf3){var ipo=(window.VALKYRIE_YC_EQUITY&&window.VALKYRIE_YC_EQUITY.ipo&&window.VALKYRIE_YC_EQUITY.ipo.signal)||'SELECTIVE';bf3.textContent='주식 '+(p.regime||'NEUTRAL')+' · '+(rel.regime||'BALANCED')+' · IPO '+ipo.split(' · ')[0];}
      }
    }
    var fd=document.getElementById('fd');if(fd){var src=d.sources||{},tv=src.tradingViewScanner?'TV':'TV×',aik=src.aikToday?'DART':'DART×';fd.textContent=hhmm(stamp(d))+' GITHUB SNAPSHOT · NAVER/'+tv+'/'+aik;}
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
    if(!force&&Date.now()-LIVE.lastFetch<60000)return;
    LIVE.status='loading';LIVE.error=null;if(typeof curTab!=='undefined'&&curTab==='EQUITY')enhanceEquity();
    try{
      var response=await fetch(ENDPOINT+'?t='+Date.now(),{cache:'no-store',headers:{accept:'application/json'}});
      if(!response.ok)throw new Error('HTTP '+response.status);
      var data=await response.json();if(!data||!data.ok)throw new Error(data&&data.error?data.error:'invalid payload');
      LIVE.data=data;LIVE.status='ready';LIVE.lastFetch=Date.now();
    }catch(err){LIVE.status='error';LIVE.error=String(err&&err.message||err);LIVE.lastFetch=Date.now();}
    enhanceEquity();patchNodes();
  }

  var originalPaneRender=window.paneRender;
  if(typeof originalPaneRender==='function'){window.paneRender=function(){originalPaneRender.apply(this,arguments);enhanceEquity();};}
  document.addEventListener('visibilitychange',function(){if(!document.hidden)refresh(true);});
  window.addEventListener('focus',function(){refresh(false);});
  LIVE.timer=setInterval(function(){if(!document.hidden)refresh(false);},POLL_MS);
  refresh(true);
})();
