/* VALKYRIE v3 · cross-asset corroboration (Npay 증권 public indicators)
 *
 * market-strip.js already polls Naver/Npay every 60s for nine real instruments
 * - KOSPI, KOSDAQ, KPI200, .DJI, .INX, .IXIC, FX_USDKRW, gold and WTI - and
 * publishes them on window.VALKYRIE_MARKET_TAPE. Until now they only scrolled
 * past in the tape at the bottom of the screen: nine live prices doing no work.
 *
 * A single market's move never settles anything on its own; what a research
 * desk actually asks is whether independent markets are telling the same
 * story, and which one is not. That is what this computes, from exactly the
 * payload the tape already holds - no new endpoint, no new key, no new
 * request, and nothing invented:
 *
 *   국내 증시     KOSPI·KOSDAQ 평균 등락률          상승 = 위험선호
 *   미국 증시     .INX·.IXIC·.DJI 평균 등락률       상승 = 위험선호
 *   코스닥 상대   KOSDAQ - KOSPI (%p)               양수 = 위험선호
 *   원화         USD/KRW 등락률                     원화 강세 = 위험선호
 *   금           gold 등락률                        하락 = 위험선호
 *
 * Each is a vote. The regime is the majority, the agreement ratio is how large
 * that majority is, and - the part that carries the analytical value - the
 * minority is named outright, because a lone dissenting market is the thing
 * worth looking at. WTI is deliberately kept out of the vote and reported on
 * its own line: crude rising is a growth signal and an inflation signal at the
 * same time, so folding it into a risk score would be a judgment the data does
 * not support.
 *
 * Fails closed like everything else here: fewer than three instruments with a
 * real price and the card shows DATA PENDING rather than a thin verdict, and
 * the source badge always says whether the numbers came straight from the
 * public API or from the last-good snapshot.
 */
