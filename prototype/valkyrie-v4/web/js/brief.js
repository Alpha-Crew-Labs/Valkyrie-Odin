/* VALKYRIE market briefing player: hourly edition (/api/briefing) played as an auto-advancing "video" —
   animated scenes + Korean speech synthesis + subtitles. Opened from the research rail (▶ 마켓 브리핑).

   Live: NAVER prices keep flowing into the scenes and the strip while it plays (VK.brief.live() from the market poll).
   Alive: numbers count up, gauge needles sweep, sparks draw themselves, transmission paths carry packets.
   Interactive: tiles → 110-day chart, nodes → node insight, what-if chips → the engine recomputes the chain in the
   player, every card → its workspace tab, "AI에게 묻기" → the assistant with a scene-specific question. */
"use strict";
var VK = window.VK || {};
window.VK = VK;

VK.brief = (function () {
  var esc = function (s) { return VK.views.esc(s); };
  var F = VK.fmt;
  var el = null, B = null, sc = 0, sn = 0, playing = false, muted = false, speed = 1.25, timer = null, utter = null, edition = null, t0 = 0, seq = 0, wfSeq = 0, tick = null;
  var SPEEDS = [1, 1.25, 1.5, 2];                                             // default 1.25×: brisk, still intelligible
  var LINE_MIN = 1400, LINE_PER_CHAR = 58, GAP_LINE = 120, GAP_SCENE = 320;   // ms, all divided by speed
  var STRIP = ["KOSPI", "KOSDAQ", "KR3YT=RR", "US10YT=RR", "FX_USDKRW", "CLcv1"];
  var SEEN_KEY = "vk.brief.seen";
  var SAY = [   // pronunciation for Korean TTS
    [/SHORT DURATION/g, "숏 듀레이션"], [/LONG DURATION/g, "롱 듀레이션"], [/NEUTRAL/g, "중립"], [/HAWKISH/g, "매파"],
    [/DOVISH/g, "비둘기파"], [/AVOID/g, "회피"], [/SELECTIVE/g, "선별"], [/ENGAGE/g, "참여"], [/VALKYRIE/g, "발키리"],
    [/S&P 500/g, "에스앤피 500"], [/UST/g, "미 국채"], [/WTI/g, "더블유티아이"], [/PCE/g, "피씨이"], [/GDP/g, "지디피"],
    [/KOSPI/g, "코스피"], [/KOSDAQ/g, "코스닥"], [/IPO/g, "공모주"], [/CB/g, "씨비"], [/AA-/g, "더블에이 마이너스"], [/BM/g, "벤치마크"],
    [/(\d)bp/g, "$1 베이시스포인트"], [/%p/g, "퍼센트포인트"], [/−/g, "마이너스 "], [/→/g, ", "], [/·/g, ", "], [/:1/g, " 대 1"], [/≥/g, " 이상 "],
    [/\bvs\b/g, " 대비 "], [/\([^)]*\)/g, ""]
  ];
  function say(t) { var s = String(t || ""); SAY.forEach(function (r) { s = s.replace(r[0], r[1]); }); return s.replace(/\s+/g, " ").trim(); }
  function tone(dir) { return { HAWKISH: "am", SHORT: "am", AVOID: "rd", SELECTIVE: "am", DOVISH: "gr", LONG: "gr", ENGAGE: "gr", NEUTRAL: "mu" }[dir] || "mu"; }
  function sg(v, d) { return v === null || v === undefined || v !== v ? "—" : (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(d === undefined ? 2 : d); }
  function cls(v) { return v > 0 ? "up" : v < 0 ? "dw" : "mu"; }
  function nf(v, d) { return v === null || v === undefined ? "—" : (+v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function unitFmt(unit, v) {
    if (v === null || v === undefined) return "—";
    if (unit === "call") return String(v);
    if (unit === "%") return (+v).toFixed(2) + "%";
    if (unit === "bp") return Math.round(v) + "bp";
    if (unit === ":1") return Math.round(v) + ":1";
    if (unit === "곳") return Math.round(v) + "곳";
    return Math.abs(v) >= 1000 ? nf(v, 0) : (+v).toFixed(2);
  }
  function tilePrice(it) {
    var p = it.price;
    if (p === null || p === undefined) return "—";
    if (/T=RR$/.test(it.code)) return (+p).toFixed(3) + "%";
    if (it.code === "BTC") return "$" + Math.round(p).toLocaleString();
    return nf(p, 2);
  }
  function fmtImpact(v, r) {
    if (v === null || v === undefined) return "—";
    var d = r.digits === undefined || r.digits === null ? 2 : +r.digits;
    return r.unit === "%" ? (+v).toFixed(d) + "%" : r.unit === ":1" ? Math.round(v) + ":1" : nf(v, d) + (r.unit || "");
  }

  /* ------------------------------------------------------------ live data straight from the market layer */
  function liveMap() {
    var m = {}, L = VK.market && VK.market.state, sets = (L && L.sets) || {};
    ["market_board", "market_extra"].forEach(function (k) {
      var d = sets[k] && sets[k].data;
      ((d && d.items) || []).forEach(function (it) { if (it && it.code) m[it.code] = it; });
    });
    return m;
  }
  function liveAge() {
    var L = VK.market && VK.market.state, s = L && L.sets && L.sets.market_board;
    if (!s) return null;
    var t = Date.parse(s.fetchedAt);
    return { sec: isNaN(t) ? null : Math.max(0, Math.round((Date.now() - t) / 1000)), source: s.source || "—" };
  }
  function tileData(t) {
    var L = liveMap()[t.code];
    return L ? Object.assign({}, t, { price: L.price, change: L.change, changeRate: L.changeRate, spark: L.spark && L.spark.length > 1 ? L.spark : t.spark,
                                      marketStatus: L.marketStatus, tradedAt: L.tradedAt, daily: L.daily, name: L.name }) : t;
  }

  /* ------------------------------------------------------------ motion helpers */
  function countUp(node, from, to, fmt, ms) {
    if (from === null || from === undefined || to === null || to === undefined || isNaN(from) || isNaN(to) || from === to) { node.textContent = fmt(to); return; }
    var s0 = performance.now(), d = ms || 700, my = (node.__cu = (node.__cu || 0) + 1);
    (function step(t) {
      if (node.__cu !== my) return;
      var k = Math.min(1, (t - s0) / d), e = 1 - Math.pow(1 - k, 3);
      node.textContent = fmt(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(step);
    })(s0);
  }
  function flash(node, up) { node.classList.remove("fl-up", "fl-dw"); void node.offsetWidth; node.classList.add(up ? "fl-up" : "fl-dw"); }
  function spark(pts, up) {
    if (!pts || pts.length < 2) return "";
    var ys = pts.map(function (p) { return +p[1]; }), lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys);
    if (hi - lo < 1e-12) { hi += 1; lo -= 1; }
    var d = ys.map(function (y, i) { return (i ? "L" : "M") + (i * 198 / (ys.length - 1) + 1).toFixed(1) + "," + (39 - 37 * (y - lo) / (hi - lo)).toFixed(1); }).join("");
    return '<svg viewBox="0 0 200 40" preserveAspectRatio="none"><path d="' + d + '" pathLength="1" class="draw" fill="none" stroke="' + (up ? "#31C08C" : "#EF5A61") + '" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>';
  }
  /* run the entrance motion for everything inside root: needle sweep, bar fills, count-ups, spark draw-in */
  function animateIn(root) {
    [].forEach.call(root.querySelectorAll(".bv-g.sweep"), function (g) {
      var n = g.querySelector(".gneedle"); if (!n) return;
      n.style.transformOrigin = n.getAttribute("x1") + "px " + n.getAttribute("y1") + "px";
      n.style.setProperty("--sw", (Math.max(0, Math.min(100, +g.dataset.v || 0)) * 1.8).toFixed(1));
      n.classList.add("sw");
    });
    var bars = [].slice.call(root.querySelectorAll("[data-w]")), thm = [].slice.call(root.querySelectorAll(".thm-b i"));
    thm.forEach(function (i) { i.dataset.w = parseFloat(i.style.width) || 0; });
    bars.concat(thm).forEach(function (b) { b.style.width = "0%"; });
    requestAnimationFrame(function () { requestAnimationFrame(function () { bars.concat(thm).forEach(function (b) { b.style.width = b.dataset.w + "%"; }); }); });
    [].forEach.call(root.querySelectorAll("[data-cu]"), function (n) {
      var to = +n.dataset.cu, from = n.dataset.cuFrom !== undefined ? +n.dataset.cuFrom : to * 0.92, r = { unit: n.dataset.u || "", digits: n.dataset.d };
      var fmt = n.dataset.kind === "tile" ? function (x) { return tilePrice({ code: n.dataset.code, price: x }); } : n.dataset.kind === "unit" ? function (x) { return unitFmt(n.dataset.u, x); } : function (x) { return fmtImpact(x, r); };
      countUp(n, from, to, fmt, 800);
    });
    requestAnimationFrame(function () { [].forEach.call(root.querySelectorAll("path.draw"), function (p) { p.classList.add("go"); }); });
  }

  /* ------------------------------------------------------------ scene visuals */
  function vHero(v) {
    return '<div class="bv-hero"><div class="bv-g sweep" data-v="' + (v.temp || 0) + '" data-go="signals">' + VK.viz.gauge(v.temp, v.label, "현재 스트레스 수준 · 1년 분포 내 위치 · 클릭: 판단 탭", 300) + "</div>" +
      '<div class="bv-calls">' + v.calls.map(function (c, i) {
        return '<div class="bv-call s' + i + '" data-go="' + ["signals", "impact", "cb"][i] + '"><em>' + esc(c[0]) + '</em><b class="' + tone(c[2]) + '">' + esc(c[1]) + "</b><span>" + esc(c[2]) +
          (c[3] ? " · CONF " + c[3] : "") + '</span><i class="cb"><em data-w="' + (c[3] || 0) + '"></em></i></div>';
      }).join("") + '</div><div class="bv-lanes">' + ["mac", "rat", "eq"].map(function (k) {
        var l = (v.lanes || {})[k] || {};
        return VK.viz.thermo(l.name || k, l.temp, l.label);
      }).join("") + "</div></div>";
  }
  function vTiles(v) {
    return '<div class="bv-tiles">' + v.tiles.map(function (t0, i) {
      var t = tileData(t0), up = (t.changeRate || 0) >= 0;
      return '<div class="bv-t" data-code="' + esc(t.code) + '" data-p="' + (t.price === null || t.price === undefined ? "" : t.price) + '" style="animation-delay:' + (i * 0.05).toFixed(2) + 's" title="클릭: 110일 차트">' +
        "<em>" + esc(t.label) + (t.marketStatus === "OPEN" ? ' <i class="lv" title="장중 · LIVE"></i>' : "") + '</em><b class="num" data-cu="' + (t.price || 0) + '" data-kind="tile" data-code="' + esc(t.code) + '">' + tilePrice(t) + "</b>" +
        '<span class="num ' + (up ? "up" : "dw") + '">' + sg(t.changeRate) + "%</span>" + spark(t.spark, up) + '<div class="bv-tbig"></div></div>';
    }).join("") + "</div>";
  }
  function vDesk(v) {
    var tl = v.temp || {}, tool = v.tool || {}, byId = {};
    (v.nodes || []).forEach(function (n) { byId[n[0]] = n; });
    var flow = '<div class="bv-flow">' + (v.path || []).map(function (id, i) {
      var n = byId[id], isSig = /^sig_/.test(id), s = n ? n[3] : null;
      return (i ? '<i class="bv-fe"><b style="animation-delay:' + (i * 0.25).toFixed(2) + 's"></b></i>' : "") +
        '<span class="bv-fn' + (isSig ? " sig" : "") + '" data-go="node:' + esc(id) + '" title="클릭: 노드 인사이트" style="border-color:' + (s !== null && s !== undefined ? F.riskColor(s) : (isSig ? "#1F3F46" : "#1B2430")) + '">' +
        "<small>" + esc(n ? n[1] : id) + "</small><b>" + esc(n ? unitFmt(n[4], n[2]) : "") + "</b></span>";
    }).join("") + "</div>";
    var nodes = (v.nodes || []).filter(function (n) { return n[4] !== "call"; }).map(function (n, i) {
      var s = n[3], val = n[2];
      return '<div class="bv-n" data-go="node:' + esc(n[0]) + '" title="클릭: 노드 인사이트" style="animation-delay:' + (0.1 + i * 0.07).toFixed(2) + 's"><span>' + esc(n[1]) + '</span><b class="num" data-cu="' + (val === null || val === undefined ? "" : val) + '" data-kind="unit" data-u="' + esc(n[4] || "") + '">' + unitFmt(n[4], val) +
        '</b><i><em data-w="' + Math.round((s || 0) * 100) + '" style="background:' + F.riskColor(s) + '"></em></i><small>현재 수준 ' + (s === null || s === undefined ? "—" : Math.round(s * 100)) + " · 1년 백분위</small></div>";
    }).join("");
    return '<div class="bv-deskw">' + flow + '<div class="bv-desk"><div class="bv-dl"><div class="bv-g sm sweep" data-v="' + (tl.temp || 0) + '">' + VK.viz.gauge(tl.temp, tl.label, (tl.name || "") + " 영역 수준 (현재)", 230) + "</div>" +
      '<ul class="bv-rs">' + (v.reasons || []).map(function (r, i) { return '<li style="animation-delay:' + (0.06 + i * 0.12).toFixed(2) + 's">' + esc(r) + "</li>"; }).join("") + "</ul></div>" +
      '<div class="bv-dr"><div class="bv-ns">' + nodes + "</div>" + (tool.verdict ? '<div class="bv-tool ' + ({ AGREE: "ok", PARTIAL: "pt" }[tool.match] || "na") + '" data-go="signals"><em>' +
        esc((tool.owner || "") + " · " + (tool.app || "")) + "</em><b>" + esc(tool.verdict) + (tool.score !== undefined && tool.score !== null ? " " + (+tool.score).toFixed(2) : "") + "</b><span>" +
        esc(tool.headline || "") + "</span><small>" + esc(tool.matchText || "") + "</small></div>" : "") + "</div></div></div>";
  }
  function vSectors(v) {
    var mx = Math.max.apply(null, (v.sectors || []).map(function (s) { return Math.abs(s.changeRate || 0); }).concat([0.5]));
    return '<div class="bv-sec"><div class="bv-sl">' + (v.tilt_active && v.tilt_active.length ? '<div class="bv-tilt">VALKYRIE 기준: ' + esc(v.tilt_active.join(" · ")) + "</div>" : "") + (v.sectors || []).map(function (s, i) {
      var w = Math.round(100 * Math.abs(s.changeRate || 0) / mx);
      return '<div class="bv-sr" data-go="cb" style="animation-delay:' + (i * 0.07).toFixed(2) + 's"><span class="nm"><b>' + esc(s.name) + '</b><small>' + esc(s.kind) + " · " + Math.round(s.rise || 0) + "↑" + Math.round(s.fall || 0) + "↓ · " +
        esc((s.leaders || []).map(function (l) { return l.name; }).join(" · ")) + '</small></span><span class="bar"><i class="' + cls(s.changeRate) + '" data-w="' + w + '"></i></span><b class="num ' + cls(s.changeRate) + '">' + sg(s.changeRate) + '%</b><span class="tg">' +
        (s.tags || []).map(function (t) { return '<em title="' + esc(t.why || "") + '">' + esc(t.t) + "</em>"; }).join("") + "</span></div>";
    }).join("") + '</div><div class="bv-ss"><div class="bv-sst">주목 종목 · 이벤트</div>' + (v.stocks || []).map(function (x, i) {
      return '<div class="bv-sx" data-go="cb" style="animation-delay:' + (0.3 + i * 0.06).toFixed(2) + 's"><em>' + esc(x.kind) + "</em><b>" + esc(x.name) + '</b><span class="num">' + esc(x.value || "") + "</span><small>" + esc(x.why || "") + " · " + esc(x.source || "") + "</small></div>";
    }).join("") + "</div></div>";
  }
  function vActions(v) {
    return '<div class="bv-acts">' + v.desks.map(function (d, i) {
      return '<div class="bv-a" data-go="signals" style="animation-delay:' + (i * 0.1).toFixed(2) + 's"><div class="bv-ah"><b>' + esc(d.desk) + "</b><span>" + esc(d.owner) + '</span></div><div class="bv-ac">' + esc(d.call) + "</div>" +
        d.items.slice(0, 5).map(function (it, j) {
          return '<div class="bv-ai" style="animation-delay:' + (0.15 + i * 0.1 + j * 0.07).toFixed(2) + 's"><i>✓</i><span><b>' + esc(it.text) + "</b><em>" + esc(it.src) + (it.why ? " · " + esc(it.why) : "") + "</em></span></div>";
        }).join("") + "</div>";
    }).join("") + "</div>";
  }
  function vWhatif(v) {
    return '<div class="bv-wi"><div class="bv-wc">' + (v.presets || []).map(function (p, i) {
      return '<button type="button" class="bv-chip" data-wf="' + i + '">' + esc(p.label) + "</button>";
    }).join("") + '<span class="bv-wh">클릭 → 엔진이 다시 계산 · 자동 진행은 멈춥니다 (▶ 계속)</span></div><div class="bv-wr" id="bvWf"><div class="note">첫 시나리오를 재생합니다…</div></div></div>';
  }
  function vWatch(v) {
    var K = { CONFLICT: "am", "CROSS-CHECK": "am", TRIGGER: "am", RISK: "am", EVENT: "cy", LEVEL: "mu" };
    return '<div class="bv-watch">' + v.items.slice(0, 9).map(function (w, i) {
      return '<div class="bv-w" data-go="signals" style="animation-delay:' + (i * 0.06).toFixed(2) + 's"><em class="' + (K[w.kind] || "mu") + '">' + esc(w.kind) + "</em><span>" + esc(w.text) + "</span></div>";
    }).join("") + "</div>";
  }
  var VIS = { hero: vHero, tiles: vTiles, desk: vDesk, sectors: vSectors, actions: vActions, whatif: vWhatif, watch: vWatch };
  function visual(s) { var v = s.visual || {}; return VIS[v.type] ? VIS[v.type](v) : ""; }

  /* ------------------------------------------------------------ what-if inside the player (engine recompute) */
  function runWhatif(i, auto) {
    var s = B.scenes[sc], v = s.visual || {}, p = (v.presets || [])[i];
    var box = document.getElementById("bvWf");
    if (!p || !box) return;
    [].forEach.call(document.querySelectorAll(".bv-chip"), function (b, k) { b.classList.toggle("on", k === i); });
    box.classList.add("ld");
    var my = ++wfSeq;
    VK.api.state(v.date, p.shock).then(function (st) {
      box = document.getElementById("bvWf");
      if (my !== wfSeq || !box) return;
      box.classList.remove("ld");
      var rows = (st.impact || []).slice(0, 8), sz = (st.signals.rates || {}).sizing || {};
      box.innerHTML = '<div class="bv-wt"><div class="bv-sst">' + esc(p.label) + " · 전이 결과 (" + rows.length + "개 항목)</div><table class=\"bv-tb\"><thead><tr><th>항목</th><th class=\"n\">기준</th><th class=\"n\">충격 후</th><th class=\"n\">변화</th></tr></thead><tbody>" +
        rows.map(function (r) {
          var d = (r.after || 0) - (r.before || 0), moved = Math.abs(d) > 1e-9;
          var dt = r.unit === "%" ? sg(d * 100, 1) + "bp" : r.unit === ":1" ? sg(r.before ? d / r.before * 100 : 0, 1) + "%" : sg(d, r.digits === undefined ? 2 : r.digits) + (r.unit || "");
          return "<tr><td>" + esc(r.label) + '</td><td class="n mu">' + fmtImpact(r.before, r) + '</td><td class="n"><b data-cu="' + r.after + '" data-cu-from="' + r.before + '" data-u="' + esc(r.unit || "") + '" data-d="' + (r.digits === undefined ? 2 : r.digits) + '">' +
            fmtImpact(r.before, r) + '</b></td><td class="n ' + (moved ? cls(d) : "mu") + '">' + (moved ? dt : "—") + "</td></tr>";
        }).join("") + "</tbody></table></div>" +
        '<div class="bv-ws">' + [["macro", "매크로"], ["rates", "채권"], ["equity", "주식"]].map(function (k, j) {
          var x = st.signals[k[0]];
          return '<div class="bv-wsig ' + tone(x.dir) + '" style="animation-delay:' + (j * 0.1).toFixed(2) + 's"><em>' + k[1] + " · " + esc(x.dir) + "</em><b>" + esc(x.call) + "</b><small>" + esc(x.action || "") + "</small></div>";
        }).join("") +
        (sz.target !== undefined && sz.target !== null ? '<div class="bv-wsz">8511 변동성 타깃 ' + sz.target.toFixed(2) + "년" + (sz.shocked ? " → 충격 후 <b>" + sz.target_shock.toFixed(2) + "년</b> (변동성 " + sz.sigma20.toFixed(1) + "→" + sz.sigma_shock.toFixed(1) + "bp/일 · 방향 무관)" : " (충격이 변동성을 바꾸지 않음)") +
          " · 금리 " + esc((st.signals.rates || {}).pressure_kr || "") + " (VALKYRIE)</div>" : "") + "</div>" +
        '<div class="bv-wa"><button type="button" class="bp-mini" data-bp="apply" data-wf="' + i + '">체인에 적용 ↗</button><span class="mu">' + esc(st.shock_label || "") + (st.offlineNote ? " · " + esc(st.offlineNote) : "") + "</span></div>";
      animateIn(box);
    }).catch(function (e) { if (box) { box.classList.remove("ld"); box.innerHTML = '<div class="note">계산 실패: ' + esc(e.message) + "</div>"; } });
  }

  /* ------------------------------------------------------------ player */
  function lineDur(text) { return Math.max(LINE_MIN, String(text || "").length * LINE_PER_CHAR) / speed; }
  function total() {   // planned running time at the current speed
    var ms = 0;
    B.scenes.forEach(function (s, i) { s.narration.forEach(function (t) { ms += lineDur(t) + GAP_LINE / speed; }); if (i) ms += GAP_SCENE / speed; });
    return ms;
  }
  function mmss(ms) { var s = Math.round(ms / 1000); return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); }
  function spdTxt() { return speed.toFixed(2).replace(/\.?0+$/, "") + "×"; }
  function frame() {
    var ed = B.edition || {};
    return '<div class="bp"><div class="bp-top"><span class="bp-logo">▶ VALKYRIE <b>BRIEFING</b></span><span class="bp-ed">' + esc(ed.label || "") + " · " + esc(ed.at || "") +
      " · 데이터 " + esc(B.date || "") + '</span><span class="bp-len" id="bpLen">≈ ' + mmss(total()) + '</span><span class="bp-live snap" id="bpLive"><i></i>MARKET</span><span class="bp-clock num" id="bpClock"></span><span class="grow"></span><span class="bp-note">' + esc(B.note || "") + '</span><button class="bp-x" data-bp="close" title="닫기 (Esc)">✕</button></div>' +
      '<div class="bp-strip" id="bpStrip"></div>' +
      '<div class="bp-stage" id="bpStage"></div><div class="bp-prog"><i id="bpProg"></i></div><div class="bp-sub" id="bpSub"></div>' +
      '<div class="bp-ctl"><button data-bp="prev" title="이전 장면 (←)">⏮</button><button data-bp="play" id="bpPlay" title="재생/일시정지 (Space)">❚❚</button><button data-bp="next" title="다음 장면 (→)">⏭</button>' +
      '<div class="bp-ch" id="bpCh">' + B.scenes.map(function (s, i) { return '<span data-bp="go" data-i="' + i + '" title="' + (i + 1) + '"><i></i>' + esc(s.kicker || s.id) + "</span>"; }).join("") + "</div>" +
      '<button data-bp="mute" id="bpMute" title="음성 켜기/끄기 (M)">🔊</button><button data-bp="speed" id="bpSpeed" title="속도">' + spdTxt() + '</button></div></div>';
  }
  function renderScene() {
    var s = B.scenes[sc], st = document.getElementById("bpStage");
    wfSeq++;
    st.innerHTML = '<div class="bs bs-' + esc((s.visual || {}).type || "x") + '"><div class="bs-k">' + esc(s.kicker || "") + '<span class="bs-n">' + (sc + 1) + " / " + B.scenes.length + '</span></div><div class="bs-t" data-go="' + esc(s.go || "") + '">' + esc(s.title || "") + "</div>" +
      '<div class="bs-v">' + visual(s) + "</div></div>";
    animateIn(st);
    [].forEach.call(document.querySelectorAll("#bpCh span"), function (x, i) { x.classList.toggle("on", i === sc); x.classList.toggle("done", i < sc); });
    if ((s.visual || {}).type === "whatif") setTimeout(function () { if (B && B.scenes[sc] === s) runWhatif(0, true); }, 700);
    subtitle();
  }
  function subtitle() {
    var s = B.scenes[sc], line = s.narration[sn] || "";
    var words = line.split(" "), per = Math.min(90, Math.max(28, 900 / Math.max(1, words.length))) / speed;
    document.getElementById("bpSub").innerHTML = '<span class="bp-sn">' + (sc + 1) + "/" + B.scenes.length + '</span><span class="bp-words">' +
      words.map(function (w, i) { return '<i style="animation-delay:' + Math.round(i * per) + 'ms">' + esc(w) + "</i>"; }).join(" ") + "</span>" +
      (!playing ? '<button type="button" class="bp-mini" data-bp="resume">▶ 계속</button>' : "") +
      '<button type="button" class="bp-ask" data-bp="ask" title="이 장면에 대해 AI 어시스턴트에게 묻기 (A)">✦ AI에게 묻기</button>';
    var bar = document.querySelector("#bpCh span.on i");
    if (bar) bar.style.width = (100 * (sn + 1) / Math.max(1, s.narration.length)) + "%";
    var done = 0, all = 0;
    B.scenes.forEach(function (x, i) { all += x.narration.length; if (i < sc) done += x.narration.length; });
    var p = document.getElementById("bpProg");
    if (p) p.style.width = (100 * Math.min(all, done + sn + 1) / Math.max(1, all)) + "%";
  }
  function clear() {
    clearTimeout(timer); timer = null; seq++;      // seq: callbacks of a cancelled utterance must not advance the player
    if (window.speechSynthesis) { try { speechSynthesis.cancel(); } catch (e) {} }
    utter = null;
  }
  function voice() {
    var vs = window.speechSynthesis ? speechSynthesis.getVoices() : [];
    return vs.filter(function (v) { return /^ko/i.test(v.lang); })[0] || null;
  }
  function step() {
    clear();
    if (!playing || !B) return;
    var s = B.scenes[sc], text = s.narration[sn];
    if (text === undefined) { return advance(); }
    subtitle();
    var dur = lineDur(text), my = seq;
    var done = function () { if (!playing || my !== seq) return; sn++; timer = setTimeout(step, GAP_LINE / speed); };
    if (!muted && window.speechSynthesis && window.SpeechSynthesisUtterance) {
      try {
        utter = new SpeechSynthesisUtterance(say(text));
        utter.lang = "ko-KR"; utter.rate = Math.min(2, 1.15 * speed);
        var v = voice(); if (v) utter.voice = v;
        // hard cap: the voice never drags a line past 1.5× its subtitle time, so the pace stays deterministic
        var fired = false;
        var cap = setTimeout(function () { fired = true; try { speechSynthesis.cancel(); } catch (e2) {} done(); }, dur * 1.5 + 600);
        utter.onend = function () { if (fired) return; fired = true; clearTimeout(cap); done(); };
        utter.onerror = function () { if (fired) return; fired = true; clearTimeout(cap); timer = setTimeout(done, dur); };
        speechSynthesis.speak(utter);
        return;
      } catch (e) { /* fall through to timed subtitles */ }
    }
    timer = setTimeout(done, dur);
  }
  function advance() {
    if (sc < B.scenes.length - 1) { sc++; sn = 0; renderScene(); timer = setTimeout(step, GAP_SCENE / speed); }
    else {
      playing = false; updPlay();
      var p = document.getElementById("bpProg"); if (p) p.style.width = "100%";
      document.getElementById("bpSub").innerHTML = '<span class="bp-sn">END</span>브리핑 끝 · ' + B.scenes.length + "장면 · " + mmss(Date.now() - t0) +
        ' <button type="button" class="bp-mini" data-bp="replay">↺ 다시 보기</button><button type="button" class="bp-mini" data-bp="close">닫기</button><button type="button" class="bp-ask" data-bp="ask">✦ AI에게 묻기</button>';
    }
  }
  function go(i) { clear(); sc = Math.max(0, Math.min(B.scenes.length - 1, i)); sn = 0; renderScene(); if (playing) timer = setTimeout(step, 250); }
  function updPlay() { var b = document.getElementById("bpPlay"); if (b) b.textContent = playing ? "❚❚" : "▶"; }
  function toggle() { playing = !playing; updPlay(); if (playing) step(); else { clear(); subtitle(); } }
  function pause() { if (!playing) return; playing = false; updPlay(); clear(); subtitle(); }   // the viewer is interacting

  /* ------------------------------------------------------------ live strip + ticks (실시간) */
  function liveStrip(animate) {
    var strip = document.getElementById("bpStrip"), m = liveMap();
    if (!strip) return;
    if (!strip.children.length) {
      strip.innerHTML = STRIP.map(function (c) { return '<span class="bp-si" data-code="' + esc(c) + '" data-go="market"><em></em><b class="num"></b><i class="num"></i></span>'; }).join("");
    }
    [].forEach.call(strip.children, function (sp) {
      var it = m[sp.dataset.code]; if (!it) { sp.querySelector("em").textContent = sp.dataset.code; return; }
      var b = sp.querySelector("b"), i = sp.querySelector("i"), old = sp.dataset.p === "" || sp.dataset.p === undefined ? null : +sp.dataset.p;
      sp.querySelector("em").textContent = it.label || it.code;
      if (old !== null && it.price !== null && old !== it.price) { countUp(b, old, it.price, function (x) { return tilePrice({ code: it.code, price: x }); }, 600); if (animate) flash(sp, it.price > old); }
      else b.textContent = tilePrice(it);
      sp.dataset.p = it.price === null || it.price === undefined ? "" : it.price;
      i.textContent = sg(it.changeRate) + "%"; i.className = "num " + cls(it.changeRate);
    });
  }
  function liveTiles() {
    var m = liveMap();
    [].forEach.call(document.querySelectorAll("#bpStage .bv-t[data-code]"), function (t) {
      var it = m[t.dataset.code]; if (!it || it.price === null || it.price === undefined) return;
      var old = t.dataset.p === "" ? null : +t.dataset.p, b = t.querySelector("b"), s = t.querySelector("span");
      if (old !== null && old !== it.price) { countUp(b, old, it.price, function (x) { return tilePrice({ code: it.code, price: x }); }, 600); flash(t, it.price > old); }
      t.dataset.p = it.price;
      s.textContent = sg(it.changeRate) + "%"; s.className = "num " + ((it.changeRate || 0) >= 0 ? "up" : "dw");
    });
  }
  function live() {
    if (!el || !el.classList.contains("on") || !B) return;
    liveStrip(true);
    if ((B.scenes[sc].visual || {}).type === "tiles") liveTiles();
    liveBadge();
  }
  function liveBadge() {
    var b = document.getElementById("bpLive"), a = liveAge();
    if (!b) return;
    var src = a ? a.source : "—";
    b.className = "bp-live " + (src === "LIVE" ? "live" : src === "STALE" ? "stale" : "snap");
    b.innerHTML = "<i></i>MARKET " + esc(src) + (a && a.sec !== null ? " · " + (a.sec < 60 ? a.sec + "s" : Math.round(a.sec / 60) + "m") : "");
  }
  function clock() {
    var c = document.getElementById("bpClock"); if (!c) return;
    c.textContent = new Date(Date.now() + 9 * 3600e3).toISOString().slice(11, 19) + " KST";
  }

  /* ------------------------------------------------------------ navigation out of the player */
  function jump(target) {
    if (!target) return;
    close();
    if (target.indexOf("node:") === 0) { if (VK.chain && VK.chain.select) VK.chain.select(target.slice(5)); return; }
    if (VK.main && VK.main.open) VK.main.open(target);
  }
  function ask() {
    var s = B && B.scenes[sc], q = (s && s.ask) || (s && s.title) || "지금 상황 요약";
    close();
    var cin = document.getElementById("cin"), btn = document.getElementById("askGo");
    if (cin && btn) { cin.value = q; btn.click(); }
  }
  function expandTile(t) {
    var big = t.classList.toggle("big"), box = t.querySelector(".bv-tbig");
    if (!big) { box.innerHTML = ""; return; }
    var it = liveMap()[t.dataset.code] || {}, pts = it.daily && it.daily.length >= 20 ? it.daily : it.spark;
    if (!pts || pts.length < 3) { box.innerHTML = '<div class="note">차트 데이터 없음</div>'; return; }
    var up = +pts[pts.length - 1][1] >= +pts[0][1];
    box.innerHTML = VK.viz.chart(pts.map(function (p) { return String(p[0]).slice(0, 10); }), pts.map(function (p) { return +p[1]; }),
      { h: 120, color: up ? "#31C08C" : "#EF5A61", fmt: function (v) { return Math.abs(v) >= 1000 ? Math.round(v).toLocaleString() : v.toFixed(2); } }) +
      '<div class="bv-tbn">' + esc(it.name || it.label || "") + " · " + (it.daily && it.daily.length >= 20 ? "110일 일봉" : "장중") + " · " + esc(String(it.tradedAt || "").replace("T", " ").slice(0, 16)) + ' · <span data-go="market">LIVE 마켓 탭 ↗</span></div>';
  }

  function open() {
    VK.api.briefing().then(function (b) {
      B = b; sc = 0; sn = 0; playing = true; t0 = Date.now();
      if (!el) {
        el = document.createElement("section"); el.className = "bpo"; el.id = "briefing"; document.body.appendChild(el);
        el.addEventListener("click", onClick);
        document.addEventListener("keydown", function (e) {
          if (!el.classList.contains("on")) return;
          var typing = /INPUT|SELECT|TEXTAREA/.test((document.activeElement || {}).tagName || "");
          if (e.key === "Escape") close();
          else if (e.key === " ") { e.preventDefault(); toggle(); }
          else if (e.key === "ArrowRight") go(sc + 1);
          else if (e.key === "ArrowLeft") go(sc - 1);
          else if (!typing && /^[1-9]$/.test(e.key)) go(+e.key - 1);
          else if (!typing && (e.key === "m" || e.key === "M")) { muted = !muted; var mb = document.getElementById("bpMute"); if (mb) mb.textContent = muted ? "🔇" : "🔊"; if (playing) step(); }
          else if (!typing && (e.key === "a" || e.key === "A")) ask();
        }, true);
      }
      el.innerHTML = frame();
      el.classList.add("on");
      document.getElementById("bpMute").textContent = muted ? "🔇" : "🔊";
      liveStrip(false); liveBadge(); clock();
      clearInterval(tick); tick = setInterval(function () { clock(); liveBadge(); }, 1000);
      renderScene();
      timer = setTimeout(step, 300);
      markSeen(b.edition && b.edition.key);
    }).catch(function (e) { alert("브리핑을 불러오지 못했습니다: " + e.message); });
  }
  function close() { playing = false; clear(); clearInterval(tick); tick = null; if (el) el.classList.remove("on"); }
  function onClick(e) {
    var t = e.target.closest("[data-bp]");
    if (t) {
      var a = t.dataset.bp;
      if (a === "close") close();
      else if (a === "play") toggle();
      else if (a === "resume") { playing = true; updPlay(); step(); }
      else if (a === "next") go(sc + 1);
      else if (a === "prev") go(sc - 1 < 0 ? 0 : sc - (sn > 0 ? 0 : 1));
      else if (a === "go") go(+t.dataset.i);
      else if (a === "mute") { muted = !muted; t.textContent = muted ? "🔇" : "🔊"; if (playing) step(); }
      else if (a === "replay") { clear(); sc = 0; sn = 0; playing = true; updPlay(); t0 = Date.now(); renderScene(); timer = setTimeout(step, 300); }
      else if (a === "ask") ask();
      else if (a === "apply") {
        var p = ((B.scenes[sc].visual || {}).presets || [])[+t.dataset.wf];
        close();
        if (p && VK.main && VK.main.applyShock) VK.main.applyShock(p.shock, "브리핑 WHAT-IF · " + p.label);
      }
      else if (a === "speed") {
        speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]; t.textContent = spdTxt();
        var L = document.getElementById("bpLen"); if (L) L.textContent = "≈ " + mmss(total());
        if (playing) step();
      }
      return;
    }
    var chip = e.target.closest("[data-wf]");
    if (chip) { pause(); runWhatif(+chip.dataset.wf, false); return; }
    var tile = e.target.closest(".bv-t[data-code]");
    if (tile && !e.target.closest("[data-go]")) { pause(); expandTile(tile); return; }
    var g = e.target.closest("[data-go]");
    if (g && g.dataset.go) { jump(g.dataset.go); return; }
    if (e.target === el) close();
  }

  /* ------------------------------------------------------------ hourly edition watch (NEW badge on the rail) */
  function seen() { try { return localStorage.getItem(SEEN_KEY); } catch (e) { return null; } }
  function markSeen(k) { try { if (k) localStorage.setItem(SEEN_KEY, k); } catch (e) {} poll(); }
  function poll() {
    VK.api.briefing().then(function (b) {
      edition = b.edition || {};
      if (VK.rail && VK.rail.setBrief) VK.rail.setBrief({ label: edition.label + " · " + (edition.at || "").slice(11), isNew: edition.key && edition.key !== seen(), next: edition.next });
    }).catch(function () {});
  }
  function init() {
    if (window.speechSynthesis) { try { speechSynthesis.getVoices(); speechSynthesis.onvoiceschanged = function () {}; } catch (e) {} }
    poll();
    setInterval(function () { if (!document.hidden) poll(); }, 5 * 60 * 1000);
  }
  return { open: open, close: close, init: init, say: say, live: live, get isOpen() { return !!(el && el.classList.contains("on")); } };
})();
