/* VALKYRIE v3 · ontology node text fitting
 *
 * Every node box in the chain SVG is a fixed-width rect (W(id), 142px for a
 * standard object) with its texts positioned by hand in data-core.js: the
 * value line (.nvl / .tsv) starts at rect.x + pad and the source sub-label
 * (.nsb) is end-anchored at rect.x + width - pad, and on a standard node both
 * sit on the SAME baseline (y + 32). That is fine while the value is short
 * ("4.18%", "+38bp"), but several real strings this app writes are wider than
 * the box on their own - measured in the live DOM, "MODEL PENDING" renders at
 * 155.1px and "DATA PENDING" at 136.5px against 133px of usable width - so
 * they spill past the border and, on the same baseline, collide with the
 * sub-label ("2.8%" printed straight through "PUBLIC API UNAVAILABLE"). The
 * effect is worse on mobile, where mobile.css raises both font sizes.
 *
 * Rather than edit every writer (data-core.js, live-core.js, domain-ui.js,
 * equity-yc.js and theme-equity.js all set node values, some through
 * MutationObserver guards), this file fixes it at the point of rendering:
 * it measures what is actually on screen and makes it fit the box it is
 * already in. No node position, box size, font size, ontology entry or
 * relation is changed - only the glyph spacing of text that would otherwise
 * render outside its own border.
 *
 * Rules per baseline:
 *   - the value (start-anchored) is only ever re-spaced, never re-worded: an
 *     overflow is absorbed with textLength + lengthAdjust="spacingAndGlyphs",
 *     SVG's own fitting, so no character is dropped and "MODEL PENDING" stays
 *     fully readable. Keeping textContent untouched also matters because
 *     domain-ui.js holds MutationObservers on the mac_krcpi / eq_cb / eq_ipo
 *     values that rewrite them on any character change; textLength is an
 *     attribute, so those observers never see it.
 *   - the end-anchored sub-label then gets whatever gap is left: it renders
 *     as-is if it fits, is truncated with an ellipsis (and a <title> carrying
 *     the full string) if it does not, and is hidden only when the gap is too
 *     small to show anything meaningful. That is what removes the overlap when
 *     the value itself is a full-width PENDING label.
 *
 * Runs on a 700ms interval and after paneRender/tab, matching the self-healing
 * pattern equity-node-live.js and chain-briefing.js already use, because the
 * writers above repaint node text on their own timers.
 */
