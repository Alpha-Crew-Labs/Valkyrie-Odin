/* VALKYRIE v4 · research rail — the team's own tools, one hover away (v3 research-rail.js grammar).
   Every tool (local Streamlit and public web tools) gets a LIVE/OFFLINE pip from a no-cors reachability probe. */
"use strict";
(function () {
  var host = location.hostname && location.hostname !== "" ? location.hostname : "localhost";
  function local(port, path) { return "http://" + (host === "127.0.0.1" ? "localhost" : host) + ":" + port + (path || "/"); }
  // Public web build (GitHub Pages): the owners' Streamlit apps live on a teammate's PC, not on the web host.
  var WEB = location.protocol !== "file:" && !/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\]|0\.0\.0\.0|$)/.test(host);

  var TOOLS = [
    { owner: "정희강", domain: "MACRO", items: [
      { mark: "M", name: "Quant Macro Terminal", tag: "STREAMLIT", url: local(8501), probe: true, primary: true, local: true,
        hint: ":8501 · macro\\run_macro.ps1" },
      { mark: "W", name: "Weekly Updates 보고서", tag: "PDF", url: "/reports/latest", probe: true, local: true, hideOnWeb: true,
        hint: "주간 시황 + 인텔리전스 체인 2쪽 · 최신본" }
    ] },
    { owner: "정훈", domain: "RATES", items: [
      { mark: "채권", name: "채권 위기 진단 · 액션 플랜", tag: "STREAMLIT", url: local(8511), probe: true, local: true,
        hint: ":8511 · bond\\explainer_app.py" }
    ] },
    { owner: "김유찬", domain: "EQUITY", items: [
      { mark: "주식", name: "주식 시장 진단 · 액션 플랜", tag: "STREAMLIT", url: local(8512), probe: true, local: true,
        hint: ":8512 · equity\\explainer_app.py" },
      { mark: "IPO", name: "IPO Market Report", tag: "VERCEL", url: "https://ipo-market-report.vercel.app/", probe: true, hint: "공개 도구 · vercel" },
      { mark: "CB", name: "CB Zero Finder", tag: "VERCEL", url: "https://cb-zero-finder.vercel.app/", probe: true, hint: "공개 도구 · vercel" }
    ] },
    { owner: "SYSTEM", domain: "BASELINE", items: [
      WEB ? { mark: "v3", name: "VALKYRIE v3 기준본", tag: "PROTOTYPE", url: "v3/", probe: true, hint: "/v3/ · 정적 기준본" }
          : { mark: "v3", name: "VALKYRIE v3 기준본", tag: "PROTOTYPE", url: local(8765, "/valkyrie-v3/"), probe: true,
              hint: ":8765 · 읽기 전용 폴백" }
    ] }
  ];
  if (WEB) TOOLS.forEach(function (g) { g.items = g.items.filter(function (it) { return !it.hideOnWeb; }); });
  var state = {};   // url -> "live" | "down"
  var info = {};    // port -> {text, tone} : owner-model verdict pushed by main.js (VK.rail.setInfo)
  var brief = {};   // {label, isNew} : hourly briefing edition pushed by brief.js (VK.rail.setBrief)

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }

  function portOf(it) { var m = String(it.url).match(/:(\d{4})\//); return m ? m[1] : null; }

  function itemHTML(it) {
    if (WEB && it.local) {   // not reachable from the public web: shown, not probed, not a link
      return '<a class="rrail-item local' + (it.primary ? " primary" : "") + '" title="' + esc(it.name) + " · 로컬 PC에서 run.ps1 실행 시 " + esc(it.url) + '">' +
        '<span class="rrail-mark">' + esc(it.mark) + "<i></i></span>" +
        '<span class="rrail-body"><span class="rrail-nm">' + esc(it.name) + "<em>" + esc(it.tag) + "</em></span>" +
        '<span class="rrail-met"><b>LOCAL</b>' + (portOf(it) && info[portOf(it)] ? '<b class="rv-' + esc(info[portOf(it)].tone) + '">' + esc(info[portOf(it)].text) + "</b>" : "<span>" + esc(it.hint) + "</span>") +
        "</span></span></a>";
    }
    var st = it.probe ? (state[it.url] || "") : "ext";
    var label = st === "live" ? "LIVE" : st === "down" ? "OFFLINE" : st === "ext" ? "EXTERNAL" : "CHECKING";
    return '<a class="rrail-item ' + st + (it.primary ? " primary" : "") + '" href="' + esc(it.url) + '" target="_blank" rel="noopener noreferrer" title="' +
      esc(it.name) + " 새 창에서 열기 (" + esc(it.url) + ')">' +
      '<span class="rrail-mark">' + esc(it.mark) + "<i></i></span>" +
      '<span class="rrail-body"><span class="rrail-nm">' + esc(it.name) + "<em>" + esc(it.tag) + " ↗</em></span>" +
      '<span class="rrail-met"><b>' + label + "</b>" + (portOf(it) && info[portOf(it)] ? '<b class="rv-' + esc(info[portOf(it)].tone) + '">' + esc(info[portOf(it)].text) + "</b>" : "<span>" + esc(it.hint) + "</span>") +
      "</span></span></a>";
  }

  function html() {
    var n = 0;
    TOOLS.forEach(function (g) { n += g.items.length; });
    var h = '<div class="rrail-top"><span class="rrail-logo">V</span><span class="rrail-title"><b>RESEARCH STACK</b><small>RAVENS · ' + n + " TOOLS</small></span></div>";
    h += '<div class="rrail-sec">BRIEFING · 매시 정각</div><button class="rrail-item rrail-brief' + (brief.isNew ? " new" : "") + '" data-act="brief" title="마켓 브리핑 영상 (음성+자막 자동재생)">' +
      '<span class="rrail-mark">▶<i></i></span><span class="rrail-body"><span class="rrail-nm">마켓 브리핑 영상<em>AUTO ▶</em></span>' +
      '<span class="rrail-met"><b class="rv-pt">' + esc(brief.label || "매시 정각 갱신") + "</b><span>" + (brief.isNew ? "NEW · " : "") + "음성+자막</span></span></span></button>";
    TOOLS.forEach(function (g) {
      h += '<div class="rrail-sec">' + esc(g.owner) + " · " + esc(g.domain) + "</div>";
      g.items.forEach(function (it) { h += itemHTML(it); });
    });
    return h + '<div class="rrail-foot">VALKYRIE = 판단 레이어 · 도구 = 심화 분석<br>' +
      (WEB ? "공개 웹: STREAMLIT 도구는 로컬 PC에서만 열립니다" : "도구 접속 상태 15초마다 확인") + "</div>";
  }

  var el, last = "";
  function render() {
    var h = html();
    if (h === last) return;
    last = h;
    var open = el.classList.contains("open");
    el.innerHTML = h;
    if (open) el.classList.add("open");
  }

  function probe(url) {
    var ctl = window.AbortController ? new AbortController() : null;
    var t = setTimeout(function () { if (ctl) ctl.abort(); }, 2500);
    return fetch(url, { mode: "no-cors", cache: "no-store", credentials: "omit", signal: ctl ? ctl.signal : undefined })
      .then(function () { state[url] = "live"; }, function () { state[url] = "down"; })
      .then(function () { clearTimeout(t); });
  }
  var lastCheck = 0;
  function check() {
    // On the public web the only probed tools are external sites: once at boot, then at most every 5 minutes.
    if (WEB && Date.now() - lastCheck < 300000) return;
    lastCheck = Date.now();
    var ps = [];
    TOOLS.forEach(function (g) { g.items.forEach(function (it) { if (it.probe && !(WEB && it.local)) ps.push(probe(it.url)); }); });
    Promise.all(ps).then(render);
  }

  function boot() {
    el = document.createElement("nav");
    el.id = "researchRail";
    el.className = "rrail";
    el.setAttribute("aria-label", "RAVENS 리서치 도구");
    document.body.appendChild(el);
    // touch has no hover: tap toggles, but a tap on a tool must open the tool
    el.addEventListener("click", function (ev) {
      if (ev.target.closest && ev.target.closest('[data-act="brief"]')) { if (window.VK && window.VK.brief) window.VK.brief.open(); return; }
      if (ev.target.closest && ev.target.closest(".rrail-item")) return;
      el.classList.toggle("open");
    });
    el.addEventListener("mouseenter", check);
    render();
    check();
    setInterval(function () { if (!document.hidden) check(); }, WEB ? 300000 : 15000);
  }

  window.VK = window.VK || {};
  window.VK.rail = { setInfo: function (m) { info = m || {}; if (el) render(); },
                     setBrief: function (b) { brief = b || {}; if (el) render(); } };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
