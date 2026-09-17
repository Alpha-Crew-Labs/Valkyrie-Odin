/* VALKYRIE v3 · reasoning trace narration
 * SIGNATURE / SHOCK / Command already reveal the ontology chain node-by-node
 * via lit(ids,step,cb), but the on-screen narration during that reveal was a
 * single static line ("SCANNING 16 OBJECTS...") for the whole sequence - it
 * never said which node was being traced or how strong the relation into it
 * actually is. That made a genuinely real weighted-graph computation look
 * like a canned animation.
 *
 * This wraps lit() (already the shared entry point used by signature(),
 * shock() and command() in interaction.js) to update #hud2 once per
 * revealed node with its real label and, where the previous node in the
 * sequence is one of its direct upstream/downstream ontology neighbors, the
 * real edge weight from EG - the exact same 22-relation table the rest of
 * VALKYRIE already uses. Nothing here is computed or fabricated; it only
 * narrates values that ups()/EG already contain.
 */
(function(){
  'use strict';

  function edgeWeight(a,b){
    if(typeof EG==='undefined')return null;
    for(var i=0;i<EG.length;i++){
      if((EG[i][0]===a&&EG[i][1]===b)||(EG[i][0]===b&&EG[i][1]===a))return EG[i][2];
    }
    return null;
  }

  function wrapLit(){
    var base=window.lit;
    if(typeof base!=='function'||base.__reasoningTraceWrapped)return;
    var fn=function(ids,step,cb){
      if(Array.isArray(ids)&&typeof T==='function'&&typeof ND!=='undefined'){
        for(var i=0;i<ids.length;i++){
          (function(idx){
            T(function(){
              var id=ids[idx],hud=document.getElementById('hud2');
              if(!hud||!ND[id])return;
              var prev=idx>0?ids[idx-1]:null,w=prev?edgeWeight(prev,id):null;
              var tail=w!=null?(' · 관계가중치 '+w.toFixed(2)):(idx===0?' · 출발 노드':'');
              hud.textContent='TRACE '+(idx+1)+'/'+ids.length+' · '+ND[id].l+tail;
            },idx*step);
          })(i);
        }
      }
      return base.apply(this,arguments);
    };
    fn.__reasoningTraceWrapped=true;
    window.lit=fn;
  }

  wrapLit();
})();
