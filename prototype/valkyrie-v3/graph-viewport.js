/* VALKYRIE v3 · graph viewport follow (small screens only)
 *
 * mobile.css deliberately keeps the ontology at full size on phones - #chain
 * is forced to 760px inside a 378px .cw that scrolls horizontally - so the
 * 16 objects stay legible instead of being crushed to illegibility. The cost
 * is that the canvas always opens at scrollLeft 0, showing the MACRO cluster,
 * while the tab that is actually selected (RATES at boot) sits in the right
 * half of the canvas, off screen. A phone user sees a mostly dim MACRO row,
 * a "SWIPE" hint, and no indication that the thing they selected is two
 * screens to the right. The same applies to every SIGNATURE / SHOCK / Command
 * run: the chain lights up across the full 1020-unit width, most of it
 * outside the window.
 *
 * This file moves the *window*, never the graph: node coordinates, box sizes,
 * the 16 objects, the 22 relations and the frozen v2.6 geometry are all
 * untouched - it only sets .cw scrollLeft. It is a no-op wherever the canvas
 * is not actually scrollable (scrollWidth <= clientWidth), so desktop, where
 * the whole ontology already fits, never sees any of this.
 *
 *   - tab / domain focus -> frame that domain's objects plus its signal node.
 *   - lit(ids, step)     -> follow the chain as it reveals, one node at a time,
 *                           on the same stagger lit() already uses, so the
 *                           causal traversal stays on screen on a phone.
 *
 * Scrolls are smooth unless the user asked for reduced motion, and a scroll is
 * skipped when the target is already comfortably inside the window, so the
 * canvas does not twitch on every repaint.
 */
(function(){
  'use strict';

  var EDGE=26;   /* keep this much clear space beside a followed node */

  function cw(){return document.querySelector('.cw');}
  function svg(){return document.getElementById('chain');}

  function scrollable(){
    var c=cw();
    return c&&c.scrollWidth-c.clientWidth>8?c:null;
  }
  function smooth(){
    try{return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;}
    catch(e){return true;}
  }

  /* viewBox units -> rendered px inside #chain */
  function scale(){
    var s=svg();if(!s)return 0;
    var vb=(s.getAttribute('viewBox')||'').split(/[\s,]+/);
    var vw=parseFloat(vb[2]);
    if(!isFinite(vw)||vw<=0)return 0;
    var w=s.getBoundingClientRect().width;
    return w>0?w/vw:0;
  }

  function spanOf(ids){
    if(typeof ND==='undefined')return null;
    var k=scale();if(!k)return null;
    var lo=Infinity,hi=-Infinity;
    for(var i=0;i<ids.length;i++){
      var n=ND[ids[i]];if(!n)continue;
      var w=typeof W==='function'?W(ids[i]):142;
      if(n.x<lo)lo=n.x;
      if(n.x+w>hi)hi=n.x+w;
    }
    if(!isFinite(lo)||!isFinite(hi))return null;
    return {a:lo*k,b:hi*k};
  }

  function moveTo(left){
    var c=scrollable();if(!c)return;
    var max=c.scrollWidth-c.clientWidth;
    var to=Math.max(0,Math.min(max,Math.round(left)));
    if(Math.abs(c.scrollLeft-to)<6)return;
    try{c.scrollTo({left:to,behavior:smooth()?'smooth':'auto'});}
    catch(e){c.scrollLeft=to;}
  }

  /* Centre a whole cluster; if it is wider than the window, align its start. */
  function frame(ids){
    var c=scrollable();if(!c)return;
    var s=spanOf(ids);if(!s)return;
    var vw=c.clientWidth,span=s.b-s.a;
    moveTo(span>=vw-EDGE*2?s.a-EDGE:s.a-(vw-span)/2);
  }

  /* Nudge only when the node is not already comfortably in view. */
  function follow(id){
    var c=scrollable();if(!c)return;
    var s=spanOf([id]);if(!s)return;
    var vw=c.clientWidth,l=c.scrollLeft;
    if(s.a>=l+EDGE&&s.b<=l+vw-EDGE)return;
    moveTo(s.a-(vw-(s.b-s.a))/2);
  }

  /* ND stores the lane as 'mac' / 'rat' / 'eq'; the tabs speak MACRO/RATES/
   * EQUITY. Signal nodes carry the same lane key, so they come along. */
  var LANE={MACRO:'mac',RATES:'rat',EQUITY:'eq'};

  function domainIds(domain){
    var key=LANE[domain];
    if(!key||typeof ND==='undefined')return [];
    var ids=[];
    for(var id in ND)if(ND[id]&&ND[id].d===key)ids.push(id);
    return ids;
  }

  function frameDomain(domain){
    var ids=domainIds(domain||window.curTab||'RATES');
    if(ids.length)frame(ids);
  }

  /* domain-ui.js binds its own click handler on each .tab that calls its
   * private focusDomain(), so window.tab is not what a tab press goes
   * through here. Listening on the tabs themselves catches both paths. */
  function hookTabs(){
    var tabs=document.querySelectorAll('.tab');
    for(var i=0;i<tabs.length;i++)(function(el){
      if(el.__graphViewportHooked)return;
      el.__graphViewportHooked=true;
      el.addEventListener('click',function(){
        var d=el.getAttribute('data-t');
        if(scrollable())setTimeout(function(){frameDomain(d);},90);
      });
    })(tabs[i]);
  }

  function wrapLit(){
    var base=window.lit;
    if(typeof base!=='function'||base.__graphViewportWrapped)return;
    var fn=function(ids,step){
      var r=base.apply(this,arguments);
      if(Array.isArray(ids)&&scrollable()&&typeof T==='function'){
        for(var i=0;i<ids.length;i++){
          (function(id,k){T(function(){follow(id);},k*step+10);})(ids[i],i);
        }
      }
      return r;
    };
    fn.__graphViewportWrapped=true;window.lit=fn;
  }

  function boot(){
    hookTabs();wrapLit();
    /* domain-ui.js runs a one-time auto-focus ~2.45s after load; frame after it */
    setTimeout(function(){if(scrollable())frameDomain();},2900);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);
  else boot();
  window.addEventListener('resize',function(){if(scrollable())frameDomain();});
})();
