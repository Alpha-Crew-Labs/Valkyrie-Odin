/* ---------- SNAPSHOT ---------- */
function goSnap(idx,anim){
  cur=idx;
  paintNodes(anim);
  paintHeader();
  clock();
  renderPane();
  paintInspector(sel);
  if(anim){
    var sw=document.getElementById("sweep");
    sw.classList.remove("go");
    void sw.offsetWidth;
    sw.classList.add("go");
  }
  post();
}
(function ticks(){
  var t=document.getElementById("ticks"),h="";
  for(var i=0;i<SNAPS.length;i++){
    var pct=SNAPS.length===1?0:(i/(SNAPS.length-1))*100;
    h+='<div class="tk" data-i="'+i+'" style="left:calc('+pct+'% - 0.5px)"><b>'+SNAPS[i].d.substring(5)+'</b></div>';
  }
  t.innerHTML=h;
  var tk=t.querySelectorAll(".tk");
  for(var i=0;i<tk.length;i++){
    tk[i].addEventListener("click",function(){
      if(replaying){return;}
      goSnap(parseInt(this.getAttribute("data-i"),10),true);
      select(sel,{sweep:false});
    });
  }
})();
document.getElementById("rp").addEventListener("click",function(){
  if(replaying){return;}
  replaying=true;
  var btn=this;
  btn.textContent="REWINDING…";
  banner("TEMPORAL REWIND · 2026-05-04");
  goSnap(0,true);
  select("sig_rates",{sweep:true});
  var k=1;
  var iv=setInterval(function(){
    if(k>=SNAPS.length){
      clearInterval(iv);
      replaying=false;
      btn.textContent="REPLAY ▶";
      banner("TIMELINE RESTORED · LIVE");
      return;
    }
    goSnap(k,true);
    if(SNAPS[k].cf){banner("CONFLICT · 매크로 완화 vs 듀레이션 방어");}
    k++;
  },880);
});
function banner(txt){
  var b=document.getElementById("phb");
  b.textContent=txt;
  b.classList.remove("on");
  void b.offsetWidth;
  b.classList.add("on");
  T(function(){b.classList.remove("on");},1600);
}

/* ---------- SIGNATURE ---------- */
document.getElementById("sig").addEventListener("click",function(){
  clearSeq();
  resetChain(false);
  var t=0;
  banner("INITIALIZING VALKYRIE");
  T(function(){
    banner("MACRO SHOCK DETECTED");
    switchTab("MACRO");
    activate(["mac_gdp","mac_uscpi","mac_krcpi","mac_fed","mac_bok","sig_macro"],160);
    paintInspector("sig_macro");
    sel="sig_macro";
  },t+=950);
  T(function(){
    banner("RATES TRANSMISSION");
    switchTab("RATES");
    activate(["mac_uscpi","mac_fed","mac_bok","rat_ust10","rat_ktb","rat_curve","rat_credit","sig_rates"],150);
    paintInspector("sig_rates");
    sel="sig_rates";
  },t+=1600);
  T(function(){
    banner("CROSS-ASSET TRANSMISSION");
    switchTab("EQUITY");
    activate(["rat_ktb","rat_credit","eq_fin","eq_val","eq_cb"],165);
    paintInspector("eq_cb");
    sel="eq_cb";
  },t+=1700);
  T(function(){
    banner("EQUITY DECISION");
    activate(["eq_fin","eq_val","eq_demand","eq_cb","sig_equity"],160);
    paintInspector("sig_equity");
    sel="sig_equity";
  },t+=1500);
  T(function(){
    banner("SHARED DURATION LOGIC");
    activate(["rat_ktb","rat_curve","rat_credit","sig_rates","eq_val","eq_cb","sig_equity"],100);
    document.getElementById("sdl1").classList.add("hot");
    document.getElementById("sdl2").classList.add("hot");
    document.getElementById("sdt").classList.add("hot");
    var sw=document.getElementById("sweep");
    sw.classList.remove("go");
    void sw.offsetWidth;
    sw.classList.add("go");
  },t+=1500);
  T(function(){
    banner("DECISION GRAPH RESOLVED");
    resetChain(false);
    activate(["mac_uscpi","mac_fed","mac_bok","sig_macro","rat_ktb","rat_curve","rat_credit","sig_rates","eq_val","eq_demand","eq_cb","sig_equity"],80);
  },t+=1600);
});
document.getElementById("rst").addEventListener("click",function(){
  clearSeq();
  resetChain(false);
  goSnap(SNAPS.length-1,true);
  select("sig_rates",{sweep:false});
});

