var NM={},OUT={},IN={};
for(var i=0;i<NODES.length;i++){NM[NODES[i].id]=NODES[i];}
for(var i=0;i<EDGES.length;i++){
  var e=EDGES[i];
  if(!OUT[e[1]]){OUT[e[1]]=[];}
  OUT[e[1]].push(e);
  if(!IN[e[2]]){IN[e[2]]=[];}
  IN[e[2]].push(e);
}
function hw(n){return (n.T?TW:NW)/2;}
function hh(n){return (n.T?TH:NH)/2;}
function pathD(e){
  var a=NM[e[1]],b=NM[e[2]],k=e[4],bw=e[5];
  if(k==="v"){return "M"+a.x+" "+(a.y+hh(a))+"L"+b.x+" "+(b.y-hh(b));}
  var x1=a.x+hw(a),y1=a.y,x2=b.x-hw(b),y2=b.y;
  var dx=Math.max(Math.abs(x2-x1)*0.45,34);
  return "M"+x1+" "+y1+"C"+(x1+dx)+" "+(y1+bw)+" "+(x2-dx)+" "+(y2+bw)+" "+x2+" "+y2;
}
var cur=SNAPS.length-1,sel="sig_rates",curTab="RATES",replaying=false,seqTimers=[];
function clearSeq(){
  for(var i=0;i<seqTimers.length;i++){clearTimeout(seqTimers[i]);}
  seqTimers=[];
}
function T(fn,ms){seqTimers.push(setTimeout(fn,ms));}

(function build(){
  var s="";
  s+='<line class="lanD" x1="0" y1="126" x2="1200" y2="126"/>';
  s+='<line class="lanD" x1="0" y1="262" x2="1200" y2="262"/>';
  s+='<line class="tdiv" x1="930" y1="14" x2="930" y2="388"/>';
  s+='<text class="laneL" x="6" y="20">MACRO · 정희강</text>';
  s+='<text class="laneL" x="6" y="146">RATES · 정훈</text>';
  s+='<text class="laneL" x="6" y="282">EQUITY · 김유찬</text>';
  s+='<text class="laneL" x="942" y="20">TERMINAL SIGNALS</text>';
  document.getElementById("gLane").innerHTML=s;

  s="";
  for(var i=0;i<EDGES.length;i++){
    var e=EDGES[i],d=pathD(e),neg=(e[3]==="NEG");
    var dA=(13.2+(i%5)*0.8).toFixed(1),dB=(10.2+(i%4)*1.1).toFixed(1);
    var gA=(-(i*1.31)%13).toFixed(2),gB=(-(i*0.97)%10).toFixed(2);
    s+='<path class="ebase" d="'+d+'" marker-end="url(#ad)"/>';
    s+='<path class="eflowB" id="fb_'+e[0]+'" d="'+d+'" data-d="'+dB+'" style="animation-duration:'+dB+'s;animation-delay:'+gB+'s"/>';
    s+='<path class="eflowA" id="fa_'+e[0]+'" d="'+d+'" data-d="'+dA+'" style="animation-duration:'+dA+'s;animation-delay:'+gA+'s"/>';
    s+='<path class="edraw'+(neg?" neg":"")+'" id="ed_'+e[0]+'" d="'+d+'" marker-end="url(#'+(neg?"ac":"aa")+')"/>';
    s+='<path class="spark'+(neg?" neg":"")+'" id="sp_'+e[0]+'" d="'+d+'"/>';
  }
  s+='<line class="sdl" id="sdl1" x1="1035" y1="219" x2="1035" y2="242"/>';
  s+='<line class="sdl" id="sdl2" x1="1035" y1="262" x2="1035" y2="277"/>';
  s+='<text class="sdt" id="sdt" x="1035" y="256" text-anchor="middle">SHARED DURATION LOGIC</text>';
  document.getElementById("gEdge").innerHTML=s;

  s="";
  for(var i=0;i<NODES.length;i++){
    var n=NODES[i],w=n.T?TW:NW,h=n.T?TH:NH,x=n.x-w/2,y=n.y-h/2;
    s+='<g class="nrow" id="n_'+n.id+'" data-id="'+n.id+'">';
    if(n.T){
      s+='<rect class="tnb" x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="3"/>';
      s+='<text class="tsig" x="'+(x+11)+'" y="'+(y+15)+'">SIGNAL</text>';
      s+='<text class="tst" id="tk_'+n.id+'" x="'+(x+w-11)+'" y="'+(y+15)+'" text-anchor="end">STANDBY</text>';
      s+='<text class="ttl" id="tt_'+n.id+'" x="'+(x+11)+'" y="'+(y+35)+'"></text>';
      s+='<text class="tdir" id="td_'+n.id+'" x="'+(x+11)+'" y="'+(y+50)+'"></text>';
      s+='<rect class="cbarBg" x="'+(x+11)+'" y="'+(y+h-7)+'" width="'+(w-22)+'" height="2"/>';
      s+='<rect class="cbar" id="cb_'+n.id+'" x="'+(x+11)+'" y="'+(y+h-7)+'" width="0" height="2"/>';
    }else{
      s+='<rect class="nb" x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="3"/>';
      s+='<text class="nl" x="'+(x+10)+'" y="'+(y+15)+'">'+n.l+'</text>';
      s+='<text class="nv" id="nv_'+n.id+'" x="'+(x+10)+'" y="'+(y+35)+'"></text>';
      s+='<text class="nc" id="nc_'+n.id+'" x="'+(x+w-10)+'" y="'+(y+35)+'" text-anchor="end"></text>';
      s+='<text class="ns" id="ns_'+n.id+'" x="'+(x+10)+'" y="'+(y+46)+'">'+(n.s2||"")+'</text>';
    }
    s+='</g>';
  }
  document.getElementById("gNode").innerHTML=s;

  s='<g id="brkG"><path class="brk" id="bk0" d=""/><path class="brk" id="bk1" d=""/>';
  s+='<path class="brk" id="bk2" d=""/><path class="brk" id="bk3" d=""/></g>';
  document.getElementById("gHud").innerHTML=s;
})();

