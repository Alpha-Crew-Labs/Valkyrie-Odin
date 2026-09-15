var NW=118,NH=42,TW=150,TH=54;
var NODES=[
 {id:"mac_bei",l:"기대인플레·WTI",x:70,y:56,o:"정희강",t:"MACRO"},
 {id:"mac_uscpi",l:"US CPI",x:210,y:56,o:"정희강",t:"MACRO"},
 {id:"mac_fed",l:"FED 인하경로",x:350,y:56,o:"정희강",t:"MACRO"},
 {id:"mac_krcpi",l:"KR CPI · 자체모델",x:210,y:108,o:"정희강",t:"MACRO"},
 {id:"mac_bok",l:"BOK 기준금리",x:490,y:56,o:"정희강",t:"MACRO"},
 {id:"rat_ust10",l:"UST 10Y",x:350,y:196,o:"정훈",t:"RATES"},
 {id:"rat_ktb",l:"국고 3Y / 10Y",x:490,y:196,o:"정훈",t:"RATES"},
 {id:"rat_curve",l:"2s10s 커브",x:630,y:152,o:"정훈",t:"RATES"},
 {id:"rat_credit",l:"크레딧 AA- 3Y",x:630,y:240,o:"정훈",t:"RATES"},
 {id:"eq_fin",l:"적자·차입 구조",x:350,y:356,o:"김유찬",t:"EQUITY"},
 {id:"eq_val",l:"코스닥 밸류·할인율",x:490,y:310,o:"김유찬",t:"EQUITY"},
 {id:"eq_cb",l:"CB 조달 · 풋",x:630,y:310,o:"김유찬",t:"EQUITY"},
 {id:"eq_demand",l:"IPO 수요예측",x:770,y:356,o:"김유찬",t:"EQUITY"},
 {id:"sig_macro",l:"",x:1010,y:62,o:"정희강",t:"MACRO",T:1},
 {id:"sig_rates",l:"",x:1010,y:190,o:"정훈",t:"RATES",T:1},
 {id:"sig_equity",l:"",x:1010,y:318,o:"김유찬",t:"EQUITY",T:1}
];
var EDGES=[
 ["e01","mac_bei","mac_uscpi","POS","h",0],["e02","mac_uscpi","mac_fed","POS","h",0],["e03","mac_fed","rat_ust10","POS","v",0],["e04","mac_fed","mac_bok","POS","h",0],["e05","mac_krcpi","mac_bok","POS","h",8],["e06","mac_bok","sig_macro","POS","h",0],["e07","mac_krcpi","sig_macro","POS","h",10],["e08","mac_bok","rat_ktb","POS","v",0],["e09","mac_bok","rat_curve","POS","h",0],["e10","rat_ust10","rat_ktb","POS","h",0],["e11","rat_ktb","rat_curve","POS","h",0],["e12","rat_ktb","rat_credit","POS","h",0],["e13","rat_curve","sig_rates","POS","h",0],["e14","rat_ktb","sig_rates","POS","h",0],["e15","rat_credit","sig_rates","POS","h",0],["e16","rat_ktb","eq_val","NEG","v",0],["e17","rat_credit","eq_cb","POS","v",0],["e18","eq_fin","eq_val","POS","h",0],["e19","eq_val","eq_cb","POS","h",0],["e20","eq_cb","sig_equity","POS","h",0],["e21","eq_fin","eq_demand","POS","h",0],["e22","eq_demand","sig_equity","POS","h",0]
];
var META={
 mac_bei:{ev:[["WTI 현물","$71.4","MED"],["BEI 10Y","@mac_bei","HIGH"],["FF 선물 임플라이","-4bp","LOW"]],view:"기대인플레 상단 경직 완화, 유가 하방"},
 mac_uscpi:{ev:[["헤드라인 CPI","@mac_uscpi","HIGH"],["코어 CPI","3.0%","HIGH"],["서베이 대비","-0.1%p","MED"]],view:"디스인플레 경로 재확인",aux:[["코어 서비스","3.4%"]]},
 mac_fed:{ev:[["FOMC 도트","2회","HIGH"],["FF 선물 확률","78%","HIGH"],["실질금리","1.4%","MED"]],view:"연내 인하 경로 시장 선반영"},
 mac_krcpi:{ev:[["자체 예측 CPI","@mac_krcpi","HIGH"],["모델 MAE","0.14%p","MED"],["근원 CPI","2.0%","MED"]],view:"목표 수준 안착, 하방 여지",aux:[["Curve Regime 대비","-2bp"]]},
 mac_bok:{ev:[["기준금리","@mac_bok","HIGH"],["의사록 톤","완화","MED"],["원/달러","1,332","MED"]],view:"인하 사이클 진입 확인"},
 rat_ust10:{ev:[["UST 10Y","@rat_ust10","HIGH"],["텀프리미엄","+18bp","MED"],["입찰 응찰률","2.41x","LOW"]],view:"미 장기금리 하향 안정"},
 rat_ktb:{ev:[["국고 3Y","@rat_ktb","HIGH"],["UST 스프레드","-117bp","MED"],["외국인 선물","+8,200계약","MED"]],view:"단기 구간 강세 우위",aux:[["외국인 국채선물 순매수","+8,200계약"],["국고 발행 계획","월 12.4조"]]},
 rat_curve:{ev:[["2s10s","@rat_curve","HIGH"],["레짐 판정","BULL STEEP","HIGH"],["3M 변화","+41bp","MED"]],view:"커브 스티프닝 국면 지속",aux:[["국고 입찰 수급","응찰 3.1x"]]},
 rat_credit:{ev:[["AA- 3Y 스프레드","@rat_credit","HIGH"],["A0 3Y","118bp","MED"],["발행 잔액 증감","+2.1조","LOW"]],view:"크레딧 안정, 코스닥 조달 여건 개선"},
 eq_fin:{ev:[["영업적자 비율","@eq_fin","HIGH"],["이자보상배율 <1","41%","HIGH"],["평균 현금런웨이","9.4분기","MED"]],view:"적자·차입 구조 = 최장 듀레이션 자산"},
 eq_val:{ev:[["KOSDAQ","@eq_val","HIGH"],["할인율 민감도","-1.8%/10bp","HIGH"],["PSR 중앙값","3.1x","MED"]],view:"할인율 하락이 밸류에이션 지지"},
 eq_cb:{ev:[["리픽싱 하단 이탈","@eq_cb","HIGH"],["조기상환 청구","480억","HIGH"],["신규 CB 표면금리","1.8%","MED"]],view:"조달 여건 개선, 풋 리스크 축소",aux:[["개별 CB 상위","H에너지·I소프트 외 3"]]},
 eq_demand:{ev:[["수요예측 경쟁률","@eq_demand","HIGH"],["의무보유 확약","28.4%","MED"],["밴드 상단 초과","74%","MED"]],view:"수요 과열 구간 진입, 선별 필요",aux:[["락업 해제 물량","10월 1,240억"]]}
};
var SIGMETA={sig_macro:{n:"금리경로 전망"},sig_rates:{n:"SHORT DURATION"},sig_equity:{n:"IPO 청약 선별"}};
function V(n,d,u,c,s,tx){return{n:n,d:d,u:u,c:c,s:s,tx:tx};}
var SNAPS=[
{d:"2026-05-04",t:"09:14",vin:"AS-OF 2026-05-04 · REVISION-ADJUSTED",v:{mac_bei:V(2.41,2,"%","+9bp","ALERT"),mac_uscpi:V(3.4,1,"%","+0.3%p","RISK"),mac_fed:V(0,0,"","동결 지속","RISK","인하 0회"),mac_krcpi:V(2.42,2,"%","+0.11%p","ALERT"),mac_bok:V(2.75,2,"%","동결","ALERT"),rat_ust10:V(4.62,2,"%","+17bp","RISK"),rat_ktb:V(3.42,2,"%","+13bp","RISK","3.42 / 2.95"),rat_curve:V(-8,0,"bp","BEAR FLAT","RISK","-8bp"),rat_credit:V(68,0,"bp","+9bp","ALERT"),eq_fin:V(58,0,"%","적자 비율","RISK"),eq_val:V(742,0,"p","-6.4%","RISK"),eq_cb:V(34,0,"사","하단 이탈","RISK"),eq_demand:V(412,0,":1","-38%","ALERT")},sig:{sig_macro:{t:"인하 지연",dir:"기준금리 동결 장기화",c:61,s:"RISK"},sig_rates:{t:"SHORT DURATION",dir:"장기채 축소 · 단기채 확대",c:82,s:"ALERT"},sig_equity:{t:"청약 보류 우위",dir:"적자 코스닥 IPO 회피",c:74,s:"RISK"}},fs:{sc:2,dl:8,rw:10,rows:[1,0,0,0,0]},cf:false},
{d:"2026-06-15",t:"09:02",vin:"AS-OF 2026-06-15 · REVISION-ADJUSTED",v:{mac_bei:V(2.33,2,"%","-8bp","ALERT"),mac_uscpi:V(3.1,1,"%","-0.3%p","ALERT"),mac_fed:V(0,0,"","연내 1회","ALERT","인하 1회"),mac_krcpi:V(2.31,2,"%","-0.11%p","ALERT"),mac_bok:V(2.75,2,"%","동결","ALERT"),rat_ust10:V(4.38,2,"%","-24bp","ALERT"),rat_ktb:V(3.21,2,"%","-21bp","ALERT","3.21 / 2.88"),rat_curve:V(6,0,"bp","FLAT","ALERT","+6bp"),rat_credit:V(64,0,"bp","-4bp","ALERT"),eq_fin:V(57,0,"%","적자 비율","RISK"),eq_val:V(778,0,"p","+4.9%","ALERT"),eq_cb:V(29,0,"사","하단 이탈","ALERT"),eq_demand:V(536,0,":1","+30%","ALERT")},sig:{sig_macro:{t:"인하 임박",dir:"3분기 첫 인하 가정",c:68,s:"ALERT"},sig_rates:{t:"커브 스티프너",dir:"장단기 스프레드 확대",c:71,s:"ALERT"},sig_equity:{t:"선별 보류",dir:"흑자 전환 종목만 참여",c:69,s:"ALERT"}},fs:{sc:2,dl:8,rw:10,rows:[1,1,0,0,0]},cf:false},
{d:"2026-07-27",t:"09:07",vin:"AS-OF 2026-07-27 · REVISION-ADJUSTED",v:{mac_bei:V(2.28,2,"%","-5bp","ALERT"),mac_uscpi:V(2.9,1,"%","-0.2%p","ALERT"),mac_fed:V(0,0,"","연내 2회","ALERT","인하 2회"),mac_krcpi:V(2.18,2,"%","-0.13%p","OK"),mac_bok:V(2.50,2,"%","-25bp","OK"),rat_ust10:V(4.21,2,"%","-17bp","ALERT"),rat_ktb:V(2.98,2,"%","-23bp","ALERT","2.98 / 2.81"),rat_curve:V(18,0,"bp","STEEP","ALERT","+18bp"),rat_credit:V(59,0,"bp","-5bp","ALERT"),eq_fin:V(56,0,"%","적자 비율","ALERT"),eq_val:V(834,0,"p","+7.2%","OK"),eq_cb:V(21,0,"사","하단 이탈","ALERT"),eq_demand:V(704,0,":1","+31%","ALERT")},sig:{sig_macro:{t:"인하 사이클 진입",dir:"연내 추가 1회 가정",c:76,s:"OK"},sig_rates:{t:"듀레이션 중립",dir:"벤치마크 듀레이션 유지",c:64,s:"ALERT"},sig_equity:{t:"조건부 참여",dir:"FSCORE 3점 이상 한정",c:72,s:"ALERT"}},fs:{sc:3,dl:9,rw:9,rows:[1,1,0,1,0]},cf:false},
{d:"2026-08-17",t:"09:11",vin:"AS-OF 2026-08-17 · REVISION-ADJUSTED",v:{mac_bei:V(2.35,2,"%","+7bp","ALERT"),mac_uscpi:V(2.8,1,"%","-0.1%p","ALERT"),mac_fed:V(0,0,"","연내 2회","ALERT","인하 2회"),mac_krcpi:V(2.14,2,"%","-0.04%p","OK"),mac_bok:V(2.50,2,"%","동결","OK"),rat_ust10:V(4.29,2,"%","+8bp","ALERT"),rat_ktb:V(3.04,2,"%","+6bp","ALERT","3.04 / 2.79"),rat_curve:V(41,0,"bp","BULL STEEP","ALERT","+41bp"),rat_credit:V(57,0,"bp","-2bp","ALERT"),eq_fin:V(55,0,"%","적자 비율","ALERT"),eq_val:V(861,0,"p","+3.2%","OK"),eq_cb:V(17,0,"사","하단 이탈","ALERT"),eq_demand:V(812,0,":1","+15%","ALERT")},sig:{sig_macro:{t:"인하 사이클 진입",dir:"완화 기조 지속",c:79,s:"OK"},sig_rates:{t:"SHORT DURATION",dir:"커브 과도 스티프닝 되돌림",c:73,s:"ALERT"},sig_equity:{t:"조건부 참여",dir:"FSCORE 3점 이상 한정",c:74,s:"ALERT"}},fs:{sc:3,dl:9,rw:9,rows:[1,1,0,1,0]},cf:true},
{d:"2026-09-30",t:"09:06",vin:"LATEST · REVISION-ADJUSTED",v:{mac_bei:V(2.29,2,"%","-6bp","OK"),mac_uscpi:V(2.6,1,"%","-0.2%p","OK"),mac_fed:V(0,0,"","연내 2회","OK","인하 2회"),mac_krcpi:V(2.10,2,"%","-0.04%p","OK"),mac_bok:V(2.25,2,"%","-25bp","OK"),rat_ust10:V(4.05,2,"%","-24bp","OK"),rat_ktb:V(2.62,2,"%","-42bp","OK","2.62 / 2.88"),rat_curve:V(33,0,"bp","BULL STEEP","ALERT","+33bp"),rat_credit:V(52,0,"bp","-5bp","OK"),eq_fin:V(54,0,"%","적자 비율","ALERT"),eq_val:V(905,0,"p","+5.1%","OK"),eq_cb:V(12,0,"사","하단 이탈","ALERT"),eq_demand:V(968,0,":1","+19%","ALERT")},sig:{sig_macro:{t:"인하 사이클 진입",dir:"연말 2.25% · 추가 인하 여지",c:84,s:"OK"},sig_rates:{t:"커브 스티프너",dir:"단기 구간 확대 · 장기 중립",c:76,s:"ALERT"},sig_equity:{t:"IPO 선별 참여",dir:"FSCORE 4점 이상 참여",c:81,s:"OK"}},fs:{sc:4,dl:10,rw:8,rows:[1,1,0,1,1]},cf:false}
];
var LOG=[["2026-05-04","장기채 축소 · 단기채 확대","CPI 서프라이즈 +0.3%p","+0.4","+1.2","+2.1","+1.6","CLOSED"],["2026-06-15","커브 스티프너 전환","발행 수급 부담 확대","+0.2","+0.7","+1.4","+0.9","CLOSED"],["2026-07-27","듀레이션 중립","인하 기대 선반영 판단","-0.1","+0.3","+0.8","+0.2","CLOSED"],["2026-08-17","장기채 재확대","커브 과도 스티프닝","+0.3","+1.1","PENDING","PENDING","OPEN"],["2026-09-30","단기 구간 확대","인하 사이클 진입 확인","PENDING","PENDING","PENDING","PENDING","NEW"]];
var FSROWS=[["ΔGPM","매출총이익률 개선","+1.8%p"],["ACC","발생액 음(-) 유지","-142억"],["ΔTO","자산회전율 개선","-0.04x"],["DILUT","CB·BW 희석률","8.2%"],["RUNWAY","현금 소진 여력","11분기"]];
var NM={},OUT={},IN={};for(var i=0;i<NODES.length;i++){NM[NODES[i].id]=NODES[i];}for(var i=0;i<EDGES.length;i++){var e=EDGES[i];if(!OUT[e[1]]){OUT[e[1]]=[];}OUT[e[1]].push(e);if(!IN[e[2]]){IN[e[2]]=[];}IN[e[2]].push(e);}function hw(n){return(n.T?TW:NW)/2;}function hh(n){return(n.T?TH:NH)/2;}function pathD(e){var a=NM[e[1]],b=NM[e[2]],k=e[4],bw=e[5];if(k==="v"){return"M"+a.x+" "+(a.y+hh(a))+"L"+b.x+" "+(b.y-hh(b));}var x1=a.x+hw(a),y1=a.y,x2=b.x-hw(b),y2=b.y;var dx=Math.max(Math.abs(x2-x1)*0.45,34);return"M"+x1+" "+y1+"C"+(x1+dx)+" "+(y1+bw)+" "+(x2-dx)+" "+(y2+bw)+" "+x2+" "+y2;}
var cur=SNAPS.length-1,sel="sig_rates",curTab="RATES",replaying=false,seqTimers=[];function clearSeq(){for(var i=0;i<seqTimers.length;i++){clearTimeout(seqTimers[i]);}seqTimers=[];}function T(fn,ms){seqTimers.push(setTimeout(fn,ms));}
