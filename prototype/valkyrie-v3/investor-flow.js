/* VALKYRIE v3 · investor flow — 외국인·기관 순매수 교차 (Npay 증권 front-api)
 *
 * m.stock.naver.com's 투자자별 매매동향 screen calls
 *
 *   front-api/market/tradingTrend/ranking
 *     ?periodType=daily&investorType=foreigner&tradingType=trendBuy
 *     &domesticStockExchangeType=KRX
 *
 * which is the single most direct public answer to "돈이 어디로 들어가는가" on
 * the Korean market: who the foreign desk actually bought today, in order.
 * Swapping investorType gives the institutional book.
 *
 * One side of that on its own is a list. On a Korean desk the read that
 * matters is the agreement between the two books, so this takes both and
 * splits them:
 *
 *   양매수   외국인·기관 순매수 상위에 동시 등장 — 가장 강한 수급 합의
 *   외국인   외국인만 — 환율·글로벌 배분 쪽 논리
 *   기관     기관만 — 국내 밸류·수급 쪽 논리
 *
 * Then it does the one thing none of these feeds can do alone. attention-flow.js
 * already computes, from two other endpoints, which names carry turnover while
 * still being outside the attention list ("조용한 수급"). A name that is BOTH
 * 양매수 AND outside the attention list is money arriving with institutional
 * and foreign agreement before the crowd has noticed - so those are lifted out
 * and marked 최우선 관찰. Three independent public feeds, one conclusion that
 * no single screen on Naver shows.
 *
 * investorType=foreigner and tradingType=trendBuy are taken verbatim from the
 * observed request; investorType=institution is the obvious counterpart but
 * was not observed, so it is fetched independently and its column simply
 * reports PENDING if the parameter is rejected - the foreign book still
 * renders. As in attention-flow.js the payload is walked for six-digit tickers
 * plus a readable name rather than assuming field names, because this session
 * cannot reach the host to verify the response shape.
 */
