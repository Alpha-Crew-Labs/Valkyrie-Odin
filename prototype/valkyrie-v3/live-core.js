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
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function pct(v,d){var x=n(v);return x===null?'DATA PENDING':x.toFixed(d==null?2:d)+'%';}
  function bp(v){var x=n(v);return x===null?'DATA PENDING':signed(x,0,'bp');}
  function plain(v,d){var x=n(v);return x===null?'DATA PENDING':x.toFixed(d==null?1:d);}
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
    var bei=n(m.breakeven10y),uc=n(m.ust2s10sBp),hy=n(m.usHyOasBp),k10=n(m.ktb10y);
    setNodeMeta('mac_gdp','KR REAL GDP','YoY · IMF/FRED');
    setNodeMeta('mac_uscpi','US CPI','YoY · 10Y BEI '+(bei===null?'PENDING':bei.toFixed(2)+'%'));
    setNodeMeta('mac_krcpi','KR CPI MODEL','MODEL · PUBLIC FEED PENDING');
    setNodeMeta('mac_fed','FED FUNDS','Effective · FRED');
    setNodeMeta('mac_bok','BOK 기준금리','NAVER/NPAY');
    setNodeMeta('rat_ust','UST 10Y','US 2s10s '+(uc===null?'PENDING':signed(uc,0,'bp')));
    setNodeMeta('rat_ktb','국고 3Y',k10!==null?'10Y '+k10.toFixed(2)+'%':'10Y DATA PENDING');
    setNodeMeta('rat_curve','3s10s CURVE','국고 10Y - 3Y');
    setNodeMeta('rat_credit','CREDIT AA- 3Y','US HY OAS '+(hy===null?'PENDING':Math.round(hy)+'bp'));
    setNodeMeta('eq_fin','적자·차입 구조','STRUCTURAL SNAPSHOT');
    setNodeMeta('eq_val','코스닥 할인율','MODEL · RATE-LINKED');
    setNodeMeta('eq_cb','CB 조달 · PUT','PUBLIC DART + STRUCTURAL');
    setNodeMeta('eq_ipo','IPO DEMAND','PUBLIC DART + MARKET');
  }

  function header(title,source){return '<div class="cdh"><span class="cdt">'+esc(title)+'</span><span class="cdo">'+esc(source||'PUBLIC DATA')+'</span></div>';}
  function kv(label,value,cls){return '<div class="kv"><span>'+esc(label)+'</span><b'+(cls?' class="'+cls+'"':'')+'>'+esc(value)+'</b></div>';}
  function note(text){return '<div class="note">'+esc(text)+'</div>';}
  function providerOk(p,keys){for(var i=0;i<keys.length;i++)if(!p||p[keys[i]]!=='ok')return false;return true;}
  function status(ok){return '<span class="'+(ok?'up':'pd')+'">'+(ok?'OK':'PENDING')+'</span>';}
  function paintCard(card,html){if(!card)return;card.classList.add('live-core-card');card.innerHTML=html;}
  function pendingWorkbench(cards,domain){
    for(var i=0;i<cards.length;i++)paintCard(cards[i],header(i===0?domain+' · LIVE':'PUBLIC INPUT','DATA PENDING')+'<div class="big" style="font-size:13px;color:#EFA83A">DATA PENDING</div>'+note('공개 데이터가 확인되기 전에는 샘플 숫자를 표시하지 않습니다.'));
  }
  function macroWorkbench(cards,m,payload){
    if(cards.length<5)return;
    var ps=payload.providerStatus||{};
    paintCard(cards[0],header('MACRO STATE · LIVE','PUBLIC API')+
      kv('US CPI YoY',pct(m.usCpiYoy,1),'')+kv('10Y BEI',pct(m.breakeven10y,2),'cy')+kv('FED FUNDS',pct(m.fedFunds,2),'')+kv('BOK 기준금리',pct(m.bokBaseRate,2),'am')+kv('VIX',plain(m.vix,1),'')+
      note('현재 공개 입력만 표시합니다. 시나리오 수치는 검증된 모델이 연결될 때까지 PENDING입니다.'));
    paintCard(cards[1],header('POLICY GAP · MODEL','LIVE INPUT / MODEL PENDING')+
      kv('실제 BOK',pct(m.bokBaseRate,2),'')+kv('FED',pct(m.fedFunds,2),'')+kv('KR 적정금리','MODEL PENDING','am')+kv('정책 GAP','DATA PENDING','')+
      note('검증된 현재형 Taylor Rule 파라미터가 연결되지 않아 임의의 적정금리와 GAP을 산출하지 않습니다.'));
    paintCard(cards[2],header('REAL GDP · LIVE MACRO','FRED · PUBLIC DATA')+
      kv('KR 실질 GDP YoY',pct(m.krRealGdpYoy,2),'')+kv('US 실질 GDP YoY',pct(m.usRealGdpYoy,2),'')+kv('USD BROAD',plain(m.broadDollarIndex,2),'')+kv('10Y BEI',pct(m.breakeven10y,2),'cy')+
      note('Nowcast가 아닌 최신 공개 실질성장률입니다. Nowcast 모델 출력은 별도 검증 후 연결합니다.'));
    paintCard(cards[3],header('MARKET STRESS · LIVE','PUBLIC MARKET INPUTS')+
      '<div class="big" style="color:'+(n(m.financialStressIndex)!==null&&n(m.financialStressIndex)>55?'#EFA83A':'#31C08C')+'">'+esc(n(m.financialStressIndex)===null?'DATA PENDING':Math.round(n(m.financialStressIndex))+'/100')+'</div>'+
      kv('VIX',plain(m.vix,1),'')+kv('US HY OAS',n(m.usHyOasBp)===null?'DATA PENDING':Math.round(n(m.usHyOasBp))+'bp','')+kv('US 2s10s',bp(m.ust2s10sBp),'')+
      note('포트폴리오 보유·가중치가 연결되지 않아 VaR 및 기여도 숫자는 표시하지 않습니다.'));
    paintCard(cards[4],header('LIVE INPUT STACK',payload.liveMetricCount+' METRICS')+
      '<table class="tb"><thead><tr><th>입력 계층</th><th class="n">상태</th></tr></thead><tbody>'+
      '<tr><td>NAVER/NPAY RATES</td><td class="n">'+status(providerOk(ps,['usaBonds','korBonds','domestic']))+'</td></tr>'+
      '<tr><td>FRED MACRO</td><td class="n">'+status(providerOk(ps,['usCpi','fedFunds','ust10yFred','vix','hyOas']))+'</td></tr>'+
      '<tr><td>BOK RATE</td><td class="n">'+status(n(m.bokBaseRate)!==null)+'</td></tr>'+
      '<tr><td>DART EVENT</td><td class="n">'+status(ps.dart==='ok')+'</td></tr>'+
      '</tbody></table>'+note('모델 MAE는 검증구간 데이터가 없으므로 표시하지 않습니다.'));
  }
  function ratesWorkbench(cards,m,payload){
    if(cards.length<4)return;
    var ps=payload.providerStatus||{},sg=window.SNAP&&SNAP[4]&&SNAP[4].sg&&SNAP[4].sg.rates?SNAP[4].sg.rates:null;
    paintCard(cards[0],header('DECISION LOG · PENDING','LIVE SIGNAL ONLY')+
      '<div class="big" style="font-size:16px;color:#EFA83A">'+esc(sg&&sg[0]?sg[0]:'SIGNAL PENDING')+'</div>'+
      kv('KR 3s10s',bp(m.ktb3s10sBp),'cy')+kv('AA- 3Y SPREAD',n(m.creditAa3ySpreadBp)===null?'DATA PENDING':Math.round(n(m.creditAa3ySpreadBp))+'bp','')+kv('UST 10Y',pct(m.ust10y,3),'')+
      note('실제 판단 로그와 사후성과 원장이 연결되기 전에는 가정 수익률을 LIVE 화면에 표시하지 않습니다.'));
    paintCard(cards[1],header('CURVE · LIVE','NAVER/NPAY')+
      kv('국고 3Y',pct(m.ktb3y,3),'')+kv('국고 10Y',pct(m.ktb10y,3),'')+kv('KR 3s10s',bp(m.ktb3s10sBp),n(m.ktb3s10sBp)!==null&&n(m.ktb3s10sBp)>=0?'gr':'rd')+kv('UST 10Y',pct(m.ust10y,3),'')+
      note('현재 공개 국채 수익률로 계산한 커브입니다. 과거 비교선은 Replay에서만 사용합니다.'));
    paintCard(cards[2],header('CREDIT AA- 3Y · LIVE','NAVER/NPAY + FRED')+
      '<div class="big" style="color:'+(n(m.creditAa3ySpreadBp)!==null&&n(m.creditAa3ySpreadBp)>90?'#EF5A61':'#31C08C')+'">'+esc(n(m.creditAa3ySpreadBp)===null?'DATA PENDING':Math.round(n(m.creditAa3ySpreadBp))+'bp')+'</div>'+
      kv('AA- 3Y YIELD',pct(m.creditAa3yYield,3),'')+kv('US HY OAS',n(m.usHyOasBp)===null?'DATA PENDING':Math.round(n(m.usHyOasBp))+'bp','')+kv('VIX',plain(m.vix,1),'')+
      note('크레딧 → CB 조달 조건 전이관계는 온톨로지에 유지하되 현재값은 공개 데이터만 사용합니다.'));
    paintCard(cards[3],header('DATA COVERAGE',payload.liveMetricCount+' LIVE METRICS')+
      kv('NAVER/NPAY RATES',providerOk(ps,['usaBonds','korBonds','domestic'])?'OK':'PENDING',providerOk(ps,['usaBonds','korBonds','domestic'])?'gr':'am')+
      kv('FRED CURVE / RISK',providerOk(ps,['ust2yFred','ust10yFred','vix','hyOas'])?'OK':'PENDING',providerOk(ps,['ust2yFred','ust10yFred','vix','hyOas'])?'gr':'am')+
      kv('BOK',n(m.bokBaseRate)!==null?'OK':'PENDING',n(m.bokBaseRate)!==null?'gr':'am')+
      note('미수신 값은 0으로 채우지 않고 DATA PENDING으로 남깁니다.'));
  }
  function decorateInspector(m){
    if(typeof si==='undefined'||si!==4)return;
    var ins=document.querySelector('#pane .ins');if(!ins)return;
    var rows=ins.querySelectorAll('.kv');
    for(var i=0;i<rows.length;i++){
      var label=rows[i].querySelector('span'),value=rows[i].querySelector('b');if(!label||!value)continue;
      var key=label.textContent.trim();
      if(key==='CONFIDENCE'){
        value.textContent='MODEL PENDING';value.className='am';
        var bar=rows[i].parentElement&&rows[i].parentElement.querySelector('.bar i');if(bar)bar.style.width='0%';
      }
      if(key==='DATA VINTAGE'){
        value.textContent=m?'LIVE PUBLIC API':'DATA PENDING';value.className=m?'cy':'am';
      }
    }
    var notes=ins.querySelectorAll('.note');
    for(var j=0;j<notes.length;j++){
      if(notes[j].textContent.indexOf('공표시점')>=0)notes[j].textContent=m?'현재 LIVE 화면은 공개 API timestamp 기준 · 모델/PIT 검증값은 별도 연결 예정':'공개 API 수신 전 · 샘플/가정값을 사용하지 않습니다.';
    }
    var id=(typeof INS!=='undefined'&&INS)?INS.id:null;
    if(id==='mac_krcpi'){
      var big=ins.querySelector('.cd .big');if(big){big.textContent='MODEL PENDING';big.style.fontSize='12px';big.style.color='#EFA83A';}
    }
  }
  function decoratePane(){
    if(typeof curTab==='undefined'||typeof si==='undefined'||si!==4)return;
    if(curTab!=='MACRO'&&curTab!=='RATES')return;
    var cards=document.querySelectorAll('#pane .g4>.cd');
    var payload=STATE.data,m=payload&&payload.ok===true&&payload.metrics?payload.metrics:null;
    if(!m){pendingWorkbench(cards,curTab);decorateInspector(null);return;}
    if(curTab==='MACRO')macroWorkbench(cards,m,payload);
    if(curTab==='RATES')ratesWorkbench(cards,m,payload);
    decorateInspector(m);
    if(typeof window.declutterValkyrie==='function')window.declutterValkyrie();
  }
  function installPaneDecorator(){
    var base=window.paneRender; if(typeof base!=='function'||base.__liveCoreWrapped)return;
    var wrap=function(){var r=base.apply(this,arguments);decoratePane();return r;};wrap.__liveCoreWrapped=true;window.paneRender=wrap;
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
    installPaneDecorator();if(typeof paneRender==='function')paneRender();else decoratePane();
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