/* ---------- HOVER HUD ---------- */
(function hover(){
  var gs=document.querySelectorAll(".nrow");
  for(var i=0;i<gs.length;i++){
    gs[i].addEventListener("mouseenter",function(){
      var id=this.getAttribute("data-id"),n=NM[id],w=n.T?TW:NW,h=n.T?TH:NH;
      var x=n.x-w/2-5,y=n.y-h/2-5,W2=w+10,H2=h+10,L=10;
      var d=[
        "M"+x+" "+(y+L)+"L"+x+" "+y+"L"+(x+L)+" "+y,
        "M"+(x+W2-L)+" "+y+"L"+(x+W2)+" "+y+"L"+(x+W2)+" "+(y+L),
        "M"+(x+W2)+" "+(y+H2-L)+"L"+(x+W2)+" "+(y+H2)+"L"+(x+W2-L)+" "+(y+H2),
        "M"+(x+L)+" "+(y+H2)+"L"+x+" "+(y+H2)+"L"+x+" "+(y+H2-L)
      ];
      for(var k=0;k<4;k++){
        var el=document.getElementById("bk"+k);
        el.setAttribute("d",d[k]);
        el.classList.add("on");
      }
      document.getElementById("hud").textContent="CURSOR X:"+("000"+n.x).slice(-4)+" Y:"+("000"+n.y).slice(-4);
      document.getElementById("hud2").textContent="TARGET "+id.toUpperCase()+" · "+n.o;
    });
    gs[i].addEventListener("mouseleave",function(){
      for(var k=0;k<4;k++){document.getElementById("bk"+k).classList.remove("on");}
      document.getElementById("hud").textContent="CURSOR — · —";
    });
    gs[i].addEventListener("click",function(){
      if(replaying){return;}
      select(this.getAttribute("data-id"),{sweep:true});
      post();
    });
  }
})();
var tabsEl=document.querySelectorAll(".tab");
for(var i=0;i<tabsEl.length;i++){
  tabsEl[i].addEventListener("click",function(){switchTab(this.getAttribute("data-t"));});
}

/* ---------- COMMAND ---------- */
var chips=document.querySelectorAll(".chip");
for(var i=0;i<chips.length;i++){
  chips[i].addEventListener("click",function(){
    if(replaying){return;}
    var q=this.getAttribute("data-q"),nid=this.getAttribute("data-n"),inp=document.getElementById("ci");
    inp.value="";
    clearSeq();
    var k=0;
    var iv=setInterval(function(){
      inp.value=q.substring(0,++k);
      if(k>=q.length){
        clearInterval(iv);
        banner("TRACING RELATIONS");
        setTimeout(function(){select(nid,{sweep:true});},300);
      }
    },20);
  });
}
document.getElementById("ci").addEventListener("keydown",function(e){
  if(e.key!=="Enter"){return;}
  var v=this.value;
  var nid=/채권|듀레이션|커브|금리 포지션/.test(v)?"sig_rates":(/IPO|청약|코스닥|CB/.test(v)?"sig_equity":"sig_macro");
  banner("ANALYZING "+NODES.length+" OBJECTS");
  setTimeout(function(){select(nid,{sweep:true});},280);
});

/* ---------- BOOT ---------- */
function post(){
  try{
    parent.postMessage({type:"wrks:viz:resize",height:document.documentElement.scrollHeight},"*");
  }catch(err){}
}
window.addEventListener("resize",function(){initField();post();});

(function boot(){
  initField();
  requestAnimationFrame(field);
  paintNodes(false);
  paintHeader();
  clock();
  feed();
  renderPane();
  document.getElementById("n_sig_rates").classList.add("sel");
  var ids=["bt1","bt2","bl0","bl1","bl2","bl3","bl4","bl5"];
  for(var i=0;i<ids.length;i++){
    (function(k){
      setTimeout(function(){
        document.getElementById(ids[k]).classList.add("on");
        document.getElementById("bbi").style.width=Math.round((k+1)/ids.length*300)+"px";
      },130+k*170);
    })(i);
  }
  setTimeout(function(){
    document.getElementById("boot").classList.add("off");
    setTimeout(function(){
      select("sig_rates",{sweep:true});
      post();
    },340);
  },1720);
  document.getElementById("skip").addEventListener("click",function(){
    document.getElementById("boot").classList.add("off");
    select("sig_rates",{sweep:true});
    post();
  });
  post();
  setTimeout(post,600);
  setTimeout(post,1900);
  setTimeout(post,3200);
})();
