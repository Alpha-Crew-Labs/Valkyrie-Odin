/* VALKYRIE v3 · domain-aware navigation layer
 * Keeps the ontology geometry/animation engine intact.
 * Manual MACRO/RATES/EQUITY selection updates the concise brief and focuses that lane.
 * Current-mode text is sourced only from the live public-data bridge; no fabricated live fallback.
 */
(function(){
  'use strict';

  var MAP={MACRO:'mac',RATES:'rat',EQUITY:'eq'};
  var SIGNAL={MACRO:'sig_macro',RATES:'sig_rates',EQUITY:'sig_equity'};

  function byId(id){return document.getElementById(id);}
  function num(v){var x=Number(v);return Number.isFinite(x)?x:null;}
  function pct(v,d){var x=num(v);return x===null?'—':x.toFixed(d==null?1:d)+'%';}
  function bp(v){var x=num(v);return x===null?'—':(x>0?'+':'')+Math.round(x)+'bp';}
  function count(v){var x=num(v);return x===null?'—':Math.round(x)+'건';}
  function sig(domain){
    if(!window.cur||!cur.sg)return 'SIGNAL PENDING';
    var k=domain==='MACRO'?'macro':domain==='RATES'?'rates':'equity';
    return cur.sg[k]&&cur.sg[k][0]?String(cur.sg[k][0]):'SIGNAL PENDING';
  }
  function liveMetrics(){
    var s=window.VALKYRIE_LIVE_CORE;
    return s&&s.data&&s.data.ok===true&&s.data.metrics?s.data.metrics:null;
  }
  function themeLead(){
    var s=window.VALKYRIE_THEME_EQUITY,t=s&&Array.isArray(s.top)&&s.top.length?s.top[0]:null;
    if(!t||num(t.changeRate)===null)return null;
    return String(t.name)+' '+(num(t.changeRate)>0?'+':'')+num(t.changeRate).toFixed(2)+'%';
  }

  function replayBrief(domain){
    var o=typeof calc==='function'?calc():null;
    if(!o||!window.cur)return ['REPLAY DATA','SNAPSHOT','SIGNAL'];
    if(domain==='MACRO')return [
      'REPLAY · CPI '+pct(o.mac_uscpi,1)+' · GDP '+pct(o.mac_gdp,2),
      'BOK '+pct(o.mac_bok,2)+' · STRESS '+(cur.x&&cur.x.fs!=null?cur.x.fs:'—'),
      sig('MACRO')+' · SNAPSHOT'
    ];
    if(domain==='RATES')return [
      'REPLAY · UST 10Y '+pct(o.rat_ust,2),
      '국고 3Y '+pct(o.rat_ktb,2)+' · CURVE '+bp(o.rat_curve),
      sig('RATES')+' · AA- '+Math.round(o.rat_credit)+'bp'
    ];
    return [
      'REPLAY · IPO '+Math.round(o.eq_ipo)+':1',
      '할인율 '+pct(o.eq_val,1)+' · CB '+Math.round(o.eq_cb)+'곳',
      sig('EQUITY')+' · SNAPSHOT'
    ];
  }

  function shockBrief(domain){
    var o=typeof calc==='function'?calc():null;
    if(!o)return ['SHOCK MODEL','MODEL INPUT','MODEL SIGNAL'];
    if(domain==='MACRO')return [
      'SHOCK · BOK '+(SH.bok>=0?'+':'')+SH.bok+'bp · UST '+(SH.ust>=0?'+':'')+SH.ust+'bp',
      'BOK '+pct(o.mac_bok,2)+' · CPI '+pct(o.mac_uscpi,1),
      sig('MACRO')+' · SHOCK MODEL'
    ];
    if(domain==='RATES')return [
      'SHOCK · UST '+(SH.ust>=0?'+':'')+SH.ust+'bp · CREDIT '+(SH.cr>=0?'+':'')+SH.cr+'bp',
      '국고 3Y '+pct(o.rat_ktb,2)+' · CURVE '+bp(o.rat_curve),
      sig('RATES')+' · AA- '+Math.round(o.rat_credit)+'bp'
    ];
    return [
      'SHOCK · RATE '+(SH.ust>=0?'+':'')+SH.ust+'bp · CREDIT '+(SH.cr>=0?'+':'')+SH.cr+'bp',
      '할인율 '+pct(o.eq_val,1)+' · CB '+Math.round(o.eq_cb)+'곳',
      sig('EQUITY')+' · IPO '+Math.round(o.eq_ipo)+':1 · MODEL'
    ];
  }

  function currentBrief(domain){
    var m=liveMetrics();
    if(!m)return ['PUBLIC DATA PENDING','LIVE INPUT REQUIRED','SIGNAL PENDING'];
    if(domain==='MACRO')return [
      'CPI '+pct(m.usCpiYoy,1)+' · BEI '+pct(m.breakeven10y,2),
      'FED '+pct(m.fedFunds,2)+' → BOK '+pct(m.bokBaseRate,2),
      sig('MACRO')+' · VIX '+(num(m.vix)===null?'—':num(m.vix).toFixed(1))
    ];
    if(domain==='RATES')return [
      'UST 10Y '+pct(m.ust10y,2)+' · 2s10s '+bp(m.ust2s10sBp),
      '국고 3Y '+pct(m.ktb3y,2)+' · 3s10s '+bp(m.ktb3s10sBp),
      sig('RATES')+' · AA- '+(num(m.creditAa3ySpreadBp)===null?'—':Math.round(num(m.creditAa3ySpreadBp))+'bp')
    ];
    var lead=themeLead();
    return [
      'KOSDAQ '+(num(m.kosdaqRiskScore)===null?'—':Math.round(num(m.kosdaqRiskScore))+'/100')+' · 폭 '+(num(m.kosdaqBreadthPct)===null?'—':Math.round(num(m.kosdaqBreadthPct))+'%'),
      lead||( 'VIX '+(num(m.vix)===null?'—':num(m.vix).toFixed(1))+' · HY OAS '+(num(m.usHyOasBp)===null?'—':Math.round(num(m.usHyOasBp))+'bp') ),
      sig('EQUITY')+' · IPO '+count(m.dartIpoEvents)+' · CB '+count(m.dartCbEvents)
    ];
  }

  function briefValues(){
    var domain=window.curTab||'RATES';
    if(typeof shocked==='function'&&shocked())return shockBrief(domain);
    if(typeof si!=='undefined'&&si!==4)return replayBrief(domain);
    return currentBrief(domain);
  }

  function paintBrief(){
    var domain=window.curTab||'RATES',vals=briefValues(),box=document.querySelector('.bf');
    if(box)box.setAttribute('data-domain',domain);
    var tags=document.querySelectorAll('.bf .tag');
    if(tags.length>=3){tags[0].textContent='SHOCK · 핵심 입력';tags[1].textContent='TRANSMISSION · 전이';tags[2].textContent='DECISION · 판단';}
    ['bf1','bf2','bf3'].forEach(function(id,i){
      var e=byId(id);if(!e)return;
      e.textContent=vals[i]||'—';e.classList.remove('rv');void e.offsetWidth;e.classList.add('rv');
    });
  }
  window.refreshDomainBrief=paintBrief;
  window.brief=paintBrief;

  var baseTab=window.tab;
  if(typeof baseTab==='function'){
    window.tab=function(t,hl){var r=baseTab(t,hl);paintBrief();return r;};
  }

  function focusDomain(domain){
    var key=MAP[domain];if(!key||!window.ND||!window.NEL||!window.SV)return;
    if(typeof clearT==='function')clearT();
    if(typeof cool==='function')cool();
    if(typeof sel!=='undefined')sel=null;
    if(typeof INS!=='undefined'&&INS)INS.id=null;

    var total=0,id;
    for(id in NEL){
      if(!NEL[id]||!NEL[id].g)continue;
      NEL[id].g.classList.remove('on','rel');
      if(ND[id]&&ND[id].d===key){NEL[id].g.classList.add('rel');total++;}
    }
    if(SIGNAL[domain]&&NEL[SIGNAL[domain]])NEL[SIGNAL[domain]].g.classList.add('on');
    if(window.EL){
      for(var i=0;i<EL.length;i++){
        var a=ND[EL[i].a],b=ND[EL[i].b];
        EL[i].g.classList.remove('rel','hot');
        if(a&&b&&a.d===key&&b.d===key)EL[i].g.classList.add('rel');
      }
    }
    SV.classList.add('fc');
    var hud=byId('hud2');if(hud)hud.textContent='DOMAIN · '+domain+' · '+total+' OBJECTS';
    if(typeof paneRender==='function')paneRender();
    paintBrief();
  }
  window.focusValkyrieDomain=focusDomain;

  var tabs=document.querySelectorAll('.tab');
  for(var i=0;i<tabs.length;i++){
    (function(el){
      var domain=el.getAttribute('data-t');
      el.setAttribute('role','tab');el.setAttribute('tabindex','0');
      el.addEventListener('click',function(){focusDomain(domain);});
      el.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();el.click();}});
    })(tabs[i]);
  }

  // Refresh text when public feeds/theme rankings update while the same domain stays selected.
  setInterval(paintBrief,30000);
  paintBrief();
  setTimeout(function(){if(!window.sel&&!window.busy)focusDomain(window.curTab||'RATES');},2450);
})();
