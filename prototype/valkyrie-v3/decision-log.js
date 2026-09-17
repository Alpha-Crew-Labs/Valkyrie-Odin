/* VALKYRIE v3 · live decision-log overlay
 * Records only user-triggered shocks and resolved command queries.
 * Outcome columns remain PENDING until real forward performance exists.
 */
(function(){
  'use strict';

  var lastKey='',lastAt=0;

  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function nowLabel(){var d=new Date();return String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');}
  function dedup(key){var t=Date.now();if(key===lastKey&&t-lastAt<3000)return true;lastKey=key;lastAt=t;return false;}
  function pendingCell(){return '<span class="pd">—</span>';}
  function liveCoreReady(){return !!(window.VALKYRIE_LIVE_CORE&&window.VALKYRIE_LIVE_CORE.status==='ready'&&window.VALKYRIE_LIVE_CORE.data&&window.VALKYRIE_LIVE_CORE.data.ok);}
  function signalFor(domain){if(typeof si!=='undefined'&&si===4&&!liveCoreReady())return null;var sg=window.cur&&cur.sg&&cur.sg[domain.toLowerCase()];return Array.isArray(sg)?sg:null;}
  function domainFor(q){return /kospi|kosdaq|주식|시장|equity|ipo|청약|cb|리픽싱|전환/i.test(q)?'EQUITY':'RATES';}
  function shockLabel(k){return k==='ust'?'UST +50bp':k==='cr'?'CREDIT +40bp':k==='bok'?'BOK +25bp':k==='all'?'복합 스트레스':String(k||'SHOCK').toUpperCase();}
  function pushLog(entry){
    if(!Array.isArray(window.LOG))return;
    if(dedup(entry.key))return;
    LOG.unshift(entry);if(LOG.length>30)LOG.length=30;
    renderRows();
  }
  function rowHtml(x){
    return '<tr class="dl-live"><td class="num">'+esc(x.when)+'</td><td style="color:#E6EBF3">'+esc(x.decision)+'</td><td style="color:#6E7889">'+esc(x.evidence)+'</td>'+
      '<td class="n">'+pendingCell()+'</td><td class="n">'+pendingCell()+'</td><td class="n">'+pendingCell()+'</td><td class="n">'+pendingCell()+'</td><td class="n"><span class="pd">PENDING</span></td></tr>';
  }
  function renderRows(){
    var body=document.getElementById('dlb');if(!body||!Array.isArray(window.LOG))return;
    var old=body.querySelectorAll('tr.dl-live');for(var i=0;i<old.length;i++)old[i].remove();
    var html=LOG.slice(0,8).map(rowHtml).join('');if(!html)return;
    body.insertAdjacentHTML('afterbegin',html);
  }
  function logShock(kind){
    if(typeof calc!=='function')return;
    var trusted=typeof si==='undefined'||si!==4||liveCoreReady(),o=trusted?calc():null,decision='SHOCK · '+shockLabel(kind),evidence=trusted?'국고3Y '+(o&&isFinite(o.rat_ktb)?o.rat_ktb.toFixed(2)+'%':'—')+' · CREDIT '+(o&&isFinite(o.rat_credit)?Math.round(o.rat_credit)+'bp':'—'):'PUBLIC INPUT REQUIRED · SCENARIO NOT QUANTIFIED';
    pushLog({key:'shock|'+kind+'|'+evidence,when:nowLabel(),decision:decision,evidence:evidence});
  }
  function logCommand(q){
    q=String(q||'').trim();if(!q)return;
    var domain=domainFor(q),sg=signalFor(domain),signal=sg&&sg[0]?sg[0]:'SIGNAL PENDING',evidence=sg&&sg[2]?sg[2]:'PUBLIC INPUT REQUIRED';
    if(typeof banner==='function')banner('QUERY RESOLVED · '+domain+' · '+signal,evidence);
    pushLog({key:'query|'+domain+'|'+signal+'|'+q,when:nowLabel(),decision:signal,evidence:evidence});
  }
  function wrapPaneRender(){
    var base=window.paneRender;if(typeof base!=='function'||base.__decisionLogWrapped)return;
    var fn=function(){var r=base.apply(this,arguments);renderRows();return r;};fn.__decisionLogWrapped=true;window.paneRender=fn;
  }
  function wrapShock(){
    var base=window.shock;if(typeof base!=='function'||base.__decisionLogWrapped)return;
    var fn=function(k){var blocked=typeof busy!=='undefined'&&busy;var r=base.apply(this,arguments);if(!blocked)setTimeout(function(){logShock(k);},0);return r;};fn.__decisionLogWrapped=true;window.shock=fn;
  }
  function wrapCommand(){
    var base=window.command;if(typeof base!=='function'||base.__decisionLogWrapped)return;
    var fn=function(q){var blocked=typeof busy!=='undefined'&&busy;var text=String(q||'');var r=base.apply(this,arguments);if(!blocked&&!/50bp|10년물|ust/i.test(text))setTimeout(function(){logCommand(text);},0);return r;};fn.__decisionLogWrapped=true;window.command=fn;
  }

  wrapPaneRender();wrapShock();wrapCommand();renderRows();
})();
