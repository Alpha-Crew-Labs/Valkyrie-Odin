/* VALKYRIE v3 · theme flow — where the money is actually going (Npay 증권)
 *
 * theme-equity.js is a complete and rather good data engine. It walks the
 * ENTIRE Naver/Npay theme universe by cursor (up to 8 pages, refusing to
 * publish below 50 themes), ranks the day's top and bottom movers, and for any
 * theme pulls its constituents sorted by 거래대금. It then renders all of that
 * into a full-width terminal, #themePulse, which ux-overlay.css switches off
 * with `#pane>#themePulse{display:none!important}` and a comment demoting it
 * to "a data engine only".
 *
 * The reason is a layout one, not a data one: mount() appends the terminal as
 * a third child of #pane, whose own height is 252px with overflow:hidden,
 * while .themeq-body alone asks for 270px. It never had anywhere to go. What
 * replaced it is a one-line THEME ROTATION chip strip that, without live data,
 * reads THEME DATA PENDING and nothing else - so the richest Npay integration
 * in the app has been invisible.
 *
 * This file gives it a home instead of a smaller substitute:
 *
 *   - a strip above the EQUITY card row, always visible, carrying the numbers
 *     that answer "돈이 어디로 쏠리는가" at a glance;
 *   - a drawer that relocates the real #themePulse terminal out of #pane (so
 *     the hiding rule, which requires #pane as the direct parent, stops
 *     applying without being edited) and gives it the full width and 76vh it
 *     was designed for, over the frozen shell rather than inside it.
 *
 * Two figures on the strip are computed here and exist nowhere else, both from
 * state already in memory - no new endpoint, key or request:
 *
 *   테마 폭   상승 테마 / 등락률이 있는 전체 테마. Whether today is a broad
 *             advance or a narrow one, measured across the whole universe
 *             rather than the five names that happen to be on screen.
 *   CR3      선택 테마 상위 3종목 거래대금 / 그 테마 전체 거래대금. How much
 *             of the money moving through a theme is going into just three
 *             names - a theme that is up 4% on three tickers is a different
 *             proposition from one that is up 4% on forty.
 *
 * Fails closed with the engine: while theme-equity.js is PENDING the strip
 * shows PENDING and computes nothing.
 */
