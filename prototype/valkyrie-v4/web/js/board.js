/* GLOBAL MARKET BOARD — full-screen live board (NAVER live sets via VK.market + team research-tool verdicts).
   Opens with G, the strip BOARD button or a tile click; closes with Esc / G / ✕. Renders only while open. */
"use strict";
var VK = window.VK || {};
window.VK = VK;

VK.board = (function () {
  var esc = function (s) { return VK.views.esc(s); };
  var el = null, open = false, getState = null, getSeries = null, onNowcast = null, getTools = null, lastPrice = {};

  function sets() { return (VK.market && VK.market.state && VK.market.state.sets) || {}; }
  function data(n) { return sets()[n] && sets()[n].data; }
  function src(n) { return sets()[n] ? sets()[n].source : "—"; }
  function sg(v, d) { return v === null || v === undefined || v !== v ? "—" : (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(d === undefined ? 2 : d); }
  function cls(v) { return v > 0 ? "up" : v < 0 ? "dw" : "mu"; }
  function comma(v, d) { return v === null || v === undefined ? "—" : (+v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function price(it) {
    if (it.price === null || it.price === undefined) return "—";
    if (it.code === "US10YT=RR") return it.price.toFixed(3) + "%";
    if (it.code === "BTC") return "$" + comma(it.price, 0);
    if (it.code === "FX_USDKRW") return comma(it.price, 1);
    return comma(it.price, 2);
  }
  function jo(v) { return v === null || v === undefined ? "—" : (Math.abs(v) >= 1e4 ? sg(v / 1e4, 2) + "조" : sg(v, 0) + "억"); }

  /* area+line chart over [[x, y], ...] */
  function chart(pts, up, h) {
    if (!pts || pts.length < 2) return '<svg class="gt-ch"></svg>';
    var W = 300, H = h || 46, ys = pts.map(function (p) { return +p[1]; });
    var lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys);
    if (hi - lo < 1e-12) { hi += 1; lo -= 1; }
    var X = function (i) { return (i * (W - 2) / (ys.length - 1) + 1).toFixed(1); };
    var Y = function (v) { return (H - 2 - (H - 5) * (v - lo) / (hi - lo)).toFixed(1); };
    var d = ys.map(function (v, i) { return (i ? "L" : "M") + X(i) + "," + Y(v); }).join("");
    return '<svg class="gt-ch" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none"><g class="' + (up ? "u" : "d") + '">' +
      '<path class="ar" d="' + d + "L" + X(ys.length - 1) + "," + H + "L1," + H + 'Z"/><path class="ln" d="' + d + '"/></g></svg>';
  }
  function mini(pts, up, w, h) {
    if (!pts || pts.length < 2) return "";
    var ys = pts.map(function (p) { return +p[1]; }), lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys);
    if (hi - lo < 1e-12) { hi += 1; lo -= 1; }
    var d = ys.map(function (y, i) { return (i ? "L" : "M") + (i * (w - 2) / (ys.length - 1) + 1).toFixed(1) + "," + (h - 1 - (h - 2) * (y - lo) / (hi - lo)).toFixed(1); }).join("");
    return '<svg viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none"><path d="' + d + '" fill="none" stroke="' + (up ? "rgba(49,192,140,.8)" : "rgba(239,90,97,.8)") + '" stroke-width="1.1" vector-effect="non-scaling-stroke"/></svg>';
  }

  /* ------------------------------------------------------------ tiles */
  function ustHistory() {
    var S = getSeries && getSeries();
    if (!S || !S.ust10) return [];
    var out = [];
    for (var i = Math.max(0, S.dates.length - 110); i < S.dates.length; i++) if (S.ust10[i] !== null) out.push([S.dates[i], S.ust10[i]]);
    return out;
  }
  function tile(it) {
    var up = (it.changeRate || 0) >= 0, daily = it.daily && it.daily.length >= 20 ? it.daily : null, lbl = "110D";
    if (!daily && it.code === "US10YT=RR") { daily = ustHistory(); lbl = "110D · FRED EOD"; }
    if (!daily) { daily = it.spark; lbl = it.code === "BTC" ? "24H · KRW" : "장중"; }
    var rng = "";
    if (it.high52w && it.low52w && it.price !== null && it.high52w > it.low52w) {
      var p = Math.max(0, Math.min(100, (it.price - it.low52w) / (it.high52w - it.low52w) * 100));
      rng = '<div class="gt-r" title="52주 ' + comma(it.low52w, 2) + " ~ " + comma(it.high52w, 2) + '"><i style="left:' + p.toFixed(1) + '%"></i></div>';
    }
    var chg = it.code === "US10YT=RR" ? (it.change !== null ? sg(it.change * 100, 1) + "bp" : "") : it.change !== null && it.change !== undefined ? sg(it.change, 2) : "";
    return '<div class="gt" data-code="' + esc(it.code) + '"><div class="gt-h"><span class="gt-l">' + esc(it.label) + '</span><span class="gt-st ' +
      (it.marketStatus === "OPEN" ? "open" : "") + '">' + esc(it.marketStatus || "") + "</span></div>" +
      '<div class="gt-v">' + price(it) + '</div><div class="gt-c ' + cls(it.changeRate) + '">' + sg(it.changeRate) + "%<small>" + chg + "</small></div>" +
      chart(daily, daily.length > 1 ? +daily[daily.length - 1][1] >= +daily[0][1] : up) + rng +
      '<div class="gt-f"><span>' + esc(lbl) + "</span><span>" + esc(String(it.tradedAt || "").replace("T", " ").slice(5, 16)) + "</span></div></div>";
  }
  function nowcastTile() {
    var n = VK.market && VK.market.nowcast(), st = getState && getState();
    var ok = n && st && st.nowcastable && Math.abs(n.bp) >= 0.1;
    var ktb = n ? 0.62 * n.bp : null;
    return '<div class="gt nc"><div class="gt-h"><span class="gt-l">LIVE NOWCAST → CHAIN</span><span class="gt-st">UST</span></div>' +
      '<div class="gt-v ' + (n ? cls(n.bp) : "") + '">' + (n ? sg(n.bp, 1) + "bp" : "—") + "</div>" +
      '<div class="row"><span>장중 미10년물</span><b>' + (n ? n.live.toFixed(3) + "%" : "—") + "</b></div>" +
      '<div class="row"><span>엔진 EOD (FRED)</span><b>' + (n ? n.eod.toFixed(3) + "%" : "—") + "</b></div>" +
      '<div class="row"><span>→ 국고3Y 전이 (β0.62)</span><b>' + (ktb === null ? "—" : sg(ktb, 1) + "bp") + "</b></div>" +
      '<button data-act="nowcast"' + (ok ? "" : " disabled") + ">체인에 전이 ▸</button></div>";
  }

  /* ------------------------------------------------------------ columns */
  function colUS() {
    var us = data("us_sectors"), wl = data("us_watchlist"), h = "";
    if (us) h += '<div class="gc-sec">SPDR 섹터 ETF</div><div class="gheat">' + us.items.slice().sort(function (a, b) { return b.changeRate - a.changeRate; }).map(function (x) {
      var a = Math.min(1, Math.abs(x.changeRate || 0) / 2.5);
      var bg = (x.changeRate || 0) >= 0 ? "rgba(49,192,140," + (0.1 + 0.45 * a).toFixed(2) + ")" : "rgba(239,90,97," + (0.1 + 0.45 * a).toFixed(2) + ")";
      return '<span style="background:' + bg + '" title="' + esc(x.symbol + " · " + x.name) + '"><b>' + esc(x.label) + " <small>" + esc(x.symbol) + "</small></b><em>" + sg(x.changeRate) + "%</em></span>";
    }).join("") + "</div>";
    if (wl) h += '<div class="gc-sec">워치리스트</div><div class="gwl">' + wl.items.map(function (x) {
      var up = (x.changeRate || 0) >= 0;
      return '<div title="' + esc(x.name) + '"><b>' + esc(x.symbol) + '</b><span class="' + cls(x.changeRate) + '">' + sg(x.changeRate) + "%</span><em><span>" + comma(x.price, 2) + "</span>" + mini(x.spark, up, 56, 11) + "</em></div>";
    }).join("") + "</div>";
    return col("미국 · 섹터 · 워치리스트", src("us_sectors"), h);
  }
  function flowRows(rows) {
    if (!rows || !rows.length) return "";
    var last = rows[rows.length - 1], w5 = rows.slice(-5), w20 = rows.slice(-20);
    var sum = function (a, k) { return a.reduce(function (s, r) { return s + (r[k] || 0); }, 0); };
    var items = [["개인", "individual"], ["외국인", "foreign"], ["기관", "institution"], ["연기금", "pension"]];
    var mx = Math.max.apply(null, items.map(function (x) { return Math.abs(sum(w20, x[1])); }).concat([1]));
    return '<div class="gc-sec">' + esc(last.date) + " 당일 · 20일 누적 (막대)</div>" + '<div class="gflow">' + items.map(function (x) {
      var s20 = sum(w20, x[1]), wv = Math.min(50, 50 * Math.abs(s20) / mx);
      return '<span class="nm">' + x[0] + '</span><span class="bar" title="5일 ' + jo(sum(w5, x[1])) + '"><i class="' + (s20 >= 0 ? "p" : "n") + '" style="width:' + wv.toFixed(1) + '%"></i></span>' +
        '<span class="v ' + cls(last[x[1]]) + '">' + jo(last[x[1]]) + "</span>";
    }).join("") + "</div>" + '<div class="gkv"><span>20일 누적 외국인 · 기관</span><b><span class="' + cls(sum(w20, "foreign")) + '">' + jo(sum(w20, "foreign")) + "</span> · <span class='" + cls(sum(w20, "institution")) + "'>" + jo(sum(w20, "institution")) + "</span></b></div>";
  }
  function colKR() {
    var fl = data("investor_flow"), lq = data("liquidity"), sc = data("sectors"), h = "";
    if (fl) {
      h += '<div class="gc-sec">코스피 수급</div>' + flowRows(fl.markets.KOSPI);
      h += '<div class="gc-sec">코스닥 수급</div>' + flowRows(fl.markets.KOSDAQ);
    }
    if (lq && lq.rows.length) {
      var rows = lq.rows, last = rows[rows.length - 1], prev = rows[Math.max(0, rows.length - 21)];
      var box = function (k, name) {
        var pts = rows.map(function (r) { return [r.date, r[k]]; }).filter(function (p) { return p[1] !== null; });
        var ch = last[k] !== null && prev[k] ? (last[k] / prev[k] - 1) * 100 : null;
        return "<div><small>" + name + " · " + esc(last.date.slice(5)) + "</small><b>" + (last[k] === null ? "—" : comma(last[k] / 1e4, 1) + "조") + "</b><small class='" + cls(ch) + "'>20일 " + sg(ch, 1) + "%</small>" + mini(pts, (ch || 0) >= 0, 120, 24) + "</div>";
      };
      h += '<div class="gc-sec">증시 자금 (1년)</div><div class="gliq">' + box("customer_deposit", "고객예탁금") + box("credit_loan", "신용잔고") + "</div>";
    }
    if (sc) {
      var s = sc.items.slice().sort(function (a, b) { return b.changeRate - a.changeRate; });
      var row = function (x) { return '<div class="gkv"><span>' + esc(x.name) + '</span><b class="' + cls(x.changeRate) + '">' + sg(x.changeRate) + "%</b></div>"; };
      h += '<div class="gc-sec">업종 상위 · 하위</div>' + s.slice(0, 4).map(row).join("") + s.slice(-3).reverse().map(row).join("");
    }
    return col("한국 · 수급 · 증시자금", src("investor_flow") + " · " + src("sectors"), h);
  }
  function colRates() {
    var pr = data("policy_rates"), cal = data("calendar"), tools = getTools && getTools(), h = "";
    if (tools && tools.items) {
      h += '<div class="gc-sec">RESEARCH STACK · 담당 모델 (VALKYRIE 판단에 반영)</div><div class="gtools">' + tools.items.map(function (t) {
        var m = t.match === "AGREE" ? "ok" : t.match === "CONFLICT" ? "cf" : "na";
        return '<a class="gtool" href="' + esc(t.url) + '" target="_blank" rel="noopener noreferrer" title="' + esc(t.detail || "") + '"><div class="o">' + esc(t.owner + " · " + t.domain) + '</div><div class="v">' + esc(t.verdict) +
          '</div><div class="s">' + esc(t.headline || "") + '</div><div class="m ' + m + '">' + esc(t.matchText || "") + "</div></a>";
      }).join("") + "</div>";
    }
    if (pr) {
      var pick = pr.items.filter(function (x) { return /FOMC|KROCRT|ECB|BOJ|BOE|PBOC|RBA|BOC/.test(x.code); }).slice(0, 7);
      h += '<div class="gc-sec">정책금리</div>' + pick.map(function (x) {
        return '<div class="gkv"><span>' + esc(x.name) + "</span><b>" + (x.rate === null ? "—" : x.rate.toFixed(2) + "%") + (x.lastChange ? " <span class='" + cls(-x.lastChange) + "'>" + sg(x.lastChange, 2) + "</span>" : "") +
          " <span class='mu'>" + esc(String(x.decidedAt || "").slice(2, 10)) + "</span></b></div>";
      }).join("");
    }
    if (cal) {
      var today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
      var ev = cal.items.filter(function (x) { return x.date >= today; }).slice(0, 9);
      h += '<div class="gc-sec">이번 주 캘린더</div>' + ev.map(function (x) {
        var v = x.info && (x.info["발표"] || x.info["예상"] || x.info["예상 EPS"]);
        if (v === "-" || v === "—") v = null;
        return '<div class="gkv"><span>' + esc(x.date.slice(5)) + " " + esc({ KOR: "KR", USA: "US" }[x.nation] || x.nation || "") + " · " + esc(x.title) + "</span><b class='mu'>" + esc((x.subtitle || "").split(" ")[0]) + (v ? " · " + esc(v) : "") + "</b></div>";
      }).join("");
    }
    return col("정책 · 캘린더 · 팀 모델", src("policy_rates"), h);
  }
  function tstr(s) { var c = String(s || "").match(/^\d{8}(\d{2})(\d{2})/); return c ? c[1] + ":" + c[2] : ""; }
  function colNews() {
    var nw = data("news"), ww = data("world_news"), br = data("briefing"), h = "";
    if (br && br.items.length) {
      var T = { RATE_UP_TOP: "상승률 1위", RATE_DOWN_TOP: "하락률 1위", TRADING_AMOUNT_TOP: "거래대금 1위", TRADING_VOLUME_TOP: "거래량 1위" };
      h += '<div class="gc-sec">브리핑</div>' + br.items.filter(function (x) { return T[x.type]; }).map(function (x) {
        return '<div class="gkv"><span>' + esc((x.nation === "USA" ? "US " : "") + (T[x.type] || x.type) + " · " + x.name) + '</span><b class="' + cls(x.changeRate) + '">' + sg(x.changeRate) + "%</b></div>";
      }).join("");
    }
    if (nw) h += '<div class="gc-sec">국내 뉴스</div><div class="gnews">' + nw.items.slice(0, 8).map(function (x) {
      return '<a href="' + esc(x.url) + '" target="_blank" rel="noopener noreferrer"><em>' + tstr(x.publishedAt) + "</em>" + esc(x.title) + "</a>";
    }).join("") + "</div>";
    if (ww) h += '<div class="gc-sec">WORLD · 로이터</div><div class="gnews">' + ww.items.slice(0, 6).map(function (x) {
      return "<div><em>" + tstr(x.publishedAt) + "</em>" + esc(x.title) + "</div>";
    }).join("") + "</div>";
    return col("브리핑 · 뉴스", src("news"), h, "news");
  }
  function col(t, o, body, extra) {
    return '<div class="gc' + (extra ? " " + extra : "") + '"><div class="gc-h"><span class="gc-t">' + esc(t) + '</span><span class="gc-o">' + esc(o) + '</span></div><div class="gc-sc">' + (body || '<div class="note">대기 중</div>') + "</div></div>";
  }

  /* ------------------------------------------------------------ render */
  function header() {
    var st = getState && getState(), sg3 = st && st.signals;
    var m = sets().market_board;
    return '<div class="gb-h"><span class="gb-t">GLOBAL <span>MARKET</span> BOARD</span><span class="gb-s">NAVER 증권 · ' + esc(m ? m.source : "—") + (m && m.ageSec !== undefined ? " · " + m.ageSec + "s" : "") + "</span>" +
      '<span class="grow"></span>' + (sg3 ? '<span class="gb-vk">VALKYRIE <b>' + esc(sg3.macro.call) + "</b> · <b>" + esc(sg3.rates.call) + "</b> · <b>" + esc(sg3.equity.call) + "</b></span>" : "") +
      '<button class="gb-x" data-act="close" title="닫기 (Esc · G)">✕ CLOSE</button></div>';
  }
  function render() {
    if (!open || !el) return;
    var b = data("market_board");
    var tiles = b ? b.items.map(tile).join("") + nowcastTile() : '<div class="note">시장 데이터 대기 중…</div>';
    var scroll = [].map.call(el.querySelectorAll(".gc-sc"), function (x) { return x.scrollTop; });
    el.innerHTML = header() + '<div class="gb-tiles">' + tiles + '</div><div class="gb-b">' + colUS() + colKR() + colRates() + colNews() + "</div>";
    [].forEach.call(el.querySelectorAll(".gc-sc"), function (x, i) { x.scrollTop = scroll[i] || 0; });
    if (b) b.items.forEach(function (it) {
      var prev = lastPrice[it.code];
      if (prev !== undefined && it.price !== null && prev !== it.price) {
        var t = el.querySelector('.gt[data-code="' + it.code + '"]');
        if (t) t.classList.add(it.price > prev ? "fu" : "fd");
      }
      lastPrice[it.code] = it.price;
    });
  }

  function toggle(on) {
    open = on === undefined ? !open : on;
    el.classList.toggle("on", open);
    if (open) render();
  }

  function init(opts) {
    getState = opts.getState; getSeries = opts.getSeries; onNowcast = opts.onNowcast; getTools = opts.getTools;
    el = document.createElement("section");
    el.className = "gb"; el.id = "gboard"; el.setAttribute("aria-label", "글로벌 마켓 보드");
    document.body.appendChild(el);
    el.addEventListener("click", function (e) {
      var a = e.target.closest("[data-act]");
      if (!a) return;
      if (a.dataset.act === "close") toggle(false);
      else if (a.dataset.act === "nowcast") { var n = VK.market.nowcast(); if (n && onNowcast) { toggle(false); onNowcast(n); } }
    });
    el.addEventListener("animationend", function (e) { e.target.classList.remove("fu", "fd"); });
  }

  return { init: init, toggle: toggle, render: render, get open() { return open; } };
})();
