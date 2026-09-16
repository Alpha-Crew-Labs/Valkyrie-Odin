/* VALKYRIE · YC Equity integration layer
 * Public-data only. No personal API key, Vercel function, private proxy, or fabricated live value.
 * IPO/CB funding pulse is derived from the public aikstockdata DART disclosure feed.
 */
(function(){
  'use strict';

  var API={
    intraday:'https://aikstockdata.com/data/public/disclosures_intraday.json',
    today:'https://aikstockdata.com/data/public/today.json'
  };
  var POLL_MS=300000;
  var STATE={status:'loading',data:null,error:null,lastFetch:0,timer:null,mode:'PUBLIC_API'};
  window.VALKYRIE_YC_EQUITY=STATE;

  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function cardByTitle(title){
    var cards=document.querySelectorAll('#pane .cd');
    for(var i=0;i<cards.length;i++){
      var t=cards[i].querySelector('.cdt');
      if(t && t.textContent.trim()===title) return cards[i];
    }
    return null;
  }
  function eventList(raw){
    if(Array.isArray(raw))return raw;
    var keys=['events','data','items','disclosures'];
    for(var i=0;i<keys.length;i++)if(Array.isArray(raw&&raw[keys[i]]))return raw[keys[i]];
    return [];
  }
  function eventText(e){return JSON.stringify(e||{});}
  function pick(e,keys){for(var i=0;i<keys.length;i++){var v=e&&e[keys[i]];if(v!==undefined&&v!==null&&String(v).trim())return String(v);}return '';}
  function normalizeEvent(e){
    return {
      company:pick(e,['corp_name','corpName','company','name','stock_name']),
      title:pick(e,['report_nm','reportName','title','report','disclosure_name']),
      time:pick(e,['rcept_dt','rceptDt','date','datetime','time','published_at']),
      rcpNo:pick(e,['rcept_no','rceptNo','rcpNo'])
    };
  }
  function pulse(raw,re){
    var all=eventList(raw),hits=[];
    for(var i=0;i<all.length;i++)if(re.test(eventText(all[i])))hits.push(normalizeEvent(all[i]));
    return {count:hits.length,total:all.length,top:hits.slice(0,4)};
  }
  function stamp(raw){
    return pick(raw,['generated_kst','generatedAtKst','generated_at','generatedAt','disclosure_through','as_of'])||new Date().toISOString();
  }
  function hhmm(v){
    if(!v)return '—';
    var d=new Date(v);if(isNaN(d.getTime()))return esc(v);
    return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(d);
  }
  async function fetchJson(url){
    var ctl=new AbortController(),timer=setTimeout(function(){ctl.abort();},8000);
    try{
      var r=await fetch(url,{method:'GET',mode:'cors',credentials:'omit',cache:'no-store',signal:ctl.signal,headers:{accept:'application/json,text/plain,*/*'}});
      if(!r.ok)throw new Error('HTTP '+r.status);
      return await r.json();
    }finally{clearTimeout(timer);}
  }
  async function refresh(){
    STATE.status='loading';STATE.error=null;
    try{
      var rs=await Promise.all([fetchJson(API.intraday),fetchJson(API.today).catch(function(){return null;})]);
      var raw=rs[0],today=rs[1];
      var ipo=pulse(raw,/(신규상장|상장예비심사|기업공개|수요예측|공모주|상장주선인|증권신고서\(지분증권\))/i);
      var cb=pulse(raw,/(전환사채|교환사채|신주인수권부사채|전환가액|리픽싱)/i);
      STATE.data={ipo:ipo,cb:cb,generated:stamp(today||raw),provider:'AIKSTOCKDATA · PUBLIC DART FEED'};
      STATE.status='ready';STATE.lastFetch=Date.now();
    }catch(e){
      STATE.status='error';STATE.data=null;STATE.error=String(e&&e.message||e);STATE.lastFetch=Date.now();
    }
    enhanceEquity();
  }
  function eventRows(rows){
    if(!rows||!rows.length)return '<div class="note ycq-note">현재 공개 피드에서 해당 이벤트 없음</div>';
    var out='<div class="ycq-feed">';
    for(var i=0;i<rows.length;i++){
      var x=rows[i],label=[x.company,x.title].filter(Boolean).join(' · ')||'공시 이벤트';
      var link=x.rcpNo?'https://dart.fss.or.kr/dsaf001/main.do?rcpNo='+encodeURIComponent(x.rcpNo):'';
      out+='<div class="kv"><span>'+esc(label)+'</span>'+(link?'<a class="ycq-dart" href="'+link+'" target="_blank" rel="noopener noreferrer">DART ↗</a>':'<b>'+esc(x.time||'')+'</b>')+'</div>';
    }
    return out+'</div>';
  }
  function pendingCard(title,subtitle){
    return '<div class="cdh"><span class="cdt">'+title+'</span><span class="cdo">'+subtitle+'</span></div>'+
      '<div class="ycq-signal warn"><span class="lbl">PUBLIC FEED</span><strong>DATA PENDING</strong></div>'+
      '<div class="note ycq-note">공개 DART 피드가 확인될 때까지 숫자를 임의 생성하지 않습니다.</div>';
  }
  function liveCard(title,subtitle,label,p){
    return '<div class="cdh"><span class="cdt">'+title+'</span><span class="cdo">'+subtitle+'</span></div>'+
      '<div class="ycq-signal"><span class="lbl">'+label+'</span><strong>'+p.count+' EVENTS</strong></div>'+
      '<div class="ycq-grid">'+
        '<div class="ycq-mini"><span>해당 이벤트</span><b>'+p.count+'건</b></div>'+
        '<div class="ycq-mini"><span>전체 피드</span><b>'+p.total+'건</b></div>'+
      '</div>'+eventRows(p.top);
  }
  function enhanceEquity(){
    if(typeof curTab==='undefined' || curTab!=='EQUITY')return;
    var ipo=cardByTitle('IPO MARKET REPORT'),cb=cardByTitle('CB ZERO FINDER');
    if(!ipo&&!cb)return;
    if(STATE.status!=='ready'||!STATE.data){
      if(ipo){ipo.classList.add('ycq');ipo.innerHTML=pendingCard('IPO MARKET REPORT','김유찬 · PUBLIC DART');}
      if(cb){cb.classList.add('ycq');cb.innerHTML=pendingCard('CB ZERO FINDER','김유찬 · PUBLIC DART');}
      return;
    }
    var d=STATE.data;
    if(ipo){
      ipo.classList.add('ycq');
      ipo.innerHTML=liveCard('IPO MARKET REPORT','김유찬 · PUBLIC DART','IPO / EQUITY EVENT PULSE',d.ipo)+
        '<div class="note ycq-note">'+esc(d.provider)+' · '+hhmm(d.generated)+' · 5분 자동 갱신</div>';
    }
    if(cb){
      cb.classList.add('ycq');
      cb.innerHTML=liveCard('CB ZERO FINDER','김유찬 · PUBLIC DART','CB / MEZZANINE EVENT PULSE',d.cb)+
        '<div class="note ycq-note">'+esc(d.provider)+' · '+hhmm(d.generated)+' · 5분 자동 갱신</div>';
    }
  }
  function installQuickLink(){
    var groups=document.querySelectorAll('.cmd .cps'),target=null;
    for(var i=0;i<groups.length;i++)if(!groups[i].classList.contains('sk')){target=groups[i];break;}
    if(!target||target.querySelector('.ycq-chip'))return;
    var chip=document.createElement('div');
    chip.className='cp ycq-chip';chip.textContent='유찬 Equity';chip.title='KOSPI · KOSDAQ · IPO · CB Equity intelligence';
    chip.addEventListener('click',function(){if(typeof tab==='function')tab('EQUITY');setTimeout(enhanceEquity,30);});
    target.appendChild(chip);
  }

  var originalPaneRender=window.paneRender;
  if(typeof originalPaneRender==='function')window.paneRender=function(){originalPaneRender.apply(this,arguments);enhanceEquity();};

  installQuickLink();
  enhanceEquity();
  refresh();
  STATE.timer=setInterval(refresh,POLL_MS);
})();
