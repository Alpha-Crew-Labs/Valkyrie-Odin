/* VALKYRIE v3 · final interaction overlay
 * 1) Node focus on hover only; wheel keeps normal page scrolling.
 * 2) Theme rotation is embedded into the Equity live-market card.
 * 3) Empty inspector becomes a transparent 1-100 tactical positioning gauge.
 * 4) Replay holds each snapshot for 10 seconds with soft transitions.
 */
(function(){
  'use strict';

  var HOVER={id:null};
  var REPLAY={running:false,timers:[],tick:null,startedAt:0};
  var syncQueued=false;

  function byId(id){return document.getElementById(id);}
  function n(v){var x=Number(v);return Number.isFinite(x)?x:null;}
  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function signedPct(v){var x=n(v);return x===null?'—':(x>0?'+':'')+x.toFixed(2)+'%';}

  /* ---------- 1. HOVER-ONLY ONTOLOGY FOCUS ---------- */
  function clearHoverFocus(){
    HOVER.id=null;
    if(!window.SV)return;
    SV.classList.remove('ux-hover-focus','node-zoom','zoom-l1','zoom-l2');
    if(window.NEL)for(var id in NEL)if(NEL[id]&&NEL[id].g)NEL[id].g.classList.remove('zoom-main','zoom-rel','zoom-muted');
    if(window.EL)for(var i=0;i<EL.length;i++)EL[i].g.classList.remove('zoom-rel');
  }
  function applyHoverFocus(id){
    if(!window.SV||!window.NEL||!window.ND||!NEL[id]||typeof chain!=='function')return;
    clearHoverFocus();
    HOVER.id=id;
    var set=chain(id);SV.classList.add('ux-hover-focus','node-zoom','zoom-l2');
    for(var key in NEL){
      if(!NEL[key]||!NEL[key].g)continue;
      if(key===id)NEL[key].g.classList.add('zoom-main');
      else if(set[key])NEL[key].g.classList.add('zoom-rel');
      else NEL[key].g.classList.add('zoom-muted');
    }
    if(window.EL)for(var i=0;i<EL.length;i++)if(set[EL[i].a]&&set[EL[i].b])EL[i].g.classList.add('zoom-rel');
    var hud=byId('hud2');if(hud)hud.textContent='FOCUS · '+(ND[id].l||id)+' · '+Object.keys(set).length+' LINKED';
    if(typeof ripple==='function')ripple(id);
  }
  function insideNode(target){
    if(!target)return null;
    var g=target.closest?target.closest('#chain .nd'):null;
    return g||null;
  }
  function installHoverOnlyFocus(){
    /* Capture wheel before the legacy target listener. We intentionally do not preventDefault,
       so wheel/trackpad returns to normal page scrolling. */
    document.addEventListener('wheel',function(e){if(insideNode(e.target))e.stopPropagation();},true);
    if(!window.NEL)return;
    for(var id in NEL){
      (function(nodeId,g){
        if(!g||g.__uxHoverFocus)return;g.__uxHoverFocus=true;
        g.addEventListener('mouseenter',function(){applyHoverFocus(nodeId);});
        g.addEventListener('mouseleave',function(){if(HOVER.id===nodeId)clearHoverFocus();});
      })(id,NEL[id]&&NEL[id].g);
    }
    if(window.SV&&!SV.__uxHoverLeave){SV.__uxHoverLeave=true;SV.addEventListener('mouseleave',clearHoverFocus);}
  }

  /* ---------- 2. EMBEDDED EQUITY THEME ROTATION ---------- */
  function themeTone(v){var x=n(v);return x===null?'':x>0?'up':x<0?'down':'';}
  function themeChip(t){return '<span class="trm-chip '+themeTone(t&&t.changeRate)+'">'+esc(t&&t.name||'DATA PENDING')+' <b>'+esc(signedPct(t&&t.changeRate))+'</b></span>';}
  function themeStock(s){return '<span class="trm-stock"><span>'+esc(s&&s.name||s&&s.code||'—')+'</span><b>'+esc(signedPct(s&&s.changeRate))+'</b></span>';}
  function themeSignature(s){
    var a=[];(s.top||[]).slice(0,3).forEach(function(x){a.push(x.no+':'+x.changeRate);});(s.bottom||[]).slice(0,2).forEach(function(x){a.push(x.no+':'+x.changeRate);});
    a.push(s.selected&&s.selected.no||'');(s.stocks||[]).slice(0,3).forEach(function(x){a.push(x.code+':'+x.changeRate);});a.push(s.stocksStatus||'');return a.join('|');
  }
  function renderThemeRotation(){
    if(typeof curTab!=='undefined'&&curTab!=='EQUITY')return;
    var host=byId('cd_live_equity');if(!host)return;
    var s=window.VALKYRIE_THEME_EQUITY;if(!s)return;
    var sig=themeSignature(s),mini=byId('themeRotationMini');
    if(mini&&mini.parentNode!==host){mini.parentNode.removeChild(mini);mini=null;}
    if(!mini){mini=document.createElement('div');mini.id='themeRotationMini';mini.className='theme-rotation-mini';var source=host.querySelector('.liveq-source');if(source)host.insertBefore(mini,source);else host.appendChild(mini);}
    if(mini.dataset.sig===sig)return;mini.dataset.sig=sig;
    var top=(s.top||[]).slice(0,3),bottom=(s.bottom||[]).slice(0,2),sel=s.selected||top[0]||null,stocks=(s.stocks||[]).slice(0,3);
    var flow=top.map(themeChip).join('')+(top.length&&bottom.length?'<i class="trm-divider"></i>':'')+bottom.map(themeChip).join('');
    var detail='';
    if(sel){
      detail='<div class="trm-focus"><div class="trm-focus-top"><span>LEAD THEME</span><b>'+esc(sel.name)+'</b><strong class="'+themeTone(sel.changeRate)+'">'+esc(signedPct(sel.changeRate))+'</strong></div>';
      detail+=stocks.length?'<div class="trm-stocks">'+stocks.map(themeStock).join('')+'</div>':'<div class="trm-pending">'+(s.stocksStatus==='loading'?'CONSTITUENTS SYNC':'CONSTITUENTS DATA PENDING')+'</div>';
      detail+='</div>';
    }
    mini.innerHTML='<div class="trm-head"><span>THEME ROTATION</span><em>'+(s.mode==='DIRECT_API'?'NAVER/NPAY · DIRECT':'SNAPSHOT / PENDING')+'</em></div><div class="trm-flow">'+(flow||'<span class="trm-pending">THEME DATA PENDING</span>')+'</div>'+detail;
  }

  /* ---------- 3. TACTICAL POSITIONING GAUGE ---------- */
  function addComponent(arr,key,score,weight,display){var x=n(score);if(x===null)return;arr.push({key:key,score:clamp(x,0,100),weight:weight,display:display});}
  function gaugeData(){
    var core=window.VALKYRIE_LIVE_CORE&&window.VALKYRIE_LIVE_CORE.data&&window.VALKYRIE_LIVE_CORE.data.ok?window.VALKYRIE_LIVE_CORE.data.metrics:null;
    var eq=window.VALKYRIE_LIVE_EQUITY&&window.VALKYRIE_LIVE_EQUITY.data&&window.VALKYRIE_LIVE_EQUITY.data.ok?window.VALKYRIE_LIVE_EQUITY.data:null;
    var theme=window.VALKYRIE_THEME_EQUITY,parts=[];
    var pulse=eq&&eq.pulse?n(eq.pulse.score):null;if(pulse===null&&core)pulse=n(core.kosdaqRiskScore);
    addComponent(parts,'MARKET',pulse,35,pulse===null?'—':Math.round(pulse)+'/100');

    var breadth=null,kd=eq&&eq.markets&&eq.markets.KOSDAQ,br=kd&&kd.breadth;
    if(br&&n(br.advanceDeclineRatio)!==null)breadth=n(br.advanceDeclineRatio)*100;else if(core)breadth=n(core.kosdaqBreadthPct);
    addComponent(parts,'BREADTH',breadth,20,breadth===null?'—':Math.round(breadth)+'%');

    var vix=core?n(core.vix):null,vixScore=vix===null?null:clamp((35-vix)/20*100,0,100);
    addComponent(parts,'VIX',vixScore,20,vix===null?'—':vix.toFixed(1));

    var hy=core?n(core.usHyOasBp):null,hyScore=hy===null?null:clamp((550-hy)/300*100,0,100);
    addComponent(parts,'HY OAS',hyScore,15,hy===null?'—':Math.round(hy)+'bp');

    var themeShare=null;
    if(theme&&Array.isArray(theme.themes)&&theme.themes.length){var valid=theme.themes.filter(function(t){return n(t.changeRate)!==null;}),pos=valid.filter(function(t){return n(t.changeRate)>0;});if(valid.length)themeShare=pos.length/valid.length*100;}
    addComponent(parts,'THEME',themeShare,10,themeShare===null?'—':Math.round(themeShare)+'%');

    var w=0,sum=0;parts.forEach(function(p){w+=p.weight;sum+=p.score*p.weight;});
    if(w<55)return {score:null,parts:parts,coverage:w};
    var score=clamp(Math.round(sum/w),1,100),stance=score>=65?'OVERWEIGHT':score<=35?'UNDERWEIGHT':'NEUTRAL';
    var msg=stance==='OVERWEIGHT'?'위험선호 우위 · 투자확대':stance==='UNDERWEIGHT'?'방어 우위 · 투자축소':'균형 구간 · 중립';
    return {score:score,parts:parts,coverage:w,stance:stance,message:msg};
  }
  function gaugeHtml(g){
    var replay=typeof si!=='undefined'&&si!==4,meta=replay?'CURRENT · LIVE':'TACTICAL · LIVE';
    if(g.score===null){return '<div class="cd vg-card"><div class="vg-head"><span>POSITIONING GAUGE</span><em>'+meta+'</em></div><div class="vg-wrap"><svg class="vg-svg" viewBox="0 0 220 132"><path class="vg-arc-base" d="M20 110 A90 90 0 0 1 200 110"/><text class="vg-score pending" x="110" y="91">DATA PENDING</text><text class="vg-label" x="110" y="108">PUBLIC INPUT REQUIRED</text></svg></div><div class="vg-note">점수는 <strong>Market · Breadth · VIX · HY · Theme</strong> 공개 입력이 충분히 모인 뒤에만 산출합니다.</div></div>';}
    var angle=-90+g.score*1.8,cls=g.stance==='OVERWEIGHT'?'ow':g.stance==='UNDERWEIGHT'?'uw':'neutral';
    var comps=g.parts.map(function(p){return '<div class="vg-comp"><span>'+esc(p.key)+'</span><b>'+esc(p.display)+'</b></div>';}).join('');
    return '<div class="cd vg-card"><div class="vg-head"><span>POSITIONING GAUGE</span><em>'+meta+'</em></div><div class="vg-wrap"><svg class="vg-svg" viewBox="0 0 220 132" role="img" aria-label="VALKYRIE tactical positioning '+g.score+' out of 100"><path class="vg-arc-base" d="M20 110 A90 90 0 0 1 200 110"/><path class="vg-arc u" pathLength="100" stroke-dasharray="35 65" d="M20 110 A90 90 0 0 1 200 110"/><path class="vg-arc n" pathLength="100" stroke-dasharray="30 70" stroke-dashoffset="-35" d="M20 110 A90 90 0 0 1 200 110"/><path class="vg-arc o" pathLength="100" stroke-dasharray="35 65" stroke-dashoffset="-65" d="M20 110 A90 90 0 0 1 200 110"/><line class="vg-needle" x1="110" y1="110" x2="110" y2="38" style="transform:rotate('+angle+'deg)"/><circle class="vg-hub" cx="110" cy="110" r="5"/><text class="vg-tick" x="15" y="124">1</text><text class="vg-tick" x="104" y="25">50</text><text class="vg-tick" x="194" y="124">100</text><text class="vg-score" x="110" y="91">'+g.score+'</text><text class="vg-label" x="110" y="107">TACTICAL SCORE</text></svg></div><div class="vg-stance"><b class="'+cls+'">'+g.stance+'</b><span>'+g.message+'</span></div><div class="vg-components">'+comps+'</div><div class="vg-note">투명 규칙: <strong>Market 35 · Breadth 20 · VIX 20 · HY 15 · Theme 10</strong>. 가용 입력만 재가중하며 65↑ 투자확대 / 36 - 64 중립 / 35↓ 투자축소.</div></div>';
  }
  function renderGauge(){
    var ins=document.querySelector('#pane .ins');if(!ins)return;
    if(typeof INS!=='undefined'&&INS&&INS.id){ins.removeAttribute('data-ux-gauge');return;}
    var g=gaugeData(),sig=(g.score===null?'P':g.score)+'|'+g.parts.map(function(p){return p.key+':'+p.display;}).join('|')+'|'+(typeof si!=='undefined'?si:'');
    if(ins.getAttribute('data-ux-gauge')===sig)return;
    ins.setAttribute('data-ux-gauge',sig);ins.innerHTML=gaugeHtml(g);
  }

  /* ---------- 4. 10-SECOND CINEMATIC REPLAY ---------- */
  function replayTimer(fn,ms){var id=setTimeout(fn,ms);REPLAY.timers.push(id);return id;}
  function clearReplayTimers(){for(var i=0;i<REPLAY.timers.length;i++)clearTimeout(REPLAY.timers[i]);REPLAY.timers=[];if(REPLAY.tick){clearInterval(REPLAY.tick);REPLAY.tick=null;}}
  function softSnap(k){
    document.body.classList.add('replay-transition');
    replayTimer(function(){
      if(typeof goSnap==='function')goSnap(k);
      if(typeof window.refreshDomainBrief==='function')window.refreshDomainBrief();
      if(typeof window.declutterValkyrie==='function')window.declutterValkyrie();
      if(typeof banner==='function')banner('REPLAY '+(k+1)+' / '+SNAP.length,SNAP[k].d+' · 10 SEC HOLD');
      replayTimer(function(){document.body.classList.remove('replay-transition');queueSync();},620);
    },260);
  }
  function finishReplay(){
    if(typeof goSnap==='function')goSnap(SNAP.length-1);
    REPLAY.running=false;clearReplayTimers();document.body.classList.remove('replay-active','replay-transition');
    if(typeof busy!=='undefined')busy=false;
    var rp=byId('rp');if(rp)rp.textContent='◀ REPLAY';
    if(typeof banner==='function')banner('REPLAY COMPLETE','LIVE RESTORED');queueSync();
  }
  function startReplay(){
    if(REPLAY.running)return;
    if(typeof busy!=='undefined'&&busy)return;
    REPLAY.running=true;if(typeof busy!=='undefined')busy=true;
    if(typeof clearT==='function')clearT();if(typeof cool==='function')cool();clearReplayTimers();
    document.body.classList.add('replay-active');
    var rp=byId('rp'),lead=700,hold=10000,total=SNAP.length;
    REPLAY.startedAt=Date.now()+lead;
    if(typeof banner==='function')banner('TEMPORAL REPLAY','5 SNAPSHOTS · 10 SEC EACH');
    for(var k=0;k<total;k++)(function(idx){replayTimer(function(){softSnap(idx);},lead+idx*hold);})(k);
    REPLAY.tick=setInterval(function(){
      if(!REPLAY.running)return;var delta=Date.now()-REPLAY.startedAt;
      if(delta<0){if(rp)rp.textContent='■ REPLAY · READY';return;}
      var step=Math.min(total-1,Math.floor(delta/hold)),within=((delta%hold)+hold)%hold,remain=Math.max(1,Math.ceil((hold-within)/1000));
      if(rp)rp.textContent='■ REPLAY '+(step+1)+'/'+total+' · '+String(remain).padStart(2,'0')+'s';
    },250);
    replayTimer(finishReplay,lead+total*hold+700);
  }
  function installReplayOverride(){
    var rp=byId('rp');if(!rp||rp.__uxReplay)return;rp.__uxReplay=true;
    rp.addEventListener('click',function(e){e.preventDefault();e.stopImmediatePropagation();startReplay();},true);
  }

  /* ---------- KEEP THE OVERLAY IN SYNC WITH RE-RENDERING MODULES ---------- */
  function syncAll(){installHoverOnlyFocus();renderGauge();renderThemeRotation();}
  function queueSync(){if(syncQueued)return;syncQueued=true;requestAnimationFrame(function(){syncQueued=false;syncAll();});}
  function wrapPaneRender(){
    var base=window.paneRender;if(typeof base!=='function'||base.__uxOverlayWrapped)return;
    var fn=function(){var r=base.apply(this,arguments);syncAll();return r;};fn.__uxOverlayWrapped=true;window.paneRender=fn;
  }
  function observePane(){var pane=byId('pane');if(!pane||!window.MutationObserver)return;new MutationObserver(queueSync).observe(pane,{childList:true,subtree:true});}

  wrapPaneRender();installReplayOverride();observePane();syncAll();
  setInterval(syncAll,2500);
})();
