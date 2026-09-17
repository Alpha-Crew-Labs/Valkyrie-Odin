/* ---------- SHOCK ENGINE ---------- */
function calc(){
  var b=cur.v,o={};
  var dust=SH.ust,dbok=SH.bok,dcr=SH.cr;
  var dktb=0.62*dust+0.35*dbok;
  var dcurve=0.30*dust-0.55*dbok;
  var dcrT=dcr+0.18*dust;
  var dval=0.014*dktb+0.010*dcrT;
  var dcb=0.14*dcrT+0.05*dktb;
  var dipo=-(0.42*dktb+0.55*dcrT);
  o.mac_gdp=b.mac_gdp;o.mac_uscpi=b.mac_uscpi;o.mac_krcpi=b.mac_krcpi;o.mac_fed=b.mac_fed;
  o.mac_bok=b.mac_bok+dbok/100;
  o.rat_ust=b.rat_ust+dust/100;
  o.rat_ktb=b.rat_ktb+dktb/100;
  o.rat_curve=b.rat_curve+dcurve;
  o.rat_credit=b.rat_credit+dcrT;
  o.eq_fin=b.eq_fin;
  o.eq_val=b.eq_val+dval;
  o.eq_cb=b.eq_cb+dcb;
  o.eq_ipo=b.eq_ipo+dipo;
  return o;
}
function shocked(){return SH.ust||SH.cr||SH.bok;}

/* ---------- RENDER VALUES ---------- */
var TW_=null;
function tween(target,ms){
  if(TW_)cancelAnimationFrame(TW_);
  var from={};for(var k in V)from[k]=V[k];
  var t0=performance.now();
  function st(t){
    var k=Math.min(1,(t-t0)/ms),e=1-Math.pow(1-k,3);
    for(var id in target){
      var val=(from[id]===undefined?target[id]:from[id])+(target[id]-(from[id]===undefined?target[id]:from[id]))*e;
      V[id]=val;if(NEL[id])NEL[id].v.textContent=FM[id](val);
    }
    if(k<1)TW_=requestAnimationFrame(st);else{for(var id in target)V[id]=target[id];TW_=null;paneRender();}
  }
  TW_=requestAnimationFrame(st);
}
function subs(){
  NEL.mac_gdp.s.textContent='US '+cur.x.usg.toFixed(2)+'%';
  NEL.mac_bok.s.textContent='적정 '+cur.x.tay.toFixed(2)+'%';
  NEL.rat_ktb.s.textContent='10Y '+(cur.x.k10+(SH.ust*0.52+SH.bok*0.2)/100).toFixed(2)+'%';
  NEL.mac_uscpi.s.textContent='전년비';
  NEL.mac_krcpi.s.textContent='자체 예측';
  NEL.mac_fed.s.textContent='연내 누적';
  NEL.rat_ust.s.textContent='미국채 10년';
  NEL.rat_curve.s.textContent='커브';
  NEL.rat_credit.s.textContent='스프레드';
  NEL.eq_fin.s.textContent='코스닥 IPO';
  NEL.eq_val.s.textContent='밸류 민감도';
  NEL.eq_cb.s.textContent='리픽싱 하단';
  NEL.eq_ipo.s.textContent='수요예측';
}
function sigs(){
  var g=cur.sg,st=shocked();
  var m=[['sig_macro',g.macro],['sig_rates',g.rates],['sig_equity',g.equity]];
  for(var i=0;i<m.length;i++){
    var id=m[i][0],d=m[i][1],e=NEL[id];
    var cf=d[1]+(st?(id==='sig_rates'?6:-5):0);
    cf=Math.max(40,Math.min(94,cf));
    e.v.textContent=d[0];e.s.textContent=d[2]+' · CONF '+cf+'%';
    e.v.setAttribute('fill',id==='sig_rates'?'#EFA83A':(id==='sig_equity'?(d[0].indexOf('보류')>=0?'#EF5A61':'#3FD9E6'):'#E6EBF3'));
    e.bf.setAttribute('width',(TW-20)*cf/100);
    e.st.textContent='LOCKED';
  }
}
function alerts(){
  for(var id in NEL)NEL[id].g.classList.remove('al');
  var a=cur.al;for(var i=0;i<a.length;i++){if(NEL[a[i]])NEL[a[i]].g.classList.add('al');}
  if(shocked()){NEL.rat_credit.g.classList.add('al');NEL.eq_cb.g.classList.add('al');NEL.rat_ust.g.classList.add('al');}
  var n=cur.n+(shocked()?2:0),st=n>=3?'ALERT':'CAUTION';
  $('mst').innerHTML='<i class="dot'+(n>=3?' a':'')+'"></i><span>'+st+'</span><span class="ml2 num" style="color:#49525F">'+n+' ALERT</span>';
  $('mstn')&&0;
  $('cfb').classList.toggle('on',!!cur.cfl);
}
function brief(){
  var b=cur.bf;
  if(shocked()){
    var o=calc();
    b=['SHOCK 주입 · UST +'+SH.ust+'bp · CREDIT +'+SH.cr+'bp · BOK +'+SH.bok+'bp',
       '국고 '+o.rat_ktb.toFixed(2)+'% (+'+(0.62*SH.ust+0.35*SH.bok).toFixed(0)+'bp) · 크레딧 '+Math.round(o.rat_credit)+'bp',
       '장기 듀레이션 축소 강화 · IPO 청약 보류 전환'];
  }
  var a=['bf1','bf2','bf3'];
  for(var i=0;i<3;i++){var e=$(a[i]);e.textContent=b[i];e.classList.remove('rv');void e.offsetWidth;e.classList.add('rv');}
}
function apply(ms){
  tween(calc(),ms||480);subs();sigs();alerts();brief();
  $('snl').textContent=cur.d;$('asof').textContent=si===4?'PUBLIC DATA CONNECTING':(cur.d+' · REPLAY');
  var tk=document.querySelectorAll('.tk');
  for(var i=0;i<tk.length;i++)tk[i].classList.toggle('on',i===si);
}

