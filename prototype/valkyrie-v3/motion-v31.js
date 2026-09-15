(() => {
  'use strict';

  const DATA = window.VALKYRIE_V3;
  if (!DATA) return;
  const NS = 'http://www.w3.org/2000/svg';
  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const byId = id => document.getElementById(id);
  const relById = new Map(DATA.relations.map(r => [r.id, r]));
  const objectById = new Map(DATA.objects.map(o => [o.id, o]));
  let raf = 0;
  let particles = [];
  let flowLayer = null;
  let haloLayer = null;
  let pulseLayer = null;
  let relationPeek = null;
  let ambientCanvas = null;
  let ctx = null;
  let lastFrame = 0;
  let verificationTimer = null;

  const svgEl = (tag, attrs={}) => {
    const el = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k,v]) => el.setAttribute(k,String(v)));
    return el;
  };

  function selectedId(){
    return $('#nodeLayer .node.selected')?.dataset.id || 'bok_path';
  }

  function currentScenario(){
    return $('.scenario-row.active')?.dataset.scenario || 'BASE';
  }

  function currentMode(){
    return $('.mode-btn.active')?.dataset.mode || 'LIVE';
  }

  function installSvgDefs(){
    const svg = byId('ontologySvg');
    const defs = $('defs',svg);
    if (!defs || byId('v31Glow')) return;
    defs.insertAdjacentHTML('beforeend', `
      <filter id="v31Blur" x="-80%" y="-80%" width="260%" height="260%">
        <feGaussianBlur stdDeviation="3.5"/>
      </filter>
      <filter id="v31Glow" x="-80%" y="-80%" width="260%" height="260%">
        <feGaussianBlur stdDeviation="2.2" result="b"/>
        <feColorMatrix in="b" type="matrix" values="0 0 0 0 0.21  0 0 0 0 0.84  0 0 0 0 0.91  0 0 0 .8 0" result="c"/>
        <feMerge><feMergeNode in="c"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <filter id="v31GlowAmber" x="-80%" y="-80%" width="260%" height="260%">
        <feGaussianBlur stdDeviation="2.5" result="b"/>
        <feColorMatrix in="b" type="matrix" values="0 0 0 0 1  0 0 0 0 .61  0 0 0 0 .16  0 0 0 .8 0" result="c"/>
        <feMerge><feMergeNode in="c"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <linearGradient id="v31FlowGradient" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#244d59"/><stop offset=".36" stop-color="#36d7e7"/><stop offset=".57" stop-color="#b8fbff"/><stop offset=".76" stop-color="#36d7e7"/><stop offset="1" stop-color="#244d59"/>
      </linearGradient>
      <linearGradient id="v31StressGradient" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#6a3e18"/><stop offset=".38" stop-color="#ffb54a"/><stop offset=".56" stop-color="#fff1b8"/><stop offset=".76" stop-color="#ff9b32"/><stop offset="1" stop-color="#6a3e18"/>
      </linearGradient>`);
  }

  function installHydroLayers(){
    const world = byId('world');
    const edgeLayer = byId('edgeLayer');
    const nodeLayer = byId('nodeLayer');
    if (!world || !edgeLayer || !nodeLayer || byId('v31FlowLayer')) return;

    haloLayer = svgEl('g',{id:'v31HaloLayer'});
    flowLayer = svgEl('g',{id:'v31FlowLayer'});
    pulseLayer = svgEl('g',{id:'v31PulseLayer'});
    world.insertBefore(haloLayer, edgeLayer);
    world.insertBefore(flowLayer, byId('edgeLabelLayer'));
    world.insertBefore(pulseLayer, nodeLayer);

    DATA.relations.forEach(rel => {
      const base = byId(`edge_${rel.id}`);
      if (!base) return;
      const d = base.getAttribute('d');
      const halo = svgEl('path',{id:`v31_halo_${rel.id}`,d,class:'v31-edge-halo','data-rel':rel.id});
      const core = svgEl('path',{id:`v31_core_${rel.id}`,d,class:'v31-edge-core','data-rel':rel.id});
      haloLayer.appendChild(halo);
      flowLayer.appendChild(core);
    });
    syncEdgeStates();
  }

  function syncEdgeStates(){
    DATA.relations.forEach(rel => {
      const base=byId(`edge_${rel.id}`), halo=byId(`v31_halo_${rel.id}`), core=byId(`v31_core_${rel.id}`);
      if(!base||!halo||!core)return;
      const hidden = base.style.display === 'none';
      halo.style.display = core.style.display = hidden ? 'none' : '';
      const hot = base.classList.contains('active');
      const stress = base.classList.contains('stress');
      const dim = base.classList.contains('dim');
      halo.classList.toggle('hot',hot); core.classList.toggle('hot',hot);
      halo.classList.toggle('stress',stress); core.classList.toggle('stress',stress);
      core.classList.toggle('temporal',currentMode()==='TEMPORAL' && hot);
      if(dim){halo.style.opacity='.015';core.style.opacity='.02'}else{halo.style.opacity='';core.style.opacity=''}
    });
    document.body.classList.toggle('v31-stress',currentMode()==='STRESS');
    document.body.classList.toggle('v31-trace',currentMode()==='TRACE');
    document.body.classList.toggle('v31-temporal',currentMode()==='TEMPORAL');
  }

  function installAcquisition(node){
    $$('.v31-corner,.v31-acquire-ring').forEach(x=>x.remove());
    if(!node)return;
    const corners=[
      'M -5 10 L -5 -5 L 10 -5',
      'M 134 -5 L 149 -5 L 149 10',
      'M -5 48 L -5 63 L 10 63',
      'M 134 63 L 149 63 L 149 48'
    ];
    corners.forEach(d=>node.appendChild(svgEl('path',{d,class:'v31-corner'})));
    node.appendChild(svgEl('rect',{x:-8,y:-8,width:160,height:74,rx:5,class:'v31-acquire-ring'}));
    const dossier=$('.dossier');
    dossier?.classList.remove('v31-focus');
    requestAnimationFrame(()=>dossier?.classList.add('v31-focus'));
  }

  function installAmbient(){
    const viewport=byId('graphViewport');
    if(!viewport||byId('ambientCanvas'))return;
    ambientCanvas=document.createElement('canvas');ambientCanvas.id='ambientCanvas';
    viewport.insertBefore(ambientCanvas,viewport.firstChild);
    ctx=ambientCanvas.getContext('2d',{alpha:true});
    resizeAmbient();
    resetParticles();
    window.addEventListener('resize',resizeAmbient,{passive:true});
    document.addEventListener('visibilitychange',()=>{if(document.hidden) cancelAnimationFrame(raf); else animateAmbient(performance.now())});
    animateAmbient(performance.now());
  }

  function resizeAmbient(){
    if(!ambientCanvas||!ctx)return;
    const r=ambientCanvas.getBoundingClientRect(); const d=Math.min(window.devicePixelRatio||1,1.5);
    ambientCanvas.width=Math.max(1,Math.floor(r.width*d));ambientCanvas.height=Math.max(1,Math.floor(r.height*d));
    ctx.setTransform(d,0,0,d,0,0);ambientCanvas.dataset.w=r.width;ambientCanvas.dataset.h=r.height;
  }

  function resetParticles(){
    const w=Number(ambientCanvas?.dataset.w)||800,h=Number(ambientCanvas?.dataset.h)||600;
    const count=Math.max(28,Math.min(58,Math.round(w*h/18000)));
    particles=Array.from({length:count},()=>({x:Math.random()*w,y:Math.random()*h,vx:(Math.random()-.5)*.055,vy:.018+Math.random()*.055,a:.06+Math.random()*.16,r:.35+Math.random()*.7,t:Math.random()*Math.PI*2}));
  }

  function animateAmbient(now){
    if(document.hidden||!ctx||!ambientCanvas)return;
    const dt=Math.min(34,Math.max(8,now-lastFrame||16));lastFrame=now;
    const w=Number(ambientCanvas.dataset.w)||800,h=Number(ambientCanvas.dataset.h)||600;
    ctx.clearRect(0,0,w,h);
    ctx.save();
    particles.forEach(p=>{
      p.x+=p.vx*dt;p.y+=p.vy*dt;p.t+=dt*.0007;
      if(p.y>h+5){p.y=-5;p.x=Math.random()*w}if(p.x<-5)p.x=w+5;if(p.x>w+5)p.x=-5;
      const alpha=p.a*(.55+.45*Math.sin(p.t));
      ctx.beginPath();ctx.fillStyle=`rgba(75,194,211,${alpha})`;ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();
    });
    ctx.restore();
    raf=requestAnimationFrame(animateAmbient);
  }

  function addTelemetry(){
    const viewport=byId('graphViewport');if(!viewport)return;
    relationPeek=document.createElement('div');relationPeek.className='v31-relation-peek';viewport.appendChild(relationPeek);
    const tele=document.createElement('div');tele.className='v31-telemetry';tele.innerHTML='<span class="v31-heartbeat"></span><b id="v31TelemetryText">OBJECT NETWORK ACTIVE</b><span id="v31ObjectPulse">VERIFYING 23 OBJECTS</span>';viewport.appendChild(tele);
  }

  function installPointerField(){
    document.addEventListener('pointermove',e=>{
      document.documentElement.style.setProperty('--cursor-x',`${(e.clientX/innerWidth*100).toFixed(1)}%`);
      document.documentElement.style.setProperty('--cursor-y',`${(e.clientY/innerHeight*100).toFixed(1)}%`);
    },{passive:true});
    const viewport=byId('graphViewport');
    viewport?.addEventListener('pointermove',e=>{
      const r=viewport.getBoundingClientRect();
      viewport.style.setProperty('--gx',`${((e.clientX-r.left)/r.width*100).toFixed(1)}%`);
      viewport.style.setProperty('--gy',`${((e.clientY-r.top)/r.height*100).toFixed(1)}%`);
      const edge=e.target.closest?.('.edge');
      if(edge && relationPeek){
        const id=edge.dataset.id, rel=relById.get(id); if(!rel)return;
        const a=objectById.get(rel.from),b=objectById.get(rel.to);
        relationPeek.innerHTML=`<b>${a?.short||rel.from} → ${b?.short||rel.to}</b><em>${rel.type}</em> · ${rel.sign||'DIRECT'}<br>RELATION ${id.toUpperCase()}`;
        relationPeek.style.left=`${Math.min(r.width-180,e.clientX-r.left+14)}px`;relationPeek.style.top=`${Math.min(r.height-64,e.clientY-r.top+14)}px`;relationPeek.classList.add('show');
      }else relationPeek?.classList.remove('show');
    },{passive:true});
    viewport?.addEventListener('pointerleave',()=>relationPeek?.classList.remove('show'));
  }

  function pulseNode(id,kind='arrival',delay=0){
    setTimeout(()=>{
      const n=byId(`node_${id}`);if(!n||n.classList.contains('hidden'))return;
      const cls=kind==='shock'?'v31-shock':'v31-arrival';n.classList.remove(cls);void n.getBBox();n.classList.add(cls);setTimeout(()=>n.classList.remove(cls),900);
    },delay);
  }

  function animateRelation(id,{delay=0,stress=false}={}){
    setTimeout(()=>{
      const base=byId(`edge_${id}`);if(!base||base.style.display==='none'||!pulseLayer)return;
      const c=svgEl('path',{d:base.getAttribute('d'),class:`v31-comet${stress?' stress-run':''}`});pulseLayer.appendChild(c);
      requestAnimationFrame(()=>c.classList.add('run'));
      setTimeout(()=>c.remove(),950);
      const rel=relById.get(id);if(rel)pulseNode(rel.to,stress?'shock':'arrival',280);
    },delay);
  }

  function traversal(root,direction='DOWNSTREAM',limit=10){
    const seen=new Set([root]);const result=[];let frontier=[root];let depth=0;
    while(frontier.length&&result.length<limit&&depth<5){
      const next=[];
      frontier.forEach(cur=>{
        DATA.relations.filter(r=>direction==='UPSTREAM'?r.to===cur:r.from===cur).forEach(r=>{
          const target=direction==='UPSTREAM'?r.from:r.to;
          if(!seen.has(target)&&result.length<limit){seen.add(target);next.push(target);result.push({rel:r,depth,target});}
        });
      });frontier=next;depth++;
    }
    return result;
  }

  function runFocusPropagation(id){
    pulseNode(id,'arrival');
    traversal(id,'DOWNSTREAM',7).forEach((x,i)=>animateRelation(x.rel.id,{delay:90+i*105}));
  }

  function runTracePropagation(){
    const id=selectedId();
    const direction=$('#traceControls [data-trace].active')?.dataset.trace || 'DOWNSTREAM';
    if(direction==='ONE_HOP'){
      DATA.relations.filter(r=>r.from===id||r.to===id).slice(0,10).forEach((r,i)=>animateRelation(r.id,{delay:i*85}));
    } else traversal(id,direction,11).forEach((x,i)=>{
      // For upstream visually traverse the same edge geometry; destination pulse is handled on relation.to, so also pulse source.
      animateRelation(x.rel.id,{delay:i*95});
      if(direction==='UPSTREAM') pulseNode(x.rel.from,'arrival',i*95+250);
    });
  }

  function runScenarioPropagation(name){
    const scenario=DATA.scenarios[name];if(!scenario||name==='BASE')return;
    const changed=new Set(scenario.changed||[]);
    const relevant=DATA.relations.filter(r=>changed.has(r.from)&&changed.has(r.to));
    const indegree=new Map([...changed].map(id=>[id,0]));relevant.forEach(r=>indegree.set(r.to,(indegree.get(r.to)||0)+1));
    let roots=[...changed].filter(id=>(indegree.get(id)||0)===0);if(!roots.length)roots=[...changed].slice(0,2);
    const depth=new Map(roots.map(id=>[id,0]));let frontier=[...roots];
    for(let d=0;d<6&&frontier.length;d++){
      const next=[];frontier.forEach(id=>relevant.filter(r=>r.from===id).forEach(r=>{if(!depth.has(r.to)){depth.set(r.to,d+1);next.push(r.to)}}));frontier=next;
    }
    [...changed].forEach(id=>pulseNode(id,'shock',(depth.get(id)||0)*170));
    relevant.forEach((r,i)=>animateRelation(r.id,{delay:(depth.get(r.from)||0)*170+i*16,stress:true}));
  }

  function runTemporalPropagation(index){
    const snap=DATA.snapshots[index];if(!snap)return;
    const changed=Object.keys(snap.values||{});
    changed.slice(0,15).forEach((id,i)=>pulseNode(id,'arrival',i*48));
    DATA.relations.filter(r=>changed.includes(r.from)&&changed.includes(r.to)).slice(0,14).forEach((r,i)=>animateRelation(r.id,{delay:100+i*55}));
  }

  function flashButton(el,cls='v31-fired'){if(!el)return;el.classList.remove(cls);void el.offsetWidth;el.classList.add(cls);setTimeout(()=>el.classList.remove(cls),900)}

  function wireSemanticMotion(){
    byId('nodeLayer')?.addEventListener('click',e=>{
      const node=e.target.closest('.node');if(!node)return;
      setTimeout(()=>{installAcquisition(byId(`node_${selectedId()}`));syncEdgeStates();runFocusPropagation(selectedId())},25);
    });

    $$('.scenario-row').forEach(btn=>btn.addEventListener('click',()=>setTimeout(()=>{flashButton(btn);syncEdgeStates();runScenarioPropagation(btn.dataset.scenario)},35)));
    $$('.mode-btn').forEach(btn=>btn.addEventListener('click',()=>setTimeout(()=>{flashButton(btn);syncEdgeStates();if(btn.dataset.mode==='TRACE')runTracePropagation()},35)));
    byId('traceControls')?.addEventListener('click',e=>{if(e.target.matches('[data-trace]'))setTimeout(()=>{syncEdgeStates();runTracePropagation()},35)});
    $('.dossier-actions')?.addEventListener('click',e=>{
      const b=e.target.closest('[data-action]');if(!b)return;
      setTimeout(()=>{
        syncEdgeStates();
        if(b.dataset.action==='TRACE')runTracePropagation();
        if(b.dataset.action==='STRESS')runFocusPropagation(selectedId());
        if(b.dataset.action==='REPLAY')$$('.time-point').forEach((p,i)=>setTimeout(()=>runTemporalPropagation(i),i*850));
      },45);
    });
    byId('timeline')?.addEventListener('click',e=>{
      const p=e.target.closest('.time-point');if(!p)return;const arr=$$('.time-point');const idx=arr.indexOf(p);
      setTimeout(()=>{syncEdgeStates();runTemporalPropagation(idx)},40);
    });
    byId('commandModal')?.addEventListener('click',()=>setTimeout(syncEdgeStates,120));
    byId('commandInput')?.addEventListener('keydown',e=>{if(e.key==='Enter')setTimeout(()=>{syncEdgeStates();runScenarioPropagation(currentScenario())},120)});
  }

  function observeAppState(){
    const edgeLayer=byId('edgeLayer');
    if(edgeLayer)new MutationObserver(()=>syncEdgeStates()).observe(edgeLayer,{subtree:true,attributes:true,attributeFilter:['class','style']});
    const nodeLayer=byId('nodeLayer');
    if(nodeLayer)new MutationObserver(()=>{const n=$('#nodeLayer .node.selected');if(n)installAcquisition(n)}).observe(nodeLayer,{subtree:true,attributes:true,attributeFilter:['class']});
  }

  function startVerificationHeartbeat(){
    const health=byId('healthText');const tele=byId('v31TelemetryText');const pulse=byId('v31ObjectPulse');
    const phrases=['ONTOLOGY SYNCED','RELATIONS VERIFIED','EVIDENCE BUS ACTIVE','DECISION GRAPH READY'];let i=0;
    verificationTimer=setInterval(()=>{
      i=(i+1)%phrases.length;if(health)health.textContent=phrases[i];if(tele)tele.textContent=phrases[i];
      const visible=$$('#nodeLayer .node:not(.hidden):not(.dim)');if(visible.length){const n=visible[Math.floor(Math.random()*visible.length)];pulseNode(n.dataset.id,'arrival');if(pulse)pulse.textContent=`VERIFY · ${objectById.get(n.dataset.id)?.short||n.dataset.id}`;}
    },6200);
  }

  function boot(){
    installSvgDefs();installHydroLayers();installAmbient();addTelemetry();installPointerField();wireSemanticMotion();observeAppState();startVerificationHeartbeat();
    installAcquisition($('#nodeLayer .node.selected'));
    setTimeout(()=>{syncEdgeStates();runFocusPropagation(selectedId())},650);
    console.info('[VALKYRIE v3.1] Semantic Hydro Motion online');
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0),{once:true});else setTimeout(boot,0);
})();
