/* VALKYRIE · live macro/rates ontology bridge
 * Replaces API-available demo values in the latest snapshot with public-data inputs.
 * Historical replay remains an archive; current mode fails closed to DATA PENDING when public data is unavailable.
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
    var c=n(m.ktb3s10sBp),cr=n(m.creditAa3ySpreadBp),uc=n(m.ust2s10sBp),hy=n(m.usHyOasBp);
    var global='US 2s10s '+(uc===null?'—':signed(uc,0,'bp'))+' · HY '+(hy===null?'—':Math.round(hy)+'bp');
    if(c!==null&&c<0)return ['CURVE INVERTED',78,'KR 3s10s '+signed(c,0,'bp')+' · '+global];
    if(c!==null&&c>=25&&cr!==null&&cr<100)return ['STEEPENING',82,'KR 3s10s '+signed(c,0,'bp')+' · '+global];
    return ['CURVE WATCH',74,global];
  }
  function liveMacroDecision(m){
    var c=n(m.usCpiYoy),f=n(m.fedFunds),bei=n(m.breakeven10y),vix=n(m.vix);
    var market='BEI '+(bei===null?'—':bei.toFixed(2)+'%')+' · VIX '+(vix===null?'—':vix.toFixed(1));
    if(c!==null&&c<=2.5)return ['DISINFLATION',80,'US CPI '+c.toFixed(1)+'% · '+market];
    if((c!==null&&c>=3.2)||(bei!==null&&bei>=2.6))return ['INFLATION WATCH',78,'CPI '+(c===null?'—':c.toFixed(1)+'%')+' · '+market];
    return ['LIVE MACRO',76,'FED '+(f===null?'—':f.toFixed(2)+'%')+' · '+market];
  }
  function liveEquityDecision(m){
    var s=n(m.kosdaqRiskScore),b=n(m.kosdaqBreadthPct),vix=n(m.vix);
    if(s===null)return ['MARKET LIVE',70,'KOSPI·KOSDAQ API · VIX '+(vix===null?'—':vix.toFixed(1))];
    var t=s>=63?'RISK-ON':s<=37?'RISK-OFF':'NEUTRAL';
    return [t,76,'KOSDAQ '+Math.round(s)+'/100 · BREADTH '+(b===null?'—':Math.round(b)+'%')+' · VIX '+(vix===null?'—':vix.toFixed(1))];
  }
  function updateTimeline(date){
    var ticks=document.querySelectorAll('.tk'); if(!ticks.length)return;
    var last=ticks[ticks.length-1],lab=last.querySelector('.tkl'),tip=last.querySelector('.tip');
    if(lab&&date)lab.textContent=date.slice(5);
    if(tip&&date)tip.innerHTML=esc(date)+' · LIVE PUBLIC API<br>NAVER/NPAY · FRED · DART';
  }
  function applyNodeLabels(m){
    var bei=n(m.breakeven10y),uc=n(m.ust2s10sBp),hy=n(m.usHyOasBp);
    setNodeMeta('mac_gdp','KR REAL GDP','YoY · IMF/FRED');
    setNodeMeta('mac_uscpi','US CPI','YoY · 10Y BEI '+(bei===null?'PENDING':bei.toFixed(2)+'%'));
    setNodeMeta('mac_krcpi','KR CPI MODEL','MODEL · PUBLIC FEED PENDING');
    setNodeMeta('mac_fed','FED FUNDS','Effective · FRED');
    setNodeMeta('mac_bok','BOK 기준금리','NAVER/NPAY');
    setNodeMeta('rat_ust','UST 10Y','US 2s10s '+(uc===null?'PENDING':signed(uc,0,'bp')));
    setNodeMeta('rat_ktb','국고 3Y',m.ktb10y!==null?'10Y '+Number(m.ktb10y).toFixed(2)+'%':'10Y DATA PENDING');
    setNodeMeta('rat_curve','3s10s CURVE','국고 10Y - 3Y');
    setNodeMeta('rat_credit','CREDIT AA- 3Y','US HY OAS '+(hy===null?'PENDING':Math.round(hy)+'bp'));
    setNodeMeta('eq_fin','적자·차입 구조','STRUCTURAL SNAPSHOT');
    setNodeMeta('eq_val','코스닥 할인율','MODEL · RATE-LINKED');
    setNodeMeta('eq_cb','CB 조달 · PUT','PUBLIC DART + STRUCTURAL');
    setNodeMeta('eq_ipo','IPO DEMAND','PUBLIC DART + MARKET');
  }
  function addLiveNote(card,text){
    if(!card||card.querySelector('.live-core-extra'))return;
    var d=document.createElement('div');d.className='note live-core-extra';d.style.marginTop='6px';d.textContent=text;card.appendChild(d);
  }
  function decoratePane(){
    if(typeof curTab==='undefined')return;
    var m=STATE.data&&STATE.data.metrics?STATE.data.metrics:null;
    var cards=document.querySelectorAll('#pane .cd');
    for(var i=0;i<cards.length;i++){
      var t=cards[i].querySelector('.cdt'),o=cards[i].querySelector('.cdo'); if(!t)continue;
      var title=t.textContent.trim();
      if(title==='GDP NOWCAST'||title==='REAL GDP · LIVE MACRO'){
        t.textContent='REAL GDP · LIVE MACRO';if(o)o.textContent='FRED · PUBLIC DATA';
        if(m)addLiveNote(cards[i],'10Y BEI '+(n(m.breakeven10y)===null?'DATA PENDING':n(m.breakeven10y).toFixed(2)+'%')+' · VIX '+(n(m.vix)===null?'DATA PENDING':n(m.vix).toFixed(1))+' · USD BROAD '+(n(m.broadDollarIndex)===null?'DATA PENDING':n(m.broadDollarIndex).toFixed(2)));
      }
      if(title==='TAYLOR RULE GAP'){if(o)o.textContent='MODEL · LIVE INPUTS';}
      if(title==='SCENARIO MATRIX'){if(o)o.textContent='MODEL · LIVE INPUTS';}
      if(title==='CREDIT AA- 3Y'){
        if(o)o.textContent='NAVER/NPAY + FRED · LIVE';
        if(m)addLiveNote(cards[i],'US HY OAS '+(n(m.usHyOasBp)===null?'DATA PENDING':Math.round(n(m.usHyOasBp))+'bp')+' · US 2s10s '+(n(m.ust2s10sBp)===null?'DATA PENDING':signed(n(m.ust2s10sBp),0,'bp'))+' · VIX '+(n(m.vix)===null?'DATA PENDING':n(m.vix).toFixed(1)));
      }
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
  function failClosed(reason){
    var ids=['mac_gdp','mac_uscpi','mac_fed','mac_bok','rat_ust','rat_ktb','rat_curve','rat_credit'];
    for(var i=0;i<ids.length;i++){
      var e=window.NEL&&NEL[ids[i]];if(!e)continue;
      if(e.v)e.v.textContent='DATA PENDING';
      if(e.s)e.s.textContent='PUBLIC API UNAVAILABLE';
    }
    if(typeof si!=='undefined'&&si===4){
      var b1=document.getElementById('bf1'),b2=document.getElementById('bf2'),b3=document.getElementById('bf3');
      if(b1)b1.textContent='PUBLIC API DATA PENDING';
      if(b2)b2.textContent='현재값을 샘플 숫자로 대체하지 않습니다';
      if(b3)b3.textContent='LIVE DATA REQUIRED';
    }
    STATE.asOfLabel='DATA PENDING · PUBLIC API';observeAsOf();
    var lv=document.getElementById('lvt');if(lv)lv.textContent='DATA PENDING';
    var fd=document.getElementById('fd');if(fd)fd.textContent='CORE LIVE DATA PENDING · NO FABRICATED FALLBACK'+(reason?' · '+reason:'');
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
    SNAP[4].x.bei=n(m.breakeven10y);
    SNAP[4].x.us2s10s=n(m.ust2s10sBp);
    SNAP[4].x.vix=n(m.vix);
    SNAP[4].x.hy=n(m.usHyOasBp);
    SNAP[4].x.usd=n(m.broadDollarIndex);

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
      'US CPI '+(n(m.usCpiYoy)===null?'DATA PENDING':n(m.usCpiYoy).toFixed(1)+'%')+' · 10Y BEI '+(n(m.breakeven10y)===null?'—':n(m.breakeven10y).toFixed(2)+'%')+' · VIX '+(n(m.vix)===null?'—':n(m.vix).toFixed(1)),
      'UST 10Y '+(n(m.ust10y)===null?'—':n(m.ust10y).toFixed(2)+'%')+' · US 2s10s '+(n(m.ust2s10sBp)===null?'—':signed(n(m.ust2s10sBp),0,'bp'))+' → KR 3s10s '+(n(m.ktb3s10sBp)===null?'—':signed(n(m.ktb3s10sBp),0,'bp')),
      'US HY OAS '+(n(m.usHyOasBp)===null?'—':Math.round(n(m.usHyOasBp))+'bp')+' · LIVE INPUT '+payload.liveMetricCount+'개 · MODEL/SNAPSHOT 별도 태그'
    ];

    AV.mac_gdp='IMF IFS 실질 GDP를 FRED 공개 CSV로 수집해 전년동기 대비로 계산합니다.';
    AV.mac_uscpi='BLS CPI 전년비와 FRED T10YIE 10년 기대인플레이션을 함께 확인합니다.';
    AV.mac_fed='FRED DFF의 Effective Federal Funds Rate 최신 관측치입니다.';
    AV.mac_bok='Naver/Npay 공개 marketIndex 기준금리 피드의 한국 정책금리입니다.';
    AV.rat_ust='Naver/Npay UST 10Y를 주값으로 쓰고 FRED DGS2/DGS10 2s10s 커브를 교차 확인합니다.';
    AV.rat_ktb='Naver/Npay 공개 한국 국채 수익률 피드의 3년물입니다.';
    AV.rat_curve='Naver/Npay 국고 10년물 - 3년물로 계산한 실시간 커브 스프레드입니다.';
    AV.rat_credit='한국 AA- 3년 스프레드와 FRED ICE BofA US HY OAS를 함께 확인해 글로벌 크레딧 상태를 교차 점검합니다.';

    applyNodeLabels(m);
    if(si===4){cur=SNAP[4];for(var k in FM)V[k]=cur.v[k];apply(0);}
    applyNodeLabels(m);
    installPaneDecorator();paneRender();decoratePane();
    var stamp=payload.generatedAtKst||kstClock(payload.generatedAt)||liveDate;
    STATE.asOfLabel=stamp+' · PUBLIC API';observeAsOf();
    var sn=document.getElementById('snl');if(sn)sn.textContent=liveDate;
    var lv=document.getElementById('lvt');if(lv)lv.textContent='LIVE API';
    var fd=document.getElementById('fd');if(fd)fd.textContent='NAVER/NPAY · FRED H.15/CBOE/ICE · DART · '+payload.liveMetricCount+' LIVE METRICS';
    var ov=document.querySelector('.ovl .ml2');if(ov)ov.textContent='관계 = 사전 정의 온톨로지 · 값 = PUBLIC API 우선 · MODEL/SNAPSHOT 별도 태그';
    updateTimeline(liveDate);
  }

  async function start(){
    STATE.status='loading';
    try{
      var p=await getJson(SNAPSHOT+'?t='+Date.now());STATE.data=p;hydrate(p);STATE.status='ready';STATE.error=null;
    }catch(e){STATE.status='error';STATE.error=String(e&&e.message||e);failClosed('PUBLIC SNAPSHOT UNAVAILABLE');}
  }
  start();
  setInterval(start,600000);
})();