(function(){
  'use strict';

  var MIN_SUB=24;      /* below this many user units a sub-label is unreadable */
  var SEP=7;           /* minimum clear space between value and sub-label */

  function widthOf(t){
    try{return t.getComputedTextLength();}catch(e){return 0;}
  }

  /* Re-measure from the pristine string, not from whatever we wrote last pass. */
  function sourceText(t){
    if(t.__nfOut===undefined||t.textContent!==t.__nfOut)t.__nfSrc=t.textContent;
    return t.__nfSrc===undefined?t.textContent:t.__nfSrc;
  }
  function put(t,s){
    if(t.textContent!==s)t.textContent=s;
    t.__nfOut=s;
  }
  function clearFit(t){
    if(t.hasAttribute('textLength'))t.removeAttribute('textLength');
    if(t.hasAttribute('lengthAdjust'))t.removeAttribute('lengthAdjust');
  }
  function squeeze(t,to){
    t.setAttribute('lengthAdjust','spacingAndGlyphs');
    t.setAttribute('textLength',to.toFixed(2));
  }
  function setTitle(t,full){
    var ttl=t.querySelector('title');
    if(!full){if(ttl)t.removeChild(ttl);return;}
    if(!ttl){ttl=document.createElementNS('http://www.w3.org/2000/svg','title');t.appendChild(ttl);}
    if(ttl.textContent!==full)ttl.textContent=full;
  }

  /* Longest prefix of src that renders within limit, plus an ellipsis. */
  function truncate(t,src,limit){
    var lo=0,hi=src.length,best='';
    while(lo<=hi){
      var mid=(lo+hi)>>1,cand=src.slice(0,mid).replace(/\s+$/,'')+'…';
      put(t,cand);clearFit(t);
      if(widthOf(t)<=limit){best=cand;lo=mid+1;}else{hi=mid-1;}
    }
    return best;
  }

  function fitLine(rect,texts){
    var rx=parseFloat(rect.getAttribute('x')),rw=parseFloat(rect.getAttribute('width'));
    if(!isFinite(rx)||!isFinite(rw))return;

    var lead=null,tail=null;
    for(var i=0;i<texts.length;i++){
      var t=texts[i];
      if(t.getAttribute('text-anchor')==='end')tail=t;else if(!lead)lead=t;
    }

    var leadRight=rx;
    if(lead){
      var lx=parseFloat(lead.getAttribute('x')),pad=isFinite(lx)?lx-rx:9;
      var room=rw-pad*2;
      clearFit(lead);
      var nat=widthOf(lead);
      /* The value line is only ever re-spaced, never re-worded: domain-ui.js
       * keeps MutationObservers on mac_krcpi / eq_cb / eq_ipo values that
       * rewrite their text on any character change, so touching textContent
       * here would ping-pong forever. textLength is an attribute, so it is
       * invisible to those observers and safe. */
      if(room>0&&nat>room){squeeze(lead,room);leadRight=lx+room;}
      else{leadRight=lx+nat;}
    }

    if(!tail)return;
    var tx=parseFloat(tail.getAttribute('x'));
    if(!isFinite(tx))return;
    var gap=tx-leadRight-SEP;
    var tsrc=sourceText(tail);

    if(!lead)gap=rw-18;                        /* sub-label alone on its line */
    if(gap<MIN_SUB){
      tail.setAttribute('fill-opacity','0');
      put(tail,tsrc);clearFit(tail);setTitle(tail,null);
      return;
    }
    tail.removeAttribute('fill-opacity');
    put(tail,tsrc);clearFit(tail);
    if(widthOf(tail)>gap){
      var tc=truncate(tail,tsrc,gap);
      if(tc){put(tail,tc);setTitle(tail,tsrc);}
      else{tail.setAttribute('fill-opacity','0');put(tail,tsrc);setTitle(tail,null);}
    }else{
      setTitle(tail,null);
    }
  }

  function fitNode(g){
    var rect=g.querySelector('rect.nbx,rect.tsx');
    if(!rect)return;
    var byLine={},texts=g.querySelectorAll('text'),any=false;
    for(var i=0;i<texts.length;i++){
      var t=texts[i];
      if(t.parentNode!==g)continue;                      /* skip nested nodes */
      var cls=t.getAttribute('class')||'';
      if(cls.indexOf('nvl')<0&&cls.indexOf('nsb')<0&&cls.indexOf('tsv')<0)continue;
      var y=t.getAttribute('y');
      (byLine[y]||(byLine[y]=[])).push(t);any=true;
    }
    if(!any)return;
    for(var k in byLine)fitLine(rect,byLine[k]);
  }

  function refresh(){
    var svg=document.getElementById('chain');
    if(!svg||!svg.getBBox)return;
    var gs=svg.querySelectorAll('g.nd');
    for(var i=0;i<gs.length;i++){
      try{fitNode(gs[i]);}catch(e){}
    }
  }

  function wrap(name,flag){
    var base=window[name];
    if(typeof base!=='function'||base[flag])return;
    var fn=function(){var r=base.apply(this,arguments);refresh();return r;};
    fn[flag]=true;window[name]=fn;
  }

  wrap('paneRender','__nodeFitWrapped');
  wrap('tab','__nodeFitWrapped');
  refresh();
  setInterval(refresh,700);
  window.addEventListener('resize',refresh);
})();
