"use strict";
var NW=142,NH=46,TW=158,TH=54;
var ND={
 mac_gdp:{x:18,y:46,l:'GDP NOWCAST',s:'KR 실질 · 나우캐스트',o:'정희강',d:'mac'},
 mac_uscpi:{x:182,y:16,l:'US CPI',s:'전년비',o:'정희강',d:'mac'},
 mac_krcpi:{x:182,y:78,l:'KR CPI MODEL',s:'자체 예측',o:'정희강',d:'mac'},
 mac_fed:{x:346,y:16,l:'FED PATH',s:'연내 누적 인하',o:'정희강',d:'mac'},
 mac_bok:{x:510,y:50,l:'BOK 기준금리',s:'테일러 적정',o:'정희강',d:'mac'},
 sig_macro:{x:846,y:42,l:'MACRO',o:'정희강',d:'mac',t:1},
 rat_ust:{x:346,y:146,l:'UST 10Y',s:'미국채 10년',o:'정훈',d:'rat'},
 rat_ktb:{x:510,y:146,l:'국고 3Y',s:'10Y',o:'정훈',d:'rat'},
 rat_curve:{x:674,y:146,l:'2s10s CURVE',s:'커브 기울기',o:'정훈',d:'rat'},
 rat_credit:{x:510,y:208,l:'CREDIT AA- 3Y',s:'크레딧 스프레드',o:'정훈',d:'rat'},
 sig_rates:{x:846,y:150,l:'RATES',o:'정훈',d:'rat',t:1},
 eq_fin:{x:346,y:290,l:'적자·차입 구조',s:'코스닥 IPO 모집단',o:'김유찬',d:'eq'},
 eq_val:{x:510,y:290,l:'코스닥 할인율',s:'밸류 민감도',o:'김유찬',d:'eq'},
 eq_cb:{x:674,y:276,l:'CB 조달 · PUT',s:'리픽싱 하단 접근',o:'김유찬',d:'eq'},
 eq_ipo:{x:674,y:330,l:'IPO DEMAND',s:'수요예측 경쟁률',o:'김유찬',d:'eq'},
 sig_equity:{x:846,y:292,l:'EQUITY',o:'김유찬',d:'eq',t:1}
};
var EG=[
 ['mac_gdp','mac_krcpi',.42],['mac_gdp','mac_bok',.30],['mac_uscpi','mac_fed',.71],
 ['mac_krcpi','mac_bok',.58],['mac_fed','mac_bok',.46],['mac_fed','sig_macro',.55],
 ['mac_bok','sig_macro',.68],['mac_fed','rat_ust',.74],['mac_bok','rat_ktb',.35],
 ['rat_ust','rat_ktb',.62],['rat_ktb','rat_curve',.58],['rat_ktb','rat_credit',.33],
 ['rat_curve','sig_rates',.66],['rat_credit','sig_rates',.40],['rat_ktb','eq_val',.57],
 ['rat_credit','eq_cb',.61,1],['eq_fin','eq_cb',.49],['eq_fin','eq_val',.28],
 ['eq_val','eq_ipo',.44],['eq_val','sig_equity',.38],['eq_cb','sig_equity',.52],
 ['eq_ipo','sig_equity',.57]
];
var FM={
 mac_gdp:function(v){return v.toFixed(2)+'%';},
 mac_uscpi:function(v){return v.toFixed(1)+'%';},
 mac_krcpi:function(v){return v.toFixed(1)+'%';},
 mac_fed:function(v){return '-'+Math.round(v)+'bp';},
 mac_bok:function(v){return v.toFixed(2)+'%';},
 rat_ust:function(v){return v.toFixed(2)+'%';},
 rat_ktb:function(v){return v.toFixed(2)+'%';},
 rat_curve:function(v){return (v>=0?'+':'')+Math.round(v)+'bp';},
 rat_credit:function(v){return Math.round(v)+'bp';},
 eq_fin:function(v){return Math.round(v)+'%';},
 eq_val:function(v){return v.toFixed(1)+'%';},
 eq_cb:function(v){return Math.round(v)+'곳';},
 eq_ipo:function(v){return Math.round(v)+':1';}
};
var SNAP=[
 {d:'2026-05-04',st:'ALERT',n:3,cf:{cf:0},v:{mac_gdp:1.62,mac_uscpi:3.4,mac_krcpi:2.6,mac_fed:25,mac_bok:2.75,rat_ust:4.62,rat_ktb:3.31,rat_curve:-6,rat_credit:71,eq_fin:66,eq_val:10.2,eq_cb:21,eq_ipo:402},
  x:{usg:1.48,tay:3.05,k10:3.25,fs:62},al:['mac_uscpi','rat_ust','rat_credit'],
  sg:{macro:['긴축 장기화',64,'인하 지연'],rates:['SHORT DURATION',81,'장기 축소 · 단기 확대'],equity:['청약 보류',73,'선별 강화']},
  bf:['US CPI 3.4% · 재가속','UST 4.62% → 국고 3.31% · 커브 -6bp 역전','장기채 축소 · IPO 청약 보류']},
 {d:'2026-06-15',st:'CAUTION',n:2,v:{mac_gdp:1.71,mac_uscpi:3.1,mac_krcpi:2.4,mac_fed:25,mac_bok:2.75,rat_ust:4.44,rat_ktb:3.18,rat_curve:9,rat_credit:66,eq_fin:64,eq_val:9.6,eq_cb:19,eq_ipo:448},
  x:{usg:1.66,tay:2.92,k10:3.27,fs:55},al:['mac_uscpi','rat_credit'],
  sg:{macro:['긴축 유지',68,'첫 인하 지연'],rates:['SHORT DURATION',78,'장기 축소 · 단기 확대'],equity:['조건부 청약',70,'선별 강화']},
  bf:['US CPI 3.1% · 둔화 시작','UST 4.44% → 국고 3.18% · 커브 +9bp 정상화','장기채 축소 유지 · 조건부 청약']},
 {d:'2026-07-27',st:'CAUTION',n:2,v:{mac_gdp:1.83,mac_uscpi:2.9,mac_krcpi:2.3,mac_fed:50,mac_bok:2.50,rat_ust:4.29,rat_ktb:3.06,rat_curve:22,rat_credit:60,eq_fin:63,eq_val:9.0,eq_cb:17,eq_ipo:503},
  x:{usg:1.94,tay:2.61,k10:3.28,fs:47},al:['rat_credit','eq_fin'],
  sg:{macro:['완화 전환 임박',74,'연내 -50bp'],rates:['SHORT DURATION',77,'장기 축소 · 단기 확대'],equity:['조건부 청약',72,'선별 유지']},
  bf:['US CPI 2.9% · 둔화 확인','UST 4.29% → 국고 3.06% · 커브 +22bp 스티프닝','단기 확대 · 조건부 청약']},
 {d:'2026-08-17',st:'CAUTION',n:2,cfl:1,v:{mac_gdp:1.88,mac_uscpi:2.9,mac_krcpi:2.2,mac_fed:50,mac_bok:2.50,rat_ust:4.34,rat_ktb:3.11,rat_curve:17,rat_credit:64,eq_fin:62,eq_val:9.2,eq_cb:18,eq_ipo:488},
  x:{usg:2.08,tay:2.44,k10:3.28,fs:51},al:['rat_credit','eq_fin'],
  sg:{macro:['인하 사이클 진입',76,'연내 -50bp'],rates:['SHORT DURATION',75,'장기 축소 · 단기 확대'],equity:['조건부 청약',69,'선별 유지']},
  bf:['US CPI 2.9% · 정체','UST 4.34% 되돌림 · 크레딧 64bp 재확대','완화 기대 vs 듀레이션 방어 · 논리 충돌']},
 {d:'2026-09-30',st:'CAUTION',n:2,v:{mac_gdp:1.94,mac_uscpi:2.8,mac_krcpi:2.1,mac_fed:50,mac_bok:2.25,rat_ust:4.18,rat_ktb:2.94,rat_credit:52,rat_curve:38,eq_fin:61,eq_val:8.4,eq_cb:14,eq_ipo:566},
  x:{usg:2.25,tay:2.18,k10:3.32,fs:43},al:['rat_credit','eq_fin'],
  sg:{macro:['인하 사이클 진입',79,'연내 -50bp'],rates:['SHORT DURATION',82,'장기 축소 · 단기 확대'],equity:['선별 청약',74,'조건부 참여']},
  bf:['US CPI 2.8% · 둔화 확인','UST 4.18% → 국고 2.94% · 커브 +38bp 스티프닝','채권 단기 확대 · IPO 선별 청약']}
];
var AV={
 mac_gdp:'ECOS·FRED 실시간 반영. 산출갭이 테일러룰 적정금리에 직접 투입됩니다.',
 mac_uscpi:'헤드라인 둔화. 서비스 물가 경직성은 잔존하나 방향은 하향입니다.',
 mac_krcpi:'자체 예측 모델 기준 목표 상단 내 안착. MAE 0.21%p 구간.',
 mac_fed:'연내 누적 50bp 인하 경로. 점도표와 시장 기대 간 괴리 축소 중입니다.',
 mac_bok:'실제금리가 테일러 적정금리를 하회. 추가 인하 여력이 제한적입니다.',
 rat_ust:'글로벌 듀레이션 기준점. 국고 전이계수 0.62.',
 rat_ktb:'단기 구간 강세 우위. 장기 구간은 수급 부담이 남아 있습니다.',
 rat_curve:'스티프닝 진행. 단기 확대·장기 축소 포지션의 직접 근거입니다.',
 rat_credit:'우량 등급 스프레드 축소. 코스닥 CB 조달 조건 완화로 전이됩니다.',
 eq_fin:'코스닥 IPO 모집단의 적자·차입 비중. 듀레이션이 가장 긴 자산군입니다.',
 eq_val:'무위험금리 변화가 할인율에 직결. 장기 현금흐름 자산에 증폭 반영됩니다.',
 eq_cb:'리픽싱 하단 접근 종목. 크레딧 확대 시 조기상환 청구 위험이 상승합니다.',
 eq_ipo:'수요예측 경쟁률 회복. 다만 의무보유확약 비율은 개선이 더딥니다.',
 sig_macro:'금리 경로 전망. 정희강 Quant Engine 산출.',
 sig_rates:'듀레이션 포지션 판단. 정훈 Fixed Income 룰 기반.',
 sig_equity:'IPO 청약 선별 판단. 재무 스코어 + 크레딧 연동 임계값.'
};
var $=function(i){return document.getElementById(i);};
var SV=document.getElementById('chain'),NS='http://www.w3.org/2000/svg';
var si=4,cur=SNAP[4],V={},SH={ust:0,cr:0,bok:0},sel=null,curTab='RATES',busy=false,LOG=[];

