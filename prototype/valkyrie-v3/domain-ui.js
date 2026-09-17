/* VALKYRIE v3 · domain-aware navigation layer
 * Domain selection synchronizes brief, ontology focus and lower research surface.
 * Node-wheel focus magnifies the hovered object and its causal chain without changing geometry.
 * Current-mode text comes from live public-data bridges; no fabricated live fallback.
 */
(function(){
  'use strict';

  var MAP={MACRO:'mac',RATES:'rat',EQUITY:'eq'};
  var SIGNAL={MACRO:'sig_macro',RATES:'sig_rates',EQUITY:'sig_equity'};
  var OWNERS={MACRO:'정희강',RATES:'정훈',EQUITY:'김유찬'};
  var ZOOM={id:null,level:0};

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
  function liveMetrics(){var s=window.VALKYRIE_LIVE_CORE;return s&&s.data&&s.data.ok===true&&s.data.metrics?s.data.metrics:null;}
  function themeLead(){var s=window.VALKYRIE_THEME_EQUITY,t=s&&Array.isArray(s.top)&&s.top.length?s.top[0]:null;if(!t||num(t.changeRate)===null)return null;return String(t.name)+' '+(num(t.changeRate)>0?'+':'')+num(t.changeRate).toFixed(2)+'%';}

  function replayBrief(domain){
    var o=typeof calc==='function'?calc():null;if(!o||!window.cur)return ['REPLAY DATA','SNAPSHOT','SIGNAL'];
    if(domain==='MACRO')return ['REPLAY · CPI '+pct(o.mac_uscpi,1)+' · GDP '+pct(o.mac_gdp,2),'BOK '+pct(o.mac_bok,2)+' · STRESS '+(cur.x&&cur.x.fs!=null?cur.x.fs:'—'),sig('MACRO')+' · SNAPSHOT'];
    if(domain==='RATES')return ['REPLAY · UST 10Y '+pct(o.rat_ust,2),'국고 3Y '+pct(o.rat_ktb,2)+' · CURVE '+bp(o.rat_curve),sig('RATES')+' · AA- '+Math.round(o.rat_credit)+'bp'];
    return ['REPLAY · IPO '+Math.round(o.eq_ipo)+':1','할인율 '+pct(o.eq_val,1)+' · CB '+Math.round(o.eq_cb)+'곳',sig('EQUITY')+' · SNAPSHOT'];
  }
  function shockBrief(domain){
    var o=typeof calc==='function'?calc():null;if(!o)return ['SHOCK MODEL','MODEL INPUT','MODEL SIGNAL'];
    if(domain==='MACRO')return ['SHOCK · BOK '+(SH.bok>=0?'+':'')+SH.bok+'bp · UST '+(SH.ust>=0?'+':'')+SH.ust+'bp','BOK '+pct(o.mac_bok,2)+' · CPI '+pct(o.mac_uscpi,1),sig('MACRO')+' · MODEL'];
    if(domain==='RATES')return ['SHOCK · UST '+(SH.ust>=0?'+':'')+SH.ust+'bp · CREDIT '+(SH.cr>=0?'+':'')+SH.cr+'bp','국고 3Y '+pct(o.rat_ktb,2)+' · CURVE '+bp(o.rat_curve),sig('RATES')+' · AA- '+Math.round(o.rat_credit)+'bp'];
    return ['SHOCK · RATE '+(SH.ust>=0?'+':'')+SH.ust+'bp · CREDIT '+(SH.cr>=0?'+':'')+SH.cr+'bp','할인율 '+pct(o.eq_val,1)+' · CB '+Math.round(o.eq_cb)+'곳',sig('EQUITY')+' · IPO '+Math.round(o.eq_ipo)+':1'];
  }
  function currentBrief(domain){
    var m=liveMetrics();if(!m)return ['PUBLIC DATA PENDING','LIVE INPUT REQUIRED','SIGNAL PENDING'];
    if(domain==='MACRO')return ['CPI '+pct(m.usCpiYoy,1)+' · BEI '+pct(m.breakeven10y,2),'FED '+pct(m.fedFunds,2)+' → BOK '+pct(m.bokBaseRate,2),sig('MACRO')+' · VIX '+(num(m.vix)===null?'—':num(m.vix).toFixed(1))];
    if(domain==='RATES')return ['UST 10Y '+pct(m.ust10y,2)+' · 2s10s '+bp(m.ust2s10sBp),'국고 3Y '+pct(m.ktb3y,2)+' · 3s10s '+bp(m.ktb3s10sBp),sig('RATES')+' · AA- '+(num(m.creditAa3ySpreadBp)===null?'—':Math.round(num(m.creditAa3ySpreadBp))+'bp')];
    var lead=themeLead();
    return ['KOSDAQ '+(num(m.kosdaqRiskScore)===null?'—':Math.round(num(m.kosdaqRiskScore))+'/100')+' · 폭 '+(num(m.kosdaqBreadthPct)===null?'—':Math.round(num(m.kosdaqBreadthPct))+'%'),lead||('VIX '+(num(m.vix)===null?'—':num(m.vix).toFixed(1))+' · HY '+(num(m.usHyOasBp)===null?'—':Math.round(num(m.usHyOasBp))+'bp')),sig('EQUITY')+' · IPO '+count(m.dartIpoEvents)+' · CB '+count(m.dartCbEvents)];
  }
  function briefValues(){var domain=window.curTab||'RATES';if(typeof shocked==='function'&&shocked())return shockBrief(domain);if(typeof si!=='undefined'&&si!==4)return replayBrief(domain);return currentBrief(domain);}
  function paintBrief(){
    var domain=window.curTab||'RATES',vals=briefValues(),box=document.querySelector('.bf');if(box)box.setAttribute('data-domain',domain);
    var tags=document.querySelectorAll('.bf .tag');if(tags.length>=3){tags[0].textContent='SHOCK';tags[1].textContent='FLOW';tags[2].textContent='DECISION';}
    ['bf1','bf2','bf3'].forEach(function(id,i){var e=byId(id);if(!e)return;e.textContent=vals[i]||'—';e.classList.remove('rv');void e.offsetWidth;e.classList.add('rv');});
  }
  window.refreshDomainBrief=paintBrief;window.brief=paintBrief;

  function stripOwnerInline(v){
    return String(v||'')
      .replace(/정희강\s*·?\s*/g,'')
      .replace(/정훈\s*·?\s*/g,'')
      .replace(/김유찬\s*·?\s*/g,'');
  }
  function stripOwnerText(v){
    return stripOwnerInline(v)
      .replace(/^\s*·\s*/,'')
      .replace(/\s*·\s*$/,'')
      .replace(/\s{2,}/g,' ')
      .trim();
  }
  function compactCdo(v){
    var s=stripOwnerText(v);
    s=s.replace(/AIKSTOCKDATA\s*·?\s*/gi,'').replace(/PUBLIC\s+DART/gi,'DART').replace(/PUBLIC\s+DATA/gi,'DATA').replace(/PUBLIC\s+API/gi,'API').replace(/\s*·\s*LIVE INPUTS/gi,'').replace(/\s*·\s*LIVE$/i,'');
    return s.replace(/^\s*·\s*/,'').replace(/\s*·\s*$/,'').trim();
  }
  function cleanPaneTextNodes(){
    var pane=byId('pane');if(!pane||!document.createTreeWalker)return;
    var showText=window.NodeFilter?window.NodeFilter.SHOW_TEXT:4,walker=document.createTreeWalker(pane,showText),nodes=[],node;
    while((node=walker.nextNode()))nodes.push(node);
    for(var i=0;i<nodes.length;i++){
      var before=nodes[i].nodeValue,after=stripOwnerInline(before)
        .replace(/AIKSTOCKDATA\s*·?\s*/gi,'')
        .replace(/PUBLIC\s+DART/gi,'DART')
        .replace(/PUBLIC\s+DATA/gi,'DATA')
        .replace(/PUBLIC\s+API/gi,'API');
      if(after!==before)nodes[i].nodeValue=after;
    }
  }
  function liveReadyForDomain(){
    if(typeof si==='undefined'||si!==4)return false;
    if((window.curTab||'RATES')==='EQUITY'){
      var e=window.VALKYRIE_LIVE_EQUITY;return !!(e&&e.status==='ready'&&e.data&&e.data.ok);
    }
    var c=window.VALKYRIE_LIVE_CORE;return !!(c&&c.status==='ready'&&c.data&&c.data.ok);
  }
  function sanitizeLiveInspector(){
    if(typeof si==='undefined'||si!==4)return;
    var ins=document.querySelector('#pane .ins');if(!ins)return;
    var ready=liveReadyForDomain(),rows=ins.querySelectorAll('.kv');
    for(var i=0;i<rows.length;i++){
      var label=rows[i].querySelector('span'),value=rows[i].querySelector('b');if(!label||!value)continue;
      var key=label.textContent.trim();
      if(key==='CONFIDENCE'){
        value.textContent='MODEL PENDING';value.className='am';
        var bar=rows[i].parentElement&&rows[i].parentElement.querySelector('.bar i');if(bar)bar.style.width='0%';
      }
      if(key==='DATA VINTAGE'){
        value.textContent=ready?'LIVE PUBLIC API':'DATA PENDING';value.className=ready?'cy':'am';
      }
    }
    var notes=ins.querySelectorAll('.note');
    for(var j=0;j<notes.length;j++)if(notes[j].textContent.indexOf('공표시점')>=0)notes[j].textContent=ready?'현재 LIVE 화면은 공개 API timestamp 기준 · 모델/PIT 검증값은 별도 연결 예정':'공개 API 수신 전 · 샘플/가정값을 사용하지 않습니다.';
    var id=(typeof INS!=='undefined'&&INS)?INS.id:null;
    if(id==='mac_krcpi'||id==='eq_cb'||id==='eq_ipo'){
      var big=ins.querySelector('.cd .big');if(big){big.textContent=id==='mac_krcpi'?'MODEL PENDING':'DATA PENDING';big.style.fontSize='12px';big.style.color='#EFA83A';}
    }
  }
  function sanitizeEquitySignal(){
    if(typeof si==='undefined'||si!==4||!window.NEL||!NEL.sig_equity||!NEL.sig_equity.s)return;
    var e=NEL.sig_equity.s,t=String(e.textContent||'');
    var next=t.replace(/DIRECT LIVE\s*·\s*CONF\s*(\d+(?:\.\d+)?)%/i,'DIRECT LIVE · PULSE $1/100');
    if(next!==t)e.textContent=next;
  }
  function sanitizeLiveSurface(){sanitizeLiveInspector();sanitizeEquitySignal();}
  function declutter(){
    var tabs=document.querySelectorAll('.tab');
    for(var i=0;i<tabs.length;i++){
      var d=tabs[i].getAttribute('data-t'),to=tabs[i].querySelector('.to');if(to&&OWNERS[d])to.textContent=OWNERS[d];
    }
    var lanes=document.querySelectorAll('.lnm');for(var j=0;j<lanes.length;j++)lanes[j].textContent=String(lanes[j].textContent||'').split('·')[0].trim();
    var owns=document.querySelectorAll('.nown');for(var k=0;k<owns.length;k++)owns[k].textContent='';
    var cdo=document.querySelectorAll('#pane .cdo');for(var a=0;a<cdo.length;a++)cdo[a].textContent=compactCdo(cdo[a].textContent);
    cleanPaneTextNodes();
    if(window.ND){for(var id in ND)if(ND[id])ND[id].o='';}
    var meta=document.querySelector('.ovl .ml2');if(meta)meta.textContent='ONTOLOGY · LIVE DATA';
    var tabsp=document.querySelector('.tabsp');if(tabsp)tabsp.setAttribute('aria-hidden','true');
    var feed=document.querySelector('.ovb>div:nth-child(2)');if(feed)feed.style.display='none';
    var flow=byId('fl1');if(flow)flow.textContent='22 FLOWS';
    sanitizeLiveSurface();
  }
  window.declutterValkyrie=declutter;

  var baseTab=window.tab;
  if(typeof baseTab==='function')window.tab=function(t,hl){var r=baseTab(t,hl);paintBrief();setTimeout(declutter,0);return r;};

  function resetNodeZoom(){
    ZOOM.id=null;ZOOM.level=0;
    if(!window.SV)return;
    SV.classList.remove('node-zoom','zoom-l1','zoom-l2');
    if(window.NEL)for(var id in NEL)if(NEL[id]&&NEL[id].g)NEL[id].g.classList.remove('zoom-main','zoom-rel','zoom-muted');
    if(window.EL)for(var i=0;i<EL.length;i++)EL[i].g.classList.remove('zoom-rel');
  }
  function applyNodeZoom(id,level){
    if(!window.SV||!window.NEL||!window.ND||!NEL[id]||typeof chain!=='function'){return;}
    resetNodeZoom();if(level<=0)return;
    ZOOM.id=id;ZOOM.level=level;
    var set=chain(id);SV.classList.add('node-zoom','zoom-l'+level);
    for(var key in NEL){if(!NEL[key]||!NEL[key].g)continue;if(key===id)NEL[key].g.classList.add('zoom-main');else if(set[key])NEL[key].g.classList.add('zoom-rel');else NEL[key].g.classList.add('zoom-muted');}
    if(window.EL)for(var i=0;i<EL.length;i++)if(set[EL[i].a]&&set[EL[i].b])EL[i].g.classList.add('zoom-rel');
    var hud=byId('hud2');if(hud)hud.textContent='FOCUS · '+(ND[id].l||id)+' · '+Object.keys(set).length+' LINKED';
    if(typeof ripple==='function')ripple(id);
  }
  function installNodeWheelZoom(){
    if(!window.NEL)return;
    for(var id in NEL){
      (function(nodeId,g){if(!g||g.__wheelZoom)return;g.__wheelZoom=true;
        g.addEventListener('wheel',function(e){
          var same=ZOOM.id===nodeId,current=same?ZOOM.level:0;
          if(e.deltaY>0&&current===0)return;
          e.preventDefault();e.stopPropagation();
          var next=e.deltaY<0?Math.min(2,current+1):Math.max(0,current-1);
          applyNodeZoom(nodeId,next);
        },{passive:false});
        g.addEventListener('mouseenter',function(){var hud=byId('hud2');if(hud&&!ZOOM.level)hud.textContent='TARGET · '+(ND[nodeId].l||nodeId)+' · WHEEL ↑ FOCUS';});
      })(id,NEL[id]&&NEL[id].g);
    }
    if(window.SV){SV.addEventListener('click',function(e){if(e.target===SV)resetNodeZoom();});}
    document.addEventListener('keydown',function(e){if(e.key==='Escape')resetNodeZoom();});
  }

  function focusDomain(domain){
    var key=MAP[domain];if(!key||!window.ND||!window.NEL||!window.SV)return;
    resetNodeZoom();if(typeof clearT==='function')clearT();if(typeof cool==='function')cool();if(typeof sel!=='undefined')sel=null;if(typeof INS!=='undefined'&&INS)INS.id=null;
    var total=0,id;for(id in NEL){if(!NEL[id]||!NEL[id].g)continue;NEL[id].g.classList.remove('on','rel');if(ND[id]&&ND[id].d===key){NEL[id].g.classList.add('rel');total++;}}
    if(SIGNAL[domain]&&NEL[SIGNAL[domain]])NEL[SIGNAL[domain]].g.classList.add('on');
    if(window.EL){for(var i=0;i<EL.length;i++){var a=ND[EL[i].a],b=ND[EL[i].b];EL[i].g.classList.remove('rel','hot');if(a&&b&&a.d===key&&b.d===key)EL[i].g.classList.add('rel');}}
    SV.classList.add('fc');var hud=byId('hud2');if(hud)hud.textContent='DOMAIN · '+domain+' · '+total+' OBJECTS';if(typeof paneRender==='function')paneRender();paintBrief();declutter();
  }
  window.focusValkyrieDomain=focusDomain;

  var tabs=document.querySelectorAll('.tab');
  for(var i=0;i<tabs.length;i++)(function(el){var domain=el.getAttribute('data-t');el.setAttribute('role','tab');el.setAttribute('tabindex','0');el.addEventListener('click',function(){focusDomain(domain);});el.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();el.click();}});})(tabs[i]);

  var basePane=window.paneRender;
  if(typeof basePane==='function')window.paneRender=function(){var r=basePane.apply(this,arguments);declutter();return r;};

  installNodeWheelZoom();declutter();paintBrief();
  if(window.MutationObserver&&window.NEL&&NEL.sig_equity&&NEL.sig_equity.s){new MutationObserver(sanitizeEquitySignal).observe(NEL.sig_equity.s,{childList:true,characterData:true,subtree:true});sanitizeEquitySignal();}
  setInterval(function(){paintBrief();declutter();},30000);
  setTimeout(function(){declutter();if(!window.sel&&!window.busy)focusDomain(window.curTab||'RATES');},2450);
})();