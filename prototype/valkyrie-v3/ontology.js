window.VALKYRIE_V3 = (() => {
  const objects = [
    {id:'kr_cpi',name:'KR CPI',short:'KR CPI',type:'OBSERVATION',layer:'MACRO',owner:'정희강 · MACRO',ownerClass:'macro',x:80,y:110,value:'2.42%',delta:'+0.11%p',state:'STICKY',confidence:96,model:'KOSTAT / RAVENS',vintage:'2026-09',evidence:[['01','Headline CPI 2.42%','HIGH'],['02','Core CPI 2.31%','HIGH'],['03','Services momentum +0.18%p','MED']]},
    {id:'us_cpi',name:'US CPI',short:'US CPI',type:'OBSERVATION',layer:'MACRO',owner:'정희강 · MACRO',ownerClass:'macro',x:80,y:225,value:'2.6%',delta:'-0.2%p',state:'DISINFLATION',confidence:95,model:'BLS / RAVENS',vintage:'2026-09',evidence:[['01','Headline CPI 2.6%','HIGH'],['02','Core CPI 2.9%','HIGH'],['03','3M annualized 2.5%','MED']]},
    {id:'growth',name:'KR Growth Nowcast',short:'KR GROWTH',type:'OBSERVATION',layer:'MACRO',owner:'정희강 · MACRO',ownerClass:'macro',x:80,y:340,value:'1.72%',delta:'-0.21%p',state:'SOFT',confidence:78,model:'RAVENS Nowcast',vintage:'2026-09',evidence:[['01','Exports momentum +1.8%','HIGH'],['02','Domestic demand weak','MED'],['03','PMI diffusion 49.6','MED']]},
    {id:'usdkrw',name:'USD / KRW',short:'USD/KRW',type:'MARKET',layer:'MACRO',owner:'정희강 · MACRO',ownerClass:'macro',x:80,y:455,value:'1,394',delta:'+0.8%',state:'FIRM USD',confidence:92,model:'Market',vintage:'LIVE',evidence:[['01','Dollar index +0.5%','HIGH'],['02','Foreign equity flow -₩0.3T','MED'],['03','Rate differential wide','HIGH']]},
    {id:'cpi_model',name:'CPI Forecast Engine',short:'CPI FORECAST',type:'MODEL',layer:'MACRO',owner:'정희강 · MACRO',ownerClass:'macro',x:300,y:175,value:'2.58%',delta:'Q4 26',state:'BASE',confidence:84,model:'CPI Forecast v2.1',vintage:'2026-09-15',evidence:[['01','KR CPI latest','HIGH'],['02','FX pass-through','MED'],['03','Global inflation beta','MED']]},
    {id:'bok_path',name:'BOK Policy Path',short:'BOK PATH',type:'MODEL',layer:'MACRO',owner:'정희강 · MACRO',ownerClass:'macro',x:300,y:365,value:'2.25→2.00',delta:'BASE 54%',state:'EASING BIAS',confidence:82,model:'Policy Path v1.8',vintage:'2026-09-15',evidence:[['01','CPI forecast 2.58%','HIGH'],['02','Growth nowcast 1.72%','HIGH'],['03','USD/KRW constraint','MED']]},

    {id:'ust10',name:'UST 10Y',short:'UST10Y',type:'MARKET',layer:'RATES',owner:'정훈 · RATES',ownerClass:'rates',x:500,y:105,value:'4.62%',delta:'+17bp',state:'REPRICING',confidence:94,model:'Market',vintage:'LIVE',evidence:[['01','Term premium elevated','MED'],['02','Fed path repriced','HIGH'],['03','Supply pressure','MED']]},
    {id:'ktb3',name:'KTB 3Y',short:'KTB 3Y',type:'MARKET',layer:'RATES',owner:'정훈 · RATES',ownerClass:'rates',x:505,y:260,value:'2.62%',delta:'+9bp',state:'CHEAPENING',confidence:94,model:'Market',vintage:'LIVE',evidence:[['01','Policy path repricing','HIGH'],['02','Front-end beta 0.71','MED'],['03','Foreign futures flow','MED']]},
    {id:'ktb10',name:'KTB 10Y',short:'KTB 10Y',type:'MARKET',layer:'RATES',owner:'정훈 · RATES',ownerClass:'rates',x:505,y:405,value:'2.88%',delta:'+13bp',state:'PRESSURE',confidence:94,model:'Market',vintage:'LIVE',evidence:[['01','UST10Y transmission','HIGH'],['02','Duration supply','MED'],['03','Term premium','MED']]},
    {id:'curve',name:'2s10s Curve',short:'2s10s CURVE',type:'MARKET',layer:'RATES',owner:'정훈 · RATES',ownerClass:'rates',x:690,y:315,value:'+26bp',delta:'BEAR FLAT',state:'CAUTION',confidence:88,model:'Curve Regime v1.3',vintage:'LIVE',evidence:[['01','KTB 3Y 2.62%','HIGH'],['02','KTB 10Y 2.88%','HIGH'],['03','Front-end repricing dominant','MED']]},
    {id:'credit',name:'Credit AA- 3Y',short:'AA- CREDIT',type:'MARKET',layer:'CREDIT',owner:'정훈 · RATES',ownerClass:'rates',x:690,y:465,value:'52bp',delta:'+6bp',state:'WIDENING',confidence:87,model:'Credit Monitor v1.2',vintage:'LIVE',evidence:[['01','AA- spread +6bp','HIGH'],['02','Funding demand rising','MED'],['03','Liquidity premium +3bp','MED']]},
    {id:'rates_signal',name:'Short Duration',short:'SHORT DURATION',type:'SIGNAL',layer:'RATES',owner:'정훈 · RATES',ownerClass:'rates',x:700,y:120,value:'82%',delta:'CONFIDENCE',state:'ACTIVE',confidence:82,model:'Rates Decision Engine',vintage:'2026-09-15',evidence:[['01','Curve bear flattening','HIGH'],['02','Credit widening','MED'],['03','Policy path less dovish','HIGH']]},
    {id:'rates_decision',name:'장기채 축소 · 단기채 확대',short:'RATES DECISION',type:'DECISION',layer:'DECISIONS',owner:'정훈 · RATES',ownerClass:'rates',x:865,y:120,value:'EXECUTE',delta:'2026-05-04',state:'TRACKED',confidence:82,model:'Analyst Decision',vintage:'2026-05-04',evidence:[['01','Short duration signal 82%','HIGH'],['02','Curve regime confirmed','HIGH'],['03','Risk budget available','MED']]},
    {id:'rates_outcome',name:'Rates Outcome',short:'RATES OUTCOME',type:'OUTCOME',layer:'DECISIONS',owner:'정훈 · RATES',ownerClass:'rates',x:1040,y:120,value:'+1.6%',delta:'vs BM',state:'CLOSED',confidence:100,model:'Decision Log',vintage:'D+60',evidence:[['01','D+5 +0.4%','HIGH'],['02','D+20 +1.2%','HIGH'],['03','D+60 +2.1%','HIGH']]},

    {id:'duration_concept',name:'Shared Duration Logic',short:'DURATION LOGIC',type:'CONCEPT',layer:'CROSS',owner:'RAVENS · CROSS-ASSET',ownerClass:'cross',x:805,y:310,value:'CROSS-ASSET',delta:'CONCEPT',state:'ACTIVE',confidence:86,model:'Ontology Concept',vintage:'CURRENT',evidence:[['01','Bond duration sensitivity','HIGH'],['02','Equity discount-rate sensitivity','HIGH'],['03','Funding duration linkage','MED']]},
    {id:'kosdaq_val',name:'KOSDAQ Valuation',short:'KOSDAQ VAL',type:'MARKET',layer:'EQUITY',owner:'김유찬 · EQUITY',ownerClass:'equity',x:900,y:285,value:'-6.4%',delta:'RATE SENS.',state:'PRESSURE',confidence:81,model:'Equity Duration Lens',vintage:'LIVE',evidence:[['01','Discount rate +40bp eqv.','MED'],['02','Loss-making cohort weak','HIGH'],['03','Small-cap risk premium high','MED']]},
    {id:'funding_quality',name:'Loss / Funding Quality',short:'FUNDING QUALITY',type:'OBSERVATION',layer:'EQUITY',owner:'김유찬 · EQUITY',ownerClass:'equity',x:900,y:430,value:'HIGH RISK',delta:'DEBT DEP.',state:'FRAGILE',confidence:80,model:'IPO Quality Lens',vintage:'2026-09',evidence:[['01','Loss-making issuers elevated','MED'],['02','Cash runway dispersion','MED'],['03','Refinancing dependence','HIGH']]},
    {id:'cb_refix',name:'CB Refixing / Put Risk',short:'CB / BW RISK',type:'MARKET',layer:'IPO_CB',owner:'김유찬 · EQUITY',ownerClass:'equity',x:1075,y:455,value:'12사',delta:'FLOOR BREAK',state:'CAUTION',confidence:85,model:'CB Zero Finder',vintage:'2026-09-15',evidence:[['01','Refixing floor break 12','HIGH'],['02','Put window concentration','MED'],['03','Credit spread widening','MED']]},
    {id:'ipo_demand',name:'IPO Bookbuilding Demand',short:'IPO DEMAND',type:'MARKET',layer:'IPO_CB',owner:'김유찬 · EQUITY',ownerClass:'equity',x:900,y:565,value:'968:1',delta:'-18%',state:'NORMALIZING',confidence:91,model:'IPO Market Report',vintage:'2026-09',evidence:[['01','Avg competition 968:1','HIGH'],['02','Top-tier skewed','MED'],['03','Post-listing dispersion wide','HIGH']]},
    {id:'ipo_score',name:'IPO Decision Score',short:'IPO SCORE',type:'MODEL',layer:'IPO_CB',owner:'김유찬 · EQUITY',ownerClass:'equity',x:1075,y:310,value:'3.4 / 5',delta:'SELECTIVE',state:'FILTERING',confidence:83,model:'IPO FScore v1.0',vintage:'2026-09-15',evidence:[['01','Valuation pressure','MED'],['02','Demand quality','HIGH'],['03','Funding fragility','HIGH']]},
    {id:'ipo_signal',name:'IPO Selective',short:'IPO SELECTIVE',type:'SIGNAL',layer:'IPO_CB',owner:'김유찬 · EQUITY',ownerClass:'equity',x:1080,y:205,value:'84%',delta:'CONFIDENCE',state:'ACTIVE',confidence:84,model:'IPO Decision Engine',vintage:'2026-09-15',evidence:[['01','FScore 3.4/5','HIGH'],['02','KOSDAQ duration pressure','MED'],['03','Demand still investable','MED']]},
    {id:'ipo_decision',name:'청약 선별 참여',short:'IPO DECISION',type:'DECISION',layer:'DECISIONS',owner:'김유찬 · EQUITY',ownerClass:'equity',x:1060,y:585,value:'SELECTIVE',delta:'ACTIVE',state:'TRACKED',confidence:84,model:'Analyst Decision',vintage:'2026-09-15',evidence:[['01','Model signal selective','HIGH'],['02','Company-specific override','MED'],['03','Valuation discipline','HIGH']]},
    {id:'ipo_outcome',name:'IPO Outcome',short:'IPO OUTCOME',type:'OUTCOME',layer:'DECISIONS',owner:'김유찬 · EQUITY',ownerClass:'equity',x:1060,y:675,value:'TRACK',delta:'D+20',state:'OPEN',confidence:70,model:'Decision Log',vintage:'FORWARD',evidence:[['01','Listing return pending','MED'],['02','D+5 benchmark pending','MED'],['03','D+20 review scheduled','MED']]}
  ];

  const relations = [
    ['r01','kr_cpi','cpi_model','INFORMS','POS'],
    ['r02','us_cpi','cpi_model','EXTERNALIZES','POS'],
    ['r03','usdkrw','cpi_model','PASSES_THROUGH','POS'],
    ['r04','cpi_model','bok_path','FORECASTS','POS'],
    ['r05','growth','bok_path','INFORMS','NEG'],
    ['r06','usdkrw','bok_path','CONSTRAINS','POS'],
    ['r07','bok_path','ktb3','PRICES','POS'],
    ['r08','bok_path','ktb10','PRICES','POS'],
    ['r09','ust10','ktb10','TRANSMITS','POS'],
    ['r10','ktb3','curve','SHAPES','POS'],
    ['r11','ktb10','curve','SHAPES','POS'],
    ['r12','ktb3','credit','DISCOUNTS','POS'],
    ['r13','credit','rates_signal','SUPPORTS','POS'],
    ['r14','curve','rates_signal','SUPPORTS','POS'],
    ['r15','bok_path','rates_signal','INFORMS','POS'],
    ['r16','rates_signal','rates_decision','RESOLVES_TO','POS'],
    ['r17','rates_decision','rates_outcome','RESULTED_IN','POS'],
    ['r18','ktb10','duration_concept','DEFINES','POS'],
    ['r19','curve','duration_concept','DEFINES','POS'],
    ['r20','duration_concept','kosdaq_val','DISCOUNTS','NEG'],
    ['r21','credit','cb_refix','FUNDS','POS'],
    ['r22','funding_quality','cb_refix','AMPLIFIES','POS'],
    ['r23','kosdaq_val','ipo_score','INFORMS','NEG'],
    ['r24','ipo_demand','ipo_score','SUPPORTS','POS'],
    ['r25','funding_quality','ipo_score','PENALIZES','NEG'],
    ['r26','cb_refix','ipo_score','PENALIZES','NEG'],
    ['r27','ipo_score','ipo_signal','RESOLVES_TO','POS'],
    ['r28','ipo_signal','ipo_decision','RESOLVES_TO','POS'],
    ['r29','ipo_decision','ipo_outcome','RESULTED_IN','POS']
  ].map(([id,from,to,type,sign])=>({id,from,to,type,sign}));

  const scenarios = {
    BASE:{label:'BASE',risk:'CAUTION',changed:[],patch:{}},
    HAWKISH:{label:'HAWKISH',risk:'HIGH',changed:['kr_cpi','cpi_model','bok_path','ktb3','ktb10','curve','credit','rates_signal','duration_concept','kosdaq_val','cb_refix','ipo_score','ipo_signal','ipo_decision'],patch:{
      kr_cpi:{value:'2.82%',delta:'+0.40%p',state:'UPSIDE SHOCK'},cpi_model:{value:'2.98%',delta:'+0.40%p',state:'HAWKISH'},bok_path:{value:'2.50→2.25',delta:'CUT -1',state:'LESS DOVISH'},ktb3:{value:'2.91%',delta:'+29bp',state:'SELL-OFF'},ktb10:{value:'3.11%',delta:'+23bp',state:'PRESSURE'},curve:{value:'+20bp',delta:'BEAR FLAT',state:'HAWKISH'},credit:{value:'71bp',delta:'+19bp',state:'WIDENING'},rates_signal:{value:'91%',delta:'CONFIDENCE',state:'STRONG'},duration_concept:{value:'TIGHTER',delta:'DISCOUNT ↑',state:'ACTIVE'},kosdaq_val:{value:'-11.8%',delta:'RATE SENS.',state:'RISK'},cb_refix:{value:'17사',delta:'+5',state:'HIGH RISK'},ipo_score:{value:'2.8 / 5',delta:'DEFENSIVE',state:'FILTERING'},ipo_signal:{value:'88%',delta:'SELECTIVE / PAUSE',state:'DEFENSIVE'},ipo_decision:{value:'SELECTIVE',delta:'PAUSE WEAK',state:'TRACKED'}
    }},
    DOVISH:{label:'DOVISH',risk:'NORMAL',changed:['cpi_model','bok_path','ktb3','ktb10','curve','credit','rates_signal','duration_concept','kosdaq_val','ipo_score','ipo_signal'],patch:{
      cpi_model:{value:'2.28%',delta:'-0.30%p',state:'DOVISH'},bok_path:{value:'2.25→1.75',delta:'CUT +1',state:'EASING'},ktb3:{value:'2.38%',delta:'-24bp',state:'RALLY'},ktb10:{value:'2.61%',delta:'-27bp',state:'RALLY'},curve:{value:'+23bp',delta:'BULL STEEP',state:'EASING'},credit:{value:'43bp',delta:'-9bp',state:'TIGHTENING'},rates_signal:{value:'61%',delta:'NEUTRALIZE',state:'WATCH'},duration_concept:{value:'LOOSER',delta:'DISCOUNT ↓',state:'ACTIVE'},kosdaq_val:{value:'+7.2%',delta:'RATE SENS.',state:'SUPPORT'},ipo_score:{value:'4.0 / 5',delta:'CONSTRUCTIVE',state:'OPEN'},ipo_signal:{value:'76%',delta:'PARTICIPATE',state:'CONSTRUCTIVE'}
    }},
    RISK_OFF:{label:'RISK-OFF',risk:'HIGH',changed:['usdkrw','ust10','credit','rates_signal','funding_quality','cb_refix','ipo_demand','ipo_score','ipo_signal','ipo_decision'],patch:{
      usdkrw:{value:'1,455',delta:'+4.4%',state:'RISK-OFF'},ust10:{value:'4.88%',delta:'+26bp',state:'VOLATILE'},credit:{value:'84bp',delta:'+32bp',state:'STRESS'},rates_signal:{value:'89%',delta:'DEFENSIVE',state:'STRONG'},funding_quality:{value:'VERY HIGH',delta:'LIQUIDITY RISK',state:'FRAGILE'},cb_refix:{value:'21사',delta:'+9',state:'HIGH RISK'},ipo_demand:{value:'512:1',delta:'-47%',state:'FREEZE'},ipo_score:{value:'2.1 / 5',delta:'PAUSE',state:'DEFENSIVE'},ipo_signal:{value:'93%',delta:'PAUSE',state:'DEFENSIVE'},ipo_decision:{value:'PAUSE',delta:'LOW QUALITY',state:'TRACKED'}
    }}
  };

  const snapshots = [
    {date:'2026-05-04',label:'MAY 04',risk:'HIGH',note:'CPI surprise · short duration decision',values:{kr_cpi:{value:'2.71%',delta:'+0.28%p',state:'UPSIDE'},cpi_model:{value:'2.84%',delta:'+0.26%p',state:'HAWKISH'},bok_path:{value:'2.50→2.25',delta:'CUT DELAY',state:'LESS DOVISH'},ktb3:{value:'3.42%',delta:'+22bp',state:'SELL-OFF'},ktb10:{value:'2.95%',delta:'+14bp',state:'PRESSURE'},curve:{value:'-47bp',delta:'BEAR FLAT',state:'STRESS'},credit:{value:'74bp',delta:'+11bp',state:'WIDE'},rates_signal:{value:'82%',delta:'CONFIDENCE',state:'ACTIVE'},rates_decision:{value:'EXECUTE',delta:'LONG ↓ / SHORT ↑',state:'TRACKED'},rates_outcome:{value:'+1.6%',delta:'vs BM',state:'CLOSED'},kosdaq_val:{value:'-8.1%',delta:'RATE SENS.',state:'PRESSURE'},ipo_demand:{value:'602:1',delta:'-38%',state:'WEAK'},ipo_score:{value:'2.9 / 5',delta:'SELECTIVE',state:'FILTERING'},ipo_signal:{value:'81%',delta:'SELECTIVE',state:'ACTIVE'}}},
    {date:'2026-06-15',label:'JUN 15',risk:'CAUTION',note:'Curve stabilizing · credit still wide',values:{kr_cpi:{value:'2.55%',delta:'-0.16%p',state:'EASING'},bok_path:{value:'2.25→2.00',delta:'BASE',state:'EASING BIAS'},ktb3:{value:'3.06%',delta:'-36bp',state:'RALLY'},ktb10:{value:'2.90%',delta:'-5bp',state:'STABLE'},curve:{value:'-16bp',delta:'NORMALIZING',state:'CAUTION'},credit:{value:'66bp',delta:'-8bp',state:'WIDE'},rates_signal:{value:'74%',delta:'CONFIDENCE',state:'ACTIVE'},kosdaq_val:{value:'-3.6%',delta:'RECOVERY',state:'CAUTION'},ipo_demand:{value:'744:1',delta:'+24%',state:'RECOVERING'},ipo_signal:{value:'78%',delta:'SELECTIVE',state:'ACTIVE'}}},
    {date:'2026-07-27',label:'JUL 27',risk:'HIGH',note:'Risk event · funding quality deteriorates',values:{usdkrw:{value:'1,448',delta:'+3.7%',state:'RISK-OFF'},ust10:{value:'4.84%',delta:'+28bp',state:'VOLATILE'},credit:{value:'81bp',delta:'+15bp',state:'STRESS'},funding_quality:{value:'VERY HIGH',delta:'DEBT DEP.',state:'FRAGILE'},cb_refix:{value:'19사',delta:'+7',state:'HIGH RISK'},ipo_demand:{value:'488:1',delta:'-34%',state:'FREEZE'},ipo_score:{value:'2.2 / 5',delta:'PAUSE',state:'DEFENSIVE'},ipo_signal:{value:'91%',delta:'PAUSE',state:'DEFENSIVE'}}},
    {date:'2026-08-17',label:'AUG 17',risk:'CAUTION',note:'Liquidity recovery · selective reopening',values:{usdkrw:{value:'1,412',delta:'-2.5%',state:'NORMALIZING'},credit:{value:'61bp',delta:'-20bp',state:'TIGHTENING'},cb_refix:{value:'14사',delta:'-5',state:'CAUTION'},ipo_demand:{value:'824:1',delta:'+69%',state:'RECOVERING'},ipo_score:{value:'3.2 / 5',delta:'SELECTIVE',state:'FILTERING'},ipo_signal:{value:'82%',delta:'SELECTIVE',state:'ACTIVE'}}},
    {date:'2026-09-30',label:'SEP 30',risk:'CAUTION',note:'Current market state',values:{}}
  ];

  const workspaces = {
    MACRO:{title:'MACRO FORECAST ENGINE · 정희강',cards:[['CPI FORECAST','2.58%','Q4 2026 base case · inputs: CPI / FX / global inflation'],['BOK POLICY PATH','54%','Base case probability · easing bias remains'],['SCENARIO DISTRIBUTION','54 / 18 / 28','BASE / HAWKISH / DOVISH']],table:[['Object','Current','State'],['KR CPI','2.42%','STICKY'],['CPI Forecast','2.58%','BASE'],['BOK Path','2.25→2.00','EASING']]},
    RATES:{title:'RATES DECISION WORKSPACE · 정훈',cards:[['CURVE REGIME','BEAR FLAT','Front-end repricing dominant'],['SIGNAL','SHORT DURATION','82% confidence'],['TRACK RECORD','+1.6%','Benchmark-relative outcome']],table:[['Decision','D+5','D+20'],['Long ↓ / Short ↑','+0.4%','+1.2%'],['BM-relative','+0.3%','+0.8%']]},
    EQUITY:{title:'EQUITY / CAPITAL MARKETS · 김유찬',cards:[['IPO SCORE','3.4 / 5','Selective participation'],['CB / BW RISK','12 firms','Refixing floor break monitor'],['IPO DEMAND','968:1','Quality dispersion remains wide']],table:[['Object','Signal','Action'],['KOSDAQ Val','PRESSURE','DISCIPLINE'],['IPO','SELECTIVE','FILTER'],['CB / BW','CAUTION','MONITOR']]}
  };

  return {objects,relations,scenarios,snapshots,workspaces};
})();