function ce(t,a){var e=document.createElementNS(NS,t);for(var k in a){e.setAttribute(k,a[k]);}return e;}
function W(id){return ND[id].t?TW:NW;}
function H(id){return ND[id].t?TH:NH;}
function pathD(a,b){
  var A=ND[a],B=ND[b];
  var ax=A.x+W(a),ay=A.y+H(a)/2,bx=B.x,by=B.y+H(b)/2;
  if(bx-ax<40){
    if(Math.abs(ay-by)<24){return 'M'+ax+','+ay+'L'+bx+','+by;}
    var sx=A.x+W(a)/2,sy=A.y+H(a),ex=B.x+W(b)/2,ey=B.y,m=(sy+ey)/2;
    return 'M'+sx+','+sy+'C'+sx+','+m+' '+ex+','+m+' '+ex+','+ey;
  }
  var dx=Math.max(40,(bx-ax)*0.52);
  return 'M'+ax+','+ay+'C'+(ax+dx)+','+ay+' '+(bx-dx)+','+by+' '+bx+','+by;
}

/* ---------- BUILD SVG ---------- */
var defs=ce('defs',{});
defs.innerHTML='<marker id="ar" markerWidth="7" markerHeight="7" refX="6.2" refY="3.5" orient="auto"><path d="M0,0.8 L6,3.5 L0,6.2" fill="none" stroke="#2A3542" stroke-width="1.1"/></marker>';
SV.appendChild(defs);
var LANES=[[6,132,'MACRO · 정희강'],[138,268,'RATES · 정훈'],[274,398,'EQUITY · 김유찬']];
for(var i=0;i<LANES.length;i++){
  if(i>0){SV.appendChild(ce('line',{x1:6,y1:LANES[i][0]-4,x2:1014,y2:LANES[i][0]-4,'class':'lane'}));}
  var tx=ce('text',{x:10,y:LANES[i][0]+9,'class':'lnm'});tx.textContent=LANES[i][2];SV.appendChild(tx);
}
var gE=ce('g',{});SV.appendChild(gE);
var gN=ce('g',{});SV.appendChild(gN);
var gP=ce('g',{});SV.appendChild(gP);
var EL=[];
for(var i=0;i<EG.length;i++){
  var e=EG[i],d=pathD(e[0],e[1]);
  var g=ce('g',{'class':'eg'+(e[3]?' star':'')});
  var k=0.82+((i*37)%50)/100;
  g.style.setProperty('--da',(13.4*k).toFixed(2)+'s');
  g.style.setProperty('--db',(21.0*k).toFixed(2)+'s');
  var p0=ce('path',{d:d,'class':'ebase','marker-end':'url(#ar)'});
  var p1=ce('path',{d:d,'class':'efB'});
  var p2=ce('path',{d:d,'class':'efA'});
  p1.style.animationDelay=(-(i*1.7)).toFixed(1)+'s';
  p2.style.animationDelay=(-(i*1.1)).toFixed(1)+'s';
  if(e[2]>=.55){p1.setAttribute('stroke-width','1.9');}
  g.appendChild(p0);g.appendChild(p1);g.appendChild(p2);
  gE.appendChild(g);EL.push({g:g,p:p0,a:e[0],b:e[1],w:e[2]});
}
var SHL=ce('path',{'class':'shl',d:'M925,204 C965,216 965,246 925,258'});gE.appendChild(SHL);
var SHT=ce('text',{x:972,y:234,'class':'shtx','text-anchor':'middle'});SHT.textContent='SHARED';
var SHT2=ce('text',{x:972,y:244,'class':'shtx','text-anchor':'middle'});SHT2.textContent='DURATION';
gE.appendChild(SHT);gE.appendChild(SHT2);