/* ---------- INSPECTOR (inside pane) ---------- */
var INS={id:null};
function inspector(id){INS.id=id;paneRender();}
function evid(id){
  var u=ups(id),r=[];
  for(var i=0;i<u.length&&i<3;i++){
    var n=u[i].id;
    r.push([ND[n].l,V[n]!==undefined?FM[n](V[n]):'—',u[i].w>=.55?'HIGH':(u[i].w>=.4?'MED':'LOW')]);
  }
  if(!r.length)r.push([ND[id].s||'원천 데이터',V[id]!==undefined?FM[id](V[id]):'—','SRC']);
  r.push(['담당 · 도메인',ND[id].o+' · '+(ND[id].d==='mac'?'MACRO':ND[id].d==='rat'?'RATES':'EQUITY'),'—']);
  return r;
}
function insHTML(){
  var id=INS.id;
  if(!id){return '<div class="cd"><div class="cdh"><span class="cdt">선택 객체 분석</span><span class="cdo">OBJECT</span></div>'+ '<div class="ml2" style="color:#49525F;line-height:1.7;margin-top:6px">상단 체인에서 객체를 선택하면<br>근거 · 신뢰도 · 담당 분석이 표시됩니다.<br><br>관계는 사전 정의된 온톨로지이며<br>값과 상태만 데이터로 갱신됩니다.</div></div>';}
  var n=ND[id],ev=evid(id),cf=Math.round(52+(n.x/1020)*32+(shocked()?-6:0));
  var h='<div class="cd" style="flex:0 0 auto"><div class="cdh"><span class="cdt">선택 객체 분석</span><span class="cdo">'+id.toUpperCase()+'</span></div>';
  h+='<div class="ml" style="color:#5D6675">'+n.l+'</div>';
  h+='<div class="big rv" style="margin-top:3px">'+(V[id]!==undefined?FM[id](V[id]):(NEL[id]?NEL[id].v.textContent:'—'))+'</div>';
  h+='<div class="ml2" style="margin-top:2px;color:#49525F">'+(n.s||'최종 판단')+' · '+n.o+'</div></div>';
  h+='<div class="cd" style="flex:1 1 auto"><div class="cdh"><span class="cdt">근거 EVIDENCE</span><span class="cdo">'+ev.length+' ITEMS</span></div>';
  for(var i=0;i<ev.length;i++){
    h+='<div class="evr mo" style="animation-delay:'+(i*70)+'ms"><span><span class="idx">0'+(i+1)+'</span> '+ev[i][0]+'</span><span class="vv">'+ev[i][1]+'</span><span class="ii'+(ev[i][2]==='HIGH'?' h':'')+'">'+ev[i][2]+'</span></div>';
  }
  h+='<div class="note" style="margin-top:7px">'+AV[id]+'</div></div>';
  h+='<div class="cd" style="flex:0 0 auto"><div class="kv"><span>CONFIDENCE</span><b class="cy">'+cf+'%</b></div><div class="bar"><i style="width:'+cf+'%"></i></div>';
  h+='<div class="kv" style="margin-top:5px"><span>DATA VINTAGE</span><b style="font-size:9.6px;color:'+(si===4?'#EFA83A':'#8C7BF7')+';letter-spacing:.08em">'+(si===4?'LATEST · REVISION-ADJ':'REPLAY · REVISION-ADJ')+'</b></div>';
  h+='<div class="note">공표시점 = 분기말 +2개월 가정 · 실전 적용 시 PIT 데이터 필요</div></div>';
  return h;
}