(function(){
  'use strict';

  var BLOCK_ID='crossAssetBlock',MIN_INPUTS=3;

  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function num(v){if(v===null||v===undefined||v==='')return null;var x=Number(v);return isFinite(x)?x:null;}

  function tape(){
    var t=window.VALKYRIE_MARKET_TAPE;
    return t&&Array.isArray(t.items)?t:null;
  }
  function pct(items,code){
    for(var i=0;i<items.length;i++)if(items[i].code===code)return items[i].price===null?null:num(items[i].changePct);
    return null;
  }
  function mean(list){
    var s=0,n=0;
    for(var i=0;i<list.length;i++)if(list[i]!==null){s+=list[i];n++;}
    return n?s/n:null;
  }
  function sign(v,d){return v===null?'—':(v>0?'+':'')+v.toFixed(d==null?2:d);}

  function build(){
    var t=tape();if(!t||t.status!=='ready')return null;
    var it=t.items;
    var kospi=pct(it,'KOSPI'),kosdaq=pct(it,'KOSDAQ');
    var kr=mean([kospi,kosdaq]);
    var us=mean([pct(it,'.INX'),pct(it,'.IXIC'),pct(it,'.DJI')]);
    var rs=(kospi===null||kosdaq===null)?null:kosdaq-kospi;
    var fx=pct(it,'FX_USDKRW');
    var au=pct(it,'GCcv1');
    var wti=pct(it,'CLcv1');

    var rows=[
      {k:'국내 증시',   v:kr, unit:'%',  on:kr===null?null:kr>0,  src:'KOSPI·KOSDAQ'},
      {k:'미국 증시',   v:us, unit:'%',  on:us===null?null:us>0,  src:'S&P·나스닥·다우'},
      {k:'코스닥 상대', v:rs, unit:'%p', on:rs===null?null:rs>0,  src:'KOSDAQ−KOSPI'},
      {k:'원화',       v:fx, unit:'%',  on:fx===null?null:fx<0,  src:'USD/KRW'},
      {k:'금',         v:au, unit:'%',  on:au===null?null:au<0,  src:'GOLD'}
    ];
    var live=rows.filter(function(r){return r.on!==null;});
    if(live.length<MIN_INPUTS)return null;

    var onCount=0;
    for(var i=0;i<live.length;i++)if(live[i].on)onCount++;
    var offCount=live.length-onCount;
    var major=onCount>=offCount,majorN=Math.max(onCount,offCount);
    var agree=majorN/live.length;
    var regime=agree<0.7?'MIXED':(major?'RISK-ON':'RISK-OFF');

    for(var j=0;j<rows.length;j++)rows[j].aligned=rows[j].on===null?null:(rows[j].on===major);

    return {
      rows:rows, regime:regime, agree:agree, majorN:majorN, total:live.length,
      wti:wti, mode:t.mode, at:t.updatedAt
    };
  }

  function toneOf(regime){
    return regime==='RISK-ON'?'#31C08C':(regime==='RISK-OFF'?'#EF5A61':'#EFA83A');
  }
  function hhmm(v){
    if(!v)return '';
    var d=new Date(v);
    if(isNaN(d.getTime()))return '';
    var z=function(x){return (x<10?'0':'')+x;};
    return z(d.getHours())+':'+z(d.getMinutes());
  }

  function cardHTML(){
    var b=build();
    var src=b?(b.mode==='DIRECT_API'?'NPAY · DIRECT':'NPAY · SNAPSHOT'):'NPAY 증권';
    var h='<div class="cd" style="flex:0 0 auto"><div class="cdh"><span class="cdt">CROSS-ASSET 정합성</span>'+
      '<span class="cdo">'+esc(src)+(b&&hhmm(b.at)?' '+hhmm(b.at):'')+'</span></div>';

    if(!b){
      h+='<div class="big" style="font-size:13px;color:#EFA83A">DATA PENDING</div></div>';
      return '<div id="'+BLOCK_ID+'">'+h+'</div>';
    }

    var pctAgree=Math.round(b.agree*100);
    h+='<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:6px">'+
      '<b style="font-size:15px;font-weight:800;letter-spacing:.1em;color:'+toneOf(b.regime)+'">'+esc(b.regime)+'</b>'+
      '<span class="ml2" style="color:#5A6472">'+b.total+'개 중 '+b.majorN+'개 일치</span></div>';
    h+='<div class="bar"><i style="width:'+pctAgree+'%;background:'+toneOf(b.regime)+'"></i></div>';

    for(var i=0;i<b.rows.length;i++){
      var r=b.rows[i];
      var val=r.v===null?'—':sign(r.v,2)+r.unit;
      var mark=r.aligned===null?'<span style="color:#39424E">—</span>'
        :(r.aligned?'<span style="color:#31C08C">✓</span>'
                   :'<span style="color:#EFA83A">✗</span>');
      h+='<div class="evr" style="grid-template-columns:1fr auto 30px" title="'+esc(r.src)+'">'+
        '<span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(r.k)+
          '<span class="idx" style="margin-left:5px">'+esc(r.src)+'</span></span>'+
        '<span class="vv" style="color:'+(r.v===null?'#49525F':(r.v>0?'#31C08C':(r.v<0?'#EF5A61':'#7C8698')))+'">'+esc(val)+'</span>'+
        '<span class="ii" style="text-align:center">'+mark+'</span></div>';
    }

    var dis=b.rows.filter(function(r){return r.aligned===false;}).map(function(r){return r.k;});
    if(dis.length)
      h+='<div class="note" style="margin-top:6px"><b style="color:#EFA83A">엇갈림: '+esc(dis.join(' · '))+'</b> — 나머지 시장과 반대 방향입니다.</div>';
    else
      h+='<div class="note" style="margin-top:6px">교차 검증된 '+b.total+'개 시장이 모두 같은 방향입니다.</div>';

    if(b.wti!==null)
      h+='<div class="kv" style="margin-top:4px"><span>인플레 임펄스 · WTI</span><b class="'+(b.wti>0?'am':'')+'">'+esc(sign(b.wti,2))+'%</b></div>'+
         '<div class="note">유가는 성장·물가 신호를 동시에 담아 위험선호 판정에서 제외했습니다.</div>';

    h+='</div>';
    return '<div id="'+BLOCK_ID+'">'+h+'</div>';
  }

  /* Same append-and-self-heal contract chain-briefing.js uses: ux-overlay.js
   * rewrites #pane .ins wholesale on its own timer, so the block is re-asserted
   * rather than assumed to survive. Both files re-append on their own cadence,
   * so this one anchors itself above the briefing block instead of racing it to
   * the end of the column - otherwise the two cards would swap places every few
   * seconds. */
  function paint(){
    var ins=document.querySelector('#pane .ins');if(!ins)return;
    var old=document.getElementById(BLOCK_ID);
    var html=cardHTML();
    if(old){
      if(old.outerHTML===html)return;
      old.parentNode.removeChild(old);
    }
    var anchor=document.getElementById('chainBriefingBlock');
    if(anchor&&anchor.parentNode===ins)anchor.insertAdjacentHTML('beforebegin',html);
    else ins.insertAdjacentHTML('beforeend',html);
  }

  function wrapPaneRender(){
    var base=window.paneRender;
    if(typeof base!=='function'||base.__crossAssetWrapped)return;
    var fn=function(){var r=base.apply(this,arguments);paint();return r;};
    fn.__crossAssetWrapped=true;
    window.paneRender=fn;
  }

  wrapPaneRender();
  paint();
  setInterval(paint,1500);
})();