var NEL={};
for(var id in ND){
  var n=ND[id],w=W(id),h=H(id);
  var g=ce('g',{'class':'nd','data-id':id});
  if(n.t){
    g.appendChild(ce('rect',{x:n.x,y:n.y,width:w,height:h,rx:2,'class':'tsx'}));
    var l1=ce('text',{x:n.x+10,y:n.y+13,'class':'tsl'});l1.textContent='SIGNAL · '+n.l;
    var l2=ce('text',{x:n.x+10,y:n.y+29,'class':'tsv'});l2.setAttribute('fill','#E6EBF3');
    var l3=ce('text',{x:n.x+10,y:n.y+41,'class':'nsb'});
    var l4=ce('text',{x:n.x+w-10,y:n.y+13,'class':'tst','text-anchor':'end'});l4.textContent='STANDBY';
    var bg=ce('rect',{x:n.x+10,y:n.y+46,width:w-20,height:2.4,rx:1,fill:'#1A2husk'});
    bg.setAttribute('fill','#1A222D');
    var bf=ce('rect',{x:n.x+10,y:n.y+46,width:0,height:2.4,rx:1,fill:'#3FD9E6'});
    g.appendChild(l1);g.appendChild(l2);g.appendChild(l3);g.appendChild(l4);g.appendChild(bg);g.appendChild(bf);
    NEL[id]={g:g,v:l2,s:l3,st:l4,bf:bf};
  }else{
    g.appendChild(ce('rect',{x:n.x,y:n.y,width:w,height:h,rx:2,'class':'nbx'}));
    var lb=ce('text',{x:n.x+9,y:n.y+13,'class':'nlb'});lb.textContent=n.l;
    var vl=ce('text',{x:n.x+9,y:n.y+32,'class':'nvl'});
    var sb=ce('text',{x:n.x+w-9,y:n.y+32,'class':'nsb','text-anchor':'end'});
    var ow=ce('text',{x:n.x+9,y:n.y+42,'class':'nown'});ow.textContent=n.o.toUpperCase();
    g.appendChild(lb);g.appendChild(vl);g.appendChild(sb);g.appendChild(ow);
    NEL[id]={g:g,v:vl,s:sb};
  }
  var bk=ce('path',{'class':'brk',d:'M'+(n.x-2)+','+(n.y+9)+'L'+(n.x-2)+','+(n.y-2)+'L'+(n.x+9)+','+(n.y-2)+
    'M'+(n.x+w-9)+','+(n.y-2)+'L'+(n.x+w+2)+','+(n.y-2)+'L'+(n.x+w+2)+','+(n.y+9)+
    'M'+(n.x+w+2)+','+(n.y+h-9)+'L'+(n.x+w+2)+','+(n.y+h+2)+'L'+(n.x+w-9)+','+(n.y+h+2)+
    'M'+(n.x+9)+','+(n.y+h+2)+'L'+(n.x-2)+','+(n.y+h+2)+'L'+(n.x-2)+','+(n.y+h-9)});
  g.appendChild(bk);
  gN.appendChild(g);
  (function(id){
    g.addEventListener('click',function(){pick(id,true);});
    g.addEventListener('mouseenter',function(){
      $('hud2').textContent='TARGET · '+id.toUpperCase()+' · '+ND[id].o;
    });
    g.addEventListener('mouseleave',function(){
      $('hud2').textContent=sel?('ACQUIRED · '+sel.toUpperCase()):'NO OBJECT ACQUIRED';
    });
  })(id);
}
$('cw').addEventListener('mousemove',function(e){
  var r=this.getBoundingClientRect();
  $('hud').textContent='CURSOR X '+String(Math.round(e.clientX-r.left)).padStart(4,'0')+' · Y '+String(Math.round(e.clientY-r.top)).padStart(4,'0');
});

