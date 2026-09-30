/* Intelligence Chain: SVG ontology graph (16 objects / 22 relations) + ambient data field.
   Layout, relations and β come from the ontology; state only changes node values and classes. */
"use strict";
var VK = window.VK || {};
window.VK = VK;

VK.fmt = (function () {
  function val(n, v) {
    if (v === null || v === undefined || v !== v) return "—";
    var u = n.unit;
    if (u === "%") return v.toFixed(2) + "%";
    if (u === "bp") return v.toFixed(0) + "bp";
    if (u === ":1") return Math.round(v) + ":1";
    if (u === "곳") return Math.round(v) + "곳";
    if (u === "pt") return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return String(v);
  }
  function sg(x, d) { return (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(d === undefined ? 1 : d); }
  /* delta of a state node, in its natural unit; null when unchanged */
  function delta(sn) {
    if (!sn) return null;
    if (sn.delta_pct !== undefined) return Math.abs(sn.delta_pct) >= 0.05 ? sg(sn.delta_pct) + "%" : null;
    if (sn.delta !== undefined) return sn.delta ? sg(sn.delta, 0) + "곳" : null;
    if (sn.delta_bp !== undefined) return Math.abs(sn.delta_bp) >= 0.05 ? sg(sn.delta_bp) + "bp" : null;
    return null;
  }
  function moved(sn) {
    if (!sn) return false;
    return Math.abs(sn.delta_bp || 0) >= 0.5 || Math.abs(sn.delta_pct || 0) >= 0.5 || (sn.delta || 0) !== 0;
  }
  /* risk 0..1 -> green / amber / red (CLAUDE.md semantics: green normal, amber attention, red risk) */
  function riskColor(s) {
    if (s === null || s === undefined) return "#3A4452";
    var a = [49, 192, 140], b = [239, 168, 58], c = [239, 90, 97], k, p, q;
    if (s < 0.5) { k = s / 0.5; p = a; q = b; } else { k = (s - 0.5) / 0.5; p = b; q = c; }
    return "rgb(" + [0, 1, 2].map(function (i) { return Math.round(p[i] + (q[i] - p[i]) * k); }).join(",") + ")";
  }
  function riskLevel(s) { return s === null || s === undefined ? "NA" : s < 0.35 ? "LOW" : s < 0.65 ? "MID" : "HIGH"; }
  return { val: val, sg: sg, delta: delta, moved: moved, riskColor: riskColor, riskLevel: riskLevel };
})();

VK.chain = (function () {
  var NS = "http://www.w3.org/2000/svg";
  var NW = 142, NH = 46, TW = 158, TH = 54;
  var LANE_Y = { mac: [6, 132], rat: [138, 268], eq: [274, 398] };
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var SV, O, gE, gN, gP, SHL, SHT = [], NEL = {}, EL = [], onSel = null, sel = null, pathSet = null;
  var shown = {};   // node id -> numeric value currently displayed (rolling number)

  function ce(t, a) { var e = document.createElementNS(NS, t); for (var k in a || {}) e.setAttribute(k, a[k]); return e; }
  function tx(a, s) { var e = ce("text", a); e.textContent = s || ""; return e; }
  function isSig(id) { return !!O.nodes[id].signal; }
  function W(id) { return isSig(id) ? TW : NW; }
  function H(id) { return isSig(id) ? TH : NH; }

  function pathD(a, b) {
    var A = O.nodes[a], B = O.nodes[b];
    var ax = A.x + W(a), ay = A.y + H(a) / 2, bx = B.x, by = B.y + H(b) / 2;
    if (bx - ax < 40) {
      if (Math.abs(ay - by) < 24) return "M" + ax + "," + ay + "L" + bx + "," + by;
      var sx = A.x + W(a) / 2, sy = by > ay ? A.y + H(a) : A.y, ex = B.x + W(b) / 2, ey = by > ay ? B.y : B.y + H(b), m = (sy + ey) / 2;
      return "M" + sx + "," + sy + "C" + sx + "," + m + " " + ex + "," + m + " " + ex + "," + ey;
    }
    var dx = Math.max(40, (bx - ax) * 0.52);
    return "M" + ax + "," + ay + "C" + (ax + dx) + "," + ay + " " + (bx - dx) + "," + by + " " + bx + "," + by;
  }

  /* ---------------- graph relations (for focus / causal path) ---------------- */
  function walk(id, dir) {
    var out = {}, stack = [id];
    while (stack.length) {
      var c = stack.pop();
      O.edges.forEach(function (e) {
        var nx = dir > 0 ? (e.from === c ? e.to : null) : (e.to === c ? e.from : null);
        if (nx && !out[nx]) { out[nx] = 1; stack.push(nx); }
      });
    }
    return out;
  }

  /* ---------------- build ---------------- */
  function build(ontology) {
    O = ontology;
    SV = document.getElementById("chain");
    SV.innerHTML = "";
    var defs = ce("defs");
    defs.innerHTML = '<marker id="ar" markerWidth="7" markerHeight="7" refX="6.2" refY="3.5" orient="auto">' +
      '<path d="M0,0.8 L6,3.5 L0,6.2" fill="none" stroke="#2A3542" stroke-width="1.1"/></marker>';
    SV.appendChild(defs);

    O.lanes.forEach(function (ln, i) {
      var y = LANE_Y[ln.id][0];
      if (i > 0) SV.appendChild(ce("line", { x1: 6, y1: y - 4, x2: 1014, y2: y - 4, "class": "lane" }));
      SV.appendChild(tx({ x: 10, y: y + 9, "class": "lnm" }, ln.label + " · " + ln.owner));
    });

    gE = ce("g"); gN = ce("g"); gP = ce("g");
    SV.appendChild(gE); SV.appendChild(gN); SV.appendChild(gP);

    EL = [];
    O.edges.forEach(function (e, i) {
      var d = pathD(e.from, e.to);
      var isBridge = O.bridge && O.bridge[0] === e.from && O.bridge[1] === e.to;
      var g = ce("g", { "class": "eg" + (e.kind === "evidence" ? " ev" : "") + (isBridge ? " bridge" : "") });
      var k = 0.82 + ((i * 37) % 50) / 100;
      g.style.setProperty("--da", (13.4 * k).toFixed(2) + "s");
      g.style.setProperty("--db", (21.0 * k).toFixed(2) + "s");
      var p0 = ce("path", { d: d, "class": "ebase", "marker-end": "url(#ar)" });
      var p1 = ce("path", { d: d, "class": "efB" });
      var p2 = ce("path", { d: d, "class": "efA" });
      p1.style.animationDelay = (-(i * 1.7)).toFixed(1) + "s";
      p2.style.animationDelay = (-(i * 1.1)).toFixed(1) + "s";
      if (e.beta >= 0.55) p1.setAttribute("stroke-width", "1.9");
      var hit = ce("path", { d: d, fill: "none", stroke: "transparent", "stroke-width": 9 });
      g.appendChild(p0); g.appendChild(p1); g.appendChild(p2); g.appendChild(hit);
      gE.appendChild(g);
      var len = p0.getTotalLength(), mid = p0.getPointAtLength(len / 2);
      var bt = tx({ x: mid.x, y: mid.y - 3, "class": "beta", "text-anchor": "middle" },
        (e.sign < 0 ? "−" : "") + "β" + e.beta.toFixed(2));
      g.appendChild(bt);
      if (isBridge) {
        g.appendChild(tx({ x: mid.x + 6, y: mid.y + 12, "class": "bridge-tx" }, "FUNDING BRIDGE"));
      }
      var rec = { g: g, p: p0, e: e, len: len };
      hit.addEventListener("mouseenter", function (ev) { tip(ev, edgeTip(rec)); });
      hit.addEventListener("mousemove", moveTip);
      hit.addEventListener("mouseleave", hideTip);
      EL.push(rec);
    });

    // Shared Duration: the rates and equity terminals read the same discount-rate duration
    var R = O.nodes.sig_rates, Q = O.nodes.sig_equity;
    var x0 = R.x + TW / 2 + 40, y0 = R.y + TH, y1 = Q.y;
    SHL = ce("path", { "class": "shl", d: "M" + x0 + "," + y0 + " C" + (x0 + 34) + "," + (y0 + 22) + " " + (x0 + 34) + "," + (y1 - 22) + " " + x0 + "," + y1 });
    gE.appendChild(SHL);
    SHT = [tx({ x: x0 - 8, y: (y0 + y1) / 2 - 3, "class": "shtx", "text-anchor": "end" }, "SHARED"),
           tx({ x: x0 - 8, y: (y0 + y1) / 2 + 7, "class": "shtx", "text-anchor": "end" }, "DURATION")];
    SHT.forEach(function (t) { gE.appendChild(t); });

    NEL = {};
    Object.keys(O.nodes).forEach(function (id) {
      var n = O.nodes[id], w = W(id), h = H(id);
      var g = ce("g", { "class": "nd", "data-id": id, tabindex: 0 });
      var r = {};
      if (n.signal) {
        g.appendChild(ce("rect", { x: n.x, y: n.y, width: w, height: h, rx: 2, "class": "tsx" }));
        g.appendChild(tx({ x: n.x + 10, y: n.y + 13, "class": "tsl" }, "SIGNAL · " + n.label));
        r.st = tx({ x: n.x + w - 10, y: n.y + 13, "class": "tst", "text-anchor": "end" }, "STANDBY");
        r.v = tx({ x: n.x + 10, y: n.y + 30, "class": "tsv" }, "—");
        r.s = tx({ x: n.x + 10, y: n.y + 42, "class": "nsb" }, "");
        g.appendChild(r.st); g.appendChild(r.v); g.appendChild(r.s);
        g.appendChild(ce("rect", { x: n.x + 10, y: n.y + 47, width: w - 20, height: 2.4, rx: 1, fill: "#1A222D" }));
        r.bf = ce("rect", { x: n.x + 10, y: n.y + 47, width: 0, height: 2.4, rx: 1, fill: "#3FD9E6" });
        r.bw = w - 20;
        g.appendChild(r.bf);
      } else {
        g.appendChild(ce("rect", { x: n.x, y: n.y, width: w, height: h, rx: 2, "class": "nbx" }));
        g.appendChild(tx({ x: n.x + 8, y: n.y + 12, "class": "nlb" }, n.label));
        g.appendChild(tx({ x: n.x + w - 6, y: n.y + 12, "class": "nown", "text-anchor": "end" }, n.owner));
        r.v = tx({ x: n.x + 8, y: n.y + 31, "class": "nvl num" }, "—");
        r.d = tx({ x: n.x + w - 6, y: n.y + 31, "class": "ndl num", "text-anchor": "end" }, "");
        g.appendChild(r.v); g.appendChild(r.d);
        g.appendChild(tx({ x: n.x + 8, y: n.y + 41.5, "class": "nsb" }, n.sub || ""));
        r.rb = ce("rect", { x: n.x + 1, y: n.y + h - 2.6, width: 0, height: 2, rx: 1, "class": "rbar" });
        r.rw = w - 2;
        g.appendChild(r.rb);
      }
      // selection bracket (four corners)
      var c = 6, x1 = n.x - 3, y1 = n.y - 3, x2 = n.x + w + 3, y2 = n.y + h + 3;
      g.appendChild(ce("path", { "class": "brk", d:
        "M" + x1 + "," + (y1 + c) + "V" + y1 + "H" + (x1 + c) + "M" + (x2 - c) + "," + y1 + "H" + x2 + "V" + (y1 + c) +
        "M" + x2 + "," + (y2 - c) + "V" + y2 + "H" + (x2 - c) + "M" + (x1 + c) + "," + y2 + "H" + x1 + "V" + (y2 - c) }));
      g.addEventListener("click", function () { select(sel === id ? null : id); });
      g.addEventListener("keydown", function (ev) { if (ev.key === "Enter") select(sel === id ? null : id); });
      g.addEventListener("mouseenter", function (ev) { tip(ev, nodeTip(id)); });
      g.addEventListener("mousemove", moveTip);
      g.addEventListener("mouseleave", hideTip);
      r.g = g;
      NEL[id] = r;
      gN.appendChild(g);
    });
    field();
  }

  /* keep an SVG text inside `avail` px: shrink the font down to `min`, then compress glyph spacing as a last resort */
  function fit(el, avail, base, min) {
    el.style.fontSize = ""; el.removeAttribute("textLength"); el.removeAttribute("lengthAdjust");
    var len;
    try { len = el.getComputedTextLength(); } catch (e) { return; }
    if (!len || len <= avail) return;
    el.style.fontSize = Math.max(min, base * avail / len).toFixed(2) + "px";
    if (el.getComputedTextLength() > avail) { el.setAttribute("textLength", avail.toFixed(1)); el.setAttribute("lengthAdjust", "spacingAndGlyphs"); }
  }

  /* ---------------- state ---------------- */
  var ST = null;
  function update(st) {
    ST = st;
    Object.keys(NEL).forEach(function (id) {
      var r = NEL[id], sn = st.nodes[id], n = O.nodes[id];
      if (!sn) return;
      var cl = r.g.classList;
      var rs = sn.risk ? sn.risk.score : null, lv = VK.fmt.riskLevel(rs);
      cl.toggle("rl", lv === "LOW"); cl.toggle("rm", lv === "MID"); cl.toggle("rh", lv === "HIGH");
      if (r.rb) { r.rb.setAttribute("width", (r.rw * (rs || 0)).toFixed(1)); r.rb.setAttribute("fill", VK.fmt.riskColor(rs)); }
      cl.toggle("al", sn.status === "ALERT");
      cl.toggle("sh", sn.status === "SHOCK");
      if (n.signal) {
        var key = id.replace("sig_", ""), s = st.signals[key];
        r.v.textContent = s.call;
        fit(r.v, W(id) - 20, 12.5, 9.6);          // long calls stay inside the box (shrink, then compress glyphs)
        r.s.textContent = s.dir + " · CONF " + s.confidence;
        r.st.textContent = "";
        r.bf.setAttribute("width", (r.bw * s.confidence / 100).toFixed(1));
      } else {
        roll(id, r.v, sn.value, n);
        var d = VK.fmt.delta(sn);
        r.d.textContent = d || "";
      }
    });
    // conflict marks on terminals
    var cf = {};
    if (st.conflict) { cf.sig_macro = 1; if (/채권|DURATION/.test(st.conflict)) cf.sig_rates = 1; if (/청약/.test(st.conflict)) cf.sig_equity = 1; }
    (st.replay_conflicts || []).forEach(function (c) { cf[c.domain === "rat" ? "sig_rates" : "sig_equity"] = 1; });
    ((st.tools && st.tools.items) || []).forEach(function (i) { if (i.match === "CONFLICT") cf["sig_" + i.id] = 1; });   // owner-model cross-check
    ["sig_macro", "sig_rates", "sig_equity"].forEach(function (id) { NEL[id].g.classList.toggle("cf", !!cf[id]); });
    // edges on the shock path
    EL.forEach(function (x) {
      var a = st.nodes[x.e.from], b = st.nodes[x.e.to];
      var on = st.mode === "WHAT-IF" && VK.fmt.moved(a) && (VK.fmt.moved(b) || isSig(x.e.to));
      x.g.classList.toggle("shk", on);
    });
    applyFocus();
  }

  function roll(id, el, v, n) {
    var from = shown[id];
    shown[id] = v;
    if (v === null || v === undefined || from === undefined || from === null || reduce || from === v) {
      el.textContent = VK.fmt.val(n, v);
      return;
    }
    var t0 = performance.now(), dur = 420;
    (function step(t) {
      var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      if (shown[id] !== v) return;   // superseded by a newer update
      el.textContent = VK.fmt.val(n, from + (v - from) * e);
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  }

  /* ---------------- focus ---------------- */
  function applyFocus() {
    var set = null;
    if (pathSet) set = pathSet;
    else if (sel) {
      set = {}; set[sel] = 1;
      var up = walk(sel, -1), dn = walk(sel, 1), k;
      for (k in up) set[k] = 1;
      for (k in dn) set[k] = 1;
    }
    SV.classList.toggle("fc", !!set);
    Object.keys(NEL).forEach(function (id) {
      NEL[id].g.classList.toggle("rel", !!(set && set[id]));
      NEL[id].g.classList.toggle("on", id === sel);
    });
    EL.forEach(function (x) {
      var rel = !!(set && set[x.e.from] && set[x.e.to]);
      x.g.classList.toggle("rel", rel);
      x.g.classList.toggle("hot", !!(sel && rel && (x.e.from === sel || x.e.to === sel)) || !!(pathSet && rel));
    });
    var shOn = !!(set && (set.sig_rates && set.sig_equity || sel === "rat_ktb" || sel === "eq_val"));
    SHL.classList.toggle("on", shOn);
    SHT.forEach(function (t) { t.classList.toggle("on", shOn); });
  }

  function select(id, silent) {
    sel = id || null;
    pathSet = null;
    applyFocus();
    if (sel) sparkEdges(EL.filter(function (x) { return x.e.to === sel; }), false);
    if (onSel && !silent) onSel(sel);
  }

  /* highlight an explicit ordered path (command routing) */
  function highlight(ids) {
    sel = null;
    pathSet = {};
    (ids || []).forEach(function (i) { pathSet[i] = 1; });
    if (!ids || !ids.length) pathSet = null;
    applyFocus();
    if (pathSet) sparkEdges(EL.filter(function (x) { return pathSet[x.e.from] && pathSet[x.e.to]; }), true);
  }

  /* ---------------- spark packets (information transmission) ---------------- */
  var ORDER = ["mac_gdp", "mac_uscpi", "mac_krcpi", "mac_fed", "mac_bok", "rat_ust", "rat_ktb", "rat_curve",
               "rat_credit", "eq_fin", "eq_val", "eq_cb", "eq_ipo", "sig_macro", "sig_rates", "sig_equity"];
  function depth(id) { var i = ORDER.indexOf(id); return i < 0 ? 0 : i; }
  function sparkEdges(list, amber) {
    if (reduce || !list.length) return;
    var d0 = Math.min.apply(null, list.map(function (x) { return depth(x.e.from); }));
    list.forEach(function (x) {
      var delay = (depth(x.e.from) - d0) * 70;
      var c = ce("circle", { r: 2.3, "class": "pk" + (amber ? " a" : ""), cx: -10, cy: -10 });
      gP.appendChild(c);
      var t0 = performance.now() + delay, dur = 780;
      (function step(t) {
        var k = (t - t0) / dur;
        if (k < 0) return requestAnimationFrame(step);
        if (k >= 1) { c.remove(); return; }
        var p = x.p.getPointAtLength(x.len * (1 - Math.pow(1 - k, 2)));
        c.setAttribute("cx", p.x); c.setAttribute("cy", p.y);
        c.setAttribute("opacity", k > 0.85 ? (1 - k) / 0.15 : 1);
        requestAnimationFrame(step);
      })(performance.now());
    });
  }
  function sparkShock() {
    sparkEdges(EL.filter(function (x) { return x.g.classList.contains("shk"); }), true);
  }

  /* RUN SIGNATURE: macro -> rates -> equity, lane by lane */
  function signature() {
    return new Promise(function (res) {
      var lanes = [["mac_", "sig_macro"], ["rat_", "sig_rates"], ["eq_", "sig_equity"]];
      var step = 0;
      sel = null;
      (function next() {
        if (step >= lanes.length) { pathSet = null; applyFocus(); return res(); }
        var pre = lanes[step][0];
        pathSet = {};
        Object.keys(NEL).forEach(function (id) { if (id.indexOf(pre) === 0 || id === lanes[step][1]) pathSet[id] = 1; });
        if (step > 0) O.edges.forEach(function (e) { if (pathSet[e.to] && !pathSet[e.from] && e.from.indexOf(lanes[step - 1][0]) === 0) pathSet[e.from] = 1; });
        applyFocus();
        sparkEdges(EL.filter(function (x) { return pathSet[x.e.from] && pathSet[x.e.to]; }), false);
        var g = NEL[lanes[step][1]].g;
        g.classList.add("on");
        step++;
        setTimeout(next, reduce ? 250 : 1050);
      })();
    });
  }

  /* ---------------- tooltip ---------------- */
  var TIP = null;
  function tip(ev, html) { TIP = TIP || document.getElementById("tip"); TIP.innerHTML = html; TIP.classList.add("on"); moveTip(ev); }
  function moveTip(ev) { if (!TIP) return; TIP.style.left = Math.min(ev.clientX + 14, innerWidth - 350) + "px"; TIP.style.top = (ev.clientY + 14) + "px"; }
  function hideTip() { if (TIP) TIP.classList.remove("on"); }
  function edgeTip(x) {
    var e = x.e, A = O.nodes[e.from], B = O.nodes[e.to];
    var ex = e.kind === "linear" ? "예: " + A.label + " +10bp → " + B.label + " " + (e.sign < 0 ? "−" : "+") + (e.beta * 10).toFixed(1) + "bp"
           : e.kind === "function" ? "도착 노드 모델이 재계산 (가중 " + e.beta.toFixed(2) + ")" : "판단 규칙 입력 (가중 " + e.beta.toFixed(2) + ")";
    return "<b>" + A.label + " → " + B.label + "</b> · " + (e.sign < 0 ? "−" : "") + "β" + e.beta.toFixed(2) + "<br>" + (e.meaning ? e.meaning + "<br>" : "") +
      "<span class='mu'>" + ex + (e.basis ? " · 근거: " + e.basis : "") + "</span>";
  }
  function nodeTip(id) {
    var n = O.nodes[id], sn = ST && ST.nodes[id];
    if (n.signal) return "<b>" + n.label + "</b><br>" + (sn ? sn.value + " · CONF " + sn.confidence : "") + "<br><span class='mu'>클릭: 판단 근거</span>";
    var d = sn && VK.fmt.delta(sn);
    var LVK = { LOW: "1년 하단", MID: "1년 중간", HIGH: "1년 상단" };
    var rk = sn && sn.risk && sn.risk.score !== null && sn.risk.score !== undefined ? "<br>현재 수준 <b style='color:" + VK.fmt.riskColor(sn.risk.score) + "'>" +
      Math.round(sn.risk.score * 100) + "</b> · " + (LVK[sn.risk.level] || sn.risk.level) + " (1년 백분위 · 전망 아님)" : "";
    return "<b>" + n.label + "</b> · " + n.owner + "<br>" + (sn ? VK.fmt.val(n, sn.value) : "—") + (d ? " (" + d + ")" : "") +
      " · " + (sn ? sn.status : "") + rk + "<br><span class='mu'>" + (n.sub || "") + " · 클릭: 노드 인사이트</span>";
  }

  /* ---------------- ambient data field (canvas) ---------------- */
  function field() {
    var cv = document.getElementById("df");
    if (!cv || cv.dataset.on) return;
    cv.dataset.on = "1";
    var cx = cv.getContext("2d"), P = [], w = 0, h = 0, dpr = Math.min(1.5, window.devicePixelRatio || 1);
    function size() {
      w = cv.clientWidth; h = cv.clientHeight;
      cv.width = w * dpr; cv.height = h * dpr; cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    size();
    window.addEventListener("resize", size);
    for (var i = 0; i < 70; i++) P.push({ x: Math.random(), y: Math.random(), v: 0.00004 + Math.random() * 0.00008, a: 0.05 + Math.random() * 0.12 });
    function draw() {
      cx.clearRect(0, 0, w, h);
      for (var i = 0; i < P.length; i++) {
        var p = P[i];
        cx.fillStyle = "rgba(63,217,230," + p.a.toFixed(3) + ")";
        cx.fillRect(p.x * w, p.y * h, 1.2, 1.2);
      }
    }
    var last = performance.now();
    function loop(t) {
      var dt = Math.min(64, t - last); last = t;
      if (!document.hidden) {
        for (var i = 0; i < P.length; i++) { P[i].x += P[i].v * dt; if (P[i].x > 1) { P[i].x = 0; P[i].y = Math.random(); } }
        draw();
      }
      requestAnimationFrame(loop);
    }
    if (reduce) draw(); else requestAnimationFrame(loop);
  }

  return {
    build: build, update: update, select: select, highlight: highlight, signature: signature, sparkShock: sparkShock,
    onSelect: function (f) { onSel = f; },
    get selected() { return sel; },
    walk: walk
  };
})();
