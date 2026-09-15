/* ---------- INSPECTOR ---------- */
function evVal(v){
  if(v==="@TAYLOR"){return SNAPS[cur].ty.t.toFixed(2)+"%";}
  if(v.charAt(0)!=="@"){return v;}
  var d=SNAPS[cur].v[v.substring(1)];
  if(!d){return "—";}
  return d.tx?d.tx:(d.n.toFixed(d.d)+d.u);
}
function paintInspector(id){
  var S=SNAPS[cur],n=NM[id],isSig=!!n.T;
  var iv=document.getElementById("iv");
  iv.classList.remove("rv");
  void iv.offsetWidth;
  if(isSig){
    var sg=S.sig[id];
    iv.textContent=sg.t;
    iv.style.fontSize="19px";
    document.getElementById("ic1").textContent=sg.dir;
    document.getElementById("is").textContent=sg.s;
    document.getElementById("is").style.color=sg.s==="OK"?"var(--gr)":(sg.s==="RISK"?"var(--rd)":"var(--am)");
    var mdl=id==="sig_rates"?"Curve Regime v1.3":(id==="sig_macro"?"Taylor+Nowcast v2.1":"IPO FSCORE v0.9");
    document.getElementById("iaux").innerHTML="MODEL · "+mdl;
  }else{
    var d=S.v[id];
    iv.textContent=d.tx?d.tx:(d.n.toFixed(d.d)+d.u);
    iv.style.fontSize="25px";
    document.getElementById("ic1").textContent=d.c;
    document.getElementById("is").textContent=d.s;
    document.getElementById("is").style.color=d.s==="OK"?"var(--gr)":(d.s==="RISK"?"var(--rd)":"var(--am)");
    var mt=META[id]||{},ax="";
    if(mt.aux){
      for(var i=0;i<mt.aux.length;i++){
        ax+=mt.aux[i][0]+' · <span class="num" style="color:var(--mut)">'+mt.aux[i][1]+'</span><br>';
      }
    }
    document.getElementById("iaux").innerHTML=ax;
  }
  T(function(){iv.classList.add("rv");},20);
  document.getElementById("io").textContent=n.o+" · "+n.t;

  var evs=[],view="",conf=0;
  if(isSig){
    var linked=IN[id]||[];
    for(var i=0;i<linked.length&&i<3;i++){
      var src=linked[i][1],dd=S.v[src];
      evs.push([NM[src].l,dd.tx?dd.tx:(dd.n.toFixed(dd.d)+dd.u),i===0?"HIGH":"MED"]);
    }
    view=S.sig[id].dir;
    conf=S.sig[id].c;
  }else{
    var mt2=META[id]||{ev:[],view:""};
    for(var i=0;i<mt2.ev.length;i++){
      evs.push([mt2.ev[i][0],evVal(mt2.ev[i][1]),mt2.ev[i][2]]);
    }
    view=mt2.view;
    conf=n.t==="MACRO"?S.sig.sig_macro.c:(n.t==="RATES"?S.sig.sig_rates.c:S.sig.sig_equity.c);
  }
  var h="";
  for(var i=0;i<evs.length;i++){
    h+='<div class="evr" id="evr'+i+'"><span class="evn">0'+(i+1)+'</span>'+
       '<span class="evl">'+evs[i][0]+'</span>'+
       '<span class="evv num">'+evs[i][1]+'</span>'+
       '<span class="evi i-'+evs[i][2]+'">'+evs[i][2]+'</span></div>';
  }
  document.getElementById("iev").innerHTML=h;
  for(var i=0;i<evs.length;i++){
    (function(k){
      T(function(){
        var el=document.getElementById("evr"+k);
        if(el){el.classList.add("on");}
      },130+k*75);
    })(i);
  }
  document.getElementById("iview").textContent=view;
  var cfEl=document.getElementById("icf");
  T(function(){
    roll(cfEl,0,conf,0,"%",540);
    document.getElementById("icfb").style.width=conf+"%";
  },170);
  document.getElementById("ivin").textContent=S.vin;
  var act=document.getElementById("iact");
  act.innerHTML="";
  var lines=["SCAN "+NODES.length+" OBJECTS","TRACE "+(chainOf(id).length-1)+" RELATIONS",
    "EVIDENCE LOCKED "+evs.length,(isSig?"SIGNAL RESOLVED":"LINKED SIGNAL READY")];
  for(var i=0;i<lines.length;i++){
    (function(k){
      T(function(){
        act.innerHTML+="<div>"+(k===lines.length-1?"<b>"+lines[k]+"</b>":"<i>›</i> "+lines[k])+"</div>";
        post();
      },210+k*135);
    })(i);
  }
}