/* ---------- CANVAS FIELD ---------- */
var cv=$('df'),cx=cv.getContext('2d'),PT=[],RP=[],dpr=Math.min(window.devicePixelRatio||1,1.75),CW=0,CH=0;
function rs(){
  var r=cv.getBoundingClientRect();CW=r.width;CH=r.height;
  cv.width=CW*dpr;cv.height=CH*dpr;cx.setTransform(dpr,0,0,dpr,0,0);
  if(!PT.length){
    var n=Math.min(130,Math.round(CW*CH/11000));
    for(var i=0;i<n;i++){PT.push({x:Math.random()*CW,y:Math.random()*CH,vx:(Math.random()-.5)*.09,vy:(Math.random()-.5)*.07,r:Math.random()*1.1+.35,a:Math.random()*.2+.05,hv:0});}
  }
}
var sw=-260,last=0;
function draw(ts){
  requestAnimationFrame(draw);
  if(document.hidden)return;
  if(ts-last<32)return;last=ts;
  cx.clearRect(0,0,CW,CH);
  cx.strokeStyle='rgba(255,255,255,0.012)';cx.lineWidth=1;
  for(var gx=0;gx<CW;gx+=54){cx.beginPath();cx.moveTo(gx,0);cx.lineTo(gx,CH);cx.stroke();}
  for(var gy=0;gy<CH;gy+=54){cx.beginPath();cx.moveTo(0,gy);cx.lineTo(CW,gy);cx.stroke();}
  sw+=0.34;if(sw>CW+300)sw=-300;
  cx.fillStyle='rgba(63,217,230,0.014)';cx.fillRect(sw,0,190,CH);
  for(var i=RP.length-1;i>=0;i--){
    var r=RP[i];r.t+=0.02;
    if(r.t>=1){RP.splice(i,1);continue;}
    cx.beginPath();cx.arc(r.x,r.y,r.t*170,0,6.2832);
    cx.strokeStyle='rgba(63,217,230,'+(0.14*(1-r.t))+')';cx.lineWidth=1.1;cx.stroke();
  }
  for(var i=0;i<PT.length;i++){
    var p=PT[i];p.x+=p.vx;p.y+=p.vy;
    if(p.x<0)p.x=CW;if(p.x>CW)p.x=0;if(p.y<0)p.y=CH;if(p.y>CH)p.y=0;
    for(var j=0;j<RP.length;j++){
      var r=RP[j],dx=p.x-r.x,dy=p.y-r.y,ds=Math.sqrt(dx*dx+dy*dy),rad=r.t*170;
      if(Math.abs(ds-rad)<34){p.x+=dx/(ds+1)*1.5;p.y+=dy/(ds+1)*1.5;p.hv=1;}
    }
    if(p.hv>0)p.hv-=0.011;
    cx.beginPath();cx.arc(p.x,p.y,p.r,0,6.2832);
    cx.fillStyle=p.hv>0?'rgba(63,217,230,'+(p.a+p.hv*.5)+')':'rgba(150,170,200,'+p.a+')';
    cx.fill();
  }
}
function ripple(id){
  var n=ND[id],r=$('cw').getBoundingClientRect(),vb=1020,sc=Math.min(r.width/1020,r.height/400);
  var ox=(r.width-1020*sc)/2,oy=(r.height-400*sc)/2;
  RP.push({x:ox+(n.x+W(id)/2)*sc,y:oy+(n.y+H(id)/2)*sc,t:0});
  if(RP.length>4)RP.shift();
}

