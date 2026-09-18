/* VALKYRIE v3 · node sparklines — the history that was already in the file
 *
 * data-core.js ships SNAP: five dated snapshots from 2026-05-04 to 2026-09-30,
 * each carrying a value for all thirteen data objects plus a confidence figure
 * for each of the three signal nodes. That is a real sixteen-series, five-point
 * time series sitting in the source, and until now the only way to see any of
 * it was to press REPLAY and watch the numbers swap one snapshot at a time -
 * which shows you a value, never a path. A research terminal that renders two
 * charts in total, while holding this, is under-reporting its own data.
 *
 * So every node box gets its own series drawn inside it: an area and line
 * behind the text, and a dot on the current point. The graph stops being a
 * board of current values and becomes sixteen trajectories - 커브 -6bp에서
 * +38bp로, 크레딧 71bp에서 52bp로 - readable without pressing anything.
 *
 * Deliberate choices, and why:
 *
 *  - ONE recessive slate hue for every sparkline, never red/green by direction.
 *    Direction has no fixed polarity here: rising GDP and rising CPI mean
 *    opposite things, so colouring the line by its slope would be a status
 *    colour doing a series' job, and would assert a judgment the data does not
 *    carry. The shape carries the information; the hue stays out of the way and
 *    never competes with the node's own on/rel state colours.
 *  - No gridlines, no axis, no value labels on points. The node already prints
 *    its current value, and a number on every point is noise.
 *  - Each sparkline is normalised to its OWN min/max, which is what makes a
 *    small move legible - and also what would exaggerate it. The current value
 *    is printed by the node, the full series is in the <title>, and REPLAY
 *    still walks every snapshot exactly as before, so no reading depends on the
 *    picture alone.
 *  - During REPLAY the snapshot you are on is ringed on every sparkline at
 *    once, so stepping through time shows where in each path you are standing.
 *    That marker is state, not series, so it uses the app's live accent.
 *
 * Drawn immediately after the node's own rect, so it sits behind every label
 * and under the OW/N/UW ticks equity-node-live.js appends. No node moves, no
 * box changes size, nothing is fetched.
 */
