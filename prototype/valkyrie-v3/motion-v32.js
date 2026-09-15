(() => {
  'use strict';
  const D=window.VALKYRIE_V3;if(!D)return;
  const NS='http://www.w3.org/2000/svg';
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)], byId=id=>document.getElementById(id);
  const svgEl=(tag,attrs={})=>{const e=document.createElementNS(NS,tag);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,String(v)));return e;};
  let streamLayer,beadLayer,beads=[],raf=0,last=0;

  function installStreams(){
    const world=byId('world'),labels=byId('edgeLabelLayer');if(!world||!labels||byId('v32StreamLayer'))return;
    streamLayer=svgEl('g',{id:'v32StreamLayer'});beadLayer=svgEl('g',{id:'v32BeadLayer'});
    world.insertBefore(streamLayer,labels);world.insertBefore(beadLayer,byId('nodeLayer'));
    D.relations.forEach(r=>{
      const base=byId(`edge_${r.id}`);if(!base)return;const d=base.getAttribute('d');
      streamLayer.appendChild(svgEl('path',{id:`v32a_${r.id}`,d,class:'v32-streamA','data-rel':r.id}));
      streamLayer.appendChild(svgEl('path',{id:`v32b_${r.id}`,d,class:'v32-streamB','data-rel':r.id}));
    });
    syncStreams();seedBeads();animate(performance.now());
  }

  function syncStreams(){
    D.relations.forEach(r=>{
      const base=byId(`edge_${r.id}`),a=byId(`v32a_${r.id}`),b=byId(`v32b_${r.id}`);if(!base||!a||!b)return;
      const hidden=base.style.display==='none';a.style.display=b.style.display=hidden?'none':'';
      const hot=base.classList.contains('active'),stress=base.classList.contains('stress'),dim=base.classList.contains('dim');
      [a,b].forEach(el=>{el.classList.toggle('hot',hot);el.classList.toggle('stress',stress);el.classList.toggle('dim',dim);el.classList.toggle('temporal',$('.mode-btn.active')?.dataset.mode==='TEMPORAL'&&hot);});
    });
  }

  function visiblePaths(){return D.relations.map(r=>({r,p:byId(`edge_${r.id}`)})).filter(x=>x.p&&x.p.style.display!=='none');}
  function pickPath(preferHot=true){const all=visiblePaths();if(!all.length)return null;const hot=preferHot?all.filter(x=>x.p.classList.contains('active')||x.p.classList.contains('stress')):[];const pool=hot.length?hot:all;return pool[Math.floor(Math.random()*pool.length)];}
  function seedBeads(){
    beadLayer.innerHTML='';beads=[];const count=10;
    for(let i=0;i<count;i++){
      const pick=pickPath(i<4);if(!pick)break;const c=svgEl('circle',{r:i<3?1.8:1.15,class:`v32-bead${pick.p.classList.contains('stress')?' stress':''}`});beadLayer.appendChild(c);
      beads.push({el:c,rel:pick.r.id,t:Math.random(),speed:.025+Math.random()*.035,life:4+Math.random()*6});
    }
  }
  function retarget(b){const pick=pickPath(true);if(!pick)return;b.rel=pick.r.id;b.t=0;b.speed=.03+Math.random()*.045;b.life=4+Math.random()*7;b.el.classList.toggle('stress',pick.p.classList.contains('stress'));}
  function animate(now){
    const dt=Math.min(.04,Math.max(.008,(now-last)/1000||.016));last=now;
    beads.forEach(b=>{
      const p=byId(`edge_${b.rel}`);if(!p||p.style.display==='none'){retarget(b);return;}
      let len=0;try{len=p.getTotalLength();}catch{return;}b.t+=b.speed*dt*8;b.life-=dt;
      if(b.t>=1||b.life<=0){retarget(b);return;}const pt=p.getPointAtLength(len*b.t);b.el.setAttribute('cx',pt.x);b.el.setAttribute('cy',pt.y);
      const hot=p.classList.contains('active')||p.classList.contains('stress');b.el.style.opacity=hot?'.95':String(.16+.18*Math.sin(b.t*Math.PI));
    });
    raf=requestAnimationFrame(animate);
  }

  const TYPE_KO={OBSERVATION:'관측값',MODEL:'모델',MARKET:'시장',CONCEPT:'개념',SIGNAL:'시그널',DECISION:'판단',OUTCOME:'성과'};
  const UI_REPL=[
    [/CROSS-ASSET DECISION GRAPH/g,'크로스에셋 의사결정 그래프'],[/RELATION TRACE/g,'관계 경로 추적'],[/SCENARIO PROPAGATION/g,'시나리오 충격 전파'],[/TEMPORAL MARKET STATE/g,'과거 시장 상태'],
    [/TRACE MODE/g,'경로 추적'],[/STRESS MODE · SELECT A SCENARIO/g,'스트레스 모드 · 시나리오를 선택하세요'],[/TEMPORAL STATE/g,'과거 상태'],[/LIVE MARKET STATE/g,'실시간 시장 상태'],
    [/TEMPORAL REWIND/g,'과거 시점 복원'],[/ONTOLOGY RESTORED/g,'온톨로지 복원'],[/TIMELINE RESTORED · LIVE/g,'시간축 복원 · 실시간'],[/REPLAY ENGINE · START/g,'시간 재생 시작'],[/REPLAY ENGINE · COMPLETE/g,'시간 재생 완료'],
    [/OBJECT ACQUIRED/g,'객체 선택'],[/VIEW MODE/g,'탐색 모드'],[/SCENARIO BASE RESTORED/g,'기본 시나리오 복원'],[/OBJECTS RECALCULATED/g,'개 객체 재계산'],[/OBJECTS PROPAGATED/g,'개 객체 충격 전파'],
    [/SCENARIO HAWKISH/g,'매파 시나리오'],[/SCENARIO DOVISH/g,'비둘기 시나리오'],[/SCENARIO RISK_OFF/g,'위험회피 시나리오'],[/REPLAY/g,'시간 재생']
  ];
  function localText(s){let out=s;UI_REPL.forEach(([r,v])=>out=out.replace(r,v));out=out.replace(/^LIVE$/,'실시간').replace(/^BASE$/,'기본').replace(/^HAWKISH$/,'매파').replace(/^DOVISH$/,'비둘기').replace(/^RISK_OFF$/,'위험회피').replace(/^CAUTION$/,'주의').replace(/^HIGH$/,'높음').replace(/^NORMAL$/,'정상');return out;}
  function localizeRuntime(){
    $$('.node-type').forEach(n=>{if(TYPE_KO[n.textContent])n.textContent=TYPE_KO[n.textContent];});
    const pill=byId('dossierType');if(pill&&TYPE_KO[pill.textContent])pill.textContent=TYPE_KO[pill.textContent];
    ['graphTitle','scenarioLabel','snapshotLabel','riskBadge','healthText'].forEach(id=>{const el=byId(id);if(el)el.textContent=localText(el.textContent);});
    const banner=byId('graphBanner');if(banner&&!banner.hidden)banner.textContent=localText(banner.textContent);
    $$('#activityFeed .activity-line').forEach(el=>el.textContent=localText(el.textContent));
    $$('#evidenceList .evidence-item small').forEach(el=>{if(el.textContent==='HIGH')el.textContent='높음';else if(el.textContent==='MED')el.textContent='중간';else if(el.textContent==='LOW')el.textContent='낮음';});
  }

  function installObservers(){
    const root=byId('app');if(root)new MutationObserver(()=>{syncStreams();localizeRuntime();}).observe(root,{subtree:true,childList:true,attributes:true,characterData:true,attributeFilter:['class','style','hidden']});
    localizeRuntime();
  }

  function boostInteractions(){
    byId('nodeLayer')?.addEventListener('mouseenter',e=>{const n=e.target.closest?.('.node');if(!n)return;n.classList.add('v32-hover');},true);
    byId('nodeLayer')?.addEventListener('mouseleave',e=>{const n=e.target.closest?.('.node');if(n)n.classList.remove('v32-hover');},true);
    $$('.scenario-row,.mode-btn').forEach(btn=>btn.addEventListener('click',()=>setTimeout(()=>{syncStreams();seedBeads()},80)));
    byId('timeline')?.addEventListener('click',()=>setTimeout(()=>{syncStreams();seedBeads()},80));
  }

  function boot(){installStreams();installObservers();boostInteractions();console.info('[VALKYRIE v3.2] Korean-first hydro cognition layer online');}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,30),{once:true});else setTimeout(boot,30);
})();
