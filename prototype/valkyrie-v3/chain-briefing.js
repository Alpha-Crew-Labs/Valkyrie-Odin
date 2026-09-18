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
  var LAST=null,RUN=[],BLOCK_ID='chainBriefingBlock',COPY_ID='chainBriefingCopy',copiedAt=0;

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

  /* --- Research note export -------------------------------------------
   * An analyst who runs a scenario here then has to retype the conclusion
   * into whatever they are actually writing. The briefing sentence and the
   * ranked relations are already exact text built from real values, so the
   * run can be handed over verbatim instead. Nothing is generated for the
   * note that is not already on screen: the same sentence, the same five
   * relations and weights, plus the run's own provenance line (snapshot
   * date, active domain, ontology size). Clipboard API with a textarea
   * fallback, since the page is also opened over plain file:// in demos. */
  /* Hangul and CJK render two columns wide in a monospaced paste target, so
   * pad on display width rather than on String.length or the numbers do not
   * line up once a relation name contains Korean. */
  function dw(s){
    var w=0;
    for(var i=0;i<s.length;i++){
      var c=s.charCodeAt(i);
      w+=(c>=0x1100&&(c<=0x115F||c===0x2329||c===0x232A||
        (c>=0x2E80&&c<=0xA4CF)||(c>=0xAC00&&c<=0xD7A3)||
        (c>=0xF900&&c<=0xFAFF)||(c>=0xFE30&&c<=0xFE6F)||
        (c>=0xFF00&&c<=0xFF60)||(c>=0xFFE0&&c<=0xFFE6)))?2:1;
    }
    return w;
  }
  function pad(s,n){s=String(s);var w=dw(s);while(w<n){s+=' ';w++;}return s;}
  function noteText(){
    if(!LAST)return '';
    var now=new Date(),z=function(v){return (v<10?'0':'')+v;};
    var stamp=now.getFullYear()+'-'+z(now.getMonth()+1)+'-'+z(now.getDate())+' '+z(now.getHours())+':'+z(now.getMinutes());
    var snapEl=document.getElementById('snl'),snap=snapEl?String(snapEl.textContent||'').trim():'';
    var domain=window.curTab||'';
    var lines=[];
    lines.push('VALKYRIE v3 · RESEARCH NOTE');
    lines.push(stamp+(domain?' · DOMAIN '+domain:'')+(snap&&snap!=='—'?' · SNAPSHOT '+snap:''));
    lines.push('');
    lines.push('[AI 브리핑]');
    lines.push(LAST.sentence);
    lines.push('');
    lines.push('[관계 기여도 TOP '+LAST.top.length+']');
    for(var i=0;i<LAST.top.length;i++){
      var e=LAST.top[i];
      lines.push(pad('0'+(i+1)+' '+ND[e.a].l+' → '+ND[e.b].l,44)+Math.round(e.w*100)+'%');
    }
    lines.push('');
    lines.push('직전 SIGNATURE · SHOCK · Command 실행에서 함께 활성화된 관계 중 실제 가중치 상위 '+LAST.top.length+'개.');
    lines.push('온톨로지 16 OBJECTS · 22 RELATIONS · 공개 데이터 기준 (NAVER/NPAY · FRED · DART)');
    return lines.join('\n');
  }
  function copyNote(){
    var txt=noteText();if(!txt)return;
    var done=function(){copiedAt=Date.now();paintBlock();};
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(txt).then(done,function(){legacyCopy(txt,done);});
    }else legacyCopy(txt,done);
  }
  function legacyCopy(txt,done){
    try{
      var ta=document.createElement('textarea');
      ta.value=txt;ta.setAttribute('readonly','');
      ta.style.cssText='position:fixed;top:-1000px;opacity:0';
      document.body.appendChild(ta);ta.select();
      document.execCommand('copy');document.body.removeChild(ta);
      done();
    }catch(e){}
  }
  document.addEventListener('click',function(ev){
    var t=ev.target&&ev.target.closest?ev.target.closest('#'+COPY_ID):null;
    if(!t)return;
    ev.preventDefault();ev.stopPropagation();
    copyNote();
  });

  function blockHTML(){
    if(!LAST)return '';
    var fresh=Date.now()-copiedAt<2200;
    var h='<div class="cd" style="flex:0 0 auto"><div class="cdh"><span class="cdt">AI 브리핑</span>'+
      /* deliberately not .cdo: domain-ui.js's declutter() rewrites the text of
       * every .cdo in the pane on its own timer, and this one is a control. */
      '<span id="'+COPY_ID+'" role="button" tabindex="0" title="이 실행 결과를 리서치 메모 형식으로 클립보드에 복사합니다"'+
      ' style="font-size:8.4px;letter-spacing:.08em;cursor:pointer;white-space:nowrap;border:1px solid '+(fresh?'#31C08C':'#22303C')+';color:'+(fresh?'#31C08C':'#5A6472')+';padding:1px 6px;border-radius:2px">'+
      (fresh?'COPIED':'메모 복사')+'</span></div>';
    h+='<div class="ml2" style="line-height:1.65;color:#B7C0CC">'+esc(LAST.sentence)+'</div></div>';
    h+='<div class="cd" style="flex:0 0 auto"><div class="cdh"><span class="cdt">관계 기여도 TOP 5</span><span class="cdo">'+LAST.top.length+' / 22 REL</span></div>';
    /* .evr is a 3-column grid (1fr auto 34px). Emitting only two children left
     * the weight bar sized to its own text - a ~15px sliver that read as a
     * clipped badge rather than a bar. Fill all three slots: relation name
     * (elided, full text on hover), a real fixed-width bar, then the number. */
    for(var i=0;i<LAST.top.length;i++){
      var e=LAST.top[i],pct=Math.round(e.w*100),rel=ND[e.a].l+' → '+ND[e.b].l;
      h+='<div class="evr mo" style="animation-delay:'+(i*70)+'ms">'+
        '<span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+esc(rel)+'"><span class="idx">0'+(i+1)+'</span> '+esc(rel)+'</span>'+
        '<span title="온톨로지 관계 가중치 '+pct+'%" style="display:inline-block;width:46px;height:4px;border-radius:2px;background:linear-gradient(90deg,'+(pct>=55?'#EFA83A':'#3FD9E6')+' '+pct+'%,#1A222D '+pct+'%)"></span>'+
        '<span class="ii'+(pct>=55?' h':'')+'">'+pct+'%</span></div>';
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

  /* SIGNATURE is not one lit() call: it walks MACRO, then RATES, then EQUITY
   * as three separate legs. Summarizing only the leg that happened to finish
   * last threw away the whole story and left a one-row ranking ("IPO DEMAND
   * -> EQUITY") as the summary of a full 14-object traversal. So the ids are
   * accumulated across every leg of one run and the briefing is rebuilt from
   * the union each time a leg lands - which is also what makes the sentence
   * report the real end-to-end path. A run boundary is whatever restarts the
   * chain: signature / shock / command begin one, reset clears it. */
  function startRun(){RUN=[];LAST=null;copiedAt=0;}

  function wrapLit(){
    var base=window.lit;
    if(typeof base!=='function'||base.__chainBriefingWrapped)return;
    var fn=function(ids,step,cb){
      var r=base.apply(this,arguments);
      if(Array.isArray(ids)&&typeof T==='function'){
        for(var i=0;i<ids.length;i++)if(RUN.indexOf(ids[i])<0)RUN.push(ids[i]);
        var snapshot=RUN.slice();
        T(function(){
          var b=buildBriefing(snapshot);
          if(b){LAST=b;if(typeof paneRender==='function')paneRender();}
        },ids.length*step+40);
      }
      return r;
    };
    fn.__chainBriefingWrapped=true;
    window.lit=fn;
  }

  function wrapRunStart(name){
    var base=window[name];
    if(typeof base!=='function'||base.__chainBriefingWrapped)return;
    var fn=function(){startRun();return base.apply(this,arguments);};
    fn.__chainBriefingWrapped=true;
    window[name]=fn;
  }

  wrapPaneRenderOutermost();wrapLit();
  ['signature','shock','command','reset'].forEach(wrapRunStart);
  setInterval(paintBlock,900);
})();
