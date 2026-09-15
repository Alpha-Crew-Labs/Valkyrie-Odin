/* VALKYRIE · YC Equity integration layer
 * Keeps the v2.6 shell untouched and enriches only the EQUITY workspace.
 * IPO source: IPO Market Report (latest issue 2026-09-05, data cutoff 2026-09-03).
 * CB source: CB Zero Finder live public view inspected 2026-09-15.
 * These are displayed source snapshots, not cross-origin live API syncs.
 */
(function(){
  'use strict';

  var YC_EQUITY = {
    source: '김유찬 · IPO Market Report / CB Zero Finder',
    observed: '2026-09-15',
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

  function enhanceEquity(){
    if(typeof curTab==='undefined' || curTab!=='EQUITY') return;
    var q=YC_EQUITY;

    var ipo=cardByTitle('IPO MARKET REPORT');
    if(ipo){
      ipo.classList.add('ycq');
      ipo.innerHTML=
        '<div class="cdh"><span class="cdt">IPO MARKET REPORT</span><span class="cdo">김유찬 · REPORT SNAPSHOT</span></div>'+
        '<div class="ycq-signal"><span class="lbl">IPO MARKET SIGNAL</span><strong>'+q.ipo.signal+'</strong></div>'+
        '<div class="ycq-grid">'+
          mini('분석 기업',q.ipo.companies+'개','')+
          mini('공모가 대비 평균',q.ipo.avgReturn.toFixed(1)+'%','rd')+
          mini('수익률 중앙값',q.ipo.medianReturn.toFixed(0)+'%','rd')+
          mini('밴드 내 확정 비중',q.ipo.inBandShare.toFixed(0)+'%','am')+
        '</div>'+
        kv('밴드 내 확정 평균수익률',q.ipo.inBandReturn.toFixed(0)+'%','rd')+
        kv('밴드 하회 확정 비중',q.ipo.belowBandShare.toFixed(0)+'%','')+
        kv('밴드 하회 평균수익률','+'+q.ipo.belowBandReturn.toFixed(0)+'%','gr')+
        '<div class="note ycq-note">밴드 안에서 가격을 받아도 평균 <b>-21%</b> → 신규 IPO는 가격보다 <b>할인폭과 종목 선별</b>이 중요. 수요예측 경쟁률·확약률은 현 리포트에 없으므로 임의 표시하지 않음.</div>'+
        '<a class="btn g ycq-link" href="'+q.ipo.url+'" target="_blank" rel="noopener noreferrer" aria-label="김유찬 IPO Market Report 새 창에서 열기">IPO Market Report 전체 보기 ↗</a>'+
        '<div class="note ycq-note">발행 '+q.ipo.reportDate+' · 데이터 기준 '+q.ipo.dataDate+' · '+q.ipo.period+'</div>';
    }

    var cb=cardByTitle('CB ZERO FINDER');
    if(cb){
      cb.classList.add('ycq');
      cb.innerHTML=
        '<div class="cdh"><span class="cdt">CB ZERO FINDER</span><span class="cdo">김유찬 · LIVE SNAPSHOT</span></div>'+
        '<div class="ycq-signal warn"><span class="lbl">FUNDING / DILUTION SIGNAL</span><strong>'+q.cb.signal+'</strong></div>'+
        '<div class="ycq-grid">'+
          mini('YTD 발행',q.cb.ytdCount+'건','')+
          mini('YTD 발행액',q.cb.ytdAmountTrn.toFixed(1)+'조','')+
          mini('ZERO·ZERO',q.cb.zeroZeroCount+'건 · '+q.cb.zeroZeroShare.toFixed(1)+'%','am')+
          mini('YTD 평균 희석',q.cb.ytdAvgDilution.toFixed(1)+'%','am')+
        '</div>'+
        kv('최근 90일 평균 희석률',q.cb.recentAvgDilution.toFixed(1)+'%','rd')+
        kv('최근 90일 · 희석 20% 이상',q.cb.highDilutionShare.toFixed(1)+'%','rd')+
        '<div class="note ycq-note">YTD 평균 희석 <b>12.8%</b> 대비 최근 90일 <b>16.0%</b> → 조달시장 내 희석 부담이 상승. ZERO·ZERO 비중도 높아 <b>발행 구조와 리픽싱 조건 동시 확인</b> 필요.</div>'+
        '<a class="btn g ycq-link" href="'+q.cb.url+'" target="_blank" rel="noopener noreferrer" aria-label="김유찬 CB Zero Finder 새 창에서 열기">CB Zero Finder 전체 보기 ↗</a>'+
        '<div class="note ycq-note">공개 화면 기준 '+q.cb.dataDate+' · YTD와 최근 90일 지표는 서로 다른 기간 범위</div>';
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
    chip.title='IPO Market Report · CB Zero Finder 시그널 보기';
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
