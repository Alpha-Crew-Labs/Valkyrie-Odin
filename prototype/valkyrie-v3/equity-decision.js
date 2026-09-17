/* VALKYRIE v3 · Equity decision signal combiner
 * Combines already-fetched public signals only; no network calls and no fabricated fallback.
 */
(function(){
  'use strict';
  var lastSig='';

  function n(v){if(v===null||v===undefined||v==='')return null;var x=Number(v);return Number.isFinite(x)?x:null;}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  var TONE_HEX={gr:'#31C08C',rd:'#EF5A61',am:'#EFA83A'};
  function marketRead(){
    var s=window.VALKYRIE_LIVE_EQUITY,d=s&&s.status==='ready'&&s.data&&s.data.ok?s.data:null,p=d&&d.pulse,score=p?n(p.score):null;
    if(score===null)return null;
    return {key:'시장',bias:score>=63?1:score<=37?-1:0,text:'시장 '+(p.regime||'NEUTRAL')+' '+Math.round(score)+'/100'};
  }
  function structuralRead(){
    var s=window.VALKYRIE_YC_EQUITY,d=s&&s.status==='ready'&&s.data&&s.data.ok?s.data:null,cb=d&&d.cb;
    if(!cb||cb.ok!==true)return null;
    var z=n(cb.zeroZeroSharePct),dil=n(cb.averageDilutionPct),bias=(dil!==null&&dil>=20)||(z!==null&&z>=35)?-1:(dil!==null&&dil<10&&z!==null&&z<20)?1:0;
    var state=bias>0?'완화':bias<0?'경계':'혼조';
    return {key:'CB',bias:bias,text:'CB '+state+(z===null?'':' · 무이표·무보장 '+Math.round(z)+'%')+(dil===null?'':' · 평균희석 '+dil.toFixed(1)+'%')};
  }
  function fundingRead(){
    var s=window.VALKYRIE_YC_EQUITY,d=s&&s.status==='ready'&&s.data&&s.data.ok?s.data:null,ipo=d&&d.ipo;
    if(!ipo||ipo.ok!==true)return null;
    var above=n(ipo.aboveOfferPct);if(above===null)return null;
    var bias=above>=55?1:above<=35?-1:0,state=bias>0?'우호':bias<0?'위축':'중립';
    return {key:'IPO',bias:bias,text:'IPO 조달 '+state+' '+Math.round(above)+'%'};
  }
  function fundamentalRead(){
    var s=window.VALKYRIE_LIVE_EQUITY,d=s&&s.status==='ready'&&s.data&&s.data.ok?s.data:null,r=d&&d.research,e=r&&r.ok===true&&!r.stale?r.earnings:null,im=e?n(e.improveRatePct):null;
    if(im===null)return null;
    return {key:'실적',bias:im>=60?1:im<=40?-1:0,text:'실적 개선 '+Math.round(im)+'%'};
  }
  function synthesize(){
    var reads=[marketRead(),structuralRead(),fundingRead(),fundamentalRead()].filter(Boolean),count=reads.length;
    if(count<2)return {count:count,label:'DATA PENDING',tone:'am',summary:count+'/4 신호 확보 · 최소 2/4 필요',detail:reads.map(function(x){return x.text;}).join(' · ')};
    var avg=reads.reduce(function(a,x){return a+x.bias;},0)/count,label=avg>=.25?'구조 우호':avg<=-.25?'구조 경계':'혼조·중립',tone=avg>=.25?'gr':avg<=-.25?'rd':'am';
    return {count:count,label:label,tone:tone,summary:reads.map(function(x){return x.text;}).join(' · '),detail:reads.map(function(x){return x.key+': '+x.text;}).join('\n')};
  }
  function render(){
    if(typeof curTab!=='undefined'&&curTab!=='EQUITY')return;
    var host=document.getElementById('cd_live_equity');if(!host)return;
    var d=synthesize(),sig=d.label+'|'+d.count+'|'+d.summary,node=document.getElementById('equityDecisionLine');
    if(node&&node.parentNode!==host){node.remove();node=null;}
    if(!node){node=document.createElement('div');node.id='equityDecisionLine';node.className='liveq-rel equity-decision-line';var source=host.querySelector('.liveq-source');if(source)host.insertBefore(node,source);else host.appendChild(node);}
    if(lastSig===sig&&node.dataset.sig===sig)return;lastSig=sig;node.dataset.sig=sig;node.title=d.detail||d.summary;
    node.innerHTML='<span>EQUITY DECISION</span><b style="color:'+(TONE_HEX[d.tone]||'#E6EBF3')+'">'+esc(d.label)+'</b><em>'+esc(d.summary)+'</em>';
  }
  function wrapPaneRender(){var base=window.paneRender;if(typeof base!=='function'||base.__equityDecisionWrapped)return;var fn=function(){var r=base.apply(this,arguments);render();return r;};fn.__equityDecisionWrapped=true;window.paneRender=fn;}

  wrapPaneRender();render();setInterval(render,2200);
})();
