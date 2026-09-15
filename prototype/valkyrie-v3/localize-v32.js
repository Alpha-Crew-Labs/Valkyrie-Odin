(() => {
  'use strict';
  const D=window.VALKYRIE_V3;
  if(!D)return;

  const names={
    kr_cpi:['한국 소비자물가','한국 CPI'],us_cpi:['미국 소비자물가','미국 CPI'],growth:['한국 성장률 나우캐스트','한국 성장률'],usdkrw:['원/달러 환율','원/달러'],
    cpi_model:['CPI 전망 엔진','CPI 전망'],bok_path:['한국은행 금리 경로','한은 금리 경로'],ust10:['미 국채 10년','미10년'],ktb3:['국고채 3년','국고3년'],ktb10:['국고채 10년','국고10년'],
    curve:['국고채 커브','금리 커브'],credit:['AA- 크레딧 3년','AA- 스프레드'],rates_signal:['듀레이션 축소','듀레이션 축소'],rates_decision:['장기채 축소 · 단기채 확대','금리 판단'],rates_outcome:['금리 판단 성과','금리 성과'],
    duration_concept:['공통 듀레이션 로직','듀레이션 로직'],kosdaq_val:['코스닥 밸류에이션','코스닥 밸류'],funding_quality:['손실·자금조달 건전성','자금조달 질'],cb_refix:['CB 리픽싱 / 풋 리스크','CB/BW 리스크'],
    ipo_demand:['IPO 수요예측','IPO 수요'],ipo_score:['IPO 의사결정 점수','IPO 점수'],ipo_signal:['IPO 선별 참여 시그널','IPO 선별'],ipo_decision:['청약 선별 참여','IPO 판단'],ipo_outcome:['IPO 사후 성과','IPO 성과']
  };
  const states={
    STICKY:'고물가 지속',DISINFLATION:'물가 둔화',SOFT:'성장 둔화','FIRM USD':'달러 강세',BASE:'기본',
    'EASING BIAS':'인하 편향',REPRICING:'재가격',CHEAPENING:'약세',PRESSURE:'금리 상승 압력',CAUTION:'주의',WIDENING:'스프레드 확대',ACTIVE:'활성',
    TRACKED:'추적 중',CLOSED:'종료',FRAGILE:'취약',NORMALIZING:'정상화',FILTERING:'선별',OPEN:'진행 중',
    'UPSIDE SHOCK':'상방 충격',HAWKISH:'매파', 'LESS DOVISH':'완화 기대 축소','SELL-OFF':'매도 우위',STRONG:'강한 시그널',RISK:'위험', 'HIGH RISK':'고위험',DEFENSIVE:'방어적',
    DOVISH:'비둘기',RALLY:'강세','BULL STEEP':'불 스티프닝',TIGHTENING:'축소',SUPPORTIVE:'우호적',PARTICIPATE:'참여',
    'RISK OFF':'위험회피',STRESSED:'스트레스','VERY HIGH':'매우 높음',PAUSE:'관망'
  };
  const owners={
    '정희강 · MACRO':'정희강 · 매크로','정훈 · RATES':'정훈 · 금리','김유찬 · EQUITY':'김유찬 · 주식/IPO','RAVENS · CROSS-ASSET':'RAVENS · 크로스에셋'
  };
  const relationTypes={
    INFORMS:'반영',EXTERNALIZES:'대외 영향',PASSES_THROUGH:'전가',FORECASTS:'전망',CONSTRAINS:'제약',PRICES:'가격 반영',TRANSMITS:'전이',SHAPES:'형성',DISCOUNTS:'할인',SUPPORTS:'지지',
    RESOLVES_TO:'판단 전환',RESULTED_IN:'결과',DEFINES:'정의',FUNDS:'자금조달',AMPLIFIES:'증폭',PENALIZES:'감점'
  };
  const evidenceRules=[
    [/Headline CPI/gi,'헤드라인 CPI'],[/Core CPI/gi,'근원 CPI'],[/Services momentum/gi,'서비스 물가 모멘텀'],[/Exports momentum/gi,'수출 모멘텀'],[/Domestic demand weak/gi,'내수 둔화'],[/PMI diffusion/gi,'PMI 확산지수'],
    [/Dollar index/gi,'달러지수'],[/Foreign equity flow/gi,'외국인 주식 수급'],[/Rate differential wide/gi,'금리차 확대'],[/latest/gi,'최신값'],[/FX pass-through/gi,'환율 전가'],[/Global inflation beta/gi,'글로벌 물가 베타'],
    [/CPI forecast/gi,'CPI 전망'],[/Growth nowcast/gi,'성장률 나우캐스트'],[/constraint/gi,'제약'],[/Term premium/gi,'기간 프리미엄'],[/Fed path repriced/gi,'연준 경로 재가격'],[/Supply pressure/gi,'공급 부담'],
    [/Policy path repricing/gi,'정책금리 경로 재가격'],[/Front-end beta/gi,'단기 구간 베타'],[/Foreign futures flow/gi,'외국인 선물 수급'],[/Duration supply/gi,'듀레이션 공급'],[/Front-end repricing dominant/gi,'단기 구간 재가격 우세'],
    [/Funding demand rising/gi,'자금조달 수요 증가'],[/Liquidity premium/gi,'유동성 프리미엄'],[/bear flattening/gi,'베어 플래트닝'],[/Credit widening/gi,'크레딧 스프레드 확대'],[/Policy path less dovish/gi,'완화 기대 축소'],
    [/Risk budget available/gi,'리스크 버짓 여유'],[/Bond duration sensitivity/gi,'채권 듀레이션 민감도'],[/Equity discount-rate sensitivity/gi,'주식 할인율 민감도'],[/Funding duration linkage/gi,'자금조달 듀레이션 연결'],
    [/Discount rate/gi,'할인율'],[/Loss-making cohort weak/gi,'적자 기업군 약세'],[/Small-cap risk premium high/gi,'중소형주 위험 프리미엄 높음'],[/Loss-making issuers elevated/gi,'적자 발행사 비중 높음'],[/Cash runway dispersion/gi,'현금 버퍼 편차'],[/Refinancing dependence/gi,'차환 의존도'],
    [/Refixing floor break/gi,'리픽싱 하한 이탈'],[/Put window concentration/gi,'풋옵션 구간 집중'],[/Avg competition/gi,'평균 경쟁률'],[/Top-tier skewed/gi,'상위 종목 쏠림'],[/Post-listing dispersion wide/gi,'상장 후 수익률 편차 확대'],
    [/Valuation pressure/gi,'밸류에이션 부담'],[/Demand quality/gi,'수요의 질'],[/Funding fragility/gi,'자금조달 취약성'],[/KOSDAQ duration pressure/gi,'코스닥 듀레이션 부담'],[/Demand still investable/gi,'수요는 아직 투자 가능'],
    [/Model signal selective/gi,'모델 시그널 선별 참여'],[/Company-specific override/gi,'기업별 오버라이드'],[/Valuation discipline/gi,'밸류에이션 규율'],[/Listing return pending/gi,'상장 수익률 대기'],[/benchmark pending/gi,'벤치마크 비교 대기'],[/review scheduled/gi,'사후 점검 예정']
  ];
  const localEvidence=s=>evidenceRules.reduce((v,[re,to])=>v.replace(re,to),s);

  D.objects.forEach(o=>{
    if(names[o.id]){o.name=names[o.id][0];o.short=names[o.id][1];}
    o.state=states[o.state]||o.state;
    o.owner=owners[o.owner]||o.owner;
    if(Array.isArray(o.evidence))o.evidence=o.evidence.map(([n,t,r])=>[n,localEvidence(t),r==='HIGH'?'높음':r==='MED'?'중간':r==='LOW'?'낮음':r]);
    // Re-layout clipped right/bottom objects before app.js builds SVG.
    if(['cb_refix','ipo_score','ipo_signal','ipo_decision','ipo_outcome'].includes(o.id))o.x=Math.min(o.x,1035);
    if(o.id==='ipo_outcome')o.y=648;
  });
  D.relations.forEach(r=>{r.type=relationTypes[r.type]||r.type;});
  Object.values(D.scenarios||{}).forEach(s=>{
    if(s.label==='BASE')s.label='기본'; if(s.label==='HAWKISH')s.label='매파'; if(s.label==='DOVISH')s.label='비둘기'; if(s.label==='RISK_OFF')s.label='위험회피';
    Object.values(s.patch||{}).forEach(p=>{if(p.state)p.state=states[p.state]||p.state;});
  });
  window.VALKYRIE_V3_KO=true;
})();