/* ---------- GRAPH LOGIC ---------- */
function ups(id){var r=[];for(var i=0;i<EG.length;i++){if(EG[i][1]===id)r.push({id:EG[i][0],w:EG[i][2]});}r.sort(function(a,b){return b.w-a.w;});return r;}
function chain(id){
  var up={},dn={},q=[id];
  while(q.length){var c=q.pop();for(var i=0;i<EG.length;i++){if(EG[i][1]===c&&!up[EG[i][0]]){up[EG[i][0]]=1;q.push(EG[i][0]);}}}
  q=[id];
  while(q.length){var c=q.pop();for(var i=0;i<EG.length;i++){if(EG[i][0]===c&&!dn[EG[i][1]]){dn[EG[i][1]]=1;q.push(EG[i][1]);}}}
  var s={};s[id]=1;for(var k in up)s[k]=1;for(var k in dn)s[k]=1;
  return s;
}
var tmr=[];
function clearT(){for(var i=0;i<tmr.length;i++)clearTimeout(tmr[i]);tmr=[];}
function T(f,ms){tmr.push(setTimeout(f,ms));}
function cool(){
  for(var i=0;i<EL.length;i++)EL[i].g.classList.remove('hot','dn');
  for(var id in NEL)NEL[id].g.classList.remove('rel');
  SV.classList.remove('fc');SHL.classList.remove('on');SHT.classList.remove('on');SHT2.classList.remove('on');
}
function packet(el){
  var len=el.p.getTotalLength(),c=ce('circle',{r:2.6,'class':'pk'});
  gP.appendChild(c);var t0=performance.now(),dur=820;
  function st(t){
    var k=Math.min(1,(t-t0)/dur),pt=el.p.getPointAtLength(len*k);
    c.setAttribute('cx',pt.x);c.setAttribute('cy',pt.y);c.setAttribute('opacity',k<.1?k*10:(k>.85?(1-k)/.15:1));
    if(k<1)requestAnimationFrame(st);else if(c.parentNode)gP.removeChild(c);
  }
  requestAnimationFrame(st);
}
function litOrder(set){
  var a=[];for(var k in set)a.push(k);
  a.sort(function(x,y){return (ND[x].x-ND[y].x)||(ND[x].y-ND[y].y);});
  return a;
}
function pick(id,user){
  clearT();cool();sel=id;
  SV.classList.add('fc');
  for(var i in NEL)NEL[i].g.classList.remove('on');
  NEL[id].g.classList.add('on');
  var set=chain(id),ord=litOrder(set);
  $('hud2').textContent='ACQUIRED · '+id.toUpperCase()+' · '+Object.keys(set).length+' LINKED';
  for(var i=0;i<ord.length;i++){
    (function(n,k){T(function(){NEL[n].g.classList.add('rel');ripple(n);},k*120);})(ord[i],i);
  }
  for(var i=0;i<EL.length;i++){
    if(set[EL[i].a]&&set[EL[i].b]){
      (function(el,k){T(function(){el.g.classList.add('rel','hot');if(k<3)packet(el);T(function(){el.g.classList.remove('hot');},2100);},k*120+90);})(EL[i],i%ord.length);
    }
  }
  if(set.sig_rates&&set.sig_equity){T(function(){SHL.classList.add('on');SHT.classList.add('on');SHT2.classList.add('on');},ord.length*120);}
  inspector(id);
  if(user){
    var d=ND[id].d,tb=d==='mac'?'MACRO':d==='rat'?'RATES':'EQUITY';
    T(function(){tab(tb,id);},170);
  }
}
