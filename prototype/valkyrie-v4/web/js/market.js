/* LIVE market layer (NAVER via the local server): top market strip + "LIVE 마켓" workspace pane + UST nowcast.
   Every tile says where its number came from: LIVE (fetched this session), SNAPSHOT (file on disk), STALE (last fetch failed). */
"use strict";
var VK = window.VK || {};
window.VK = VK;

VK.market = (function () {
  var esc = function (s) { return VK.views.esc(s); };
  var L = { sets: {}, status: {}, ver: {}, offline: false, lastPoll: 0 };
  var shown = {};          // tile code -> last price (flash on change)
  var focusCode = null;    // asset focused from a strip tile (LIVE 마켓 shows its chart + news)
  var NODE_OF = { "US10YT=RR": "rat_ust", "KOSPI": "eq_kospi", "KOSDAQ": "eq_val", "FX_USDKRW": "mac_fed", ".INX": "eq_kospi", ".IXIC": "eq_val" };
  var onNowcast = null, getState = null, onOpen = null, onUpdate = null;
  var POLL_MS = 10000;

  function data(n) { return L.sets[n] && L.sets[n].data; }
  function src(n) { return L.sets[n] ? L.sets[n].source : null; }

  /* ------------------------------------------------------------ formatting */
  function sgp(v, d) { return v === null || v === undefined ? "—" : (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(d === undefined ? 2 : d); }
  function cls(v) { return v > 0 ? "up" : v < 0 ? "dw" : "mu"; }
  function comma(v, d) { return v === null || v === undefined ? "—" : (+v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function tilePrice(it) {
    if (it.price === null || it.price === undefined) return "—";
    if (it.code === "US10YT=RR") return it.price.toFixed(3) + "%";
    if (it.code === "BTC") return "$" + comma(it.price, 0);
    if (/T=RR$/.test(it.code)) return it.price.toFixed(3) + "%";
    if (it.code === "FX_USDKRW") return comma(it.price, 1);
    if (/^FX_/.test(it.code)) return comma(it.price, 2);
    return comma(it.price, it.price < 10 ? 3 : 2);
  }
  function ago(sec) { return sec < 60 ? sec + "s" : sec < 3600 ? Math.round(sec / 60) + "m" : Math.round(sec / 3600) + "h"; }
  function tstr(s) {   // 20260930092510 or ISO 2026-09-30T09:25:10 -> 09:25
    if (!s) return "";
    var c = String(s).match(/^\d{8}(\d{2})(\d{2})/);          // compact NAVER stamp
    var m = String(s).match(/T(\d{2}):(\d{2})/);              // ISO (the year must not be read as HH:MM)
    return c ? c[1] + ":" + c[2] : m ? m[1] + ":" + m[2] : "";
  }

  function spark(points, w, h, up) {
    if (!points || points.length < 2) return "";
    var ys = points.map(function (p) { return +p[1]; }), lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys);
    if (hi - lo < 1e-12) { hi += 1; lo -= 1; }
    var d = ys.map(function (y, i) { return (i ? "L" : "M") + (i * (w - 2) / (ys.length - 1) + 1).toFixed(1) + "," + (h - 1 - (h - 2) * (y - lo) / (hi - lo)).toFixed(1); }).join("");
    return '<svg class="msp" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none"><path d="' + d + '" class="' + (up ? "u" : "d") + '"/></svg>';
  }

  /* ------------------------------------------------------------ nowcast (live UST vs engine EOD) */
  function nowcast() {
    var b = data("market_board"), st = getState && getState();
    if (!b || !st || !st.raw) return null;
    var u = b.items.filter(function (x) { return x.code === "US10YT=RR"; })[0];
    if (!u || u.price === null) return null;
    var bp = Math.round((u.price - st.raw.ust10) * 1000) / 10;
    return { bp: bp, live: u.price, eod: st.raw.ust10, at: u.tradedAt, source: src("market_board") };
  }

  /* ------------------------------------------------------------ strip */
  /* ------------------------------------------------------------ ticker (asset-class groups, continuous scroll) */
  var GROUPS = [["한국", ["KOSPI", "KOSDAQ", "KR3YT=RR", "KR10YT=RR"]], ["미국", [".INX", ".IXIC", ".DJI", "RTYcv1", ".VIX"]],
                ["금리", ["US2YT=RR", "US10YT=RR", "US30YT=RR"]], ["아시아", [".N225", ".HSI", ".SSEC", ".TWII"]], ["유럽", [".GDAXI", ".FTSE", ".STOXX50E"]],
                ["환율", ["FX_USDKRW", "FX_JPYKRW", "FX_EURKRW", "FX_CNYKRW", ".DXY"]], ["원자재", ["CLcv1", "GCcv1", "SIcv1", "HGcv1", "NGcv1"]], ["크립토", ["BTC"]]];
  var builtSig = "";
  function allItems() {
    var map = {}, b = data("market_board"), x = data("market_extra");
    ((b && b.items) || []).concat((x && x.items) || []).forEach(function (it) { if (it && it.code) map[it.code] = it; });
    return map;
  }
  function tileHTML(it) {
    var up = (it.changeRate || 0) >= 0;
    return '<div class="mt" data-code="' + esc(it.code) + '" title="' + esc(tileTip(it)) + '">' +
      '<div class="mt-h"><span class="mt-l">' + esc(it.label) + "</span>" + (it.marketStatus === "CLOSE" ? '<span class="mt-x">CLOSE</span>' : '<i class="mt-o"></i>') + "</div>" +
      '<div class="mt-b"><span class="mt-v num">' + tilePrice(it) + '</span><span class="mt-c num ' + cls(it.changeRate) + '">' + sgp(it.changeRate) + "%</span></div>" +
      spark(it.spark, 70, 14, up) + "</div>";
  }
  function renderStrip() {
    var track = document.getElementById("mkTrack"), items = allItems();
    if (!track) return;
    var codes = [];
    GROUPS.forEach(function (g) { g[1].forEach(function (c) { if (items[c]) codes.push(c); }); });
    if (!codes.length) { track.innerHTML = '<span class="ml2" style="padding:0 12px">시장 데이터 대기 중…</span>'; renderStatus(); return; }
    var sig = codes.join(",");
    if (sig !== builtSig) {   // (re)build the track once per instrument set; values are patched in place afterwards
      var seq = GROUPS.map(function (g) {
        var tiles = g[1].filter(function (c) { return items[c]; }).map(function (c) { return tileHTML(items[c]); }).join("");
        return tiles ? '<span class="tg">' + esc(g[0]) + "</span>" + tiles : "";
      }).join("");
      track.innerHTML = seq + seq;                       // duplicated for a seamless loop
      track.style.setProperty("--tk-dur", Math.round(codes.length * 3.6) + "s");
      builtSig = sig;
      codes.forEach(function (c) { shown[c] = items[c].price; });
      renderStatus();
      return;
    }
    codes.forEach(function (c) {
      var it = items[c], nodes = track.querySelectorAll('.mt[data-code="' + c.replace(/"/g, '\\"') + '"]');
      [].forEach.call(nodes, function (el) {
        var v = el.querySelector(".mt-v"), ch = el.querySelector(".mt-c"), st = el.querySelector(".mt-h");
        if (v) v.textContent = tilePrice(it);
        if (ch) { ch.textContent = sgp(it.changeRate) + "%"; ch.className = "mt-c num " + cls(it.changeRate); }
        if (st) st.innerHTML = '<span class="mt-l">' + esc(it.label) + "</span>" + (it.marketStatus === "CLOSE" ? '<span class="mt-x">CLOSE</span>' : '<i class="mt-o"></i>');
        var sp = el.querySelector("svg.msp"), fresh = spark(it.spark, 70, 14, (it.changeRate || 0) >= 0);
        if (fresh) { if (sp) sp.outerHTML = fresh; else el.insertAdjacentHTML("beforeend", fresh); }
        el.title = tileTip(it);
        var prev = shown[c];
        if (prev !== undefined && it.price !== null && prev !== it.price) el.classList.add(it.price > prev ? "fu" : "fd");
      });
      shown[c] = it.price;
    });
    renderStatus();
  }  function tileTip(it) {
    var s = it.label + (it.name ? " · " + it.name : "") + "\n현재 " + tilePrice(it) + " (" + sgp(it.change, it.code === "US10YT=RR" ? 3 : 2) + ", " + sgp(it.changeRate) + "%)";
    if (it.high52w) s += "\n52주 " + comma(it.low52w, 2) + " ~ " + comma(it.high52w, 2);
    if (it.code === "BTC" && it.priceKrw) s += "\n₩" + comma(it.priceKrw, 0) + " (업비트, USD = KRW ÷ 원/달러)";
    s += "\n" + (it.marketStatus || "") + " · " + (it.tradedAt || "") + "\n실시간 시세 · " + (src("market_board") || "");
    if (it.code === "US10YT=RR") { var n = nowcast(); if (n) s += "\n엔진 EOD(FRED) " + n.eod.toFixed(3) + "% 대비 " + sgp(n.bp, 1) + "bp"; }
    return s;
  }
  function renderStatus() {
    var el = document.getElementById("mkSt"), nb = document.getElementById("mkNow");
    if (!el) return;
    var st = L.sets.market_board, stat = L.status.market_board || {};
    var source = st ? st.source : "—";
    var age = stat.ageSec !== undefined ? stat.ageSec : st && st.ageSec;
    var dot = source === "LIVE" ? "gr" : source === "STALE" ? "rd" : "am";
    el.className = "mk-st " + dot;
    el.innerHTML = '<i></i><b>MARKET ' + esc(L.offline ? "SNAPSHOT" : source) + "</b><span class='num'>" +
      (L.offline ? esc(tstr(st && st.fetchedAt)) : age !== undefined ? ago(age) + " 전" : "") + "</span>";
    el.title = Object.keys(L.status).map(function (k) {
      var s = L.status[k];
      return k + ": " + s.source + " · " + ago(s.ageSec) + " 전 · " + s.every + "s 주기" + (s.error ? " · 오류 " + s.error : "");
    }).join("\n") || (L.offline ? VK.api.offlineName + ": 마지막 수집 파일" + (VK.api.mode === "web" ? " (GitHub Actions 주기 갱신 · 실시간 폴링은 로컬 서버)" : "") : "");
    if (nb) {
      var n = nowcast(), st2 = getState && getState();
      var latest = st2 && st2.nowcastable;
      nb.disabled = !n || !latest || Math.abs(n.bp) < 0.1;
      nb.innerHTML = "NOWCAST <b class='num " + (n ? cls(n.bp) : "") + "'>UST " + (n ? sgp(n.bp, 1) + "bp" : "—") + "</b>";
      nb.title = n ? "장중 미10년물 " + n.live.toFixed(3) + "% − 엔진 EOD(FRED) " + n.eod.toFixed(3) + "% = " + sgp(n.bp, 1) +
        "bp\n클릭: 이 차이를 UST 충격으로 체인에 전이 (LIVE NOWCAST)" + (latest ? "" : "\n최신 날짜에서만 사용 가능") : "";
    }
  }

  /* ------------------------------------------------------------ pane */
  function card(title, sub, body, cl) {
    return '<div class="cd' + (cl ? " " + cl : "") + '"><div class="cdh"><span class="cdt">' + esc(title) + '</span><span class="cdo">' + sub + "</span></div>" + body + "</div>";
  }
  function srcChip(n) {
    var s = src(n) || "—";
    return '<span class="chip ' + (s === "LIVE" ? "NORMAL" : s === "STALE" ? "SHOCK" : "DEMO") + '">' + esc(s) + "</span>";
  }
  function focusBlock() {
    var it = allItems()[focusCode];
    if (!it) return "";
    var daily = it.daily && it.daily.length >= 20 ? it.daily : it.spark, lbl = it.daily && it.daily.length >= 20 ? "110일 일봉" : (it.code === "BTC" ? "24시간 (KRW)" : "장중");
    var up = daily && daily.length > 1 ? +daily[daily.length - 1][1] >= +daily[0][1] : (it.changeRate || 0) >= 0;
    var ch = daily && daily.length > 2 ? VK.viz.chart(daily.map(function (p) { return String(p[0]).slice(0, 10); }), daily.map(function (p) { return +p[1]; }),
      { h: 140, color: up ? "#31C08C" : "#EF5A61", fmt: function (v) { return Math.abs(v) >= 1000 ? Math.round(v).toLocaleString() : v.toFixed(2); } }) : "";
    var rng = it.high52w && it.low52w ? kvl("52주 범위", comma(it.low52w, 2) + " ~ " + comma(it.high52w, 2)) : "";
    var node = NODE_OF[it.code];
    var left = '<div class="fa-h"><b>' + esc(it.label) + "</b> <span class=\"mu\">" + esc(it.name || "") + "</span></div>" +
      '<div class="fa-v"><span class="num">' + tilePrice(it) + '</span><em class="num ' + cls(it.changeRate) + '">' + sgp(it.changeRate) + "%</em></div>" + ch +
      '<div class="legend-row"><span><i style="background:' + (up ? "#31C08C" : "#EF5A61") + '"></i>' + lbl + "</span></div>" + rng +
      kvl("상태", esc(it.marketStatus || "") + " · " + esc(String(it.tradedAt || "").replace("T", " ").slice(0, 16))) +
      (node ? '<div class="evs" style="margin-top:6px"><span data-sel="' + node + '">VALKYRIE 노드 인사이트 → ' + esc(node) + "</span></div>" : "");
    var right = '<div data-news="' + esc(it.code) + '">' + (VK.insight ? VK.insight.newsBox(it.code) : "") + "</div>";
    return '<div class="grid fa">' + card(it.label + " · LIVE", srcChip("market_board") + ' <span class="cp" data-act="unfocus">✕ 전체 보기</span>', left, "hl") +
      card(it.label + " 관련 뉴스 · LIVE", "Google 뉴스 (다음·연합 등)", right) + "</div>";
  }
  function kvl(k, v) { return '<div class="kv"><span>' + esc(k) + "</span><b class=\"num\">" + v + "</b></div>"; }

  function pane() {
    var h = (focusCode ? focusBlock() : "") + '<div class="grid mkp">';
    // 1. US sectors + watchlist
    var us = data("us_sectors"), wl = data("us_watchlist");
    var c1 = "";
    if (us) {
      c1 += '<div class="heat">' + us.items.slice().sort(function (a, b) { return b.changeRate - a.changeRate; }).map(function (x) {
        var a = Math.min(1, Math.abs(x.changeRate || 0) / 2.5);
        var bg = (x.changeRate || 0) >= 0 ? "rgba(49,192,140," + (0.08 + 0.4 * a).toFixed(2) + ")" : "rgba(239,90,97," + (0.08 + 0.4 * a).toFixed(2) + ")";
        return '<span style="background:' + bg + '" title="' + esc(x.symbol + " · " + x.name) + '"><b>' + esc(x.label) + "</b><em class='num'>" + sgp(x.changeRate) + "%</em></span>";
      }).join("") + "</div>";
    }
    if (wl) {
      c1 += '<table class="tb"><thead><tr><th>티커</th><th class="n">가격</th><th class="n">등락</th><th></th></tr></thead><tbody>' +
        wl.items.map(function (x) {
          return "<tr><td title='" + esc(x.name) + "'><b>" + esc(x.symbol) + '</b></td><td class="n">' + comma(x.price, 2) + '</td><td class="n ' + cls(x.changeRate) + '">' + sgp(x.changeRate) + "%</td><td>" + spark(x.spark, 54, 12, (x.changeRate || 0) >= 0) + "</td></tr>";
        }).join("") + "</tbody></table>";
    }
    h += card("미국 섹터 · 워치리스트", srcChip("us_sectors"), c1 || '<div class="note">대기 중</div>');
    // 2. KR sectors + briefing + policy rates
    var sc = data("sectors"), br = data("briefing"), pr = data("policy_rates");
    var c2 = "";
    if (sc) {
      var s = sc.items.slice().sort(function (a, b) { return b.changeRate - a.changeRate; });
      var row = function (x) { return "<tr><td>" + esc(x.name) + '</td><td class="n ' + cls(x.changeRate) + '">' + sgp(x.changeRate) + '%</td><td class="n mu">' + (x.rise || 0) + "↑ " + (x.fall || 0) + "↓</td></tr>"; };
      c2 += '<div class="sec-t">업종 상위 5</div><table class="tb"><tbody>' + s.slice(0, 5).map(row).join("") + "</tbody></table>" +
        '<div class="sec-t" style="margin-top:6px">업종 하위 5</div><table class="tb"><tbody>' + s.slice(-5).reverse().map(row).join("") + "</tbody></table>";
    }
    if (br && br.items.length) {
      var TYPE = { RATE_UP_TOP: "상승률 1위", RATE_DOWN_TOP: "하락률 1위", TRADING_AMOUNT_TOP: "거래대금 1위", TRADING_VOLUME_TOP: "거래량 1위" };
      c2 += '<div class="sec-t" style="margin-top:6px">브리핑</div>' + br.items.filter(function (x) { return TYPE[x.type]; }).map(function (x) {
        return '<div class="kv"><span>' + esc((x.nation === "USA" ? "US " : "") + (TYPE[x.type] || x.type)) + " · " + esc(x.name) + '</span><b class="' + cls(x.changeRate) + '">' + sgp(x.changeRate) + "%</b></div>";
      }).join("");
    }
    if (pr) {
      var pick = pr.items.filter(function (x) { return /FOMC|KROCRT|ECB|BOJ|BOE/.test(x.code); }).slice(0, 5);
      c2 += '<div class="sec-t" style="margin-top:6px">정책금리</div>' + pick.map(function (x) {
        return '<div class="kv"><span>' + esc(x.name) + '</span><b class="num">' + (x.rate === null ? "—" : x.rate.toFixed(2) + "%") + (x.decidedAt ? " <span class='mu'>" + esc(String(x.decidedAt).slice(0, 10)) + "</span>" : "") + "</b></div>";
      }).join("");
    }
    h += card("국내 업종 · 브리핑 · 정책금리", srcChip("sectors"), c2 || '<div class="note">대기 중</div>');
    // 3. news
    var nw = data("news"), ww = data("world_news"), c3 = "";
    if (nw) c3 += nw.items.slice(0, 9).map(function (x) {
      return '<a class="nws" href="' + esc(x.url) + '" target="_blank" rel="noopener noreferrer"><span class="num mu">' + esc(tstr(x.publishedAt)) + "</span> " + esc(x.title) + " <em>" + esc(x.press) + "</em></a>";
    }).join("");
    if (ww) c3 += '<div class="sec-t" style="margin-top:6px">WORLD · 로이터</div>' + ww.items.slice(0, 6).map(function (x) {
      return '<div class="nws"><span class="num mu">' + esc(tstr(x.publishedAt)) + "</span> " + esc(x.title) + "</div>";
    }).join("");
    h += card("뉴스", srcChip("news"), c3 || '<div class="note">대기 중</div>');
    // 4. calendar + IPO pipeline (real)
    var cal = data("calendar"), ipo = data("ipo_pipeline"), c4 = "";
    if (cal) {
      var today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
      var ev = cal.items.filter(function (x) { return x.category === "economicIndicators" && x.date >= today; }).slice(0, 7);
      c4 += '<div class="sec-t">경제 캘린더</div>' + (ev.length ? ev.map(function (x) {
        var val = x.info && (x.info["발표"] || x.info["예상"]);
        return '<div class="kv"><span>' + esc(x.date.slice(5)) + " " + esc(x.nation === "KOR" ? "KR" : x.nation === "USA" ? "US" : x.nation) + " · " + esc(x.title) +
          '</span><b class="num mu">' + esc((x.subtitle || "").split(" ")[0]) + (val ? " · " + esc(val) : "") + "</b></div>";
      }).join("") : '<div class="note">예정 지표 없음</div>');
    }
    if (ipo) {
      var STAGES = [["demandForecastingList", "수요예측"], ["forecastingCompleteList", "수요예측 완료"], ["subscriptionList", "청약"], ["listingList", "상장"]];
      c4 += '<div class="sec-t" style="margin-top:6px">IPO 일정 · 실데이터</div>';
      STAGES.forEach(function (sg) {
        (ipo[sg[0]] || []).slice(0, 4).forEach(function (x) {
          var price = x.fixPubPrice ? comma(+x.fixPubPrice, 0) + "원 확정" : x.hopePubStart ? comma(+x.hopePubStart, 0) + "~" + comma(+x.hopePubEnd, 0) : "";
          var date = sg[0] === "listingList" ? x.lcalDate : sg[0] === "demandForecastingList" ? x.dfEndDate : x.poStartDate;
          c4 += '<div class="kv"><span><span class="chip DRAFT">' + esc(sg[1]) + "</span> " + esc(x.compName) + " <span class='mu'>" + esc(x.marketType || "") + '</span></span><b class="num">' +
            esc(date ? date.slice(5) : "") + (x.fnlCmptRatio ? " · " + comma(+x.fnlCmptRatio, 0) + ":1" : price ? " · " + esc(price) : "") + "</b></div>";
        });
      });
      c4 += '<div class="note">엔진 IPO DEMAND = <b>38커뮤니케이션 수요예측 기관 경쟁률</b> 최근 10건 중앙값 (REAL)</div>';
    }
    h += card("캘린더 · IPO 파이프라인", srcChip("ipo_pipeline"), c4 || '<div class="note">대기 중</div>');
    var n = nowcast();
    return h + "</div>" + (n ? '<div class="note">LIVE NOWCAST: 장중 미10년물 ' + n.live.toFixed(3) + "% vs 엔진 EOD " + n.eod.toFixed(3) + "% → <b>" + sgp(n.bp, 1) + "bp</b> · 상단 NOWCAST 버튼으로 체인에 전이</div>" : "");
  }

  /* ------------------------------------------------------------ polling */
  function poll() {
    if (document.hidden) return;
    L.lastPoll = Date.now();
    VK.api.live(L.ver).then(function (r) {
      L.offline = !!r.offline;
      Object.keys(r.sets || {}).forEach(function (k) { L.sets[k] = r.sets[k]; L.ver[k] = r.sets[k].ver; });
      if (r.status && Object.keys(r.status).length) L.status = r.status;
      renderStrip();
      if (onUpdate && Object.keys(r.sets || {}).length) onUpdate(Object.keys(r.sets));
    }).catch(function () { renderStatus(); });
  }

  function init(opts) {
    getState = opts.getState; onNowcast = opts.onNowcast; onOpen = opts.onOpen; onUpdate = opts.onUpdate;
    var tiles = document.getElementById("mkTiles");
    tiles.addEventListener("click", function (e) {
      var t = e.target.closest(".mt");
      if (onOpen) onOpen(t ? t.dataset.code : null);
    });
    tiles.addEventListener("animationend", function (e) { e.target.classList.remove("fu", "fd"); });
    document.getElementById("mkNow").addEventListener("click", function () {
      var n = nowcast();
      if (n && onNowcast) onNowcast(n);
    });
    poll();
    setInterval(poll, POLL_MS);
    document.addEventListener("visibilitychange", function () { if (!document.hidden && Date.now() - L.lastPoll > POLL_MS) poll(); });
  }

  return { init: init, pane: pane, refreshStatus: renderStatus, nowcast: nowcast, get state() { return L; },
           focus: function (code) { focusCode = code || null; }, get focused() { return focusCode; } };
})();
