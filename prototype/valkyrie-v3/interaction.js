/* ---------- SEQUENCES ---------- */
function banner(a,b){
  $('ban1').textContent=a;$('ban2').textContent=b||'';
  var e=$('ban');e.classList.remove('on');void e.offsetWidth;e.classList.add('on');
}
function lit(ids,step,cb){
  for(var i=0;i<ids.length;i++){
    (function(n,k){T(function(){
      NEL[n].g.classList.add('rel');ripple(n);
      for(var j=0;j<EL.length;j++){
        if(EL[j].b===n&&NEL[EL[j].a].g.classList.contains('rel')){
          EL[j].g.classList.add('rel','hot');packet(EL[j]);
          (function(el){T(function(){el.g.classList.remove('hot');},2000);})(EL[j]);
        }
      }
    },k*step);})(ids[i],i);
  }
  if(cb)T(cb,ids.length*step);
}
function signature(){
  if(busy)return;busy=true;clearT();cool();reset(true);
  SV.classList.add('fc');
  banner('INITIALIZING VALKYRIE','ONTOLOGY 16 OBJECTS · 22 RELATIONS');
  T(function(){
    banner('MACRO SHOCK DETECTED','US CPI · FED PATH · BOK');
    tab('MACRO');
    lit(['mac_gdp','mac_uscpi','mac_krcpi','mac_fed','mac_bok','sig_macro'],170);
  },1500);
  T(function(){
    banner('RATES TRANSMISSION','UST → KTB → CURVE · CREDIT');
    tab('RATES');
    lit(['rat_ust','rat_ktb','rat_curve','rat_credit','sig_rates'],170);
  },3000);
  T(function(){
    banner('EQUITY MARKET TRANSMISSION','KOSPI · KOSDAQ → FUNDING · VALUATION');
    tab('EQUITY');
    lit(['eq_fin','eq_val','eq_cb'],170);
  },4600);
  T(function(){
    banner('KOSDAQ RISK CAPITAL','IPO · CB → EQUITY SELECTIVITY');
    lit(['eq_ipo','sig_equity'],170);
  },5900);
  T(function(){
    banner('SHARED DURATION LOGIC','장기채 = 성장주·IPO · 동일 할인율 논리');
    SHL.classList.add('on');SHT.classList.add('on');SHT2.classList.add('on');
  },7100);
  T(function(){
    banner('DECISION GRAPH RESOLVED','MACRO · RATES · EQUITY 정합');
    busy=false;
  },8700);
  T(function(){SV.classList.remove('fc');cool();},10600);
}
function goSnap(k){
  si=k;cur=SNAP[k];SH={ust:0,cr:0,bok:0};
  $('lv').className='live'+(k===4?'':' rp');
  $('lvt').textContent=k===4?'LIVE':'REPLAY '+cur.d;
  apply(460);
}
function replay(){
  if(busy)return;busy=true;clearT();cool();
  banner('TEMPORAL ACCESS','SNAPSHOT ARCHIVE · 5 POINTS');
  T(function(){banner('REWINDING','2026-09-30 → 2026-05-04');goSnap(0);},1500);
  for(var i=1;i<5;i++){(function(k){T(function(){goSnap(k);if(SNAP[k].cfl)banner('CONFLICT DETECTED','MACRO EASING vs DURATION DEFENSIVE');},3000+k*820);})(i);}
  T(function(){banner('TIMELINE RESTORED','LIVE · 2026-09-30');busy=false;},7400);
}
function reset(quiet){
  clearT();cool();sel=null;INS.id=null;SH={ust:0,cr:0,bok:0};
  for(var i in NEL)NEL[i].g.classList.remove('on');
  if(!quiet){si=4;cur=SNAP[4];$('lv').className='live';$('lvt').textContent='LIVE';}
  apply(360);
}
function shock(k){
  if(k==='ust')SH.ust+=50;
  if(k==='cr')SH.cr+=40;
  if(k==='bok')SH.bok+=25;
  if(k==='all'){SH.ust+=50;SH.cr+=40;SH.bok+=25;}
  banner('SHOCK INJECTED','UST +'+SH.ust+'bp · CREDIT +'+SH.cr+'bp · BOK +'+SH.bok+'bp');
  clearT();cool();SV.classList.add('fc');
  lit(['rat_ust','rat_ktb','rat_curve','rat_credit','eq_val','eq_cb','eq_ipo','sig_rates','sig_equity'],150);
  apply(700);
  T(function(){SV.classList.remove('fc');},2600);
}
var CQ={
 '채권':['rat_ust','rat_ktb','rat_curve','rat_credit','sig_rates'],
 'equity':['eq_fin','eq_val','eq_cb','eq_ipo','sig_equity'],
 'ipo':['eq_fin','eq_val','eq_ipo','sig_equity'],
 'cb':['rat_credit','eq_fin','eq_cb','sig_equity']
};
function command(q){
  if(busy)return;
  var ids,tb;
  if(/kospi|kosdaq|주식|시장|equity/i.test(q)){ids=CQ.equity;tb='EQUITY';}
  else if(/ipo|청약/i.test(q)){ids=CQ.ipo;tb='EQUITY';}
  else if(/cb|리픽싱|전환/i.test(q)){ids=CQ.cb;tb='EQUITY';}
  else if(/50bp|10년물|ust/i.test(q)){shock('ust');$('cin').value='';return;}
  else{ids=CQ['채권'];tb='RATES';}
  busy=true;clearT();cool();SV.classList.add('fc');
  $('hud2').textContent='SCANNING 16 OBJECTS · TRACING RELATIONS';
  lit(ids,180,function(){
    INS.id=ids[ids.length-1];tab(tb,null);busy=false;
    $('hud2').textContent='SIGNAL RESOLVED · '+ids.length+' OBJECTS';
  });
  T(function(){SV.classList.remove('fc');},ids.length*180+2200);
}