(function(){
  'use strict';

  var NS='http://www.w3.org/2000/svg';
  var LINE='#8E9BAB',DOT='#C3CBD6',NOW='#3FD9E6',GRAD='valkNspkFill';
  var PAD_X=6,TOP=14,BOT=43;

  function el(n,a){
    var e=document.createElementNS(NS,n);
    for(var k in a)e.setAttribute(k,a[k]);
    return e;
  }
  function num(v){var x=Number(v);return isFinite(x)?x:null;}

  /* data objects read SNAP[i].v[id]; signal nodes read their confidence out of
   * SNAP[i].sg[lane], which is the only series they have */
  var LANE={sig_macro:'macro',sig_rates:'rates',sig_equity:'equity'};
  function series(id){
    if(typeof SNAP==='undefined'||!SNAP.length)return null;
    var out=[],i,v;
    for(i=0;i<SNAP.length;i++){
      var s=SNAP[i];if(!s)return null;
      if(LANE[id]){
        var sg=s.sg&&s.sg[LANE[id]];
        v=sg?num(sg[1]):null;
      }else{
        v=s.v?num(s.v[id]):null;
      }
      if(v===null)return null;
      out.push(v);
    }
    return out.length>=3?out:null;
  }

  function build(g,rect,id){
    var vals=series(id);if(!vals)return;
    var rx=parseFloat(rect.getAttribute('x')),rw=parseFloat(rect.getAttribute('width'));
    var ry=parseFloat(rect.getAttribute('y'));
    if(!isFinite(rx)||!isFinite(rw)||!isFinite(ry))return;

    var x0=rx+PAD_X,x1=rx+rw-PAD_X,span=x1-x0;
    if(span<=0)return;
    var yTop=ry+TOP,yBot=ry+BOT,h=yBot-yTop;
    if(h<=0)return;

    var lo=Math.min.apply(null,vals),hi=Math.max.apply(null,vals);
    var range=hi-lo;
    var yOf=function(v){
      if(range<=0)return yTop+h/2;           /* flat series sits on the midline */
      return yBot-(v-lo)/range*h;
    };
    var xOf=function(i){return x0+span*i/(vals.length-1);};

    var d='',i;
    for(i=0;i<vals.length;i++)d+=(i?'L':'M')+xOf(i).toFixed(1)+','+yOf(vals[i]).toFixed(1);
    var area=d+'L'+x1.toFixed(1)+','+yBot.toFixed(1)+'L'+x0.toFixed(1)+','+yBot.toFixed(1)+'Z';

    var frag=document.createDocumentFragment();
    frag.appendChild(el('path',{'class':'nspk-a',d:area,fill:'url(#'+GRAD+')',stroke:'none'}));
    frag.appendChild(el('path',{'class':'nspk-l',d:d,fill:'none',stroke:LINE,
      'stroke-opacity':'.62','stroke-width':'1.1','stroke-linejoin':'round','stroke-linecap':'round'}));
    frag.appendChild(el('circle',{'class':'nspk-d',
      cx:xOf(vals.length-1).toFixed(1),cy:yOf(vals[vals.length-1]).toFixed(1),
      r:'1.6',fill:DOT,'fill-opacity':'.85'}));

    /* the snapshot REPLAY is currently standing on */
    var cur=typeof si==='undefined'?SNAP.length-1:si;
    if(cur>=0&&cur<vals.length&&cur!==vals.length-1){
      frag.appendChild(el('circle',{'class':'nspk-n',
        cx:xOf(cur).toFixed(1),cy:yOf(vals[cur]).toFixed(1),
        r:'2.1',fill:'none',stroke:NOW,'stroke-width':'1'}));
    }

    var t=el('title',{});
    var parts=[];
    for(i=0;i<vals.length;i++)parts.push((SNAP[i].d||'').slice(5)+' '+vals[i]);
    t.textContent=parts.join('  ·  ');
    frag.appendChild(t);

    var holder=el('g',{'class':'nspk'});
    holder.appendChild(frag);
    /* behind every label, above the box fill */
    if(rect.nextSibling)g.insertBefore(holder,rect.nextSibling);
    else g.appendChild(holder);
  }

  /* one gradient shared by all sixteen area fills */
  function ensureGrad(svg){
    if(svg.querySelector('#'+GRAD))return;
    var defs=svg.querySelector('defs');
    if(!defs){defs=el('defs',{});svg.insertBefore(defs,svg.firstChild);}
    var g=el('linearGradient',{id:GRAD,x1:'0',y1:'0',x2:'0',y2:'1'});
    g.appendChild(el('stop',{offset:'0',
      'stop-color':'#8E9BAB','stop-opacity':'.26'}));
    g.appendChild(el('stop',{offset:'1',
      'stop-color':'#8E9BAB','stop-opacity':'.02'}));
    defs.appendChild(g);
  }

  var lastCur=null;
  function refresh(){
    var svg=document.getElementById('chain');
    if(!svg||typeof SNAP==='undefined')return;
    ensureGrad(svg);
    var cur=typeof si==='undefined'?-1:si;
    var gs=svg.querySelectorAll('g.nd');
    for(var i=0;i<gs.length;i++){
      var g=gs[i],id=g.getAttribute('data-id');
      var have=g.querySelector('g.nspk');
      if(have){
        if(cur===lastCur)continue;            /* only the marker moves */
        have.parentNode.removeChild(have);
      }
      var rect=g.querySelector('rect.nbx,rect.tsx');
      if(!rect)continue;
      try{build(g,rect,id);}catch(e){}
    }
    lastCur=cur;
  }

  function wrap(name,flag){
    var base=window[name];
    if(typeof base!=='function'||base[flag])return;
    var fn=function(){var r=base.apply(this,arguments);refresh();return r;};
    fn[flag]=true;window[name]=fn;
  }

  wrap('paneRender','__nodeSparkWrapped');
  wrap('goSnap','__nodeSparkWrapped');
  refresh();
  setInterval(refresh,900);
})();