/* ---------- CANVAS : GRID + DATA FIELD + SCAN ---------- */
var cv=document.getElementById("df"),ctx=cv.getContext("2d"),P=[],cwEl=document.getElementById("cw");
var W=0,H=0,pulses=[],lastT=0,scanT=0;
function initField(){
  var r=cwEl.getBoundingClientRect();
  W=Math.max(r.width,10);H=Math.max(r.height,10);
  var dpr=Math.min(window.devicePixelRatio||1,1.75);
  cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  P=[];
  var count=Math.round(W*H/7200);
  if(count>130){count=130;}
  for(var i=0;i<count;i++){
    P.push({x:Math.random()*W,y:Math.random()*H,
      vx:(Math.random()-.5)*.10,vy:(Math.random()-.5)*.08,a:.06+Math.random()*.09});
  }
}
function svgToPx(x,y){
  var r=cwEl.getBoundingClientRect(),sc=Math.min(r.width/1200,r.height/400);
  var ox=(r.width-1200*sc)/2,oy=(r.height-400*sc)/2;
  return {x:ox+x*sc,y:oy+y*sc};
}
function pulseAt(id){
  var n=NM[id];
  if(!n){return;}
  var p=svgToPx(n.x,n.y);
  pulses.push({x:p.x,y:p.y,t:0});
}
function field(ts){
  requestAnimationFrame(field);
  if(document.hidden){return;}
  if(ts-lastT<30){return;}
  lastT=ts;
  ctx.clearRect(0,0,W,H);
  ctx.strokeStyle="rgba(24,30,40,.85)";
  ctx.lineWidth=1;
  ctx.beginPath();
  for(var gx=0;gx<W;gx+=52){ctx.moveTo(gx+.5,0);ctx.lineTo(gx+.5,H);}
  for(var gy=0;gy<H;gy+=52){ctx.moveTo(0,gy+.5);ctx.lineTo(W,gy+.5);}
  ctx.stroke();
  scanT+=0.0013;
  if(scanT>1.25){scanT=-0.12;}
  var sx=scanT*W;
  var gd=ctx.createLinearGradient(sx-150,0,sx+40,0);
  gd.addColorStop(0,"rgba(34,184,207,0)");
  gd.addColorStop(0.75,"rgba(34,184,207,0.035)");
  gd.addColorStop(1,"rgba(34,184,207,0)");
  ctx.fillStyle=gd;
  ctx.fillRect(sx-150,0,190,H);
  for(var i=0;i<pulses.length;i++){pulses[i].t+=0.026;}
  while(pulses.length&&pulses[0].t>1){pulses.shift();}
  for(var i=0;i<P.length;i++){
    var p=P[i];
    p.x+=p.vx;p.y+=p.vy;
    if(p.x<0){p.x=W;}
    if(p.x>W){p.x=0;}
    if(p.y<0){p.y=H;}
    if(p.y>H){p.y=0;}
    var boost=0;
    for(var j=0;j<pulses.length;j++){
      var pu=pulses[j],dx=pu.x-p.x,dy=pu.y-p.y,dd=Math.sqrt(dx*dx+dy*dy);
      var rad=28+pu.t*158;
      if(Math.abs(dd-rad)<27){
        boost+=(1-pu.t)*0.48;
        p.x+=dx/(dd+1)*0.5;
        p.y+=dy/(dd+1)*0.5;
      }
    }
    var al=p.a+boost;
    if(al>0.55){al=0.55;}
    ctx.fillStyle=boost>0.02?"rgba(34,184,207,"+al.toFixed(3)+")":"rgba(138,148,166,"+al.toFixed(3)+")";
    ctx.fillRect(p.x,p.y,1.1,1.1);
  }
}

