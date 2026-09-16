/* VALKYRIE · live macro/rates ontology bridge
 * Replaces API-available demo values in the latest snapshot with public-data inputs.
 * Historical replay remains a historical/demo archive; unsupported model outputs stay explicitly tagged MODEL/SNAPSHOT.
 */
(function(){
  'use strict';
  var SNAPSHOT='./data/core-live.json';
  var STATE={status:'idle',data:null,error:null,asOfLabel:null};
  window.VALKYRIE_LIVE_CORE=STATE;

  function n(v){var x=Number(v);return Number.isFinite(x)?x:null;}
  function signed(v,d,suffix){if(v===null)return '—';return (v>0?'+':'')+v.toFixed(d)+(suffix||'');}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c];});}
  function kstClock(iso){
    var d=new Date(iso); if(isNaN(d.getTime()))return null;
    try{return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(d);}catch(e){return null;}
  }
  async function getJson(url){
    var ctl=new AbortController(),t=setTimeout(function(){ctl.abort();},7000);
    try{var r=await fetch(url,{cache:'no-store',credentials:'omit',signal:ctl.signal,headers:{accept:'application/json'}});if(!r.ok)throw new Error('HTTP '+r.status);return await r.json();}
    finally{clearTimeout(t);}
  }
  function setNodeMeta(id,label,sub){
    if(window.ND&&ND[id]){ND[id].l=label;if(sub!==undefined)ND[id].s=sub;}
    if(window.NEL&&NEL[id]){
      if(NEL[id].l)NEL[id].l.textContent=label;
      if(NEL[id].s&&sub!==undefined)NEL[id].s.textContent=sub;
    }
  }
  function setValue(v,key,val){if(val!==null)v[key]=val;}
  function liveRateDecision(m){
    var c=n(m.ktb3s10sBp),cr=n(m.creditAa3ySpreadBp);
    if(c!==null&&c<0)return ['CURVE INVERTED',78,'장단기 역전 · 듀레이션 방어'];
    if(c!==null&&c>=25&&cr!==null&&cr<100)return ['STEEPENING',82,'3s10s '+signed(c,0,'bp')+' · 크레딧 안정'];
    return ['CURVE WATCH',74,'금리·크레딧 실시간 확인'];
  }
  function liveMacroDecision(m){
    var c=n(m.usCpiYoy),f=n(m.fedFunds);
    if(c!==null&&c<=2.5)return ['DISINFLATION',80,'US CPI '+c.toFixed(1)+'% · FED '+(f===null?'—':f.toFixed(2)+'%')];
    if(c!==null&&c>=3.2)return ['INFLATION WATCH',78,'US CPI '+c.toFixed(1)+'% · 긴축 경계'];
    return ['LIVE MACRO',76,'공개 API · CPI / GDP / 정책금리'];
  }
  function liveEquityDecision(m){
    var s=n(m.kosdaqRiskScore),b=n(m.kosdaqBreadthPct);
    if(s===null)return ['MARKET LIVE',70,'KOSPI·KOSDAQ API'];
    var t=s>=63?'RISK-ON':s<=37?'RISK-OFF':'NEUTRAL';
    return [t,76,'KOSDAQ PULSE '+Math.round(s)+'/100 · BREADTH '+(b===null?'—':Math.round(b)+'%')];
  }
  function updateTimeline(date){
    var ticks=document.querySelectorAll('.tk'); if(!ticks.length)return;
    var last=ticks[ticks.length-1],lab=last.querySelector('.tkl'),tip=last.querySelector('.tip');
    if(lab&&date)lab.textContent=date.slice(5);
    if(tip&&date)tip.innerHTML=esc(date)+' · LIVE PUBLIC API<br>NAVER/NPAY · FRED · DART';
  }
  function applyNodeLabels(m){
    setNodeMeta('mac_gdp','KR REAL GDP','YoY · IMF/FRED');
    setNodeMeta('mac_uscpi','US CPI','YoY · BLS/FRED');
    setNodeMeta('mac_krcpi','KR CPI MODEL','MODEL · PUBLIC FEED PENDING');
    setNodeMeta('mac_fed','FED FUNDS','Effective · FRED');
    setNodeMeta('mac_bok','BOK 기준금리','NAVER/NPAY');
    setNodeMeta('rat_ust','UST 10Y','NAVER/NPAY');
    setNodeMeta('rat_ktb','국고 3Y',m.ktb10y!==null?'10Y '+Number(m.ktb10y).toFixed(2)+'%':'10Y DATA PENDING');
    setNodeMeta('rat_curve','3s10s CURVE','국고 10Y - 3Y');
    setNodeMeta('rat_credit','CREDIT AA- 3Y','회사채 AA- - 국고 3Y');
    setNodeMeta('eq_fin','적자·차입 구조','STRUCTURAL SNAPSHOT');
    setNodeMeta('eq_val','코스닥 할인율','MODEL · RATE-LINKED');
    setNodeMeta('eq_cb','CB 조달 · PUT','STRUCTURAL SNAPSHOT');
    setNodeMeta('eq_ipo','IPO DEMAND','STRUCTURAL SNAPSHOT');
  }
  function decoratePane(){
    if(typeof curTab==='undefined')return;
    var cards=document.querySelectorAll('#pane .cd');
    for(var i=0;i<cards.length;i++){
      var t=cards[i].querySelector('.cdt'),o=cards[i].querySelector('.cdo'); if(!t)continue;
      if(t.textContent.trim()==='GDP NOWCAST'){t.textContent='REAL GDP · LIVE MACRO';if(o)o.textContent='FRED · PUBLIC DATA';}
      if(t.textContent.trim()==='TAYLOR RULE GAP'){if(o)o.textContent='MODEL · LIVE INPUTS';}
      if(t.textContent.trim()==='SCENARIO MATRIX'){if(o)o.textContent='MODEL · LIVE INPUTS';}
      if(t.textContent.trim()==='CREDIT AA- 3Y'){if(o)o.textContent='NAVER/NPAY · LIVE';}
    }
  }
  function installPaneDecorator(){
    var base=window.paneRender; if(typeof base!=='function'||base.__liveCoreWrapped)return;
    var wrap=function(){base.apply(this,arguments);decoratePane();};wrap.__liveCoreWrapped=true;window.paneRender=wrap;
  }
  function observeAsOf(){
    var el=document.getElementById('asof'); if(!el)return;
    var paint=function(){if(STATE.asOfLabel&&el.textContent!==STATE.asOfLabel)el.textContent=STATE.asOfLabel;};
    new MutationObserver(paint).observe(el,{childList:true,characterData:true,subtree:true});paint();
  }
  function hydrate(payload){
    if(!payload||!payload.ok||!payload.metrics)throw new Error('core live snapshot unavailable');
    var m=payload.metrics,v=SNAP[4].v;
    setValue(v,'mac_gdp',n(m.krRealGdpYoy));
    setValue(v,'mac_uscpi',n(m.usCpiYoy));
    setValue(v,'mac_fed',n(m.fedFunds));
    setValue(v,'mac_bok',n(m.bokBaseRate));
    setValue(v,'rat_ust',n(m.ust10y));
    setValue(v,'rat_ktb',n(m.ktb3y));
    setValue(v,'rat_curve',n(m.ktb3s10sBp));
    setValue(v,'rat_credit',n(m.creditAa3ySpreadBp));

    FM.mac_fed=function(x){return x.toFixed(2)+'%';};
    SNAP[4].x.usg=n(m.usRealGdpYoy)!==null?n(m.usRealGdpYoy):SNAP[4].x.usg;
    SNAP[4].x.k10=n(m.ktb10y)!==null?n(m.ktb10y):SNAP[4].x.k10;
    SNAP[4].x.fs=n(m.financialStressIndex)!==null?n(m.financialStressIndex):SNAP[4].x.fs;

    var liveDate=(payload.generatedAtKst||'').slice(0,10)||new Date().toISOString().slice(0,10);
    SNAP[4].d=liveDate;
    SNAP[4].sg.macro=liveMacroDecision(m);
    SNAP[4].sg.rates=liveRateDecision(m);
    SNAP[4].sg.equity=liveEquityDecision(m);
    var alerts=[];
    if(n(m.usCpiYoy)!==null&&n(m.usCpiYoy)>=3.2)alerts.push('mac_uscpi');
    if(n(m.creditAa3ySpreadBp)!==null&&n(m.creditAa3ySpreadBp)>=90)alerts.push('rat_credit');
    if(n(m.ktb3s10sBp)!==null&&n(m.ktb3s10sBp)<0)alerts.push('rat_curve');
    SNAP[4].al=alerts;SNAP[4].n=Math.max(1,alerts.length);
    SNAP[4].bf=[
      'US CPI '+(n(m.usCpiYoy)===null?'DATA PENDING':n(m.usCpiYoy).toFixed(1)+'%')+' · PUBLIC API',
      'UST '+(n(m.ust10y)===null?'—':n(m.ust10y).toFixed(2)+'%')+' → 국고 3Y '+(n(m.ktb3y)===null?'—':n(m.ktb3y).toFixed(2)+'%')+' · 3s10s '+(n(m.ktb3s10sBp)===null?'—':signed(n(m.ktb3s10sBp),0,'bp')),
      'LIVE INPUT '+payload.liveMetricCount+'개 · MODEL/SNAPSHOT 출력은 별도 태그'
    ];

    AV.mac_gdp='IMF IFS 실질 GDP를 FRED 공개 CSV로 수집해 전년동기 대비로 계산합니다.';
    AV.mac_uscpi='BLS CPI 지수를 FRED 공개 CSV로 수집해 전년동월 대비로 계산합니다.';
    AV.mac_fed='FRED DFF의 Effective Federal Funds Rate 최신 관측치입니다.';
    AV.mac_bok='Naver/Npay 공개 marketIndex 기준금리 피드의 한국 정책금리입니다.';
    AV.rat_ust='Naver/Npay 공개 미국 국채 수익률 피드의 10년물입니다.';
    AV.rat_ktb='Naver/Npay 공개 한국 국채 수익률 피드의 3년물입니다.';
    AV.rat_curve='Naver/Npay 국고 10년물 - 3년물로 계산한 실시간 커브 스프레드입니다.';
    AV.rat_credit='Naver/Npay 국내금리 피드의 회사채 AA- 3년 수익률에서 국고 3년을 차감한 값입니다.';

    applyNodeLabels(m);
    if(si===4){cur=SNAP[4];for(var k in FM)V[k]=cur.v[k];apply(0);}
    applyNodeLabels(m);
    installPaneDecorator();paneRender();decoratePane();
    var stamp=payload.generatedAtKst||kstClock(payload.generatedAt)||liveDate;
    STATE.asOfLabel=stamp+' · PUBLIC API';observeAsOf();
    var sn=document.getElementById('snl');if(sn)sn.textContent=liveDate;
    var lv=document.getElementById('lvt');if(lv)lv.textContent='LIVE API';
    var fd=document.getElementById('fd');if(fd)fd.textContent='NAVER/NPAY · FRED · DART · '+payload.liveMetricCount+' LIVE METRICS';
    var ov=document.querySelector('.ovl .ml2');if(ov)ov.textContent='관계 = 사전 정의 온톨로지 · 값 = PUBLIC API 우선 · MODEL/SNAPSHOT 별도 태그';
    updateTimeline(liveDate);
  }

  async function start(){
    STATE.status='loading';
    try{
      var p=await getJson(SNAPSHOT+'?t='+Date.now());STATE.data=p;hydrate(p);STATE.status='ready';STATE.error=null;
    }catch(e){STATE.status='error';STATE.error=String(e&&e.message||e);var fd=document.getElementById('fd');if(fd)fd.textContent='CORE LIVE DATA PENDING · MODEL/SNAPSHOT VALUES TAGGED';}
  }
  start();
  setInterval(start,600000);
})();