/* ---------- PANES ---------- */
function fs(credit){
  var dl=credit<=55?10:(credit<=65?9:8),rw=credit<=55?8:(credit<=65?9:10);
  return {dl:dl,rw:rw};
}
function paneRender(){
  var p=$('pane'),o=calc(),h='';
  var cr=Math.round(o.rat_credit),F=fs(cr);
  if(curTab==='MACRO'){
    h+='<div class="g4" style="grid-template-columns:1.25fr 1fr 1fr 1fr 1.05fr">';
    h+='<div class="cd" id="cd_sc"><div class="cdh"><span class="cdt">SCENARIO MATRIX</span><span class="cdo">정희강 · Quant</span></div>'+ '<table class="tb"><thead><tr><th>구분</th><th class="n">KR CPI</th><th class="n">첫 인하</th><th class="n">연말 기준</th></tr></thead><tbody>'+ '<tr><td style="color:#E6EBF3">BASE</td><td class="n">'+o.mac_krcpi.toFixed(1)+'%</td><td class="n">26.11</td><td class="n">'+o.mac_bok.toFixed(2)+'%</td></tr>'+ '<tr><td>HAWKISH</td><td class="n" colspan="3" style="text-align:right"><span class="pd">PENDING</span></td></tr>'+ '<tr><td>DOVISH</td><td class="n" colspan="3" style="text-align:right"><span class="pd">PENDING</span></td></tr>'+ '</tbody></table><div class="note">시나리오 2종은 정성 요소 포함 · <b>정희강 구현 예정</b>. 미산출 항목은 값을 채우지 않고 PENDING으로 표기합니다.</div></div>';
    h+='<div class="cd"><div class="cdh"><span class="cdt">TAYLOR RULE GAP</span><span class="cdo">관성 테일러룰</span></div>'+ '<div class="kv"><span>실제 기준금리</span><b>'+o.mac_bok.toFixed(2)+'%</b></div>'+ '<div class="kv"><span>적정금리 추정</span><b class="cy">'+cur.x.tay.toFixed(2)+'%</b></div>'+ '<div class="kv"><span>GAP</span><b class="'+((o.mac_bok-cur.x.tay)>=0?'am':'gr')+'">'+((o.mac_bok-cur.x.tay)>=0?'+':'')+Math.round((o.mac_bok-cur.x.tay)*100)+'bp</b></div>'+ '<div class="bar"><i class="'+((o.mac_bok-cur.x.tay)>=0?'am':'')+'" style="width:'+Math.min(100,Math.abs((o.mac_bok-cur.x.tay)*100)*1.8+18)+'%"></i></div>'+ '<div class="note">GAP&gt;0 = 실제금리가 적정보다 높음 → <b>인하 여력</b>. 5월 +30bp에서 현재 '+Math.round((o.mac_bok-cur.x.tay)*100)+'bp로 축소.</div></div>';
    h+='<div class="cd"><div class="cdh"><span class="cdt">GDP NOWCAST</span><span class="cdo">ECOS · FRED</span></div>'+ '<div class="kv"><span>KR 실질성장</span><b>'+o.mac_gdp.toFixed(2)+'%</b></div>'+ '<div class="kv"><span>US 실질성장</span><b>'+cur.x.usg.toFixed(2)+'%</b></div>'+ '<div class="kv"><span>산출갭 기여</span><b class="cy">테일러룰 투입</b></div>'+ '<div class="cdh" style="margin-top:8px"><span class="cdt">FINANCIAL STRESS</span><span class="cdo">0-100</span></div>'+ '<div class="big" style="color:'+(cur.x.fs>55?'#EFA83A':'#31C08C')+'">'+cur.x.fs+'</div>'+ '<div class="bar"><i class="'+(cur.x.fs>55?'am':'')+'" style="width:'+cur.x.fs+'%"></i></div>'+ '<div class="note">5월 62 → 현재 '+cur.x.fs+'. 스트레스 완화 국면.</div></div>';
    h+='<div class="cd"><div class="cdh"><span class="cdt">STRESS TEST · VaR</span><span class="cdo">1D 95%</span></div>'+ '<div class="kv"><span>포트폴리오 VaR</span><b class="rd">-0.82%</b></div>'+ '<div class="kv"><span>듀레이션 기여</span><b>-0.51%p</b></div>'+ '<div class="kv"><span>크레딧 기여</span><b>-0.24%p</b></div>'+ '<div class="kv"><span>주식 기여</span><b>-0.07%p</b></div>'+ '<div class="note">상단 SHOCK 칩을 누르면 동일 계수로 <b>체인 전체가 재계산</b>됩니다. 계수는 관계선에 부여된 전이계수(β)입니다.</div></div>';
    h+='<div class="cd"><div class="cdh"><span class="cdt">MODEL STACK</span><span class="cdo">M:\\ VALKYRIE PROJECT</span></div>'+ '<table class="tb"><thead><tr><th>모델</th><th>소스</th><th class="n">MAE</th><th class="n">상태</th></tr></thead><tbody>'+ '<tr><td>KR GDP Nowcast</td><td>ECOS</td><td class="n">0.21</td><td class="n up">OK</td></tr>'+ '<tr><td>US GDP Nowcast</td><td>FRED</td><td class="n">0.26</td><td class="n up">OK</td></tr>'+ '<tr><td>관성 Taylor Rule</td><td>ECOS</td><td class="n">0.18</td><td class="n up">OK</td></tr>'+ '<tr><td>Scenario Engine</td><td>—</td><td class="n">—</td><td class="n"><span class="pd">DEV</span></td></tr>'+ '</tbody></table><div class="note">MAE는 <b>샘플값</b> · 실측치와 검증 구간 수신 후 교체 예정.</div></div>';
    h+='</div>';
  }
  if(curTab==='RATES'){
    h+='<div class="g4" style="grid-template-columns:1.85fr 1fr 1fr 1.05fr">';
    h+='<div class="cd"><div class="cdh"><span class="cdt">판단 로그 DECISION LOG</span><span class="cdo">정훈 · 국고3Y 대비</span></div>'+ '<table class="tb"><thead><tr><th>발신일</th><th>판단</th><th>근거</th><th class="n">D+5</th><th class="n">D+20</th><th class="n">D+60</th><th class="n">BM 대비</th><th class="n">상태</th></tr></thead><tbody id="dlb">'+ row(0,'2026-05-04','장기채 축소 · 단기채 확대','CPI 서프라이즈 · 커브 역전','+0.21','+0.68','+1.42','+0.94','CLOSED')+ row(1,'2026-06-15','단기 구간 유지','인하 지연 · 크레딧 축소','+0.09','+0.31','+0.77','+0.42','CLOSED')+ row(2,'2026-07-27','스티프너 진입','첫 인하 가시화','+0.14','+0.46','','+0.38','OPEN')+ row(3,'2026-08-17','듀레이션 방어 유지','크레딧 재확대','-0.06','+0.12','','-0.04','OPEN')+ row(4,'2026-09-30','단기 확대 · 장기 축소','커브 +38bp 스티프닝','','','','','PENDING')+ '</tbody></table><div class="note">미도래 구간은 0이 아니라 공란 · 상태는 <b>PENDING</b>으로 표기합니다. 표본이 5건이므로 <b>적중률 지표는 사용하지 않습니다.</b></div></div>';
    h+='<div class="cd"><div class="cdh"><span class="cdt">CURVE</span><span class="cdo">국고</span></div>'+ '<div class="kv"><span>국고 3Y</span><b>'+o.rat_ktb.toFixed(2)+'%</b></div>'+ '<div class="kv"><span>국고 10Y</span><b>'+(cur.x.k10+(SH.ust*0.52+SH.bok*0.2)/100).toFixed(2)+'%</b></div>'+ '<div class="kv"><span>2s10s</span><b class="'+(o.rat_curve>=0?'gr':'rd')+'">'+(o.rat_curve>=0?'+':'')+Math.round(o.rat_curve)+'bp</b></div>'+ curveSVG(o)+ '<div class="note">5월 역전(-6bp) → 현재 '+(o.rat_curve>=0?'+':'')+Math.round(o.rat_curve)+'bp. <b>스티프닝이 단기 확대 판단의 직접 근거</b>입니다.</div></div>';
    h+='<div class="cd" id="cd_cr"><div class="cdh"><span class="cdt">CREDIT AA- 3Y</span><span class="cdo">회사채 스프레드</span></div>'+ '<div class="big" style="color:'+(cr>65?'#EF5A61':(cr>58?'#EFA83A':'#31C08C'))+'">'+cr+'bp</div>'+ '<div class="bar"><i class="'+(cr>65?'rd':(cr>58?'am':''))+'" style="width:'+Math.min(100,cr)+'%"></i></div>'+ '<div class="kv" style="margin-top:6px"><span>5월 대비</span><b class="'+(cr-71<0?'gr':'rd')+'">'+(cr-71>=0?'+':'')+(cr-71)+'bp</b></div>'+ '<div class="kv"><span>EQUITY 전이</span><b class="cy">β 0.61</b></div>'+ '<div class="note"><b>채권 → 주식으로 넘어가는 유일한 실제 경로</b>입니다. 스프레드 확대 시 코스닥 CB 조달 조건이 악화되고 IPO 재무 스코어 임계값이 강화됩니다.</div></div>';
    h+='<div class="cd"><div class="cdh"><span class="cdt">수신 대기 항목</span><span class="cdo">정훈 회신 필요</span></div>'+ '<div class="sc"><span class="mk">LOG</span><span>판단 로그 실제 건수</span><span class="vv">5건 가정</span><span class="p1 n"></span></div>'+ '<div class="sc"><span class="mk">EVID</span><span>5/4 판단 당시 근거 원문</span><span class="vv">추정</span><span class="p1 n"></span></div>'+ '<div class="sc"><span class="mk">DATA</span><span>크레딧 AA- 조달 경로</span><span class="vv">블벅 CSV</span><span class="p1 n"></span></div>'+ '<div class="sc"><span class="mk">ONTO</span><span>관계 22개 경제 논리 검수</span><span class="vv">대기</span><span class="p1 n"></span></div>'+ '<div class="note">위 4건이 확정되기 전까지 이 영역의 수치는 <b>샘플</b>입니다. 특히 크레딧 조달 경로가 막히면 <b>★ 관계가 죽습니다.</b></div></div>';
    h+='</div>';
  }
  if(curTab==='EQUITY'){
    h+='<div class="g4" style="grid-template-columns:1.25fr 1.25fr 1.35fr 1.05fr">';
    h+='<div class="cd" id="cd_ipo"><div class="cdh"><span class="cdt">IPO MARKET REPORT</span><span class="cdo">김유찬 · 운영중</span></div>'+ '<div class="kv"><span>수요예측 경쟁률</span><b>'+Math.round(o.eq_ipo)+':1</b></div>'+ '<div class="kv"><span>의무보유확약 비율</span><b class="am">8.4%</b></div>'+ '<div class="kv"><span>공모가 대비 (상장일)</span><b class="gr">+41.2%</b></div>'+ '<div class="kv"><span>공모가 대비 (D+30)</span><b class="rd">-6.8%</b></div>'+ '<div class="kv"><span>시장 국면</span><b class="cy">'+(o.eq_ipo>520?'과열 경계':(o.eq_ipo>450?'중립':'위축'))+'</b></div>'+ '<div class="cdh" style="margin-top:7px"><span class="cdt">락업 해제 일정</span><span class="cdo">D+30 / D+90</span></div>'+ '<div class="sc"><span class="mk">10-14</span><span>A바이오</span><span class="vv">12.4%</span><span class="p1 n"></span></div>'+ '<div class="sc"><span class="mk">10-27</span><span>B소재</span><span class="vv">6.1%</span><span class="p1 y"></span></div>'+ '<div class="note">경쟁률은 회복이나 <b>확약 비율은 개선이 더딤</b> → 상장 초기 물량 부담.</div></div>';
    h+='<div class="cd" id="cd_cb"><div class="cdh"><span class="cdt">CB ZERO FINDER</span><span class="cdo">김유찬 · 운영중</span></div>'+ '<div class="kv"><span>리픽싱 하단 접근</span><b class="am">'+Math.round(o.eq_cb)+'곳</b></div>'+ '<div class="kv"><span>PUT 행사 가능 구간</span><b class="rd">'+Math.max(0,Math.round(o.eq_cb*0.43))+'곳</b></div>'+ '<table class="tb" style="margin-top:6px"><thead><tr><th>종목</th><th class="n">전환가 괴리</th><th class="n">PUT</th><th class="n">현금런웨이</th></tr></thead><tbody>'+ '<tr><td>A바이오</td><td class="n dw">-28.4%</td><td class="n am">D+41</td><td class="n">5분기</td></tr>'+ '<tr><td>B소재</td><td class="n dw">-19.1%</td><td class="n">D+182</td><td class="n">9분기</td></tr>'+ '<tr><td>C로보틱스</td><td class="n dw">-12.7%</td><td class="n">D+240</td><td class="n">7분기</td></tr>'+ '</tbody></table>'+ '<div class="note">크레딧 '+cr+'bp 기준. <b>스프레드 확대 → 조달 악화 → 조기상환 청구 → 현금 유출</b> 경로로 Equity Risk에 직결됩니다.</div></div>';
    h+='<div class="cd"><div class="cdh"><span class="cdt">IPO FUNDAMENTAL SCORE</span><span class="cdo">DART Open API</span></div>'+ sco('C로보틱스',cr,F)+ '<div class="note">임계값이 크레딧에 연동됩니다 — 현재 DILUTION &lt; <b>'+F.dl+'%</b> · RUNWAY ≥ <b>'+F.rw+'분기</b>.<br>'+ '<b>기업 재무는 그대로인데 금리 환경만으로 점수가 바뀝니다.</b> 세 도메인을 한 화면에 두는 이유입니다.</div></div>';
    h+='<div class="cd"><div class="cdh"><span class="cdt">할인율 민감도</span><span class="cdo">코스닥</span></div>'+ '<div class="big">'+o.eq_val.toFixed(1)+'%</div>'+ '<div class="bar"><i class="'+(o.eq_val>9.5?'am':'')+'" style="width:'+(o.eq_val*8)+'%"></i></div>'+ '<div class="kv" style="margin-top:6px"><span>적자·차입 비중</span><b>'+Math.round(o.eq_fin)+'%</b></div>'+ '<div class="kv"><span>국고 3Y 전이 β</span><b class="cy">0.57</b></div>'+ '<div class="kv"><span>듀레이션 성격</span><b class="am">LONG</b></div>'+ '<div class="note">코스닥 IPO는 현금흐름이 먼 미래에 있는 <b>시장에서 듀레이션이 가장 긴 자산</b>입니다. 채권 장기물과 동일한 논리가 적용됩니다.</div></div>';
    h+='</div>';
  }
  p.innerHTML='<div style="display:grid;grid-template-columns:1fr 268px;gap:7px;height:100%">'+ '<div style="min-width:0;height:100%">'+h+'</div>'+ '<div class="ins">'+insHTML()+'</div></div>';
  if(INS.id==='eq_cb'&&$('cd_cb'))$('cd_cb').classList.add('hl');
  if(INS.id==='eq_ipo'&&$('cd_ipo'))$('cd_ipo').classList.add('hl');
  if(INS.id==='rat_credit'&&$('cd_cr'))$('cd_cr').classList.add('hl');
  var rws=document.querySelectorAll('#dlb tr');
  for(var i=0;i<rws.length;i++){
    rws[i].classList.toggle('sel',i===si);
    (function(k){rws[k].addEventListener('click',function(){goSnap(k);});})(i);
  }
}
function row(i,d,j,e,a,b,c,bm,st){
  return '<tr><td class="num">'+d+'</td><td style="color:#E6EBF3">'+j+'</td><td style="color:#6E7889">'+e+'</td>'+ '<td class="n '+cl(a)+'">'+(a||'<span class="pd">—</span>')+'</td><td class="n '+cl(b)+'">'+(b||'<span class="pd">—</span>')+'</td>'+ '<td class="n '+cl(c)+'">'+(c||'<span class="pd">—</span>')+'</td><td class="n '+cl(bm)+'" style="font-weight:700">'+(bm||'<span class="pd">—</span>')+'</td>'+ '<td class="n">'+(st==='PENDING'?'<span class="pd">PENDING</span>':'<span style="color:#5E6878">'+st+'</span>')+'</td></tr>';
}
function cl(v){return !v?'':(v.charAt(0)==='-'?'dw':'up');}
function sco(nm,cr,F){
  var rows=[['ΔGPM','매출총이익률 개선','+1.8%p',1],['ACC','발생액 음(-)','-124억',1],['ΔTO','자산회전율 개선','-0.04x',0], ['DILUTION','CB·BW 희석','8.2% < '+F.dl+'%',8.2<F.dl?1:0],['RUNWAY','현금런웨이','7분기 ≥ '+F.rw+'분기',7>=F.rw?1:0]];
  var s=0,h='<div class="ml2" style="color:#6E7889;margin-bottom:4px">'+nm+' · 직전 분기 실적 기준</div>';
  for(var i=0;i<rows.length;i++){
    s+=rows[i][3];
    h+='<div class="sc"><span class="mk">'+rows[i][0]+'</span><span>'+rows[i][1]+'</span><span class="vv">'+rows[i][2]+'</span><span class="p1 '+(rows[i][3]?'y':'n')+'"></span></div>';
  }
  h+='<div class="sc" style="border-bottom:0;padding-top:5px"><span class="mk" style="color:#3FD9E6">SCORE</span><span style="color:'+(s>=4?'#31C08C':(s>=3?'#EFA83A':'#EF5A61'))+';font-weight:700">'+ (s>=4?'조건부 참여':(s>=3?'관망':'청약 보류'))+'</span><span class="vv" style="font-size:14px">'+s+' / 5</span><span></span></div>';
  return h;
}
function curveSVG(o){
  var a=[3.28,3.14,o.rat_ktb,o.rat_ktb+0.18,cur.x.k10+(SH.ust*0.52)/100];
  var b=[3.42,3.36,3.31,3.36,3.25];
  var mn=2.6,mx=3.6,W=210,Hh=52;
  function pts(arr){var s='';for(var i=0;i<arr.length;i++){s+=(i?'L':'M')+(i*(W/4)).toFixed(1)+','+(Hh-(arr[i]-mn)/(mx-mn)*Hh).toFixed(1);}return s;}
  return '<svg viewBox="0 0 '+W+' '+(Hh+12)+'" style="width:100%;height:58px;margin-top:6px" role="img" aria-label="수익률 곡선">'+ '<path d="'+pts(b)+'" fill="none" stroke="#2B3542" stroke-width="1.2" stroke-dasharray="3 3"/>'+ '<path d="'+pts(a)+'" fill="none" stroke="#3FD9E6" stroke-width="1.7"/>'+ '<text x="0" y="'+(Hh+10)+'" font-size="6.4" fill="#3D4552" letter-spacing="1">3M</text>'+ '<text x="'+(W/2-6)+'" y="'+(Hh+10)+'" font-size="6.4" fill="#3D4552" letter-spacing="1">3Y</text>'+ '<text x="'+(W-14)+'" y="'+(Hh+10)+'" font-size="6.4" fill="#3D4552" letter-spacing="1">10Y</text></svg>';
}
function tab(t,hl){
  if(curTab===t){paneRender();return;}
  curTab=t;
  var tb=document.querySelectorAll('.tab');
  for(var i=0;i<tb.length;i++)tb[i].classList.toggle('act',tb[i].getAttribute('data-t')===t);
  var p=$('pane');p.classList.remove('sw');void p.offsetWidth;paneRender();p.classList.add('sw');
}
