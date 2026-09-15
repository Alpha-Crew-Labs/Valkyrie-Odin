/* VALKYRIE · YC Equity integration layer
 * Keeps the v2.6 shell untouched and enriches only the EQUITY workspace.
 * IPO market source: IPO Market Report (latest issue 2026-09-05, data cutoff 2026-09-03).
 * Current IPO focus source: DART [발행조건확정] 증권신고서(지분증권), 덕산넵코어스, 2026-09-15.
 * CB source: CB Zero Finder public view inspected 2026-09-15.
 */
(function(){
  'use strict';

  var YC_EQUITY = {
    source: '김유찬 · IPO Market Report / CB Zero Finder',
    observed: '2026-09-16',
    ipo: {
      url: 'https://ipo-market-report.vercel.app/',
      reportDate: '2026.09.05',
      dataDate: '2026.09.03',
      period: '25.09~26.09',
      companies: 50,
      avgReturn: -18.6,
      medianReturn: -32.0,
      inBandShare: 86,
      inBandReturn: -21,
      belowBandShare: 4,
      belowBandReturn: 62,
      signal: 'SELECTIVE · 할인 요구'
    },
    ipoFocus: {
      name: '덕산넵코어스',
      filingDate: '2026.09.15',
      dartUrl: 'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260915000085',
      offerPrice: 14600,
      assessedValue: 19544,
      valuationDiscount: 25.3,
      h1RevenueEok: 237.69,
      h1GrossProfitEok: 25.27,
      h1OperatingProfitEok: 7.50,
      h1Gpm: 10.63,
      h1Opm: 3.16,
      preShares: 15795396,
      postShares: 18893889,
      fullyDilutedShares: 19600789,
      offerDilution: 19.62,
      fullyDilutedDilution: 24.09,
      publicFloat: 15.88,
      netProceedsEok: 429.94
    },
    cb: {
      url: 'https://cb-zero-finder.vercel.app/',
      dataDate: '2026-09-15',
      ytdCount: 362,
      ytdAmountTrn: 8.7,
      zeroZeroCount: 91,
      zeroZeroShare: 25.1,
      ytdAvgDilution: 12.8,
      recentAvgDilution: 16.0,
      highDilutionShare: 21.8,
      signal: 'WATCH · 희석 압력 상승'
    }
  };

  window.VALKYRIE_YC_EQUITY = YC_EQUITY;

  function cardByTitle(title){
    var cards=document.querySelectorAll('#pane .cd');
    for(var i=0;i<cards.length;i++){
      var t=cards[i].querySelector('.cdt');
      if(t && t.textContent.trim()===title) return cards[i];
    }
    return null;
  }

  function kv(label,value,cls){
    return '<div class="kv"><span>'+label+'</span><b'+(cls?' class="'+cls+'"':'')+'>'+value+'</b></div>';
  }

  function mini(label,value,cls){
    return '<div class="ycq-mini"><span>'+label+'</span><b'+(cls?' class="'+cls+'"':'')+'>'+value+'</b></div>';
  }

  function fmtWon(v){return Number(v).toLocaleString('ko-KR')+'원';}

  function enhanceEquity(){
    if(typeof curTab==='undefined' || curTab!=='EQUITY') return;
    var q=YC_EQUITY, f=q.ipoFocus;

    var ipo=cardByTitle('IPO MARKET REPORT');
    if(ipo){
      ipo.classList.add('ycq');
      ipo.innerHTML=
        '<div class="cdh"><span class="cdt">IPO MARKET REPORT</span><span class="cdo">김유찬 · STRUCTURAL</span></div>'+
        '<div class="ycq-signal"><span class="lbl">KOSDAQ IPO SIGNAL</span><strong>'+q.ipo.signal+'</strong></div>'+
        '<div class="ycq-grid">'+
          mini('최근 분석',q.ipo.companies+'개','')+
          mini('공모가 대비 평균',q.ipo.avgReturn.toFixed(1)+'%','rd')+
          mini('수익률 중앙값',q.ipo.medianReturn.toFixed(0)+'%','rd')+
          mini('밴드 내 평균',q.ipo.inBandReturn.toFixed(0)+'%','rd')+
        '</div>'+
        '<div class="ycq-focusbox">'+
          '<div class="ycq-focushead"><span>CURRENT IPO · DART '+f.filingDate.slice(5)+'</span><b>'+f.name+'</b></div>'+
          '<div class="ycq-grid">'+
            mini('확정 공모가',fmtWon(f.offerPrice),'')+
            mini('평가가 대비 할인',f.valuationDiscount.toFixed(1)+'%','gr')+
            mini('26H1 영업이익',f.h1OperatingProfitEok.toFixed(1)+'억','')+
            mini('공모 후 희석',f.offerDilution.toFixed(1)+'%','am')+
          '</div>'+
          kv('26H1 GPM / OPM',f.h1Gpm.toFixed(1)+'% / '+f.h1Opm.toFixed(1)+'%','')+
          kv('신주인수권 포함 Fully Diluted',f.fullyDilutedDilution.toFixed(1)+'%','rd')+
          kv('공모 후 일반 공모주주 비중',f.publicFloat.toFixed(2)+'%','')+
        '</div>'+
        '<div class="note ycq-note">시장 전체는 최근 IPO 50개 기준 약세. 현재 청약 종목은 <b>DART 실제 발행조건</b>으로 별도 확인합니다. 표시하지 못하는 ACC·RUNWAY 등은 임의 추정하지 않습니다.</div>'+
        '<div class="ycq-links"><a class="btn g ycq-link" href="'+q.ipo.url+'" target="_blank" rel="noopener noreferrer">IPO Market Report ↗</a><a class="btn g ycq-link" href="'+f.dartUrl+'" target="_blank" rel="noopener noreferrer">DART 원문 ↗</a></div>'+
        '<div class="note ycq-note">리포트 '+q.ipo.reportDate+' · IPO Focus 신고서 '+f.filingDate+'</div>';
    }

    var cb=cardByTitle('CB ZERO FINDER');
    if(cb){
      cb.classList.add('ycq');
      cb.innerHTML=
        '<div class="cdh"><span class="cdt">CB ZERO FINDER</span><span class="cdo">김유찬 · FUNDING</span></div>'+
        '<div class="ycq-signal warn"><span class="lbl">KOSDAQ FUNDING SIGNAL</span><strong>'+q.cb.signal+'</strong></div>'+
        '<div class="ycq-grid">'+
          mini('YTD 발행',q.cb.ytdCount+'건','')+
          mini('YTD 발행액',q.cb.ytdAmountTrn.toFixed(1)+'조','')+
          mini('ZERO·ZERO',q.cb.zeroZeroCount+'건 · '+q.cb.zeroZeroShare.toFixed(1)+'%','am')+
          mini('YTD 평균 희석',q.cb.ytdAvgDilution.toFixed(1)+'%','am')+
        '</div>'+
        kv('최근 90일 평균 희석률',q.cb.recentAvgDilution.toFixed(1)+'%','rd')+
        kv('최근 90일 · 희석 20% 이상',q.cb.highDilutionShare.toFixed(1)+'%','rd')+
        '<div class="note ycq-note">YTD 평균 희석 <b>12.8%</b> 대비 최근 90일 <b>16.0%</b> → 조달시장 내 희석 부담 상승. Credit → Funding → Equity Risk 연결에 사용합니다.</div>'+
        '<a class="btn g ycq-link" href="'+q.cb.url+'" target="_blank" rel="noopener noreferrer">CB Zero Finder 전체 보기 ↗</a>'+
        '<div class="note ycq-note">공개 화면 기준 '+q.cb.dataDate+'</div>';
    }
  }

  function installQuickLink(){
    var groups=document.querySelectorAll('.cmd .cps');
    var target=null;
    for(var i=0;i<groups.length;i++){
      if(!groups[i].classList.contains('sk')){target=groups[i];break;}
    }
    if(!target || target.querySelector('.ycq-chip')) return;
    var chip=document.createElement('div');
    chip.className='cp ycq-chip';
    chip.textContent='유찬 Equity';
    chip.title='KOSPI · KOSDAQ · IPO · CB Equity intelligence';
    chip.addEventListener('click',function(){
      if(typeof tab==='function') tab('EQUITY');
      setTimeout(function(){
        enhanceEquity();
        var cards=[document.getElementById('cd_ipo'),document.getElementById('cd_cb')];
        for(var j=0;j<cards.length;j++){
          if(cards[j]){
            cards[j].classList.remove('ycq-focus');
            void cards[j].offsetWidth;
            cards[j].classList.add('ycq-focus');
          }
        }
      },30);
    });
    target.appendChild(chip);
  }

  var originalPaneRender=window.paneRender;
  if(typeof originalPaneRender==='function'){
    window.paneRender=function(){
      originalPaneRender.apply(this,arguments);
      enhanceEquity();
    };
  }

  installQuickLink();
  enhanceEquity();
})();
