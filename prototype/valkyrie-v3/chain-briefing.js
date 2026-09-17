/* VALKYRIE v3 · AI briefing sentence + relation-contribution ranking
 * Every SIGNATURE / SHOCK / Command run already lights up a real subset of
 * the 22-edge ontology (see lit() in interaction.js) using the ids array
 * that call already carries. Nothing summarized that run in plain language
 * afterward, and nothing ranked which of the traversed relations actually
 * carried the most weight. Both are built here purely from data that
 * already exists in this file set - ND labels, the real EG edge weights,
 * and the exact ids the run touched - with zero network calls and zero
 * invented numbers. If a run shares no weighted edge among its own ids
 * (e.g. a single-node lookup) nothing is appended.
 *
 * Rendered inside the existing Inspector column (#pane .ins, the 268px
 * right column present in every pane, already overflow:auto on desktop /
 * auto-height stacked on mobile). That column is also written to by
 * ux-overlay.js (Positioning Gauge, shown when no node is selected) and by
 * view.js's own insHTML() (per-node Inspector, shown when one is). Rather
 * than fight either of those for control of the column's innerHTML, this
 * file wraps window.paneRender *after* both of them have already run (it
 * loads last), and simply appends one more idempotent block underneath
 * whichever of the two is currently showing - so no grid, geometry or
 * frozen-layout change of any kind, and no interference with the
 * gauge/inspector toggle. ux-overlay.js also refreshes that column on its
 * own independent setInterval (bypassing paneRender entirely whenever its
 * gauge signature changes), which can briefly wipe our appended block
 * before the next paneRender - so this file also re-asserts the block on
 * its own short interval, exactly like equity-node-live.js and
 * equity-decision.js already re-assert their own pieces of the UI.
 */
(function(){
  'use strict';
  var LAST=null,BLOCK_ID='chainBriefingBlock';

  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}

  function buildBriefing(ids){
    if(typeof EG==='undefined'||typeof ND==='undefined'||!Array.isArray(ids)||ids.length<2)return null;
    var edges=[];
    for(var i=0;i<EG.length;i++){
      var a=EG[i][0],b=EG[i][1];
      if(ids.indexOf(a)>=0&&ids.indexOf(b)>=0)edges.push({a:a,b:b,w:EG[i][2]});
    }
    if(!edges.length)return null;
    edges.sort(function(x,y){return y.w-x.w;});
    var top=edges.slice(0,5),first=ND[ids[0]],last=ND[ids[ids.length-1]],lead=top[0];
    if(!first||!last||!ND[lead.a]||!ND[lead.b])return null;
    var s=first.l+' 변화가 '+ids.length+'개 객체를 거쳐 '+last.l+'까지 전달됐습니다.'+
      ' 이번 실행에서 가장 강하게 작용한 관계는 '+ND[lead.a].l+' → '+ND[lead.b].l+' (가중치 '+Math.round(lead.w*100)+'%)입니다.';
    return {sentence:s,top:top};
  }

  function blockHTML(){
    if(!LAST)return '';
    var h='<div class="cd" style="flex:0 0 auto"><div class="cdh"><span class="cdt">AI 브리핑</span><span class="cdo">CHAIN SUMMARY</span></div>';
    h+='<div class="ml2" style="line-height:1.65;color:#B7C0CC">'+esc(LAST.sentence)+'</div></div>';
    h+='<div class="cd" style="flex:0 0 auto"><div class="cdh"><span class="cdt">관계 기여도 TOP 5</span><span class="cdo">'+LAST.top.length+' / 22 REL</span></div>';
    for(var i=0;i<LAST.top.length;i++){
      var e=LAST.top[i],pct=Math.round(e.w*100);
      h+='<div class="evr mo" style="animation-delay:'+(i*70)+'ms"><span><span class="idx">0'+(i+1)+'</span> '+esc(ND[e.a].l)+' → '+esc(ND[e.b].l)+'</span>'+
        '<span class="ii'+(pct>=55?' h':'')+'" style="background:linear-gradient(90deg,rgba(63,217,230,.24) '+pct+'%,transparent '+pct+'%)" title="온톨로지 관계 가중치 '+pct+'%">'+pct+'%</span></div>';
    }
    h+='<div class="note" style="margin-top:6px">직전 SIGNATURE · SHOCK · Command 실행에서 함께 활성화된 관계 중 실제 가중치 상위 '+LAST.top.length+'개입니다.</div></div>';
    return '<div id="'+BLOCK_ID+'">'+h+'</div>';
  }

  function paintBlock(){
    var ins=document.querySelector('#pane .ins');if(!ins)return;
    var old=document.getElementById(BLOCK_ID);if(old&&old.parentNode)old.parentNode.removeChild(old);
    var html=blockHTML();if(!html)return;
    ins.insertAdjacentHTML('beforeend',html);
  }

  function wrapPaneRenderOutermost(){
    var base=window.paneRender;
    if(typeof base!=='function'||base.__chainBriefingWrapped)return;
    var fn=function(){var r=base.apply(this,arguments);paintBlock();return r;};
    fn.__chainBriefingWrapped=true;
    window.paneRender=fn;
  }

  function wrapLit(){
    var base=window.lit;
    if(typeof base!=='function'||base.__chainBriefingWrapped)return;
    var fn=function(ids,step,cb){
      var r=base.apply(this,arguments);
      if(Array.isArray(ids)&&typeof T==='function'){
        T(function(){
          var b=buildBriefing(ids);
          if(b){LAST=b;if(typeof paneRender==='function')paneRender();}
        },ids.length*step+40);
      }
      return r;
    };
    fn.__chainBriefingWrapped=true;
    window.lit=fn;
  }

  wrapPaneRenderOutermost();wrapLit();
  setInterval(paintBlock,900);
})();
