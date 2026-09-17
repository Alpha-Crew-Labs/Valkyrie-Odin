/* VALKYRIE v3 · live positioning ticks on the EQUITY ontology nodes
 * The ontology graph already shows eq_fin / eq_val / eq_cb / eq_ipo as static
 * value readouts; nothing on the node itself said whether that value is
 * currently OW/N/UW-leaning, and nothing visibly changed when a live feed
 * actually resolved. This adds a small horizontal tick - the same
 * over/neutral/underweight vocabulary the Positioning Gauge already uses -
 * directly on each node, reusing equity-decision.js's own four reads
 * (window.VALKYRIE_EQUITY_READS) so there is exactly one place that decides
 * what counts as OW/N/UW. No network calls, no new data, no fabricated
 * fallback: a node with no resolved read gets a muted, tickless track.
 *
 * Placement: the bottom ~10px of every non-signal node's box is already
 * blank in this build - domain-ui.css hides .nown (the owner-name line) -
 * so the tick is drawn there via two small <rect>s appended into the node's
 * existing <g class="nd">, inside its unchanged x/y/w/h. Node positions,
 * the 22-edge layout and every other piece of ontology geometry are
 * untouched.
 */
(function(){
  'use strict';

  var MAP={
    eq_fin:{read:'fundamentalRead',label:'실적'},
    eq_val:{read:'marketRead',label:'시장'},
    eq_cb:{read:'structuralRead',label:'CB'},
    eq_ipo:{read:'fundingRead',label:'IPO'}
  };
  var TRACK='#1A222D',MUTED='#2B3542',GR='#31C08C',AM='#EFA83A',RD='#EF5A61';
  var lastSig={};

  function ce(t,a){var e=document.createElementNS('http://www.w3.org/2000/svg',t);for(var k in a)e.setAttribute(k,a[k]);return e;}

  function ensureStyle(){
    if(document.getElementById('valkyrieLiveTickStyle'))return;
    var st=document.createElement('style');st.id='valkyrieLiveTickStyle';
    st.textContent='.vlt-pulse{animation:valkyrieLiveTick .85s ease-out}'+
      '@keyframes valkyrieLiveTick{0%{filter:brightness(1)}30%{filter:brightness(2.1)}100%{filter:brightness(1)}}';
    document.head.appendChild(st);
  }

  function ensureTick(id){
    if(typeof ND==='undefined'||!ND[id]||typeof NEL==='undefined'||!NEL[id])return null;
    var g=NEL[id].g;if(!g)return null;
    var mark=g.querySelector('.vlt-track');
    if(mark){var existingTick=g.querySelector('.vlt-tick');return {track:mark,tick:existingTick,titleEl:existingTick?existingTick.querySelector('title'):null};}
    var n=ND[id],w=(typeof W==='function'?W(id):142),h=(typeof H==='function'?H(id):46);
    var x0=n.x+9,x1=n.x+w-9,y=n.y+h-5;
    var track=ce('rect',{x:x0,y:y,width:x1-x0,height:1.6,rx:.8,'class':'vlt-track',fill:TRACK});
    var tick=ce('rect',{x:x0,y:y-1.6,width:3,height:4.8,rx:1,'class':'vlt-tick',fill:MUTED});
    var ttl=ce('title',{});tick.appendChild(ttl);
    g.appendChild(track);g.appendChild(tick);
    return {track:track,tick:tick,titleEl:ttl,x0:x0,x1:x1,y:y};
  }

  function apply(id,cfg){
    var els=ensureTick(id);if(!els)return;
    var fn=window.VALKYRIE_EQUITY_READS&&window.VALKYRIE_EQUITY_READS[cfg.read];
    var r=typeof fn==='function'?fn():null;
    var n=ND[id],w=(typeof W==='function'?W(id):142),x0=n.x+9,x1=n.x+w-9,trackW=x1-x0;
    var sig=r?(r.bias+'|'+r.text):'pending';
    if(lastSig[id]===sig)return;
    var wasSet=lastSig[id]!==undefined;
    lastSig[id]=sig;
    if(!r){
      els.tick.setAttribute('fill',MUTED);
      els.tick.setAttribute('x',x0+trackW/2-1.5);
      if(els.titleEl)els.titleEl.textContent=cfg.label+' · DATA PENDING';
      return;
    }
    var frac=(r.bias+1)/2,tx=x0+frac*(trackW-3);
    var color=r.bias>0?GR:(r.bias<0?RD:AM);
    els.tick.setAttribute('fill',color);
    els.tick.setAttribute('x',tx);
    if(els.titleEl)els.titleEl.textContent=(r.bias>0?'OW':(r.bias<0?'UW':'N'))+' · '+cfg.label+' · '+r.text;
    if(wasSet&&typeof ripple==='function')ripple(id);
    els.tick.classList.remove('vlt-pulse');void els.tick.getBoundingClientRect();els.tick.classList.add('vlt-pulse');
  }

  function refresh(){
    ensureStyle();
    for(var id in MAP)apply(id,MAP[id]);
  }

  function wrapPaneRender(){
    var base=window.paneRender;if(typeof base!=='function'||base.__equityNodeLiveWrapped)return;
    var fn=function(){var r=base.apply(this,arguments);refresh();return r;};
    fn.__equityNodeLiveWrapped=true;window.paneRender=fn;
  }
  function wrapTab(){
    var base=window.tab;if(typeof base!=='function'||base.__equityNodeLiveWrapped)return;
    var fn=function(t,hl){var r=base.apply(this,arguments);if(t==='EQUITY')refresh();return r;};
    fn.__equityNodeLiveWrapped=true;window.tab=fn;
  }

  wrapPaneRender();wrapTab();refresh();setInterval(refresh,2500);
})();
