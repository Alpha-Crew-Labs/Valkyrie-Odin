/* VALKYRIE v3 · research rail — the team's own tools, in the product
 *
 * VALKYRIE is the decision layer over three analysts' work, and two of them
 * already ship their own public tools that this app ingests: 김유찬's IPO
 * Market Report and CB Zero Finder are sampled into data/research-insights.json
 * by the scheduled GitHub Action and drive the EQUITY pane, and 정희강's Quant
 * Macro Terminal Pro backs the MACRO bridge card. But that provenance only
 * appeared as small links buried inside individual cards, plus one floating
 * launcher for a single tool - so the fact that VALKYRIE sits on top of a real
 * research stack was invisible unless you already knew where to look.
 *
 * This is that stack as a permanent left rail: collapsed to an icon strip,
 * expanding over the app on hover (tap on touch), one entry per tool, grouped
 * by the analyst who owns it. Each entry carries a live figure and a
 * freshness stamp taken from the snapshot the app has ALREADY fetched -
 * window.VALKYRIE_YC_EQUITY for the IPO/CB feeds and window.VALKYRIE_HK_QUANT
 * for the Quant Terminal - so the rail is a status board for the research
 * stack rather than a bookmark bar. No new network call is made here, and a
 * tool whose feed has not arrived shows PENDING rather than a stand-in number.
 *
 * The app's own grid is never re-laid-out: research-rail.css widens the page
 * gutter (body padding-left) and the rail expands as an overlay above it, so
 * the frozen v2.6 shell keeps its internal geometry exactly.
 */
(function(){
  'use strict';

  var RAIL_ID='researchRail';

  var TOOLS=[
    {owner:'정희강', domain:'MACRO', items:[
      {mark:'Q', name:'Quant Macro Terminal', tag:'STREAMLIT',
       url:'https://quantterminalpro2-h2dxkxcunskzfta9ffgyci.streamlit.app/',
       read:function(){
         var q=window.VALKYRIE_HK_QUANT;
         if(!q||!q.result)return null;
         return {label:'US 10Y', value:q.result.us10y.toFixed(2)+'%', tone:'cy', as:q.observed};
       }}
    ]},
    {owner:'김유찬', domain:'EQUITY', items:[
      {mark:'IPO', name:'IPO Market Report', tag:'VERCEL',
       url:'https://ipo-market-report.vercel.app/',
       read:function(){
         var d=snapshot();if(!d||!d.ipo||!d.ipo.ok)return null;
         var v=num(d.ipo.avgCurrentReturnPct);
         return {label:'평균 수익률', value:v===null?'—':(v>0?'+':'')+v.toFixed(1)+'%',
                 tone:v===null?'':(v>0?'up':'dn'), as:d.ipo.generatedAt};
       }},
      {mark:'CB', name:'CB Zero Finder', tag:'VERCEL',
       url:'https://cb-zero-finder.vercel.app/',
       read:function(){
         var d=snapshot();if(!d||!d.cb||!d.cb.ok)return null;
         var v=num(d.cb.zeroZeroSharePct);
         return {label:'제로제로 비중', value:v===null?'—':v.toFixed(1)+'%',
                 tone:'am', as:d.cb.updatedAt};
       }}
    ]}
  ];

  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function num(v){if(v===null||v===undefined||v==='')return null;var x=Number(v);return isFinite(x)?x:null;}
  function snapshot(){
    var s=window.VALKYRIE_YC_EQUITY;
    return s&&s.data?s.data:null;
  }
  /* 2026-09-18T00:33:58Z and 2026.09.16 both reduce to 09.16 / 09.18 */
  function shortDate(v){
    if(!v)return '';
    var s=String(v).replace(/\./g,'-');
    var m=s.match(/(\d{4})-(\d{2})-(\d{2})/);
    return m?m[2]+'.'+m[3]:'';
  }

  function itemHTML(it){
    var r=null;
    try{r=it.read();}catch(e){r=null;}
    var met=r
      ? '<span>'+esc(r.label)+'</span><b class="'+esc(r.tone||'')+'">'+esc(r.value)+'</b>'+
        (r.as?'<span>'+esc(shortDate(r.as))+'</span>':'')
      : '<b class="am">PENDING</b>';
    return '<a class="rrail-item" href="'+esc(it.url)+'" target="_blank" rel="noopener noreferrer"'+
      ' title="'+esc(it.name)+' 새 창에서 열기">'+
      '<span class="rrail-mark">'+esc(it.mark)+'</span>'+
      '<span class="rrail-body">'+
        '<span class="rrail-nm">'+esc(it.name)+'<em>'+esc(it.tag)+' ↗</em></span>'+
        '<span class="rrail-met">'+met+'</span>'+
      '</span></a>';
  }

  function railHTML(){
    var total=0;
    for(var t=0;t<TOOLS.length;t++)total+=TOOLS[t].items.length;
    var h='<div class="rrail-top">'+
      '<span class="rrail-logo">V</span>'+
      '<span class="rrail-title"><b>RESEARCH STACK</b><small>RAVENS · '+total+' TOOLS</small></span>'+
      '</div>';
    for(var i=0;i<TOOLS.length;i++){
      var g=TOOLS[i];
      h+='<div class="rrail-sec">'+esc(g.owner)+' · '+esc(g.domain)+'</div>';
      for(var j=0;j<g.items.length;j++)h+=itemHTML(g.items[j]);
    }
    h+='<div class="rrail-foot">공개 스냅샷 · 12H</div>';
    return h;
  }

  function ensure(){
    var el=document.getElementById(RAIL_ID);
    if(!el){
      el=document.createElement('nav');
      el.id=RAIL_ID;
      el.className='rrail';
      el.setAttribute('aria-label','RAVENS 리서치 도구');
      document.body.appendChild(el);
      /* touch devices get no hover, so the strip toggles on tap - but a tap on
       * a tool link must open that tool, not just close the rail */
      el.addEventListener('click',function(ev){
        if(ev.target&&ev.target.closest&&ev.target.closest('.rrail-item'))return;
        el.classList.toggle('open');
      });
    }
    /* the rail this replaces; removed here so load order does not matter */
    var old=document.getElementById('hkqRail');
    if(old&&old.parentNode)old.parentNode.removeChild(old);
    return el;
  }

  var lastHTML='';
  function refresh(){
    var el=ensure(),html=railHTML();
    if(html===lastHTML)return;
    lastHTML=html;
    var wasOpen=el.classList.contains('open');
    el.innerHTML=html;
    if(wasOpen)el.classList.add('open');
  }

  function boot(){refresh();setInterval(refresh,4000);}

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);
  else boot();
})();