(function(){
  'use strict';

  var BAR_ID='themeFlowBar',DRAWER_ID='themeFlowDrawer',SCRIM_ID='themeFlowScrim';

  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function num(v){if(v===null||v===undefined||v==='')return null;var x=Number(v);return isFinite(x)?x:null;}
  function pct(v,d){var x=num(v);return x===null?'—':(x>0?'+':'')+x.toFixed(d==null?2:d)+'%';}

  function engine(){
    var s=window.VALKYRIE_THEME_EQUITY;
    return s&&s.status==='ready'&&Array.isArray(s.themes)&&s.themes.length?s:null;
  }

  /* share of the whole theme universe that is up today */
  function breadth(s){
    var up=0,tot=0;
    for(var i=0;i<s.themes.length;i++){
      var c=num(s.themes[i].changeRate);
      if(c===null)continue;
      tot++;if(c>0)up++;
    }
    return tot?{up:up,total:tot,share:up/tot*100}:null;
  }

  /* concentration: top-3 constituents' turnover over the theme's total */
  function cr3(s){
    var st=Array.isArray(s.stocks)?s.stocks:[];
    if(st.length<4)return null;
    var vals=[],sum=0;
    for(var i=0;i<st.length;i++){
      var a=num(st[i].tradeAmount);
      if(a===null||a<0)continue;
      vals.push(a);sum+=a;
    }
    if(vals.length<4||sum<=0)return null;
    vals.sort(function(x,y){return y-x;});
    var top3=vals[0]+vals[1]+vals[2];
    return {share:top3/sum*100,n:vals.length};
  }

  function barHTML(){
    var s=engine();
    var h='<button type="button" class="tfl-bar" id="'+BAR_ID+'" aria-haspopup="dialog"'+
      ' title="네이버페이 증권 공개 테마 데이터 · 전체 테마 흐름 열기">'+
      '<span class="tfl-t">자금 쏠림</span>';

    if(!s){
      h+='<span class="tfl-m"><span>NPAY</span><b class="am">PENDING</b></span>'+
         '<span class="tfl-m"></span><span class="tfl-lead"></span>'+
         '<span class="tfl-open">THEME FLOW ↗</span></button>';
      return h;
    }

    var b=breadth(s),c=cr3(s);
    h+='<span class="tfl-m"><span>테마 폭</span><b class="'+(b&&b.share>50?'up':(b?'dn':''))+'">'+
       (b?Math.round(b.share)+'%':'—')+'</b><span>'+(b?b.up+'/'+b.total:'')+'</span></span>';
    h+='<span class="tfl-m"><span>CR3</span><b class="'+(c&&c.share>=60?'am':'')+'">'+
       (c?Math.round(c.share)+'%':'—')+'</b><span>'+(c?'상위3/'+c.n+'종목':'테마 선택')+'</span></span>';

    var lead='';
    for(var i=0;i<(s.top||[]).length&&i<3;i++)
      lead+='<i class="up">'+esc(s.top[i].name)+' '+esc(pct(s.top[i].changeRate,1))+'</i>';
    for(var j=0;j<(s.bottom||[]).length&&j<1;j++)
      lead+='<i class="dn">'+esc(s.bottom[j].name)+' '+esc(pct(s.bottom[j].changeRate,1))+'</i>';
    h+='<span class="tfl-lead">'+(lead||'')+'</span>';
    h+='<span class="tfl-open">THEME FLOW ↗</span></button>';
    return h;
  }

  function ensureDrawer(){
    var scrim=document.getElementById(SCRIM_ID);
    if(!scrim){
      scrim=document.createElement('div');
      scrim.id=SCRIM_ID;scrim.className='tfl-scrim';
      scrim.addEventListener('click',function(){toggle(false);});
      document.body.appendChild(scrim);
    }
    var d=document.getElementById(DRAWER_ID);
    if(!d){
      d=document.createElement('div');
      d.id=DRAWER_ID;d.className='tfl-drawer';
      d.setAttribute('role','dialog');
      d.setAttribute('aria-label','테마 자금 흐름');
      d.innerHTML='<div class="tfl-dhead"><span><b>THEME FLOW</b>'+
        '<small>NAVER PAY SECURITIES · 공개 테마 유니버스</small></span>'+
        '<button type="button" class="tfl-close">닫기 ESC</button></div>'+
        '<div class="tfl-dbody"></div>';
      d.querySelector('.tfl-close').addEventListener('click',function(){toggle(false);});
      document.body.appendChild(d);
    }
    return d;
  }

  /* Relocate the real terminal rather than rebuilding it: theme-equity.js keeps
   * re-rendering #themePulse in place and its own click handlers keep working. */
  function adopt(){
    var d=ensureDrawer(),body=d.querySelector('.tfl-dbody');
    var t=document.getElementById('themePulse');
    if(t&&t.parentNode!==body)body.appendChild(t);
    return !!t;
  }

  function toggle(on){
    var d=ensureDrawer(),scrim=document.getElementById(SCRIM_ID);
    adopt();
    d.classList.toggle('on',!!on);
    if(scrim)scrim.classList.toggle('on',!!on);
  }

  document.addEventListener('keydown',function(e){
    if(e.key==='Escape')toggle(false);
  });

  var lastBar='';
  function paint(){
    /* theme-equity.js remounts #themePulse into #pane on every paneRender, so
     * keep pulling it back into the drawer it now lives in */
    adopt();

    var isEquity=(window.curTab||'')==='EQUITY';
    var old=document.getElementById(BAR_ID);
    if(!isEquity){
      if(old&&old.parentNode)old.parentNode.removeChild(old);
      lastBar='';
      toggle(false);
      return;
    }
    var g4=document.querySelector('#pane .g4');
    if(!g4)return;
    var html=barHTML();
    if(old&&old.parentNode===g4&&html===lastBar)return;
    if(old&&old.parentNode)old.parentNode.removeChild(old);
    lastBar=html;
    g4.insertAdjacentHTML('afterbegin',html);
    var btn=document.getElementById(BAR_ID);
    if(btn)btn.addEventListener('click',function(){
      toggle(!document.getElementById(DRAWER_ID).classList.contains('on'));
    });
  }

  function wrapPaneRender(){
    var base=window.paneRender;
    if(typeof base!=='function'||base.__themeFlowWrapped)return;
    var fn=function(){var r=base.apply(this,arguments);paint();return r;};
    fn.__themeFlowWrapped=true;
    window.paneRender=fn;
  }

  wrapPaneRender();
  paint();
  setInterval(paint,1200);
})();
