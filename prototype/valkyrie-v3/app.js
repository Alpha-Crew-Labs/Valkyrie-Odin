(() => {
  'use strict';

  const DATA = window.VALKYRIE_V3;
  if (!DATA) throw new Error('VALKYRIE_V3 ontology data not loaded');

  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const byId = id => document.getElementById(id);
  const objMap = new Map(DATA.objects.map(o => [o.id, o]));
  const relMap = new Map(DATA.relations.map(r => [r.id, r]));
  const activeLayers = new Set(['MACRO','RATES','CREDIT','EQUITY','IPO_CB','DECISIONS']);

  const state = {
    selectedId: 'bok_path',
    scenario: 'BASE',
    snapshotIndex: DATA.snapshots.length - 1,
    mode: 'LIVE',
    traceMode: 'DOWNSTREAM',
    zoom: 1,
    panX: 0,
    panY: 0,
    replaying: false,
    dragging: false,
    dragStart: null
  };

  const nodeLayer = byId('nodeLayer');
  const edgeLayer = byId('edgeLayer');
  const edgeLabelLayer = byId('edgeLabelLayer');
  const world = byId('world');
  const svg = byId('ontologySvg');
  const viewport = byId('graphViewport');
  const NS = 'http://www.w3.org/2000/svg';

  function svgEl(tag, attrs={}) {
    const el = document.createElementNS(NS, tag);
    for (const [k,v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    return el;
  }

  function currentSnapshot() { return DATA.snapshots[state.snapshotIndex]; }

  function currentObject(id) {
    const base = objMap.get(id);
    if (!base) return null;
    const snapPatch = currentSnapshot()?.values?.[id] || {};
    const scenarioPatch = DATA.scenarios[state.scenario]?.patch?.[id] || {};
    return {...base, ...snapPatch, ...scenarioPatch};
  }

  function objectVisible(o) {
    if (o.layer === 'CROSS') return activeLayers.has('RATES') && (activeLayers.has('EQUITY') || activeLayers.has('IPO_CB'));
    return activeLayers.has(o.layer);
  }

  function nodeCenter(o) { return {x:o.x + 72, y:o.y + 29}; }

  function relationPath(rel) {
    const a = nodeCenter(objMap.get(rel.from));
    const b = nodeCenter(objMap.get(rel.to));
    const dx = Math.max(55, Math.abs(b.x-a.x)*.47);
    const c1x = a.x + (b.x>=a.x ? dx : -dx);
    const c2x = b.x - (b.x>=a.x ? dx : -dx);
    return `M ${a.x} ${a.y} C ${c1x} ${a.y}, ${c2x} ${b.y}, ${b.x} ${b.y}`;
  }

  function buildGraph() {
    edgeLayer.innerHTML = '';
    edgeLabelLayer.innerHTML = '';
    nodeLayer.innerHTML = '';

    for (const rel of DATA.relations) {
      const p = svgEl('path', {id:`edge_${rel.id}`, d:relationPath(rel), class:`edge flow ${rel.sign==='NEG'?'negative':''}`, 'data-id':rel.id});
      edgeLayer.appendChild(p);
      const a = nodeCenter(objMap.get(rel.from)), b = nodeCenter(objMap.get(rel.to));
      const label = svgEl('text', {id:`label_${rel.id}`, x:(a.x+b.x)/2, y:(a.y+b.y)/2-4, class:'edge-label', 'text-anchor':'middle'});
      label.textContent = rel.type;
      edgeLabelLayer.appendChild(label);
    }

    for (const o of DATA.objects) {
      const g = svgEl('g', {id:`node_${o.id}`, class:`node owner-${o.ownerClass} type-${o.type}`, transform:`translate(${o.x} ${o.y})`, 'data-id':o.id, tabindex:'0', role:'button'});
      const rect = svgEl('rect',{class:'node-box',x:0,y:0,width:144,height:58});
      const accent = svgEl('rect',{class:'accent',x:0,y:0,width:3,height:58});
      const type = svgEl('text',{class:'node-type',x:10,y:12}); type.textContent=o.type;
      const name = svgEl('text',{class:'node-name',x:10,y:27}); name.textContent=o.short;
      const val = svgEl('text',{class:'node-value',x:10,y:44,'data-value':'1'}); val.textContent=o.value;
      const delta = svgEl('text',{class:'node-delta',x:92,y:44,'text-anchor':'end','data-delta':'1'}); delta.textContent=o.delta;
      const st = svgEl('text',{class:'node-state',x:135,y:12,'text-anchor':'end','data-state':'1'}); st.textContent=o.state;
      g.append(rect,accent,type,name,val,delta,st);
      nodeLayer.appendChild(g);
    }

    updateLayerCounts();
    render();
  }

  function updateLayerCounts() {
    const counts = {MACRO:0,RATES:0,CREDIT:0,EQUITY:0,IPO_CB:0,DECISIONS:0};
    DATA.objects.forEach(o => { if (counts[o.layer] !== undefined) counts[o.layer]++; });
    byId('countMacro').textContent=counts.MACRO;
    byId('countRates').textContent=counts.RATES;
    byId('countCredit').textContent=counts.CREDIT;
    byId('countEquity').textContent=counts.EQUITY;
    byId('countIpo').textContent=counts.IPO_CB;
    byId('countDecisions').textContent=counts.DECISIONS;
  }

  function incoming(id) { return DATA.relations.filter(r=>r.to===id); }
  function outgoing(id) { return DATA.relations.filter(r=>r.from===id); }

  function oneHop(id) {
    const ids = new Set([id]);
    [...incoming(id),...outgoing(id)].forEach(r=>{ids.add(r.from);ids.add(r.to);});
    return ids;
  }

  function traceSet(id, direction, maxDepth=5) {
    if (direction === 'ONE_HOP') return oneHop(id);
    const seen = new Set([id]);
    let frontier = [id];
    for (let depth=0; depth<maxDepth && frontier.length; depth++) {
      const next=[];
      for (const cur of frontier) {
        const rels = direction==='UPSTREAM' ? incoming(cur) : outgoing(cur);
        for (const r of rels) {
          const n = direction==='UPSTREAM' ? r.from : r.to;
          if (!seen.has(n)) { seen.add(n); next.push(n); }
        }
      }
      frontier=next;
    }
    return seen;
  }

  function activeTraceSet() {
    if (state.mode !== 'TRACE') return null;
    return traceSet(state.selectedId,state.traceMode);
  }

  function render() {
    const snap = currentSnapshot();
    const scenario = DATA.scenarios[state.scenario];
    const trace = activeTraceSet();
    const context = oneHop(state.selectedId);
    const temporalChanged = new Set(Object.keys(snap?.values || {}));
    const stressChanged = new Set(scenario?.changed || []);

    for (const base of DATA.objects) {
      const cur = currentObject(base.id);
      const el = byId(`node_${base.id}`);
      if (!el) continue;
      el.classList.toggle('hidden',!objectVisible(base));
      el.classList.toggle('selected',base.id===state.selectedId);
      const shouldDim = state.mode==='TRACE' ? !trace.has(base.id) : false;
      el.classList.toggle('dim',shouldDim);
      el.classList.toggle('changed',state.mode==='STRESS' ? stressChanged.has(base.id) : (state.mode==='TEMPORAL' && temporalChanged.has(base.id)));
      $('[data-value]',el).textContent=cur.value;
      $('[data-delta]',el).textContent=cur.delta;
      $('[data-state]',el).textContent=cur.state;
    }

    for (const rel of DATA.relations) {
      const el=byId(`edge_${rel.id}`), lab=byId(`label_${rel.id}`);
      const from=objMap.get(rel.from),to=objMap.get(rel.to);
      const visible=objectVisible(from)&&objectVisible(to);
      const inTrace = trace ? trace.has(rel.from)&&trace.has(rel.to) : false;
      const inContext = context.has(rel.from)&&context.has(rel.to)&&(rel.from===state.selectedId||rel.to===state.selectedId);
      const inStress = state.mode==='STRESS' && (stressChanged.has(rel.from)||stressChanged.has(rel.to));
      const inTemporal = state.mode==='TEMPORAL' && (temporalChanged.has(rel.from)||temporalChanged.has(rel.to));
      const active = visible && (inTrace || inContext || inStress || inTemporal);
      el.style.display=visible?'':'none'; lab.style.display=visible?'':'none';
      el.classList.toggle('active',active&&!inStress); el.classList.toggle('stress',inStress);
      el.classList.toggle('dim',visible && state.mode==='TRACE' && !inTrace);
      lab.classList.toggle('active',active); lab.classList.toggle('dim',visible && state.mode==='TRACE' && !inTrace);
    }

    renderDossier();
    renderTopState();
    renderTraceControls();
    updateTransform();
  }

  function renderDossier() {
    const o=currentObject(state.selectedId);
    if(!o)return;
    byId('dossierId').textContent=o.id.toUpperCase();
    byId('dossierType').textContent=o.type;
    byId('dossierOwner').textContent=o.owner;
    byId('dossierName').textContent=o.name;
    byId('dossierValue').textContent=o.value;
    byId('dossierDelta').textContent=o.delta;
    byId('dossierState').textContent=o.state;
    byId('evidenceCount').textContent=String(o.evidence?.length||0).padStart(2,'0');
    byId('modelConfidence').textContent=`${o.confidence}%`;
    byId('provOwner').textContent=o.owner;
    byId('provModel').textContent=o.model;
    byId('provVintage').textContent=o.vintage;

    const ev=byId('evidenceList'); ev.innerHTML='';
    (o.evidence||[]).forEach(([n,text,rank])=>{
      const row=document.createElement('div'); row.className='evidence-item';
      row.innerHTML=`<i>${n}</i><span>${escapeHtml(text)}</span><small class="${rank.toLowerCase()}">${rank}</small>`;
      ev.appendChild(row);
    });

    const inc=incoming(o.id),out=outgoing(o.id);
    byId('relationSummary').textContent=`↑${inc.length} · ↓${out.length}`;
    const list=byId('relationList');list.innerHTML='';
    [...inc.map(r=>({r,dir:'↑',other:r.from})),...out.map(r=>({r,dir:'↓',other:r.to}))].slice(0,7).forEach(x=>{
      const other=objMap.get(x.other);const row=document.createElement('div');row.className='relation-item';row.dataset.object=x.other;
      row.innerHTML=`<span>${x.dir}</span><span>${escapeHtml(other.short)}</span><b>${x.r.type}</b>`;list.appendChild(row);
    });
  }

  function renderTopState() {
    const snap=currentSnapshot(),sc=DATA.scenarios[state.scenario];
    const risk=state.scenario==='BASE' ? snap.risk : sc.risk;
    byId('riskBadge').textContent=risk;
    byId('riskBadge').style.color=risk==='HIGH'?'var(--red)':risk==='NORMAL'?'var(--green)':'var(--amber)';
    byId('scenarioLabel').textContent=state.scenario;
    byId('snapshotLabel').textContent=state.snapshotIndex===DATA.snapshots.length-1?'LIVE':snap.date;
    const t=new Date(); byId('asOf').textContent=`${snap.date} ${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`;
    byId('graphTitle').textContent=state.mode==='TRACE'?'RELATION TRACE':state.mode==='STRESS'?'SCENARIO PROPAGATION':state.mode==='TEMPORAL'?'TEMPORAL MARKET STATE':'CROSS-ASSET DECISION GRAPH';
    $$('.mode-btn').forEach(b=>b.classList.toggle('active',b.dataset.mode===state.mode));
    $$('.scenario-row').forEach(b=>b.classList.toggle('active',b.dataset.scenario===state.scenario));
    $$('.time-point').forEach((b,i)=>b.classList.toggle('active',i===state.snapshotIndex));
  }

  function renderTraceControls(){
    const wrap=byId('traceControls');wrap.hidden=state.mode!=='TRACE';
    $$('[data-trace]',wrap).forEach(b=>b.classList.toggle('active',b.dataset.trace===state.traceMode));
  }

  function selectObject(id,{center=false,quiet=false}={}) {
    if(!objMap.has(id))return;
    state.selectedId=id;
    if(center) centerOnObject(id);
    if(!quiet) addActivity(`OBJECT ACQUIRED · ${objMap.get(id).short}`);
    render();
  }

  function setMode(mode) {
    state.mode=mode;
    if(mode==='LIVE'){state.scenario='BASE';state.snapshotIndex=DATA.snapshots.length-1;}
    if(mode==='TRACE') showBanner(`TRACE MODE · ${objMap.get(state.selectedId).short}`);
    if(mode==='STRESS'&&state.scenario==='BASE') showBanner('STRESS MODE · SELECT A SCENARIO');
    if(mode==='TEMPORAL') showBanner(`TEMPORAL STATE · ${currentSnapshot().date}`);
    addActivity(`VIEW MODE · ${mode}`);render();
  }

  function setScenario(name) {
    if(!DATA.scenarios[name])return;
    state.scenario=name;state.snapshotIndex=DATA.snapshots.length-1;state.mode=name==='BASE'?'LIVE':'STRESS';
    const count=DATA.scenarios[name].changed.length;
    showBanner(name==='BASE'?'LIVE MARKET STATE':`${name} SCENARIO · ${count} OBJECTS PROPAGATED`);
    addActivity(name==='BASE'?'SCENARIO BASE RESTORED':`SCENARIO ${name} · ${count} OBJECTS RECALCULATED`);
    render();
  }

  function setSnapshot(index,{quiet=false}={}) {
    state.snapshotIndex=Math.max(0,Math.min(DATA.snapshots.length-1,index));state.scenario='BASE';
    state.mode=state.snapshotIndex===DATA.snapshots.length-1?'LIVE':'TEMPORAL';
    if(!quiet){showBanner(`TEMPORAL REWIND · ${currentSnapshot().date}`);addActivity(`ONTOLOGY RESTORED · ${currentSnapshot().date}`);}
    render();
  }

  function renderTimeline(){
    const tl=byId('timeline');tl.innerHTML='';
    DATA.snapshots.forEach((s,i)=>{const b=document.createElement('button');b.className='time-point'+(i===DATA.snapshots.length-1?' live':'');b.textContent=s.label;b.title=s.note;b.addEventListener('click',()=>setSnapshot(i));tl.appendChild(b);});
  }

  function replayTimeline(){
    if(state.replaying)return;state.replaying=true;addActivity('REPLAY ENGINE · START');let i=0;
    const step=()=>{setSnapshot(i,{quiet:true});showBanner(`REPLAY · ${DATA.snapshots[i].date} · ${DATA.snapshots[i].note}`);i++;if(i<DATA.snapshots.length)setTimeout(step,850);else{state.replaying=false;setTimeout(()=>{showBanner('TIMELINE RESTORED · LIVE');addActivity('REPLAY ENGINE · COMPLETE');},650);}};step();
  }

  function showBanner(text,ms=1350){const b=byId('graphBanner');b.textContent=text;b.hidden=false;clearTimeout(showBanner.t);showBanner.t=setTimeout(()=>b.hidden=true,ms);}

  function addActivity(text){
    const feed=byId('activityFeed');const row=document.createElement('div');row.className='activity-line';const t=new Date();const ts=`${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}:${String(t.getSeconds()).padStart(2,'0')}`;row.innerHTML=`<time>${ts}</time><b>${escapeHtml(text)}</b>`;feed.prepend(row);while(feed.children.length>3)feed.lastChild.remove();
  }

  function seedActivity(){['ONTOLOGY SYNCED · 23 OBJECTS / 29 RELATIONS','CPI FORECAST ENGINE · MODEL READY','DECISION GRAPH · CROSS-ASSET LINKS VERIFIED'].reverse().forEach(addActivity);}

  function updateTransform(){world.setAttribute('transform',`translate(${state.panX} ${state.panY}) scale(${state.zoom})`);byId('zoomLabel').textContent=`${Math.round(state.zoom*100)}%`;}
  function resetView(){state.zoom=1;state.panX=0;state.panY=0;updateTransform();}
  function centerOnObject(id){const o=objMap.get(id);if(!o)return;state.panX=600-(o.x+72)*state.zoom;state.panY=360-(o.y+29)*state.zoom;updateTransform();}
  function setZoom(next){state.zoom=Math.max(.62,Math.min(1.75,next));updateTransform();}

  function openWorkspace(){
    const o=objMap.get(state.selectedId);const key=o.ownerClass==='macro'?'MACRO':o.ownerClass==='rates'?'RATES':'EQUITY';const w=DATA.workspaces[key];
    byId('drawerTitle').textContent=w.title;
    const cards=w.cards.map(c=>`<article class="workspace-card"><h3>${escapeHtml(c[0])}</h3><div class="metric mono">${escapeHtml(c[1])}</div><p>${escapeHtml(c[2])}</p></article>`).join('');
    const rows=w.table.map((r,i)=>`<tr>${r.map(x=>i===0?`<th>${escapeHtml(x)}</th>`:`<td>${escapeHtml(x)}</td>`).join('')}</tr>`).join('');
    byId('drawerBody').innerHTML=`<div class="workspace-grid">${cards}</div><div class="workspace-card" style="margin-top:9px;min-height:0"><table class="mini-table">${rows}</table></div>`;
    const d=byId('workspaceDrawer');d.classList.add('open');d.setAttribute('aria-hidden','false');addActivity(`WORKSPACE OPENED · ${key}`);
  }
  function closeWorkspace(){const d=byId('workspaceDrawer');d.classList.remove('open');d.setAttribute('aria-hidden','true');}

  function compareSelected(){
    const card=byId('compareCard');const idx=Math.max(0,state.snapshotIndex-1);const prev=DATA.snapshots[idx];const base=objMap.get(state.selectedId);const prevObj={...base,...(prev.values?.[base.id]||{})};const cur=currentObject(base.id);
    card.innerHTML=`<div class="eyebrow" style="margin-bottom:5px">TEMPORAL COMPARE</div><div class="compare-row"><span>${prev.date}</span><b>${escapeHtml(prevObj.value)}</b></div><div class="compare-row"><span>${currentSnapshot().date}</span><b>${escapeHtml(cur.value)}</b></div><div class="compare-row"><span>STATE</span><b>${escapeHtml(prevObj.state)} → ${escapeHtml(cur.state)}</b></div>`;card.hidden=!card.hidden;addActivity(`COMPARE · ${base.short}`);
  }

  function handleAction(action){
    if(action==='TRACE'){state.mode='TRACE';state.traceMode='DOWNSTREAM';showBanner(`TRACE DOWNSTREAM · ${objMap.get(state.selectedId).short}`);addActivity(`TRACE START · ${objMap.get(state.selectedId).short}`);render();}
    else if(action==='STRESS'){setScenario(state.scenario==='HAWKISH'?'RISK_OFF':'HAWKISH');}
    else if(action==='COMPARE')compareSelected();
    else if(action==='REPLAY')replayTimeline();
    else if(action==='ASK')openCommand();
    else if(action==='WORKSPACE')openWorkspace();
  }

  function openCommand(prefill=''){const m=byId('commandModal');m.hidden=false;const input=byId('commandInput');input.value=prefill;setTimeout(()=>input.focus(),20);}
  function closeCommand(){byId('commandModal').hidden=true;}

  function operatorSteps(lines){byId('operatorOutput').innerHTML=lines.map((x,i)=>`<div class="operator-step"><span>${String(i+1).padStart(2,'0')}</span><b>${escapeHtml(x[0])}</b><span class="ok">${escapeHtml(x[1]||'✓')}</span></div>`).join('');}

  function runCommand(q){
    const text=q.trim();if(!text)return;const upper=text.toUpperCase();
    if(/IPO|청약/.test(upper)&&/물가|CPI/.test(upper)){
      operatorSteps([['RESOLVE OBJECTS','KR_CPI · CPI_FORECAST · BOK_PATH · IPO_SIGNAL'],['APPLY SCENARIO','HAWKISH'],['TRACE RELATIONS','11 OBJECTS'],['RESOLVE DECISION','IPO SELECTIVE / PAUSE']]);
      selectObject('kr_cpi',{center:true,quiet:true});setScenario('HAWKISH');state.mode='TRACE';state.traceMode='DOWNSTREAM';render();showBanner('GRAPH OPERATOR · CPI SHOCK → IPO');
    } else if(/장기채|듀레이션|DURATION|채권/.test(upper)){
      operatorSteps([['RESOLVE SIGNAL','SHORT_DURATION'],['TRACE UPSTREAM','BOK_PATH · CURVE · CREDIT'],['OPEN EVIDENCE','3 SOURCES'],['DECISION','LONG ↓ / SHORT ↑']]);
      selectObject('rates_signal',{center:true,quiet:true});state.mode='TRACE';state.traceMode='UPSTREAM';render();showBanner('WHY SHORT DURATION? · TRACE RESOLVED');
    } else if(/CB|리픽싱|REFIX/.test(upper)){
      operatorSteps([['RESOLVE OBJECT','CB_REFIX'],['TRACE UPSTREAM','CREDIT · FUNDING_QUALITY'],['OPEN MODEL','CB ZERO FINDER'],['STATE','CAUTION']]);
      selectObject('cb_refix',{center:true,quiet:true});state.mode='TRACE';state.traceMode='UPSTREAM';render();showBanner('CB RISK TRACE · RESOLVED');
    } else {
      const found=DATA.objects.find(o=>upper.includes(o.name.toUpperCase())||upper.includes(o.short.toUpperCase()));
      if(found){operatorSteps([['OBJECT FOUND',found.id.toUpperCase()],['FOCUS','CENTER'],['RELATIONS',`${incoming(found.id).length+outgoing(found.id).length} LINKS`]]);selectObject(found.id,{center:true});}
      else operatorSteps([['QUERY RECEIVED','NO DETERMINISTIC TOOL MATCH'],['NEXT LAYER','LLM TOOL-CALLING REQUIRED']]);
    }
    addActivity(`GRAPH OPERATOR · ${text.slice(0,42)}`);
  }

  function setupSearch(){
    const input=byId('objectSearch'),results=byId('searchResults');
    input.addEventListener('input',()=>{const q=input.value.trim().toLowerCase();if(!q){results.hidden=true;return;}const found=DATA.objects.filter(o=>`${o.name} ${o.short} ${o.type} ${o.owner}`.toLowerCase().includes(q)).slice(0,7);results.innerHTML=found.map(o=>`<div class="search-result" data-result="${o.id}"><b>${escapeHtml(o.name)}</b><small>${o.type} · ${escapeHtml(o.owner)}</small></div>`).join('');results.hidden=!found.length;});
    results.addEventListener('click',e=>{const row=e.target.closest('[data-result]');if(!row)return;selectObject(row.dataset.result,{center:true});input.value='';results.hidden=true;});
  }

  function setupEvents(){
    nodeLayer.addEventListener('click',e=>{const n=e.target.closest('.node');if(n)selectObject(n.dataset.id);});
    nodeLayer.addEventListener('keydown',e=>{const n=e.target.closest('.node');if(n&&(e.key==='Enter'||e.key===' ')){e.preventDefault();selectObject(n.dataset.id);}});
    byId('relationList').addEventListener('click',e=>{const r=e.target.closest('[data-object]');if(r)selectObject(r.dataset.object,{center:true});});
    $$('[data-layer]').forEach(c=>c.addEventListener('change',()=>{c.checked?activeLayers.add(c.dataset.layer):activeLayers.delete(c.dataset.layer);addActivity(`LAYER ${c.dataset.layer} · ${c.checked?'ON':'OFF'}`);render();}));
    $$('.scenario-row').forEach(b=>b.addEventListener('click',()=>setScenario(b.dataset.scenario)));
    $$('.mode-btn').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
    $$('[data-trace]').forEach(b=>b.addEventListener('click',()=>{state.traceMode=b.dataset.trace;addActivity(`TRACE · ${state.traceMode}`);render();}));
    $$('.dossier-actions [data-action]').forEach(b=>b.addEventListener('click',()=>handleAction(b.dataset.action)));
    byId('fitBtn').addEventListener('click',resetView);byId('zoomInBtn').addEventListener('click',()=>setZoom(state.zoom+.12));byId('zoomOutBtn').addEventListener('click',()=>setZoom(state.zoom-.12));
    byId('askBtn').addEventListener('click',()=>openCommand());byId('commandClose').addEventListener('click',closeCommand);byId('drawerClose').addEventListener('click',closeWorkspace);
    byId('commandModal').addEventListener('click',e=>{if(e.target===byId('commandModal'))closeCommand();});
    byId('commandInput').addEventListener('keydown',e=>{if(e.key==='Enter')runCommand(e.currentTarget.value);if(e.key==='Escape')closeCommand();});
    $$('.command-chips [data-command]').forEach(b=>b.addEventListener('click',()=>{byId('commandInput').value=b.dataset.command;runCommand(b.dataset.command);}));
    document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openCommand();}if(e.key==='Escape'){closeCommand();closeWorkspace();}});

    viewport.addEventListener('wheel',e=>{e.preventDefault();setZoom(state.zoom+(e.deltaY<0?.08:-.08));},{passive:false});
    viewport.addEventListener('pointerdown',e=>{if(e.target.closest('.node'))return;state.dragging=true;state.dragStart={x:e.clientX,y:e.clientY,panX:state.panX,panY:state.panY};viewport.classList.add('dragging');viewport.setPointerCapture(e.pointerId);});
    viewport.addEventListener('pointermove',e=>{const rect=viewport.getBoundingClientRect();const sx=1200/rect.width,sy=720/rect.height;byId('cursorHud').textContent=`CURSOR ${Math.round((e.clientX-rect.left)*sx)} · ${Math.round((e.clientY-rect.top)*sy)}`;if(!state.dragging)return;state.panX=state.dragStart.panX+(e.clientX-state.dragStart.x)*sx;state.panY=state.dragStart.panY+(e.clientY-state.dragStart.y)*sy;updateTransform();});
    const stopDrag=()=>{state.dragging=false;viewport.classList.remove('dragging');};viewport.addEventListener('pointerup',stopDrag);viewport.addEventListener('pointercancel',stopDrag);
    setupSearch();
  }

  function escapeHtml(value){return String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}

  function init(){
    buildGraph();renderTimeline();setupEvents();seedActivity();selectObject('bok_path',{quiet:true});
    byId('objectCount').textContent=`${DATA.objects.length} OBJECTS`;byId('relationCount').textContent=`${DATA.relations.length} RELATIONS`;
    setTimeout(()=>byId('boot')?.classList.add('off'),1050);
    setTimeout(()=>showBanner('MARKET ONTOLOGY RESOLVED · READY'),1250);
  }

  window.addEventListener('error',e=>{console.error('[VALKYRIE v3]',e.error||e.message);byId('healthText').textContent='RUNTIME DEGRADED';byId('healthText').style.color='var(--red)';byId('boot')?.classList.add('off');});
  window.addEventListener('unhandledrejection',e=>{console.error('[VALKYRIE v3 rejection]',e.reason);byId('healthText').textContent='RUNTIME DEGRADED';byId('healthText').style.color='var(--red)';byId('boot')?.classList.add('off');});
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init):init();
})();
