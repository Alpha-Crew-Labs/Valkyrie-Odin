/* VALKYRIE · HK Quant Macro Terminal integration layer
 * Keeps the v2.6 shell untouched and enriches only the MACRO workspace.
 * Source snapshot: public Quant Macro Terminal Pro, inspected 2026-09-15.
 * This is a displayed terminal snapshot, not a live API sync.
 */
(function(){
  'use strict';

  var HK_QUANT = {
    source: '정희강 · Quant Macro Terminal Pro',
    observed: '2026-09-15',
    url: 'https://quant-macro-terminal-pro-pt7qjyphjackrh79wmj29w.streamlit.app/',
    shock: { fed: 0.50, vix: 10, hy: 150 },
    weights: { equity: 40, bond: 30, commodityGold: 20 },
    result: {
      us10y: 4.96,
      curve10y2y: 0.33,
      real10y: 2.60,
      vix: 15.8,
      pnl: -3.85,
      var95: -5.40,
      status: 'STABLE'
    }
  };

  window.VALKYRIE_HK_QUANT = HK_QUANT;

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

  function enhanceMacro(){
    if(typeof curTab==='undefined' || curTab!=='MACRO') return;

    var q=HK_QUANT;
    var stress=cardByTitle('STRESS TEST · VaR');
    if(stress){
      stress.id='cd_hk_stress';
      stress.classList.add('hkq');
      stress.innerHTML=
        '<div class="cdh"><span class="cdt">STRESS TEST · VaR</span><span class="cdo">정희강 · TERMINAL SNAPSHOT</span></div>'+
        '<div class="hkq-section">MACRO SHOCK</div>'+
        kv('Fed 기준금리 충격','+'+q.shock.fed.toFixed(2)+'%p','am')+
        kv('VIX 변동성 쇼크','+'+q.shock.vix,'am')+
        kv('HY 스프레드 확대','+'+q.shock.hy+'bp','am')+
        '<div class="hkq-section result">PORTFOLIO RESULT</div>'+
        kv('예상 Portfolio PnL',q.result.pnl.toFixed(2)+'%','rd')+
        kv('Daily VaR · 95%',q.result.var95.toFixed(2)+'%','rd')+
        kv('Risk Status',q.result.status,'gr')+
        '<div class="note hkq-note">희강 Quant Terminal의 공개 화면 수치를 <b>1:1 Snapshot</b>으로 표시 · '+q.observed+'</div>';
    }

    var stack=cardByTitle('MODEL STACK');
    if(stack){
      stack.id='cd_hk_terminal';
      stack.classList.add('hkq');
      stack.innerHTML=
        '<div class="cdh"><span class="cdt">QUANT TERMINAL PRO</span><span class="cdo">정희강 · FRED LIVE</span></div>'+
        kv('US 10Y Yield',q.result.us10y.toFixed(2)+'%','cy')+
        kv('10Y-2Y Spread','+'+q.result.curve10y2y.toFixed(2)+'%p','gr')+
        kv('10Y Real Rate',q.result.real10y.toFixed(2)+'%','am')+
        kv('Market VIX',q.result.vix.toFixed(1),'')+
        '<div class="hkq-section">TARGET WEIGHTS</div>'+
        '<div class="hkq-weights"><span>주식 <b>'+q.weights.equity+'%</b></span><span>채권 <b>'+q.weights.bond+'%</b></span><span>금·원자재 <b>'+q.weights.commodityGold+'%</b></span></div>'+
        '<a class="btn g hkq-link" href="'+q.url+'" target="_blank" rel="noopener noreferrer" aria-label="정희강 Quant Macro Terminal Pro 새 창에서 열기">Quant Terminal 전체 보기 ↗</a>'+
        '<div class="note hkq-note">상세 Monte Carlo · Macro Clock · 3D Yield Curve · Financial Stress는 원 Terminal에서 확인</div>';
    }
  }

  function installQuickLink(){
    var shockBar=document.querySelector('.cps.sk');
    if(!shockBar || shockBar.querySelector('.hkq-chip')) return;
    var chip=document.createElement('div');
    chip.className='cp hkq-chip';
    chip.textContent='희강 Quant';
    chip.title='정희강 Stress Test / VaR 결과 보기';
    chip.addEventListener('click',function(){
      if(typeof tab==='function') tab('MACRO');
      setTimeout(function(){
        enhanceMacro();
        var card=document.getElementById('cd_hk_stress');
        if(card){
          card.classList.remove('hkq-focus');
          void card.offsetWidth;
          card.classList.add('hkq-focus');
        }
      },30);
    });
    shockBar.appendChild(chip);
  }

  var originalPaneRender=window.paneRender;
  if(typeof originalPaneRender==='function'){
    window.paneRender=function(){
      originalPaneRender.apply(this,arguments);
      enhanceMacro();
    };
  }

  installQuickLink();
  enhanceMacro();
})();