/* ---------- WIRE ---------- */
var tks=$('tks');
for(var i=0;i<SNAP.length;i++){
  var d=document.createElement('div');
  d.className='tk'+(i===4?' on':'');
  d.style.left=(i/(SNAP.length-1)*100)+'%';
  d.innerHTML='<i></i><div class="tkl">'+SNAP[i].d.slice(5)+'</div><div class="tip">'+SNAP[i].d+' · '+SNAP[i].sg.rates[0]+'<br>CONF '+SNAP[i].sg.rates[1]+'% · CREDIT '+SNAP[i].v.rat_credit+'bp</div>';
  (function(k){d.addEventListener('click',function(){goSnap(k);});})(i);
  tks.appendChild(d);
}
var tbs=document.querySelectorAll('.tab');
for(var i=0;i<tbs.length;i++){(function(e){e.addEventListener('click',function(){tab(e.getAttribute('data-t'));});})(tbs[i]);}
var cps=document.querySelectorAll('.cp');
for(var i=0;i<cps.length;i++){
  (function(e){
    e.addEventListener('click',function(){
      var s=e.getAttribute('data-s');
      if(s){shock(s);return;}
      var q=e.getAttribute('data-q'),inp=$('cin');inp.value='';
      var j=0;var iv=setInterval(function(){inp.value=q.slice(0,++j);if(j>=q.length){clearInterval(iv);command(q);}},17);
    });
  })(cps[i]);
}
$('cin').addEventListener('keydown',function(e){if(e.key==='Enter'){command(this.value);}});
$('sig').addEventListener('click',signature);
$('rst').addEventListener('click',function(){reset(false);});
$('rp').addEventListener('click',replay);

var FEED=['ECOS SYNC OK','FRED SYNC OK','TAYLOR MODEL UPDATED','DART FILING INGESTED','ONTOLOGY INTEGRITY 22/22','FLOW CHANNELS 22 OPEN','0 CRITICAL ALERTS'],fi=0;
setInterval(function(){
  if(window.VALKYRIE_LIVE_EQUITY&&window.VALKYRIE_LIVE_EQUITY.status==='ready')return;
  fi=(fi+1)%FEED.length;
  var t=new Date();
  $('fd').textContent=String(t.getHours()).padStart(2,'0')+':'+String(t.getMinutes()).padStart(2,'0')+':'+String(t.getSeconds()).padStart(2,'0')+'  '+FEED[fi]+' · DEMO';
},4300);

window.addEventListener('resize',function(){PT=[];rs();});
rs();requestAnimationFrame(draw);
for(var id in FM)V[id]=SNAP[4].v[id];
apply(0);

var bt=['b0','b1','b2','b3','b4'];
for(var i=0;i<bt.length;i++){(function(k){setTimeout(function(){$(bt[k]).classList.add('s');},180+k*260);})(i);}
setTimeout(function(){$('boot').classList.add('go');},1750);
setTimeout(function(){var b=$('boot');if(b.parentNode)b.parentNode.removeChild(b);},2350);

function post(){
  var h=Math.max(document.documentElement.scrollHeight,985);
  parent.postMessage({type:'wrks:viz:resize',height:h},'*');
}
post();window.addEventListener('resize',post);