/* ---------- HEADER ---------- */
function paintHeader(){
  var S=SNAPS[cur],alerts=0;
  for(var k in S.v){
    if(S.v[k].s==="ALERT"||S.v[k].s==="RISK"){alerts++;}
  }
  var st=alerts>=8?"RISK-OFF":(alerts>=4?"CAUTION":"NEUTRAL");
  var cls=alerts>=8?"ro":(alerts>=4?"ca":"ne");
  document.getElementById("ms").className="bdg "+cls;
  document.getElementById("msT").textContent=st;
  document.getElementById("msN").textContent="("+alerts+")";
  document.getElementById("cf").style.display=S.cf?"inline-flex":"none";
  var live=(cur===SNAPS.length-1);
  document.getElementById("mode").className="bdg "+(live?"live":"rep");
  document.getElementById("modeT").textContent=live?"LIVE":"REPLAY "+S.d;
  document.getElementById("snapL").textContent=S.d;
  var tk=document.querySelectorAll(".tk");
  for(var i=0;i<tk.length;i++){
    if(i===cur){tk[i].classList.add("a");}else{tk[i].classList.remove("a");}
  }
}
function clock(){
  var S=SNAPS[cur],sc=(new Date()).getSeconds();
  document.getElementById("asof").textContent=S.d+" "+S.t+":"+(sc<10?"0":"")+sc;
}
setInterval(clock,1000);

/* ---------- ACTIVITY FEED ---------- */
var fi=0;
function feed(){
  var el=document.getElementById("afd"),h="",now=new Date();
  for(var i=0;i<3;i++){
    var it=FEED[(fi+i)%FEED.length];
    var t=new Date(now.getTime()-i*4300);
    var hh2=("0"+t.getHours()).slice(-2),mm=("0"+t.getMinutes()).slice(-2),ss=("0"+t.getSeconds()).slice(-2);
    h+='<div class="n'+i+'">'+hh2+":"+mm+":"+ss+" · "+it[0]+" <b>"+it[1]+"</b></div>";
  }
  el.innerHTML=h;
  fi=(fi+1)%FEED.length;
}
setInterval(feed,4300);

