/* VALKYRIE · Equity research insight layer
 * Browser reads only a same-origin aggregate snapshot.
 * Source apps are sampled by GitHub Actions twice per weekday; no Vercel runtime dependency.
 * No fabricated fallback values.
 */
(function(){
  'use strict';

  var SNAPSHOT='./data/research-insights.json';
  var POLL_MS=1800000;
  var STATE={status:'loading',data:null,error:null,lastFetch:0,timer:null,mode:'12H_SNAPSHOT'};
  window.VALKYRIE_YC_EQUITY=STATE;

  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function n(v){if(v===null||v===undefined||v==="")return null;var x=Number(v);return Number.isFinite(x)?x:null;}
  function pct(v,d){var x=n(v);return x===null?'—':(x>0?'+':'')+x.toFixed(d==null?1:d)+'%';}
  function plainPct(v,d){var x=n(v);return x===null?'—':x.toFixed(d==null?1:d)+'%';}
  function count(v,label){var x=n(v);return x===null?'—':Math.round(x).toLocaleString('ko-KR')+(label||'');}
  function amount(v){var x=n(v);if(x===null)return '—';if(Math.abs(x)>=10000)return (x/10000).toFixed(1)+'조';return Math.round(x).toLocaleString('ko-KR')+'억';}
  function tone(v){var x=n(v);return x===null?'':x>0?'gr':x<0?'rd':'';}
  function clamp(v){return Math.max(0,Math.min(100,Number(v)||0));}
  function scopePeriod(p){if(!p)return '';if(typeof p==='string')return p;var a=p.begin||'',b=p.end||'';if(a&&b)return a.slice(2)+' ~ '+b.slice(2);return a||b||'';}
  function cardByTitle(title){
    var cards=document.querySelectorAll('#pane .cd');
    for(var i=0;i<cards.length;i++){
      var t=cards[i].querySelector('.cdt');
      if(t&&t.textContent.trim()===title)return cards[i];
    }
    return null;
  }
  function link(url,label){return '<a class="ycq-detail" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+esc(label)+' ↗</a>';}
  function mini(label,value,cls){return '<div class="ycq-mini"><span>'+esc(label)+'</span><b'+(cls?' class="'+cls+'"':'')+'>'+esc(value)+'</b></div>';}
  function meter(value,cls){var x=n(value);return '<div class="ycq-meter"><i class="'+(cls||'')+'" style="width:'+(x===null?0:clamp(x))+'%"></i></div>';}

  async function fetchJson(url){
    var ctl=new AbortController(),timer=setTimeout(function(){ctl.abort();},7000);
    try{
      var r=await fetch(url,{cache:'no-store',credentials:'omit',signal:ctl.signal,headers:{accept:'application/json'}});
      if(!r.ok)throw new Error('HTTP '+r.status);
      return await r.json();
    }finally{clearTimeout(timer);}
  }

  function pending(title,url){
    return '<div class="cdh"><span class="cdt">'+esc(title)+'</span><span class="cdo">12H</span></div>'+
      '<div class="ycq-hero pending"><span>INSIGHT</span><strong>DATA PENDING</strong></div>'+
      '<div class="ycq-empty">공개 리서치 스냅샷 확인 대기</div>'+link(url,'DETAIL');
  }

  function ipoCard(x){
    if(!x||!x.ok)return pending('IPO MARKET REPORT',x&&x.url||'https://ipo-market-report.vercel.app/');
    var scope=[x.period,x.companies!=null?count(x.companies,' IPO'):''].filter(Boolean).join(' · ');
    var hero=x.avgCurrentReturnPct;
    var best=x.best&&x.best.name?(x.best.name+' '+pct(x.best.returnPct,0)):'—';
    var worst=x.worst&&x.worst.name?(x.worst.name+' '+pct(x.worst.returnPct,0)):'—';
    return '<div class="cdh"><span class="cdt">IPO MARKET REPORT</span><span class="cdo">'+esc(scope||'12M')+'</span></div>'+
      '<div class="ycq-hero"><span>AVG RETURN</span><strong class="'+tone(hero)+'">'+esc(pct(hero,1))+'</strong></div>'+
      '<div class="ycq-grid">'+
        mini('공모가 상회',plainPct(x.aboveOfferPct,1),'cy')+
        mini('중앙값',pct(x.medianCurrentReturnPct,1),tone(x.medianCurrentReturnPct))+
      '</div>'+meter(x.aboveOfferPct,'cy')+
      '<div class="ycq-range"><span><em>BEST</em>'+esc(best)+'</span><span><em>WORST</em>'+esc(worst)+'</span></div>'+
      link(x.url||'https://ipo-market-report.vercel.app/','REPORT');
  }

  function cbCard(x){
    if(!x||!x.ok)return pending('CB ZERO FINDER',x&&x.url||'https://cb-zero-finder.vercel.app/');
    var scope=[scopePeriod(x.period),x.totalCount!=null?count(x.totalCount,'건'):''].filter(Boolean).join(' · ');
    var top=x.topIssue&&x.topIssue.name?(x.topIssue.name+' · '+amount(x.topIssue.amountEok)):'—';
    return '<div class="cdh"><span class="cdt">CB ZERO FINDER</span><span class="cdo">'+esc(scope||'SNAPSHOT')+'</span></div>'+
      '<div class="ycq-hero"><span>ZERO · ZERO</span><strong class="am">'+esc(plainPct(x.zeroZeroSharePct,1))+'</strong></div>'+
      '<div class="ycq-grid">'+
        mini('발행액',amount(x.totalAmountEok),'')+
        mini('평균 희석',plainPct(x.averageDilutionPct,1),n(x.averageDilutionPct)>=20?'rd':'')+
      '</div>'+meter(x.zeroZeroSharePct,'am')+
      '<div class="ycq-focusline"><span>최대 발행</span><b>'+esc(top)+'</b></div>'+
      link(x.url||'https://cb-zero-finder.vercel.app/','SCREENER');
  }

  function enhanceEquity(){
    if(typeof curTab==='undefined'||curTab!=='EQUITY')return;
    var ipo=cardByTitle('IPO MARKET REPORT'),cb=cardByTitle('CB ZERO FINDER');
    if(!ipo&&!cb)return;
    var d=STATE.data;
    if(ipo){ipo.classList.add('ycq');ipo.innerHTML=d?ipoCard(d.ipo):pending('IPO MARKET REPORT','https://ipo-market-report.vercel.app/');}
    if(cb){cb.classList.add('ycq');cb.innerHTML=d?cbCard(d.cb):pending('CB ZERO FINDER','https://cb-zero-finder.vercel.app/');}
    if(typeof window.declutterValkyrie==='function')window.declutterValkyrie();
  }

  async function refresh(){
    STATE.status='loading';STATE.error=null;
    try{
      var d=await fetchJson(SNAPSHOT+'?t='+Date.now());
      if(!d||d.ok!==true)throw new Error('research snapshot unavailable');
      STATE.data=d;STATE.status='ready';STATE.lastFetch=Date.now();
    }catch(e){
      STATE.status='error';STATE.data=null;STATE.error=String(e&&e.message||e);STATE.lastFetch=Date.now();
    }
    enhanceEquity();
  }

  var originalPaneRender=window.paneRender;
  if(typeof originalPaneRender==='function')window.paneRender=function(){var r=originalPaneRender.apply(this,arguments);enhanceEquity();return r;};

  enhanceEquity();
  refresh();
  STATE.timer=setInterval(refresh,POLL_MS);
})();
