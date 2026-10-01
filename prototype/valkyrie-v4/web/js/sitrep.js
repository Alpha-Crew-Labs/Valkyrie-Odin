/* SITREP strip — replaces the static SHOCK ▶ TRANSMISSION ▶ DECISION bar with a rotating market situation report.
   Items are built from the engine state (signals, plan, owner models, levels), the live NAVER sets (movers, flows,
   money, calendar, news) and the current what-if. One item shows at a time (8 s), the set is rebuilt every 10 min and
   the most important item is flashed on the chain. Click = open the related surface. */
"use strict";
var VK = window.VK || {};
window.VK = VK;

VK.sitrep = (function () {
  var esc = function (s) { return VK.views.esc(s); };
  var F = VK.fmt;
  var items = [], idx = 0, timer = null, lastBuild = 0, getState = null, onOpen = null, paused = false, lastTopKey = null;
  var STEP_MS = 20000, REBUILD_MS = 10 * 60 * 1000;   // 20 s per item: readable, not frantic

  function sg(v, d) { return v === null || v === undefined ? "—" : (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(d === undefined ? 2 : d); }
  function jo(v) { return v === null || v === undefined ? "—" : (Math.abs(v) >= 1e4 ? sg(v / 1e4, 2) + "조" : sg(v, 0) + "억"); }
  function live(n) { var s = VK.market && VK.market.state.sets[n]; return s && s.data; }

  /* ------------------------------------------------------------ build */
  function build() {
    var st = getState && getState();
    if (!st) return [];
    var out = [], sg3 = st.signals, rk = st.risk || {}, T = (st.tools && st.tools.items) || [];
    var prio = function (p, tag, tone, text, sub, go) { out.push({ p: p, tag: tag, tone: tone, text: text, sub: sub || "", go: go }); };

    // 0. what-if scenario chain (only while a shock is applied)
    if (st.mode === "WHAT-IF") prio(0, "SCENARIO", "am", st.briefing.trigger + " → " + st.briefing.transmission + " → " + st.briefing.decision, st.shock_label, "impact");
    // 1. conclusion of the day
    prio(1, "결론", "cy", sg3.macro.call + " · " + sg3.rates.call + " · " + sg3.equity.call,
      "매크로 " + sg3.macro.dir + " · 채권 " + sg3.rates.dir + " · 주식 " + sg3.equity.dir + " · 기준 " + st.date, "signals");
    // 2. VALKYRIE-internal consistency checks (macro path vs rate pressure); owner models are inputs, never "conflicts"
    var cf = [];
    if (st.conflict) cf.push(st.conflict);
    ((st.tools && st.tools.conflicts) || []).forEach(function (c) { cf.push(c); });
    if (cf.length) prio(2, "점검", "am", cf[0], cf.length > 1 ? "+" + (cf.length - 1) + "건 더" : "VALKYRIE 내부 정합성 점검", "signals");
    // 3. desk actions
    (st.plan ? st.plan.desks : []).forEach(function (d, i) {
      var it = d.items.filter(function (x) { return x.src !== "VALKYRIE"; })[0] || d.items[1] || d.items[0];
      if (it) prio(3 + i * 0.1, d.desk + " 액션", "cy", d.call + " — " + it.text, it.src + (it.why ? " · " + it.why : ""), "signals");
    });
    // 4. owner models
    T.forEach(function (t, i) {
      if (!t.verdict || t.verdict === "대기") return;
      prio(4 + i * 0.1, t.owner + " · " + t.app, t.match === "CONFLICT" ? "rd" : t.match === "AGREE" ? "gr" : "am",
        t.verdict + (t.score !== undefined && t.score !== null ? " " + (+t.score).toFixed(2) : "") + " — " + (t.headline || ""), t.matchText || "", "signals");
    });
    // 5. levels: what sits at the top of its 1-year range
    if (rk.top && rk.top.length) prio(5, "현재 수준", "am", "1년 상단: " + rk.top.slice(0, 4).map(function (x) { return x.label + " " + Math.round(x.score * 100); }).join(" · "),
      "종합 " + (rk.temps && rk.temps.all !== null ? Math.round(rk.temps.all) + " · " + rk.label : "—") + " · 수준이지 전망 아님 → 대응은 액션 플랜", "signals");
    // 5.5 sectors / themes to watch (auto, NAVER + VALKYRIE tags)
    var wt = st.watch;
    if (wt && wt.sectors && wt.sectors.length) prio(5.5, "주목 섹터", "cy",
      wt.sectors.slice(0, 3).map(function (s) { return s.name + " " + sg(s.changeRate) + "%" + (s.tags && s.tags.length ? " (" + s.tags[0].t + ")" : ""); }).join(" · ") +
        (wt.themes && wt.themes.length ? " · 테마 " + wt.themes[0].name + " " + sg(wt.themes[0].changeRate) + "%" : ""),
      "업종·테마 실시간 · VALKYRIE 기준 태그 · 자동 선정", "cb");
    // 6. live market movers
    var b = live("market_board");
    if (b && b.items) {
      var mv = b.items.filter(function (x) { return x.changeRate !== null && x.changeRate !== undefined; }).sort(function (a, c) { return Math.abs(c.changeRate) - Math.abs(a.changeRate); }).slice(0, 4);
      if (mv.length) prio(6, "LIVE 마켓", "cy", mv.map(function (x) { return x.label + " " + sg(x.changeRate) + "%"; }).join(" · "),
        "LIVE · " + (b.asOf || "").replace("T", " ").slice(5, 16) + " · 큰 움직임 순", "market");
      var u = b.items.filter(function (x) { return x.code === "US10YT=RR"; })[0];
      var n = VK.market && VK.market.nowcast();
      if (u && n && Math.abs(n.bp) >= 1) prio(6.5, "NOWCAST", "am", "장중 미10년물 " + u.price.toFixed(3) + "% · 엔진 EOD 대비 " + sg(n.bp, 1) + "bp", "상단 NOWCAST 버튼으로 체인 전이", "impact");
    }
    // 7. flows & money
    var fl = live("investor_flow");
    if (fl && fl.markets && fl.markets.KOSPI) {
      var rows = fl.markets.KOSPI.slice(-20), sum = function (k) { return rows.reduce(function (s, r) { return s + (r[k] || 0); }, 0); };
      prio(7, "수급", (sum("foreign") < 0 ? "rd" : "gr"), "코스피 20일 외국인 " + jo(sum("foreign")) + " · 기관 " + jo(sum("institution")) + " · 개인 " + jo(sum("individual")),
        "투자자별 매매동향 · 당일 " + esc(rows[rows.length - 1].date), "market");
    }
    var lq = live("liquidity");
    if (lq && lq.rows && lq.rows.length > 21) {
      var l = lq.rows[lq.rows.length - 1], p = lq.rows[lq.rows.length - 21];
      prio(7.5, "증시자금", "mu", "고객예탁금 " + (l.customer_deposit / 1e4).toFixed(1) + "조 (20일 " + sg((l.customer_deposit / p.customer_deposit - 1) * 100, 1) + "%) · 신용잔고 " + (l.credit_loan / 1e4).toFixed(1) + "조 (" + sg((l.credit_loan / p.credit_loan - 1) * 100, 1) + "%)",
        "증시자금동향 · " + esc(l.date), "market");
    }
    // 8. calendar
    var cal = live("calendar");
    if (cal && cal.items) {
      var today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
      var ev = cal.items.filter(function (x) { return x.category === "economicIndicators" && x.date >= today; }).slice(0, 3);
      if (ev.length) prio(8, "캘린더", "mu", ev.map(function (x) { return x.date.slice(5) + " " + ({ KOR: "KR", USA: "US" }[x.nation] || x.nation || "") + " " + x.title; }).join(" · "), "예정 지표", "market");
    }
    // 9. news
    var nw = live("news");
    if (nw && nw.items && nw.items.length) prio(9, "뉴스", "mu", nw.items[0].title, (nw.items[0].press || "") + " · " + String(nw.items[0].publishedAt || "").replace(/^\d{8}(\d{2})(\d{2}).*/, "$1:$2"), "market");
    // 10. EOD replay/scenario chain when not in what-if (keeps the old SHOCK ▶ TRANSMISSION ▶ DECISION reading available)
    if (st.mode !== "WHAT-IF") prio(10, "전이 경로", "mu", st.briefing.trigger + " → " + st.briefing.transmission + " → " + st.briefing.decision, "EOD " + st.date + " · VALKYRIE 규칙", "impact");
    out.sort(function (a, c) { return a.p - c.p; });
    return out;
  }

  /* ------------------------------------------------------------ render */
  function show(i, anim) {
    var el = document.getElementById("sitrep");
    if (!el || !items.length) return;
    idx = ((i % items.length) + items.length) % items.length;
    var it = items[idx];
    el.innerHTML = '<div class="sr-tag ' + esc(it.tone) + '"><b>' + esc(it.tag) + '</b><span>' + (idx + 1) + "/" + items.length + "</span></div>" +
      '<div class="sr-body' + (anim ? " rv" : "") + '"><div class="sr-text" title="' + esc(it.text) + '">' + esc(it.text) + '</div><div class="sr-sub">' + esc(it.sub) + "</div></div>" +
      '<div class="sr-nav"><button data-sr="prev" title="이전">‹</button><button data-sr="pause" title="일시정지">' + (paused ? "▶" : "❚❚") + '</button><button data-sr="next" title="다음">›</button></div>' +
      '<div class="sr-dots">' + items.map(function (_, k) { return "<i" + (k === idx ? ' class="on"' : "") + "></i>"; }).join("") + "</div>";
  }
  function tick() {
    clearTimeout(timer);
    if (!paused) show(idx + 1, true);
    timer = setTimeout(tick, STEP_MS);
  }
  function rebuild(flash) {
    var fresh = build();
    if (!fresh.length) return;
    items = fresh;
    lastBuild = Date.now();
    var top = items[0], key = top.tag + "|" + top.text;
    show(0, true);
    if (flash && key !== lastTopKey && VK.chain && document.getElementById("ban")) {
      var b = document.getElementById("ban");
      document.getElementById("ban1").textContent = "SITREP · " + top.tag;
      document.getElementById("ban2").textContent = top.text.slice(0, 90);
      b.classList.remove("on"); void b.offsetWidth; b.classList.add("on");
    }
    lastTopKey = key;
  }
  /* state changed (scenario, date, AI): rebuild silently so the strip is never stale */
  function refresh() { var keep = idx; items = build(); if (!items.length) return; show(Math.min(keep, items.length - 1), false); }

  function init(opts) {
    getState = opts.getState; onOpen = opts.onOpen;
    var el = document.getElementById("sitrep");
    el.addEventListener("click", function (e) {
      var t = e.target.closest("[data-sr]");
      if (t) {
        if (t.dataset.sr === "prev") show(idx - 1, true);
        else if (t.dataset.sr === "next") show(idx + 1, true);
        else if (t.dataset.sr === "pause") { paused = !paused; show(idx, false); }
        clearTimeout(timer); timer = setTimeout(tick, STEP_MS);
        return;
      }
      var it = items[idx];
      if (it && onOpen) onOpen(it.go);
    });
    el.addEventListener("mouseenter", function () { el.classList.add("hover"); });
    el.addEventListener("mouseleave", function () { el.classList.remove("hover"); });
    rebuild(false);
    timer = setTimeout(tick, STEP_MS);
    setInterval(function () { if (!document.hidden) rebuild(true); }, REBUILD_MS);
  }
  return { init: init, refresh: refresh, rebuild: rebuild, get items() { return items; } };
})();