/* ---------- TABS ---------- */
function switchTab(t){
  curTab=t;
  var tabs=document.querySelectorAll(".tab");
  for(var i=0;i<tabs.length;i++){
    if(tabs[i].getAttribute("data-t")===t){tabs[i].classList.add("a");}else{tabs[i].classList.remove("a");}
  }
  var p=document.getElementById("pane");
  p.classList.remove("in");
  p.classList.add("out");
  setTimeout(function(){
    renderPane();
    p.classList.remove("out");
    void p.offsetWidth;
    p.classList.add("in");
    post();
  },175);
}
function renderPane(){
  var S=SNAPS[cur],p=document.getElementById("pane"),h="";
  if(curTab==="MACRO"){
    var gap=Math.round((S.ty.a-S.ty.t)*100);
    var gcl=gap>0?"rr":"g";
    var gtx=gap>0?"실제 > 적정 · 인하 지연 구간":"실제 < 적정 · 추가 인하 여지";
    h+='<div class="ml">SCENARIO MATRIX — KR CPI · 기준금리 (BASE 확정 · 시나리오 엔진 구현 중)</div>';
    h+='<div class="scen" style="margin-top:5px">';
    h+='<div class="h"></div><div class="h">BASE</div><div class="h">HAWKISH</div><div class="h">DOVISH</div>';
    h+='<div class="lb">KR CPI (연말)</div><div>2.10%</div><div class="pd">PENDING</div><div class="pd">PENDING</div>';
    h+='<div class="lb">첫 인하 시점</div><div>완료 · 7월</div><div class="pd">PENDING</div><div class="pd">PENDING</div>';
    h+='<div class="lb">연말 기준금리</div><div>2.25%</div><div class="pd">PENDING</div><div class="pd">PENDING</div>';
    h+='<div class="lb">국고 3Y 레인지</div><div>2.45~2.75%</div><div class="pd">PENDING</div><div class="pd">PENDING</div>';
    h+='</div>';
    h+='<div class="ml2" style="margin-top:5px">HAWKISH / DOVISH는 정성 판단 요소로 현재 미구현 · 정희강 구현 예정 · 없는 값은 채우지 않음</div>';
    h+='<div style="display:grid;grid-template-columns:1fr 1.45fr;gap:9px;margin-top:8px">';
    h+='<div class="card"><div class="ml">관성 테일러룰 — 적정금리 갭</div>';
    h+='<div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:5px">';
    h+='<div><div class="ml2">실제 기준금리</div><div class="num" style="font-size:20px;font-weight:700">'+S.ty.a.toFixed(2)+'%</div></div>';
    h+='<div><div class="ml2">테일러룰 적정</div><div class="num" style="font-size:20px;font-weight:700;color:var(--mut)">'+S.ty.t.toFixed(2)+'%</div></div>';
    h+='<div style="text-align:right"><div class="ml2">GAP</div><div class="num '+gcl+'" style="font-size:20px;font-weight:700">'+(gap>0?"+":"")+gap+'bp</div></div>';
    h+='</div><div class="ml2" style="margin-top:4px">'+gtx+'</div></div>';
    h+='<div class="card"><div class="ml">MODEL STACK — 정희강 · Python</div>';
    h+='<table style="margin-top:3px"><tbody>';
    h+='<tr><td>KR GDP 나우캐스팅</td><td class="m">ECOS</td><td class="r num">MAE 0.21%p</td><td class="pd g">ACTIVE</td></tr>';
    h+='<tr><td>US GDP 나우캐스팅</td><td class="m">FRED</td><td class="r num">MAE 0.26%p</td><td class="pd g">ACTIVE</td></tr>';
    h+='<tr><td>관성 테일러룰 (BOK)</td><td class="m">ECOS</td><td class="r num">MAE 0.18%p</td><td class="pd g">ACTIVE</td></tr>';
    h+='<tr><td>Scenario Engine</td><td class="m">—</td><td class="r pd">PENDING</td><td class="pd a">BUILD</td></tr>';
    h+='</tbody></table>';
    h+='<div class="ml2" style="margin-top:4px">MAE는 샘플값 · 실측치 및 검증 구간 수신 후 교체 · 산출물은 스냅샷 JSON으로 고정</div></div>';
    h+='</div>';
  }
  if(curTab==="RATES"){
    h+='<div style="display:flex;justify-content:space-between;align-items:baseline">';
    h+='<div class="ml">DECISION LOG — 판단 이력 및 벤치마크 대비 성과</div>';
    h+='<div class="ml2">BM = 국고 3년 · 미확정 구간은 PENDING · 행 클릭 시 해당 스냅샷으로 이동</div></div>';
    h+='<table style="margin-top:4px"><thead><tr><th>발신일</th><th>판단</th><th>근거 요약</th>'+
       '<th class="r">D+5</th><th class="r">D+20</th><th class="r">D+60</th><th class="r">BM 대비</th><th>상태</th></tr></thead><tbody>';
    for(var i=0;i<LOG.length;i++){
      var r=LOG[i],hl=(r[0]===S.d)?' class="hl"':'';
      h+='<tr'+hl+' data-row="'+i+'" style="cursor:pointer"><td class="num">'+r[0]+'</td><td>'+r[1]+'</td><td class="m">'+r[2]+'</td>';
      for(var j=3;j<7;j++){
        var v=r[j];
        if(v==="PENDING"){h+='<td class="r pd">PENDING</td>';}
        else{h+='<td class="r num '+(parseFloat(v)>=0?"g":"rr")+'">'+v+'%'+(j===6?"p":"")+'</td>';}
      }
      h+='<td class="pd '+(r[7]==="CLOSED"?"m":"a")+'">'+r[7]+'</td></tr>';
    }
    h+='</tbody></table>';
    h+='<div class="ml2" style="margin-top:6px">적중률(hit ratio)은 표본 3~5건으로 통계적 의미가 없어 사용하지 않음 · 판단 로그로 포지셔닝</div>';
    h+='<div class="ml2" style="margin-top:2px;color:#3E4756">판단 건수 · 당시 근거 · 크레딧 스프레드 조달 경로 = 정훈 회신 대기</div>';
  }
  if(curTab==="EQUITY"){
    var f=S.fs;
    h+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:9px">';
    h+='<div><div class="ml">IPO MARKET REPORT — 코스닥 청약 선별</div>';
    h+='<table style="margin-top:4px"><thead><tr><th>종목</th><th class="r">수요예측</th><th class="r">공모규모</th><th class="r">FSCORE</th><th>판단</th></tr></thead><tbody>';
    var rows=[["C로보틱스","1,204:1","480억",f.sc],["D바이오","318:1","220억",Math.max(f.sc-2,0)],
      ["E머티리얼","874:1","310억",Math.max(f.sc-1,0)],["F테크","1,512:1","150억",f.sc],
      ["G에너지","206:1","640억",Math.max(f.sc-3,0)]];
    for(var i=0;i<rows.length;i++){
      var sc2=rows[i][3],jd=sc2>=4?"참여":(sc2>=3?"조건부":"보류");
      var cl=sc2>=4?"g":(sc2>=3?"a":"rr");
      h+='<tr><td>'+rows[i][0]+'</td><td class="r num">'+rows[i][1]+'</td><td class="r num">'+rows[i][2]+
         '</td><td class="r num '+cl+'">'+sc2+' / 5</td><td class="pd '+cl+'">'+jd+'</td></tr>';
    }
    h+='</tbody></table>';
    h+='<div class="ml2" style="margin-top:5px">락업 해제 물량 10월 1,240억 · 의무보유 확약 28.4% · DART Open API</div></div>';
    h+='<div><div class="ml">CB ZERO FINDER — 리픽싱 하단 근접</div>';
    h+='<table style="margin-top:4px"><thead><tr><th>종목</th><th class="r">하단 대비</th><th class="r">청구 가능</th><th>상태</th></tr></thead><tbody>';
    h+='<tr><td>H에너지</td><td class="r num rr">-2.1%</td><td class="r num">480억</td><td class="pd rr">PUT RISK</td></tr>';
    h+='<tr><td>I소프트</td><td class="r num a">+3.4%</td><td class="r num">150억</td><td class="pd a">WATCH</td></tr>';
    h+='<tr><td>J반도체</td><td class="r num a">+6.2%</td><td class="r num">310억</td><td class="pd a">WATCH</td></tr>';
    h+='</tbody></table>';
    h+='<div class="card" style="margin-top:7px"><div style="display:flex;justify-content:space-between;align-items:baseline">';
    h+='<span class="ml">IPO FUNDAMENTAL SCORE · C로보틱스</span>';
    h+='<span class="num" style="font-size:15px;font-weight:700;color:'+(f.sc>=4?"var(--gr)":"var(--am)")+'">'+f.sc+' / 5</span></div>';
    for(var i=0;i<FSROWS.length;i++){
      var ok=f.rows[i]===1,val=FSROWS[i][2];
      if(i===3){val="8.2% < "+f.dl+"%";}
      if(i===4){val="11분기 ≥ "+f.rw+"분기";}
      h+='<div class="sc"><span class="mk">'+FSROWS[i][0]+'</span><span class="lb2">'+FSROWS[i][1]+
         '</span><span class="num">'+val+'</span><span class="p1 '+(ok?"y":"n")+'"></span></div>';
    }
    h+='<div class="ml2" style="margin-top:5px;line-height:1.55">크레딧 AA- 3Y = <span class="num" style="color:var(--am)">'+
       S.v.rat_credit.n+'bp</span> → DILUTION 임계 '+f.dl+'% · RUNWAY 임계 '+f.rw+'분기<br>'+
       '스프레드 확대 시 임계값이 강화되어 <b style="color:var(--fg)">같은 기업의 점수가 하락</b>합니다.</div>';
    h+='</div></div></div>';
  }
  p.innerHTML=h;
  if(curTab==="RATES"){
    var trs=p.querySelectorAll("tbody tr");
    for(var i=0;i<trs.length;i++){
      trs[i].addEventListener("click",function(){
        if(replaying){return;}
        var k=parseInt(this.getAttribute("data-row"),10);
        goSnap(k,true);
        select("sig_rates",{sweep:true});
      });
    }
  }
}