/* ---------- ROLLING NUMBERS ---------- */
function ease(t){return 1-Math.pow(1-t,3);}
function roll(el,from,to,dec,suf,ms){
  if(!el){return;}
  var st=null;
  function step(ts){
    if(!st){st=ts;}
    var k=Math.min((ts-st)/ms,1),val=from+(to-from)*ease(k);
    el.textContent=val.toFixed(dec)+(suf||"");
    if(k<1){requestAnimationFrame(step);}
  }
  requestAnimationFrame(step);
}
var lastVals={};
function paintNodes(anim){
  var S=SNAPS[cur];
  for(var id in S.v){
    var d=S.v[id],g=document.getElementById("n_"+id);
    if(!g){continue;}
    g.setAttribute("class",g.getAttribute("class").replace(/ st-\w+/g,"")+" st-"+d.s);
    var nv=document.getElementById("nv_"+id),nc=document.getElementById("nc_"+id);
    if(d.tx){nv.textContent=d.tx;nv.setAttribute("font-size","15");}
    else if(anim&&lastVals[id]!==undefined){roll(nv,lastVals[id],d.n,d.d,d.u,460);}
    else{nv.textContent=d.n.toFixed(d.d)+d.u;}
    lastVals[id]=d.n;
    nc.textContent=d.c;
  }
  for(var sid in S.sig){
    var sg=S.sig[sid],g2=document.getElementById("n_"+sid);
    g2.setAttribute("class",g2.getAttribute("class").replace(/ st-\w+/g,"")+" st-"+sg.s);
    document.getElementById("tt_"+sid).textContent=sg.t;
    document.getElementById("td_"+sid).textContent=sg.dir;
    document.getElementById("cb_"+sid).setAttribute("width",((TW-22)*sg.c/100).toFixed(1));
  }
}

/* ---------- FLOW RUSH ---------- */
function rushEdge(eid){
  var ids=["fa_"+eid,"fb_"+eid];
  for(var i=0;i<ids.length;i++){
    var el=document.getElementById(ids[i]);
    if(!el){continue;}
    var base=parseFloat(el.getAttribute("data-d"));
    el.classList.add("hot");
    el.style.animationDuration=(base*0.24).toFixed(2)+"s";
    (function(node,b){
      T(function(){
        node.classList.remove("hot");
        node.style.animationDuration=b+"s";
      },1900);
    })(el,base);
  }
}

