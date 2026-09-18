/* VALKYRIE v3 · attention vs flow (Npay 증권 front-api)
 *
 * Two public keyless endpoints, both observed on m.stock.naver.com's own home
 * screen, answer different questions about the same market:
 *
 *   front-api/market/popularStock   누가 보고 있는가 — 조회/관심 상위
 *   front-api/market/realTimeTop    어디서 거래되고 있는가 — 실시간 거래 상위
 *
 * Either list on its own is a leaderboard, and a leaderboard is not a finding.
 * Read against each other they separate three states that matter to an equity
 * desk, and that neither list can show alone:
 *
 *   양쪽 모두   관심과 거래가 같이 붙은 종목 — 실제 주도주
 *   관심만     보는 사람은 몰리는데 거래가 따라오지 않음 — 기대가 선반영된 자리
 *   거래만     거래는 실리는데 시선은 아직 없음 — 조용히 들어오는 수급
 *
 * The third bucket is the one a research desk actually wants: money moving
 * before attention does. Nothing in the app surfaced it.
 *
 * Deliberately minimal field dependency. This session cannot reach
 * m.stock.naver.com (organisation egress policy), so the response shape is not
 * something it can verify, and inventing field names would ship a panel that
 * silently reads PENDING forever. Instead the payload is walked for any object
 * carrying a six-digit Korean ticker plus a readable name - the same
 * shape-agnostic approach theme-equity.js already uses successfully against
 * Naver's theme payloads - so it binds whatever the envelope looks like, and
 * fails closed when it does not. Rank is taken from array order, which is what
 * both endpoints are sorted by.
 *
 * Rendered inside the THEME FLOW drawer, above the theme terminal, because
 * that drawer is already the EQUITY money-flow surface and has the room the
 * 252px pane does not. No new endpoint host (m.stock.naver.com is already in
 * the page CSP), no key, no fabricated value.
 */