(function(){
  'use strict';

  var SECTION_ID='investorFlowSection';
  var BASE='https://m.stock.naver.com/front-api/market/tradingTrend/ranking'+
    '?periodType=daily&tradingType=trendBuy&domesticStockExchangeType=KRX&investorType=';
  var REFRESH_MS=180000;
  var TOP=12;

  var STATE={status:'idle',foreign:[],inst:[],instOk:false,at:null,error:null};
  window.VALKYRIE_INVESTOR_FLOW=STATE;

  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}

  async function fetchJson(url){
    var ctl=new AbortController(),t=setTimeout(function(){ctl.abort();},8000);
    try{
      var r=await fetch(url,{cache:'no-store',credentials:'omit',mode:'cors',
        signal:ctl.signal,headers:{accept:'application/json,text/plain,*/*'}});
      if(!r.ok)throw new Error('HTTP '+r.status);
      return await r.json();
    }finally{clearTimeout(t);}
  }

  var TICKER=/^\d{6}$/;
  function extract(payload){
    var out=[],seen={},queue=[payload],visited=[];
    while(queue.length){
      var cur=queue.shift();
      if(!cur||typeof cur!=='object'||visited.indexOf(cur)>=0)continue;
      visited.push(cur);
      if(!Array.isArray(cur)){
        var code=null,name=null;
        for(var k in cur){
          var v=cur[k];
          if(typeof v!=='string')continue;
          if(!code&&TICKER.test(v))code=v;
          else if(/name/i.test(k)&&v&&v.length<=30&&(!name||v.length<name.length))name=v;
        }
        if(code&&name&&!seen[code]){seen[code]=1;out.push({code:code,name:name});}
      }
      var vals=Array.isArray(cur)?cur:Object.keys(cur).map(function(k){return cur[k];});
      for(var i=0;i<vals.length;i++)if(vals[i]&&typeof vals[i]==='object')queue.push(vals[i]);
    }
    return out;
  }

  /* names carrying turnover but still outside the attention list */
  function quietSet(){
    var a=window.VALKYRIE_ATTENTION_FLOW,s={};
    if(!a||a.status!=='ready')return null;
    var p={},i;
    for(i=0;i<a.popular.length&&i<TOP;i++)p[a.popular[i].code]=1;
    for(i=0;i<a.traded.length&&i<TOP;i++)if(!p[a.traded[i].code])s[a.traded[i].code]=1;
    return s;
  }

  function split(){
    var f=STATE.foreign.slice(0,TOP),n=STATE.inst.slice(0,TOP);
    if(f.length<3)return null;
    var inN={},inF={},i;
    for(i=0;i<n.length;i++)inN[n[i].code]=1;
    for(i=0;i<f.length;i++)inF[f[i].code]=1;
    var both=[],onlyF=[],onlyN=[];
    for(i=0;i<f.length;i++)(inN[f[i].code]?both:onlyF).push(f[i]);
    for(i=0;i<n.length;i++)if(!inF[n[i].code])onlyN.push(n[i]);
    var q=quietSet(),priority=[];
    if(q)for(i=0;i<both.length;i++)if(q[both[i].code])priority.push(both[i]);
    return {both:both,onlyF:onlyF,onlyN:onlyN,priority:priority,quietKnown:!!q};
  }

  function chips(list,cls){
    if(!list.length)return '<div class="ivf-empty">해당 없음</div>';
    var h='';
    for(var i=0;i<list.length&&i<6;i++)
      h+='<span class="ivf-chip '+cls+'">'+esc(list[i].name)+'</span>';
    return h;
  }
  function col(title,sub,list,cls,pending){
    return '<div class="ivf-col">'+
      '<div class="ivf-h"><b>'+esc(title)+'</b><span>'+(pending?'—':list.length)+'</span></div>'+
      '<div class="ivf-sub">'+esc(sub)+'</div>'+
      '<div class="ivf-chips">'+(pending?'<div class="ivf-empty">DATA PENDING</div>':chips(list,cls))+'</div></div>';
  }

  function html(){
    var s=split();
    var head='<div class="ivf-head"><span>투자자별 순매수</span>'+
      '<em>NPAY · 외국인 / 기관 · 일간'+(STATE.at?' · '+esc(STATE.at):'')+'</em></div>';
    if(!s){
      return '<section id="'+SECTION_ID+'" class="ivf">'+head+
        '<div class="ivf-pending">'+esc(STATE.status==='error'?'DATA PENDING':'불러오는 중…')+'</div></section>';
    }
    var h='<section id="'+SECTION_ID+'" class="ivf">'+head;
    if(s.priority.length)
      h+='<div class="ivf-prio"><b>최우선 관찰</b>'+
        '<span>외국인·기관 양매수 + 관심 리스트 밖</span>'+
        '<div class="ivf-chips">'+chips(s.priority,'prio')+'</div></div>';
    h+='<div class="ivf-body">'+
      col('양매수','외국인·기관 동시 순매수',s.both,'on',false)+
      col('외국인','외국인만 순매수 상위',s.onlyF,'cy',false)+
      col('기관','기관만 순매수 상위',s.onlyN,'warn',!STATE.instOk)+
      '</div>'+
      '<div class="ivf-foot">순매수 상위 각 '+TOP+'종목 교차'+
      (s.quietKnown?' · 관심 리스트 대조 적용':' · 관심 리스트 대기')+
      ' · Naver/Npay 공개 read-only API</div></section>';
    return h;
  }

  function paint(){
    var body=document.querySelector('.tfl-dbody');
    if(!body)return;
    var old=document.getElementById(SECTION_ID),next=html();
    if(old){
      if(old.outerHTML===next)return;
      old.parentNode.removeChild(old);
    }
    var anchor=document.getElementById('attentionFlowSection')||document.getElementById('themePulse');
    if(anchor&&anchor.parentNode===body)anchor.insertAdjacentHTML('beforebegin',next);
    else body.insertAdjacentHTML('afterbegin',next);
  }

  function hhmm(){
    var d=new Date(),z=function(x){return (x<10?'0':'')+x;};
    return z(d.getHours())+':'+z(d.getMinutes());
  }

  async function load(){
    STATE.status='loading';paint();
    var f=[],n=[],ok=false;
    try{f=extract(await fetchJson(BASE+'foreigner'));}catch(e){f=[];}
    /* investorType=institution was not in the observed request, so a rejection
     * here must not take the foreign book down with it */
    try{n=extract(await fetchJson(BASE+'institution'));ok=n.length>=3;}catch(e){n=[];ok=false;}
    if(f.length<3){
      STATE.status='error';STATE.foreign=[];STATE.inst=[];STATE.instOk=false;
    }else{
      STATE.foreign=f;STATE.inst=n;STATE.instOk=ok;STATE.at=hhmm();STATE.status='ready';
    }
    paint();
  }

  function style(){
    if(document.getElementById('investorFlowStyle'))return;
    var st=document.createElement('style');
    st.id='investorFlowStyle';
    st.textContent=
      '.ivf{border-bottom:1px solid #17212B;background:#080E14}'+
      '.ivf-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:8px 11px 6px}'+
      '.ivf-head span{font-size:8.4px;letter-spacing:.16em;color:#8E9BAB;font-weight:800}'+
      '.ivf-head em{font-style:normal;font-size:6.8px;letter-spacing:.08em;color:#46525F;white-space:nowrap}'+
      '.ivf-prio{margin:0 11px 7px;padding:7px 9px;border:1px solid #2B4A3E;border-radius:3px;background:rgba(49,192,140,.05)}'+
      '.ivf-prio>b{font-size:8.6px;color:#31C08C;letter-spacing:.1em;font-weight:800}'+
      '.ivf-prio>span{margin-left:7px;font-size:6.8px;color:#4A5765;letter-spacing:.04em}'+
      '.ivf-body{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;background:#141C25}'+
      '.ivf-col{background:#0A1118;padding:8px 10px 10px;min-width:0}'+
      '.ivf-h{display:flex;align-items:baseline;gap:6px}'+
      '.ivf-h b{font-size:9.2px;color:#C3CBD6;font-weight:700}'+
      '.ivf-h span{font-size:8px;color:#46525F;font-variant-numeric:tabular-nums}'+
      '.ivf-sub{margin-top:2px;font-size:6.8px;letter-spacing:.04em;color:#3F4A57}'+
      '.ivf-chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:7px}'+
      '.ivf-chip{font-size:7.6px;padding:3px 6px;border-radius:2px;border:1px solid #1C2733;background:#0C141C;color:#8E9BAB;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}'+
      '.ivf-chip.on{border-color:#1E4A3C;color:#31C08C}'+
      '.ivf-chip.cy{border-color:#1E4048;color:#3FD9E6}'+
      '.ivf-chip.warn{border-color:#4A3A1E;color:#EFA83A}'+
      '.ivf-chip.prio{border-color:#31C08C;color:#31C08C;background:rgba(49,192,140,.07)}'+
      '.ivf-empty{font-size:7.4px;color:#39424E;padding:4px 0}'+
      '.ivf-pending{padding:14px 11px;font-size:9px;letter-spacing:.06em;color:#EFA83A}'+
      '.ivf-foot{padding:5px 11px;font-size:6.5px;letter-spacing:.04em;color:#3A4450}'+
      '@media(max-width:720px){.ivf-body{grid-template-columns:1fr}}';
    document.head.appendChild(st);
  }

  style();
  load();
  setInterval(load,REFRESH_MS);
  setInterval(paint,1500);
})();