/* ---------- CHAIN / PROPAGATION ---------- */
function chainOf(id){
  var seen={},q=[id];
  seen[id]=1;
  while(q.length){
    var c=q.shift(),a=IN[c]||[];
    for(var i=0;i<a.length;i++){
      if(!seen[a[i][1]]){seen[a[i][1]]=1;q.push(a[i][1]);}
    }
  }
  q=[id];
  while(q.length){
    var c2=q.shift(),b=OUT[c2]||[];
    for(var i=0;i<b.length;i++){
      if(!seen[b[i][2]]){seen[b[i][2]]=1;q.push(b[i][2]);}
    }
  }
  var arr=[];
  for(var k in seen){arr.push(k);}
  arr.sort(function(p,r){return NM[p].x-NM[r].x;});
  return arr;
}
function resetChain(keepMute){
  for(var i=0;i<NODES.length;i++){
    var g=document.getElementById("n_"+NODES[i].id);
    g.classList.remove("on");
    g.classList.remove("sel");
    if(!keepMute){g.classList.remove("mute");}
    var tk=document.getElementById("tk_"+NODES[i].id);
    if(tk){tk.textContent="STANDBY";}
  }
  for(var i=0;i<EDGES.length;i++){
    document.getElementById("ed_"+EDGES[i][0]).classList.remove("go");
    var sp=document.getElementById("sp_"+EDGES[i][0]);
    sp.classList.remove("go");
    sp.style.transition="none";
  }
  document.getElementById("sdl1").classList.remove("hot");
  document.getElementById("sdl2").classList.remove("hot");
  document.getElementById("sdt").classList.remove("hot");
}
function drawEdge(eid,delay){
  var p=document.getElementById("ed_"+eid),sp=document.getElementById("sp_"+eid);
  var L=p.getTotalLength();
  p.style.transition="none";
  p.style.strokeDasharray=L+" "+L;
  p.style.strokeDashoffset=L;
  T(function(){
    p.classList.add("go");
    p.style.transition="stroke-dashoffset 420ms cubic-bezier(.25,.6,.25,1),opacity .18s";
    p.style.strokeDashoffset="0";
    rushEdge(eid);
    sp.style.transition="none";
    sp.style.strokeDasharray="16 "+(L+22);
    sp.style.strokeDashoffset=L;
    sp.classList.add("go");
    T(function(){
      sp.style.transition="stroke-dashoffset 720ms linear,opacity .3s";
      sp.style.strokeDashoffset="-22";
      T(function(){sp.classList.remove("go");},720);
    },30);
  },delay);
}
function lockSignal(id,delay){
  var el=document.getElementById("tk_"+id);
  if(!el){return;}
  T(function(){el.textContent="ACQUIRING";},delay);
  T(function(){el.textContent="VERIFIED";},delay+280);
  T(function(){el.textContent="LOCKED";},delay+560);
}
function activate(ids,step){
  var set={};
  for(var i=0;i<ids.length;i++){set[ids[i]]=1;}
  for(var i=0;i<NODES.length;i++){
    var g=document.getElementById("n_"+NODES[i].id);
    if(set[NODES[i].id]){g.classList.remove("mute");}else{g.classList.add("mute");}
  }
  var used={};
  for(var i=0;i<ids.length;i++){
    (function(id,k){
      T(function(){
        var g=document.getElementById("n_"+id);
        g.classList.add("on");
        g.classList.remove("mute");
        pulseAt(id);
      },k*step);
      if(NM[id].T){lockSignal(id,k*step+120);}
    })(ids[i],i);
    var outs=OUT[ids[i]]||[];
    for(var j=0;j<outs.length;j++){
      if(set[outs[j][2]]&&!used[outs[j][0]]){
        used[outs[j][0]]=1;
        drawEdge(outs[j][0],i*step+80);
      }
    }
  }
}
function select(id,opt){
  opt=opt||{};
  clearSeq();
  resetChain(true);
  sel=id;
  var ch=chainOf(id);
  activate(ch,140);
  T(function(){document.getElementById("n_"+id).classList.add("sel");},60);
  if(opt.sweep){
    var sw=document.getElementById("sweep");
    sw.classList.remove("go");
    void sw.offsetWidth;
    sw.classList.add("go");
  }
  paintInspector(id);
  var tab=NM[id].t;
  if(tab!==curTab){T(function(){switchTab(tab);},180);}
  document.getElementById("hud2").textContent="OBJECT ACQUIRED · "+id.toUpperCase()+" · "+ch.length+" LINKED";
  if(id==="sig_rates"||id==="sig_equity"){
    T(function(){
      document.getElementById("sdl1").classList.add("hot");
      document.getElementById("sdl2").classList.add("hot");
      document.getElementById("sdt").classList.add("hot");
    },ch.length*140);
  }
}