(function(){
  'use strict';

  var SECTION_ID='attentionFlowSection';
  var POPULAR='https://m.stock.naver.com/front-api/market/popularStock?nationType=KOR&domesticStockExchangeType=KRX';
  var TRADED='https://m.stock.naver.com/front-api/market/realTimeTop?nationType=domestic&sortType=priceTop&stockExchangeType=KRX';
  var REFRESH_MS=180000;
  var TOP=12;

  var STATE={status:'idle',popular:[],traded:[],at:null,error:null};
  window.VALKYRIE_ATTENTION_FLOW=STATE;

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
  function codeOf(o){
    for(var k in o){
      var v=o[k];
      if(typeof v==='string'&&TICKER.test(v))return v;
    }
    return null;
  }
  function nameOf(o,code){
    var best=null;
    for(var k in o){
      var v=o[k];
      if(typeof v!=='string'||v===code)continue;
      if(!/name/i.test(k))continue;
      if(!v||v.length>30)continue;
      if(!best||v.length<best.length)best=v;
    }
    return best;
  }

  /* Walk the whole payload and keep, in order, every object that carries a
   * six-digit ticker and a readable name. Ads, banners and layout nodes have
   * neither, so they drop out on their own. */
  function extract(payload){
    var out=[],seen={},queue=[payload],visited=[];
    while(queue.length){
      var cur=queue.shift();
      if(!cur||typeof cur!=='object'||visited.indexOf(cur)>=0)continue;
      visited.push(cur);
      if(!Array.isArray(cur)){
        var code=codeOf(cur);
        if(code&&!seen[code]){
          var name=nameOf(cur,code);
          if(name){seen[code]=1;out.push({code:code,name:name});}
        }
      }
      var vals=Array.isArray(cur)?cur:Object.keys(cur).map(function(k){return cur[k];});
      for(var i=0;i<vals.length;i++)if(vals[i]&&typeof vals[i]==='object')queue.push(vals[i]);
    }
    return out;
  }

  function split(){
    var p=STATE.popular.slice(0,TOP),t=STATE.traded.slice(0,TOP);
    if(p.length<3||t.length<3)return null;
    var inT={},inP={},i;
    for(i=0;i<t.length;i++)inT[t[i].code]=t[i];
    for(i=0;i<p.length;i++)inP[p[i].code]=p[i];
    var both=[],onlyP=[],onlyT=[];
    for(i=0;i<p.length;i++)(inT[p[i].code]?both:onlyP).push(p[i]);
    for(i=0;i<t.length;i++)if(!inP[t[i].code])onlyT.push(t[i]);
    return {both:both,onlyP:onlyP,onlyT:onlyT,n:Math.min(p.length,t.length)};
  }

  function chips(list,cls){
    if(!list.length)return '<div class="afl-empty">해당 없음</div>';
    var h='';
    for(var i=0;i<list.length&&i<6;i++)
      h+='<span class="afl-chip '+cls+'">'+esc(list[i].name)+'</span>';
    return h;
  }

  function bucket(title,sub,list,cls){
    return '<div class="afl-col">'+
      '<div class="afl-h"><b>'+esc(title)+'</b><span>'+list.length+'</span></div>'+
      '<div class="afl-sub">'+esc(sub)+'</div>'+
      '<div class="afl-chips">'+chips(list,cls)+'</div></div>';
  }

  function html(){
    var s=split();
    var head='<div class="afl-head"><span>관심 vs 자금</span>'+
      '<em>NPAY · 인기 / 거래 상위'+(STATE.at?' · '+esc(STATE.at):'')+'</em></div>';
    if(!s){
      return '<section id="'+SECTION_ID+'" class="afl">'+head+
        '<div class="afl-pending">'+esc(STATE.status==='error'?'DATA PENDING':'불러오는 중…')+'</div></section>';
    }
    return '<section id="'+SECTION_ID+'" class="afl">'+head+
      '<div class="afl-body">'+
        bucket('주도주','관심 · 거래 동시 상위',s.both,'on')+
        bucket('기대 선반영','관심만 상위 · 거래 미추종',s.onlyP,'warn')+
        bucket('조용한 수급','거래만 상위 · 시선 아직',s.onlyT,'cy')+
      '</div>'+
      '<div class="afl-foot">각 리스트 상위 '+s.n+'종목 교차 · Naver/Npay 공개 read-only API</div></section>';
  }

  function paint(){
    var body=document.querySelector('.tfl-dbody');
    if(!body)return;
    var old=document.getElementById(SECTION_ID),next=html();
    if(old){
      if(old.outerHTML===next)return;
      old.parentNode.removeChild(old);
    }
    var anchor=document.getElementById('themePulse');
    if(anchor&&anchor.parentNode===body)anchor.insertAdjacentHTML('beforebegin',next);
    else body.insertAdjacentHTML('afterbegin',next);
  }

  function hhmm(){
    var d=new Date(),z=function(x){return (x<10?'0':'')+x;};
    return z(d.getHours())+':'+z(d.getMinutes());
  }

  async function load(){
    STATE.status='loading';paint();
    try{
      var r=await Promise.all([fetchJson(POPULAR),fetchJson(TRADED)]);
      var p=extract(r[0]),t=extract(r[1]);
      if(p.length<3||t.length<3)throw new Error('insufficient rows: '+p.length+' / '+t.length);
      STATE.popular=p;STATE.traded=t;STATE.at=hhmm();STATE.status='ready';STATE.error=null;
    }catch(e){
      STATE.status='error';STATE.error=String(e&&e.message||e);
      STATE.popular=[];STATE.traded=[];
    }
    paint();
  }

  function style(){
    if(document.getElementById('attentionFlowStyle'))return;
    var st=document.createElement('style');
    st.id='attentionFlowStyle';
    st.textContent=
      '.afl{border-bottom:1px solid #17212B;background:#090F15}'+
      '.afl-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:8px 11px 6px}'+
      '.afl-head span{font-size:8.4px;letter-spacing:.16em;color:#8E9BAB;font-weight:800}'+
      '.afl-head em{font-style:normal;font-size:6.8px;letter-spacing:.08em;color:#46525F;white-space:nowrap}'+
      '.afl-body{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;background:#141C25}'+
      '.afl-col{background:#0A1118;padding:8px 10px 10px;min-width:0}'+
      '.afl-h{display:flex;align-items:baseline;gap:6px}'+
      '.afl-h b{font-size:9.2px;color:#C3CBD6;font-weight:700}'+
      '.afl-h span{font-size:8px;color:#46525F;font-variant-numeric:tabular-nums}'+
      '.afl-sub{margin-top:2px;font-size:6.8px;letter-spacing:.04em;color:#3F4A57}'+
      '.afl-chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:7px}'+
      '.afl-chip{font-size:7.6px;padding:3px 6px;border-radius:2px;border:1px solid #1C2733;background:#0C141C;color:#8E9BAB;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}'+
      '.afl-chip.on{border-color:#1E4A3C;color:#31C08C}'+
      '.afl-chip.warn{border-color:#4A3A1E;color:#EFA83A}'+
      '.afl-chip.cy{border-color:#1E4048;color:#3FD9E6}'+
      '.afl-empty{font-size:7.4px;color:#39424E;padding:4px 0}'+
      '.afl-pending{padding:14px 11px;font-size:9px;letter-spacing:.06em;color:#EFA83A}'+
      '.afl-foot{padding:5px 11px;font-size:6.5px;letter-spacing:.04em;color:#3A4450}'+
      '@media(max-width:720px){.afl-body{grid-template-columns:1fr}}';
    document.head.appendChild(st);
  }

  style();
  load();
  setInterval(load,REFRESH_MS);
  setInterval(paint,1500);
})();
