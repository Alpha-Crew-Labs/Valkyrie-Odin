/* Inspector + module panes. Pure renderers: (context) -> HTML. Every number shown comes from the engine state. */
"use strict";
var VK = window.VK || {};
window.VK = VK;

VK.views = (function () {
  var F = VK.fmt;
  function esc(s) {
    return String(s === null || s === undefined ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function kv(k, v) { return '<div class="kv"><span>' + esc(k) + "</span><b class='num'>" + v + "</b></div>"; }
  function chip(cls, t) { return '<span class="chip ' + esc(cls) + '">' + esc(t || cls) + "</span>"; }
  function f2(v, d) { return v === null || v === undefined ? "—" : (+v).toFixed(d === undefined ? 2 : d); }
  function sgn(v, d) { return v === null || v === undefined ? "—" : F.sg(v, d); }
  function cls(v) { return v > 0 ? "up" : v < 0 ? "dw" : "mu"; }
  var DOM = { mac: "MACRO", rat: "RATES", eq: "EQUITY" };
  var MATCH = { AGREE: ["ok", "✓ 반영"], PARTIAL: ["pt", "△ 참고"], CONFLICT: ["cf", "✕ 충돌"], NA: ["na", "· 대기"] };
  var KIND = { linear: "선형 전이", "function": "모델 재계산", evidence: "판단 입력" };
  function toolUrl(port) { var h = location.hostname && location.hostname !== "127.0.0.1" ? location.hostname : "localhost"; return "http://" + h + ":" + port + "/"; }
  /* node -> owner deep-dive (the apps ignore unknown query params today; ?tab= is the proposed contract) */
  var DEEP = {
    mac_gdp: [[8501, "taa", "확률 네트워크 & TAA"]], mac_uscpi: [[8501, "taylor", "테일러 준칙"]], mac_krcpi: [[8501, "taylor", "테일러 준칙"]],
    mac_fed: [[8501, "liquidity", "연준 유동성"]], mac_bok: [[8501, "taylor", "테일러 준칙"]], sig_macro: [[8501, "taa", "매크로 국면 · TAA"]],
    rat_ust: [[8501, "curve", "수익률 곡선"]], rat_ktb: [[8511, "overview", "채권 위기 진단"]], rat_curve: [[8511, "action", "커브 · 액션 플랜"]],
    rat_credit: [[8511, "action", "신용 판단 · 액션 플랜"]], sig_rates: [[8511, "action", "듀레이션 액션 플랜"], [8511, "timemachine", "타임머신"]],
    eq_val: [[8512, "overview", "코스닥 위험 점수", "kosdaq"]], eq_fin: [["https://ipo-market-report.vercel.app/", null, "IPO Market Report"]],
    eq_ipo: [["https://ipo-market-report.vercel.app/", null, "IPO Market Report"], [8512, "sector", "업종 · 종목", "kosdaq"]],
    eq_cb: [["https://cb-zero-finder.vercel.app/", null, "CB Zero Finder"]],
    sig_equity: [[8512, "action", "주식 액션 플랜", "kosdaq"], [8512, "flow", "수급 · 자금", "kosdaq"]]
  };
  function deepLinks(id, date) {
    var L = DEEP[id];
    if (!L) return "";
    return '<div class="sec"><div class="sec-t">DEEP DIVE · 담당 모델</div><div class="evs">' + L.map(function (x) {
      var url = typeof x[0] === "string" ? x[0] : toolUrl(x[0]) + "?tab=" + x[1] + (x[3] ? "&mkt=" + x[3] : "") + "&from=valkyrie&date=" + encodeURIComponent(date || "");
      return '<a class="dlink" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(x[2]) + (typeof x[0] === "number" ? " <b>:" + x[0] + "</b>" : "") + " ↗</a>";
    }).join("") + "</div></div>";
  }
  function toolFor(ctx, key) { var T = ctx.st && ctx.st.tools; return T && T.items ? T.items.filter(function (i) { return i.id === key; })[0] : null; }
  /* one-line cross-check under a VALKYRIE signal: owner's deep model verdict for the same date */
  function xcheck(ctx, key, full) {
    var t = toolFor(ctx, key);
    if (!t) return "";
    var m = MATCH[t.match] || MATCH.NA;
    var h = '<a class="xck ' + m[0] + '" href="' + toolUrl(t.port) + '" target="_blank" rel="noopener noreferrer" title="' + esc((t.basis || "") + (t.detail ? "\n" + t.detail : "")) + '">' +
      '<span class="xk">' + esc(t.owner + " · " + t.app) + " ↗</span><b>" + esc(t.verdict) + (t.score !== undefined && t.score !== null ? " " + (+t.score).toFixed(2) : "") + "</b>" +
      '<span class="xm">' + m[1] + "</span>" + (full ? '<span class="xh">' + esc(t.headline || "") + "</span>" : "") + '<span class="xt">' + esc(t.matchText || "") + "</span></a>";
    return h;
  }
  var SIGKEY = { sig_macro: "macro", sig_rates: "rates", sig_equity: "equity" };

  /* node -> time series in data/10_MODEL/daily (key, transform, label) */
  function seriesSpec(id, C) {
    var erp = C.ERP_KOSDAQ;
    return {
      mac_gdp: [["gdp_now", null, "GDP 나우캐스트"]],
      mac_uscpi: [["us_cpi", null, "US CPI YoY"]],
      mac_krcpi: [["kr_cpi_fcst", null, "익월 예측"], ["kr_cpi", null, "KR CPI 실제"]],
      mac_fed: [["fed", null, "Fed Funds"]],
      mac_bok: [["bok", null, "기준금리"], ["taylor", null, "테일러 적정"]],
      rat_ust: [["ust10", null, "UST 10Y"]],
      rat_ktb: [["ktb3", null, "국고 3Y"], ["ktb10", null, "국고 10Y"]],
      rat_curve: [["curve_bp", null, "3s10s"]],
      rat_credit: [["credit_bp", null, "AA- − 국고3Y"]],
      eq_fin: [["loss_share", null, "적자 비중 · 최근 40건"]],
      eq_val: [["ktb10", function (v) { return v + erp; }, "국고10Y + ERP " + erp + "%"]],
      eq_ipo: [["ipo_demand", null, "기관 경쟁률 · 최근 10건 중앙값"]]
    }[id] || null;
  }

  /* ------------------------------------------------------------ sparkline */
  function spark(ctx, id) {
    var S = ctx.series, spec = seriesSpec(id, ctx.meta.ontology.constants);
    if (!S || !spec || !S.dates || S.dates.length < 3) return "";
    var end = S.dates.length - 1;
    while (end > 0 && S.dates[end] > ctx.st.date) end--;
    var start = Math.max(0, end - 260);
    var W = 376, H = 84, pl = 4, pr = 40, pt = 8, pb = 14;
    var lines = [], lo = Infinity, hi = -Infinity;
    spec.forEach(function (sp, si) {
      var arr = S[sp[0]];
      if (!arr) return;
      var pts = [];
      for (var i = start; i <= end; i++) {
        var v = arr[i];
        if (v === null || v === undefined) continue;
        v = sp[1] ? sp[1](v) : v;
        pts.push([i, v]);
      }
      pts.forEach(function (p) { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); });
      lines.push(pts);
    });
    if (!lines.length || !lines[0].length) return "";
    var after = ctx.st.nodes[id] && ctx.st.nodes[id].value;
    var shocked = ctx.st.mode === "WHAT-IF" && F.moved(ctx.st.nodes[id]) && typeof after === "number";
    if (shocked) { lo = Math.min(lo, after); hi = Math.max(hi, after); }
    if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
    var pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
    var X = function (i) { return pl + (W - pl - pr) * (i - start) / Math.max(1, end - start); };
    var Y = function (v) { return pt + (H - pt - pb) * (1 - (v - lo) / (hi - lo)); };
    var svg = '<svg class="spark" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none">';
    svg += '<line class="ax" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + (H - pb) + '" y2="' + (H - pb) + '"/>';
    lines.forEach(function (pts, k) {
      var d = pts.map(function (p, j) { return (j ? "L" : "M") + X(p[0]).toFixed(1) + "," + Y(p[1]).toFixed(1); }).join("");
      svg += '<path class="ln" d="' + d + '"' + (k ? ' style="stroke:#5A6474;stroke-width:1.2;stroke-dasharray:3 3"' : "") + "/>";
    });
    var lp = lines[0][lines[0].length - 1];
    svg += '<line class="cross" x1="' + X(end) + '" x2="' + X(end) + '" y1="' + pt + '" y2="' + (H - pb) + '"/>';
    svg += '<circle class="dotm" r="3.2" cx="' + X(lp[0]) + '" cy="' + Y(lp[1]) + '"/>';
    if (shocked) {
      svg += '<line x1="' + X(end) + '" x2="' + (X(end) + 12) + '" y1="' + Y(lp[1]) + '" y2="' + Y(after) + '" stroke="#EFA83A" stroke-dasharray="2 2"/>';
      svg += '<circle r="3.2" cx="' + (X(end) + 12) + '" cy="' + Y(after) + '" fill="#EFA83A"/>';
    }
    svg += '<text x="' + (W - pr + 4) + '" y="' + (pt + 7) + '">' + f2(hi - pad) + "</text>";
    svg += '<text x="' + (W - pr + 4) + '" y="' + (H - pb) + '">' + f2(lo + pad) + "</text>";
    svg += '<text x="' + pl + '" y="' + (H - 2) + '">' + esc(S.dates[start]) + "</text>";
    svg += '<text x="' + (W - pr) + '" y="' + (H - 2) + '" text-anchor="end">' + esc(S.dates[end]) + "</text></svg>";
    var leg = '<div class="legend-row">' + spec.map(function (sp, k) {
      return "<span><i style='background:" + (k ? "#5A6474" : "var(--cy)") + "'></i>" + esc(sp[2]) + "</span>";
    }).join("") + (shocked ? "<span><i style='background:var(--am)'></i>WHAT-IF 값</span>" : "") + "</div>";
    return svg + leg;
  }

  function fx(lines) {
    return '<div class="fx">' + lines.map(function (l, i) {
      return i === lines.length - 1 ? '<span class="hl">' + esc(l) + "</span>" : esc(l);
    }).join("\n") + "</div>";
  }

  /* ------------------------------------------------------------ inspector */
  function inspector(ctx) {
    var st = ctx.st, O = ctx.meta.ontology, id = ctx.sel;
    if (!id) return overview(ctx);
    var n = O.nodes[id], sn = st.nodes[id];
    if (n.signal) return sigInspector(ctx, st.signals[SIGKEY[id]]);
    var d = F.delta(sn);
    var h = '<div class="ih"><div><div class="it">' + esc(n.label) + '</div><div class="io">' + esc(n.owner) + " · " + DOM[n.domain] +
      " · " + esc(n.sub || "") + "</div></div>" + chip(sn.status) + "</div>";
    h += '<div class="bigv num rv">' + F.val(n, sn.value) + (d ? "<small class='am'>" + d + "</small>" : "") + "</div>";
    if (st.mode === "WHAT-IF" && sn.base !== undefined && F.moved(sn)) h += '<div class="ml2">기준 ' + F.val(n, sn.base) + " → WHAT-IF " + F.val(n, sn.value) + "</div>";
    h += spark(ctx, id);
    h += '<div class="sec"><div class="sec-t">FORMULA · 결정론적 계산식</div>' + fx(sn.formula.lines) +
      (sn.formula.source ? '<div class="note">출처: <b>' + esc(sn.formula.source) + "</b></div>" : "") + "</div>";
    var inE = O.edges.filter(function (e) { return e.to === id; }), outE = O.edges.filter(function (e) { return e.from === id; });
    h += '<div class="sec"><div class="sec-t">RELATIONS · 사전 정의 전이계수</div>';
    inE.concat(outE).forEach(function (e) {
      var other = e.to === id ? e.from : e.to, arrow = e.to === id ? "← " : "→ ";
      h += '<div class="kv" title="' + esc((e.meaning || "") + (e.basis ? "\n근거: " + e.basis : "")) + '"><span class="evs" style="margin:0"><span data-sel="' + other + '">' + arrow + esc(O.nodes[other].label) +
        "</span></span><b class='num'>" + (e.sign < 0 ? "−" : "") + "β " + e.beta.toFixed(2) + " <span class='mu'>" + esc(KIND[e.kind] || e.kind) + "</span></b></div>" +
        (e.meaning ? '<div class="note" style="margin:0 0 4px 12px">' + esc(e.meaning) + "</div>" : "");
    });
    h += "</div>";
    h += vintage(ctx, id);
    h += deepLinks(id, st.date);
    return h;
  }

  function vintage(ctx, id) {
    var st = ctx.st, man = ctx.meta.manifest && ctx.meta.manifest.series || {};
    var srcKey = { mac_gdp: "kr_gdp_qoq", mac_uscpi: "us_cpi_index", mac_krcpi: "kr_cpi_index", mac_fed: "fed_funds", mac_bok: "bok_rate",
                   rat_ust: "ust10", rat_ktb: "ktb3", rat_curve: "ktb10", rat_credit: "corp_aa3", eq_val: "ktb10" }[id];
    var m = srcKey && man[srcKey];
    var h = '<div class="sec"><div class="sec-t">DATA VINTAGE · PIT</div>';
    h += kv("As-of", esc(st.date));
    if (m) h += kv("원천", esc(m.source) + " · " + esc(m.label)) + kv("최종 관측", esc(m.last) + (m.stale ? " (STALE)" : ""));
    else if (/^eq_(fin|cb|ipo)$/.test(id)) {
      var real = ctx.meta.model && ctx.meta.model.equity_sample === "REAL";
      h += kv("원천", real ? chip("REAL", "REAL") + " " + esc({ eq_fin: "38커뮤니케이션 수요예측 × NAVER 재무(직전 FY 순이익)", eq_ipo: "38커뮤니케이션 수요예측 결과 (기관 경쟁률)",
        eq_cb: "CB Zero Finder (DART 공시) × NAVER 시세·재무" }[id]) : chip("DEMO", "DEMO 가상 표본"));
    }
    if (/cpi/.test(id)) h += kv("반영 CPI 월", esc(id === "mac_uscpi" ? st.vintage.us_cpi_month : st.vintage.kr_cpi_month));
    h += '<div class="note">' + esc(st.vintage.rule) + "</div></div>";
    return h;
  }

  function sigInspector(ctx, s) {
    var h = '<div class="ih"><div><div class="it">SIGNAL · ' + esc(s.title) + '</div><div class="io">' + esc(s.owner) + " · 규칙 기반 판단</div></div>" + chip("SIGNAL", s.dir) + "</div>";
    h += '<div class="call rv">' + esc(s.call) + "</div>";
    if (s.action) h += '<div class="ml2" style="margin-top:3px">' + esc(s.action) + "</div>";
    h += '<div class="kv"><span>CONFIDENCE</span><b class="num">' + s.confidence + '</b></div><div class="bar"><i style="width:' + s.confidence + '%"></i></div>';
    h += '<ul class="rs">' + s.reasons.map(function (r, i) { return '<li data-n="' + (i + 1) + '">' + esc(r) + "</li>"; }).join("") + "</ul>";
    h += '<div class="sec"><div class="sec-t">RULE</div><div class="fx">' + esc(s.rule) + "</div></div>";
    h += '<div class="sec"><div class="sec-t">EVIDENCE NODES</div><div class="evs">' + s.evidence.map(function (e) {
      return '<span data-sel="' + e + '">' + esc(ctx.meta.ontology.nodes[e].label) + "</span>";
    }).join("") + "</div></div>";
    if (s.id === "sig_equity" && s.cb_demo) h += '<div class="note">CB 브리지: <b>' + esc(s.cb_demo) + "</b></div>";
    var tk = { sig_macro: "macro", sig_rates: "rates", sig_equity: "equity" }[s.id], tt = toolFor(ctx, tk);
    if (tt) h += '<div class="sec"><div class="sec-t">담당 모델 교차검증 · RESEARCH STACK</div>' + xcheck(ctx, tk, true) +
      '<div class="note">' + esc(tt.basis || "") + (tt.action ? " · " + esc(tt.action) : "") + "</div></div>";
    h += deepLinks(s.id, ctx.st.date);
    return h;
  }

  function overview(ctx) {
    var st = ctx.st, m = ctx.meta, sg = st.signals;
    var h = '<div class="ih"><div><div class="it">SYSTEM · 현재 결론</div><div class="io">' + esc(st.date) + " · " + esc(st.shock_label) + "</div></div>" +
      chip(st.offline ? "DEMO" : st.mode === "WHAT-IF" ? "SHOCK" : "NORMAL", st.offline ? "OFFLINE" : st.mode) + "</div>";
    h += '<div class="fx">' + esc(st.briefing.trigger) + "\n→ " + esc(st.briefing.transmission) + '\n→ <span class="hl">' + esc(st.briefing.decision) + "</span></div>";
    h += '<div class="sec"><div class="sec-t">TERMINAL SIGNALS</div>';
    [["sig_macro", "macro"], ["sig_rates", "rates"], ["sig_equity", "equity"]].forEach(function (p) {
      h += '<div class="kv"><span class="evs" style="margin:0"><span data-sel="' + p[0] + '">' + esc(sg[p[1]].title) + "</span></span><b>" + esc(sg[p[1]].call) +
        " <span class='mu'>· " + sg[p[1]].confidence + "</span></b></div>";
    });
    h += "</div>";
    h += '<div class="sec"><div class="sec-t">SHARED DURATION LOGIC</div><div class="fx">' + esc(st.shared_duration.text) + "</div></div>";
    if (st.tools && st.tools.items) h += '<div class="sec"><div class="sec-t">RESEARCH STACK · ' + esc(st.tools.summary) + "</div>" +
      ["macro", "rates", "equity"].map(function (k) { return xcheck(ctx, k); }).join("") + "</div>";
    if (st.conflict || (st.replay_conflicts || []).length) {
      h += '<div class="sec"><div class="sec-t" style="color:var(--am)">점검 · VALKYRIE 내부 정합성</div>';
      if (st.conflict) h += '<div class="banner">' + esc(st.conflict) + "</div>";
      (st.replay_conflicts || []).forEach(function (c) { h += '<div class="banner">REPLAY · ' + esc(c.text) + "</div>"; });
      h += "</div>";
    }
    var man = m.manifest && m.manifest.series ? Object.keys(m.manifest.series).length : 0;
    h += '<div class="sec"><div class="sec-t">DATA</div>' +
      kv("공개 시계열", man + "개 · ECOS · FRED") +
      kv("일별 PIT 프레임", esc(m.first) + " ~ " + esc(m.last) + " (" + m.rows + "일)") +
      kv("모델", esc(m.model && m.model.model_version)) +
      kv("KR CPI 예측 MAE", f2(m.model && m.model.cpi_mae) + "%p") + "</div>";
    h += '<div class="note">노드를 클릭하면 계산식·전이계수·데이터 빈티지가 표시됩니다. <b>관계는 사전 정의</b>이며 데이터는 노드 값만 바꿉니다.</div>';
    return h;
  }

  /* ------------------------------------------------------------ panes */
  function sigCard(ctx, key) {
    var s = ctx.st.signals[key], on = ctx.sel === s.id;
    return '<div class="cd' + (on ? " hl" : "") + '"><div class="cdh"><span class="cdt">' + esc(s.title) + '</span><span class="cdo">' + esc(s.owner) + " · " + s.dir + "</span></div>" +
      '<div class="call rv">' + esc(s.call) + "</div>" + (s.action ? '<div class="ml2" style="margin-top:3px">' + esc(s.action) + "</div>" : "") +
      '<div class="kv" style="margin-top:6px"><span>CONFIDENCE</span><b class="num">' + s.confidence + '</b></div><div class="bar"><i style="width:' + s.confidence + '%"></i></div>' +
      '<ul class="rs">' + s.reasons.map(function (r, i) { return '<li data-n="' + (i + 1) + '">' + esc(r) + "</li>"; }).join("") + "</ul>" +
      '<div class="evs">' + s.evidence.map(function (e) { return '<span data-sel="' + e + '">' + esc(ctx.meta.ontology.nodes[e].label) + "</span>"; }).join("") + "</div>" +
      xcheck(ctx, key) + '<div class="rule">' + esc(s.rule) + "</div></div>";
  }

  function paneSignals(ctx) {
    var st = ctx.st, h = VK.insight ? VK.insight.tempBlock(ctx) : "";
    if (st.conflict) h += '<div class="banner">' + esc(st.conflict) + "</div>";
    (st.replay_conflicts || []).forEach(function (c) { h += '<div class="banner">REPLAY · ' + esc(c.text) + "</div>"; });
    h += '<div class="grid" style="grid-template-columns:repeat(3,minmax(0,1fr));height:auto">' + sigCard(ctx, "macro") + sigCard(ctx, "rates") + sigCard(ctx, "equity") + "</div>";
    h += '<div class="note">공유 듀레이션: <b>' + esc(st.shared_duration.text) + "</b></div>";
    return h;
  }

  function paneImpact(ctx) {
    var st = ctx.st, O = ctx.meta.ontology;
    var rows = st.impact.map(function (r) {
      var dd = r.delta, u = r.unit;
      var dtxt = u === "%" ? F.sg(dd * 100, 1) + "bp" : u === ":1" ? F.sg(r.before ? dd / r.before * 100 : 0, 1) + "%" : F.sg(dd, r.digits) + u;
      var up = Math.abs(dd) > 1e-9;
      return "<tr><td>" + esc(r.label) + '</td><td class="n">' + f2(r.before, r.digits) + u + '</td><td class="n">' + f2(r.after, r.digits) + u +
        '</td><td class="n ' + (up ? "am" : "mu") + '">' + (up ? dtxt : "—") + "</td></tr>";
    }).join("");
    var presets = ctx.meta.presets || {}, cur = st.requested_shock || {};
    var same = function (a, b) { var ka = Object.keys(a || {}), kb = Object.keys(b || {}); return ka.length === kb.length && ka.every(function (k) { return +a[k] === +b[k]; }); };
    var stress = '<div class="stress" id="stress"><span class="ml amb">STRESS 프리셋</span>' + Object.keys(presets).filter(function (k) { return k !== "base"; }).map(function (k) {
      return '<span class="cp' + (same(cur, presets[k].shock) ? " on" : "") + '" data-act="preset" data-k="' + esc(k) + '">' + esc(presets[k].label) + "</span>";
    }).join("") + '<span class="custom"><label>UST<input type="number" id="shUst" step="5" placeholder="bp"></label><label>CPI<input type="number" id="shCpi" step="5" placeholder="bp"></label>' +
      '<label>BOK<input type="number" id="shBok" step="25" placeholder="bp"></label><label>CREDIT<input type="number" id="shCr" step="1" placeholder="lvl"></label>' +
      '<button class="btn sm" data-act="applyCustom">APPLY</button><button class="btn sm g" data-act="clearShock">해제</button></span></div>';
    var h = '<div class="grid" style="grid-template-columns:minmax(0,1.25fr) minmax(0,1fr)">';
    h += '<div class="cd' + (st.mode === "WHAT-IF" ? " hl" : "") + '"><div class="cdh"><span class="cdt">충격 영향표 · ' + esc(st.shock_label) + '</span><span class="cdo">' + esc(st.mode) + "</span></div>" + stress +
      '<table class="tb"><thead><tr><th>지표</th><th class="n">기준</th><th class="n">충격 후</th><th class="n">변화</th></tr></thead><tbody>' + rows + "</tbody></table>" +
      (st.mode !== "WHAT-IF" ? '<div class="note">위 프리셋이나 UST/CPI/BOK/CREDIT 입력으로 충격을 주면 24개 사전 정의 관계를 따라 재계산됩니다. AI에게 자연어로 물어도 같은 엔진이 계산합니다.</div>' : "") +
      (st.offlineNote ? '<div class="banner">' + esc(st.offlineNote) + "</div>" : "") + "</div>";
    var key = ["rat_ktb", "rat_curve", "rat_credit", "eq_val", "eq_ipo"];
    h += '<div class="cd"><div class="cdh"><span class="cdt">전이 경로 · 계산식</span><span class="cdo">β = 사전 정의</span></div>';
    key.forEach(function (k) {
      h += '<div class="sec-t" style="margin-top:4px"><span class="evs" style="margin:0"><span data-sel="' + k + '">' + esc(O.nodes[k].label) + "</span></span></div>" + fx(st.nodes[k].formula.lines);
    });
    h += '<div class="sec" style="margin-top:7px"><div class="sec-t">SHARED DURATION</div><div class="fx">' + esc(st.shared_duration.text) + "</div></div></div></div>";
    return h;
  }

  function pips(items) {
    return '<div class="pips">' + items.map(function (i) { return "<i class='" + (i.pass ? "y" : "x") + "' title='" + esc(i.key) + "'></i>"; }).join("") + "</div>";
  }

  function paneCB(ctx) {
    var st = ctx.st, c0 = st.cb.demo_base, c1 = st.cb.demo, w = st.watch || {};
    var h = '<div class="grid" style="grid-template-columns:minmax(0,1.3fr) minmax(0,1fr) minmax(0,1.05fr)">';
    var isReal = c1.flag === "REAL";
    // 1. sectors / themes to watch — auto-selected from NAVER 업종·테마, tagged by VALKYRIE's judgement
    var tagHtml = function (tags) { return (tags || []).map(function (t) { return '<span class="wt-tag" title="' + esc(t.why || "") + '">' + esc(t.t) + "</span>"; }).join(""); };
    var rowS = function (s) {
      return "<tr><td><b>" + esc(s.name) + '</b> <span class="mu">' + esc(s.kind) + '</span></td><td class="n ' + cls(s.changeRate) + '">' + F.sg(s.changeRate, 2) + '%</td><td class="n mu">' +
        (s.change3d === null || s.change3d === undefined ? "—" : F.sg(s.change3d, 1) + "%") + '</td><td class="n mu">' + Math.round(s.rise || 0) + "↑" + Math.round(s.fall || 0) + "↓</td><td>" +
        esc((s.leaders || []).map(function (l) { return l.name; }).join(" · ")) + "</td><td>" + (tagHtml(s.tags) || '<span class="mu">' + esc(s.why || "") + "</span>") + "</td></tr>";
    };
    var secs = (w.sectors || []).slice(0, 5), ths = (w.themes || []).slice(0, 5);
    var asof = String(w.asOf || "").replace(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2}).*/, "$2-$3 $4:$5");
    h += '<div class="cd"><div class="cdh"><span class="cdt">주목 섹터 · 테마</span><span class="cdo">' + chip("REAL", "자동 선정 · NAVER " + asof) + "</span></div>" +
      '<div class="note" style="margin:0 0 5px">등락 · 폭 · 회전율 순위에 VALKYRIE 기준 태그' + (w.tilt_active && w.tilt_active.length ? " (" + esc(w.tilt_active.join(" · ")) + ")" : "") + " · 태그에 마우스를 올리면 이유</div>" +
      (secs.length || ths.length ? '<table class="tb"><thead><tr><th>섹터 · 테마</th><th class="n">등락</th><th class="n">3일</th><th class="n">폭</th><th>주도주</th><th>왜 보나</th></tr></thead><tbody>' +
        secs.map(rowS).join("") + ths.map(rowS).join("") + "</tbody></table>" : '<div class="note">NAVER 업종·테마 대기 중</div>') + "</div>";
    // 2. stocks / events to watch + the credit → CB transmission in three numbers
    var K = { "거래대금 1위": "cy", "거래량 1위": "cy", "상승률 1위": "gr", "하락률 1위": "rd", "관심 1위": "am", "검색 1위": "am", "주도주": "cy", "IPO 청약": "am", "IPO 상장": "am", "CB 희석 주의": "rd", "Put 임박": "rd" };
    h += '<div class="cd"><div class="cdh"><span class="cdt">주목 종목 · 이벤트</span><span class="cdo">' + chip("REAL", "브리핑 · IPO 일정 · CB 공시") + "</span></div>" +
      ((w.stocks || []).length ? (w.stocks || []).map(function (x) {
        return '<div class="wt-i"><em class="' + (K[x.kind] || "mu") + '">' + esc(x.kind) + "</em><span><b>" + esc(x.name) + (x.code ? ' <span class="mu num">' + esc(x.code) + "</span>" : "") +
          '</b> <span class="num">' + esc(x.value || "") + "</span><small>" + esc(x.why || "") + " · " + esc(x.source || "") + "</small></span></div>";
      }).join("") : '<div class="note">대기 중</div>') +
      '<div class="sec-t" style="margin-top:8px">크레딧 → CB 전이 (rat_credit → eq_cb)</div>' +
      kv("크레딧 AA- 3Y", f2(st.nodes.rat_credit.base, 1) + " → " + f2(st.nodes.rat_credit.value, 1) + "bp") +
      kv("차환 접근성", Math.round(c0.refi_access * 100) + "% → " + Math.round(c1.refi_access * 100) + "%") +
      kv("차환 유출 압력 · Put 위험", f2((st.signals.equity.cb_flow || {}).share || 0, 0) + "% · " + st.nodes.eq_cb.value + "곳") +
      '<div class="sec-t" style="margin-top:8px">IPO 수요 (eq_val → eq_ipo)</div>' + fx(st.nodes.eq_ipo.formula.lines) + "</div>";
    // 3. universe
    var all = st.cb.all.slice().sort(function (a, b) { return (b.put_risk - a.put_risk) || (a.score - b.score); }).slice(0, 12);
    h += '<div class="cd"><div class="cdh"><span class="cdt">코스닥 CB 표본 · Put 위험 ' + st.nodes.eq_cb.value + "곳 (" + f2(st.cb.put_share, 0) + '%)</span><span class="cdo">' + (isReal ? chip("REAL", "REAL " + (st.cb.n || st.cb.all.length) + "건") : chip("DEMO", "DEMO 50건")) + "</span></div>" +
      '<table class="tb"><thead><tr><th>발행사</th><th>섹터</th><th class="n">스코어</th><th class="n">Put까지</th><th>상태</th></tr></thead><tbody>' +
      all.map(function (c) {
        return "<tr><td>" + esc(c.name) + "</td><td>" + esc(c.sector) + '</td><td class="n">' + c.score + '/5</td><td class="n">' + f2(c.months_to_put, 1) + "개월</td><td>" +
          (c.put_risk ? "<span class='dw'>PUT 위험</span>" : c.refixed ? "<span class='am'>리픽싱</span>" : "<span class='mu'>정상</span>") + "</td></tr>";
      }).join("") + "</tbody></table>" +
      (isReal ? '<div class="note">발행조건: <b>CB Zero Finder</b>(DART 공시, 코스닥) · 주가·재무: <b>NAVER</b>(최근 확정 FY) · 가정: Put = 발행 12개월 후, 리픽싱 하한 미공시 = 리픽싱 없음 · 해당 날짜까지 발행분만 반영(PIT)</div></div>'
        : '<div class="note">발행조건·재무는 <b>가상 DEMO 표본</b>입니다.</div></div>');
    return h + "</div>";
  }

  function perfCell(p) {
    if (!p || p.status === "PENDING") return '<td class="n mu">PENDING</td>';
    return '<td class="n ' + cls(p.bp) + '">' + F.sg(p.bp) + "bp</td>";
  }

  function paneLog(ctx) {
    var logs = ctx.logs || [], flt = ctx.logFilter || "ALL";
    var rows = logs.filter(function (l) { return flt === "ALL" || l.source === flt; });
    var h = '<div class="filters" style="margin-bottom:6px">' + ["ALL", "REAL", "SIMULATED", "USER"].map(function (f) {
      return '<span class="cp' + (f === flt ? " on" : "") + '" data-act="logf" data-v="' + f + '">' + f + " " + (f === "ALL" ? logs.length : logs.filter(function (l) { return l.source === f; }).length) + "</span>";
    }).join("") + '<span class="ml2" style="margin-left:8px">BM = 국고 3Y 총수익 · 상대성과(bp) · 미관측 구간은 PENDING</span></div>';
    h += '<div class="frm"><select id="lgDom"><option value="rat">국고채</option><option value="eq">코스닥</option></select>' +
      '<select id="lgDir"><option>SHORT</option><option>LONG</option><option>AVOID</option><option>SELECTIVE</option><option>ENGAGE</option></select>' +
      '<input id="lgDec" placeholder="판단 (예: 장기채 축소)"><input id="lgWhy" placeholder="근거"><button class="btn sm" data-act="logadd"' + (ctx.online ? "" : " disabled title='서버 실행 시 기록 가능'") + ">기록 · " + esc(ctx.st.date) + "</button></div>";
    h += '<table class="tb"><thead><tr><th>발신일</th><th>판단</th><th>근거</th><th class="n">D+5</th><th class="n">D+20</th><th class="n">D+60</th><th class="n">BM 대비</th><th>상태</th><th>출처</th></tr></thead><tbody>';
    h += rows.map(function (l) {
      return '<tr class="' + (l.source === "REAL" ? "real" : "") + '"><td class="num">' + esc(l.date) + "</td><td>[" + esc(l.asset) + "] " + esc(l.decision) + '</td><td class="why">' + esc(l.rationale) + "</td>" +
        perfCell(l.perf.d5) + perfCell(l.perf.d20) + perfCell(l.perf.d60) +
        '<td class="n ' + (l.vs_bm === null ? "mu" : cls(l.vs_bm)) + '">' + (l.vs_bm === null ? "PENDING" : F.sg(l.vs_bm) + "bp") + "</td><td>" + chip(l.status) + "</td><td>" + chip(l.source) + "</td></tr>";
    }).join("") + "</tbody></table>";
    if (!rows.length) h += '<div class="note">기록 없음</div>';
    return h;
  }

  function paneSimilar(ctx) {
    var s = ctx.similar;
    if (!s) return '<div class="note">계산 중…</div>';
    var feats = s.features;
    var h = '<div class="grid" style="grid-template-columns:minmax(0,1fr) repeat(3,minmax(0,1fr))">';
    h += '<div class="cd hl"><div class="cdh"><span class="cdt">질의 국면 · ' + esc(s.query.date) + '</span><span class="cdo">' + esc(s.query.shock) + "</span></div>" +
      feats.map(function (f) { return kv(f.label, f2(s.query.vector[f.key]) + (f.unit ? " " + f.unit : "")); }).join("") +
      '<div class="note">' + esc(s.method) + " · " + s.elapsed_ms + "ms</div></div>";
    s.results.forEach(function (r, i) {
      var a = r.after20;
      h += '<div class="cd"><div class="cdh"><span class="cdt">#' + (i + 1) + " · " + esc(r.date) + '</span><span class="cdo">cos ' + r.similarity.toFixed(3) + "</span></div>" +
        '<div class="sim-bar"><i style="width:' + Math.max(0, r.similarity * 100).toFixed(0) + '%"></i></div>' +
        feats.map(function (f) { return kv(f.label, f2(r.vector[f.key]) + (f.unit ? " " + f.unit : "")); }).join("") +
        '<div class="sec-t" style="margin-top:6px">이후 20영업일 (→ ' + esc(a.end) + ")</div>" +
        kv("국고 3Y", "<span class='" + cls(-a.ktb3_bp) + "'>" + F.sg(a.ktb3_bp) + "bp</span>") +
        kv("국고 10Y", "<span class='" + cls(-a.ktb10_bp) + "'>" + F.sg(a.ktb10_bp) + "bp</span>") +
        kv("KOSDAQ", "<span class='" + cls(a.kosdaq_pct) + "'>" + F.sg(a.kosdaq_pct, 2) + "%</span>") +
        (r.decisions.length ? '<div class="note">당시 판단: ' + r.decisions.map(function (d) { return "<b>" + esc(d.date) + "</b> " + esc(d.decision) + " (" + esc(d.source) + ")"; }).join(" · ") + "</div>" : "") +
        "</div>";
    });
    return h + "</div>";
  }

  function panePublish(ctx) {
    var c = ctx.cmd, h = '<div class="grid" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr)">';
    h += '<div class="cd' + (c ? " hl" : "") + '"><div class="cdh"><span class="cdt">VALKYRIE COMMAND</span><span class="cdo">' + (c ? esc(c.mode) : "READY") + "</span></div>";
    if (c) {
      h += '<div class="ans"><div class="q">&gt; ' + esc(c.question) + "</div>" +
        (c.path && c.path.length ? '<div class="path">' + c.path.map(function (p) { return '<span data-sel="' + p + '">' + esc(ctx.meta.ontology.nodes[p].label) + "</span>"; }).join("") + "</div>" : "") +
        c.answer.map(function (l) { return "<p>" + esc(l) + "</p>"; }).join("") + "</div>" +
        (c.note ? '<div class="note">' + esc(c.note) + "</div>" : "");
    } else {
      h += '<div class="ans">' + (ctx.meta.questions || []).map(function (q) { return '<p><span class="cp" data-act="ask" data-q="' + esc(q.q) + '">' + esc(q.q) + "</span></p>"; }).join("") + "</div>" +
        '<div class="note">준비 질문은 엔진 계산으로 즉시 답합니다 · 자유 질문은 상단 AI 질문창에서.</div>';
    }
    h += "</div>";
    h += '<div class="cd"><div class="cdh"><span class="cdt">ODIN 발간 · 승인 워크플로</span><span class="cdo">DRAFT → PENDING → PUBLISHED</span></div>';
    if (ctx.online) {
      h += '<div style="margin-bottom:7px"><button class="btn sm" data-act="draft">초안 생성 · ' + esc(ctx.st.date) + " · " + esc(ctx.st.shock_label) + "</button></div>";
      var pubs = ctx.pubs || [];
      if (!pubs.length) h += '<div class="note">아직 초안이 없습니다.</div>';
      pubs.forEach(function (p) {
        var btns = p.status === "DRAFT" ? '<button class="btn sm g" data-act="submit" data-id="' + p.id + '">제출</button>'
          : p.status === "PENDING" ? '<button class="btn sm" data-act="approve" data-id="' + p.id + '">승인</button> <button class="btn sm g" data-act="reject" data-id="' + p.id + '">반려</button>' : "";
        h += '<div class="pub"><div class="pub-t"><span>' + esc(p.title) + "</span><span>" + chip(p.status) + " " + btns + "</span></div>" +
          '<div class="pub-b">' + esc(p.body.join("\n")) + "</div>" +
          '<div class="pub-h">컨피던스 ' + p.confidence + " · " + p.history.map(function (x) { return esc(x.status) + " " + esc(x.at.slice(5, 16)) + " " + esc(x.by); }).join(" → ") + "</div></div>";
      });
    } else {
      h += '<div class="banner">OFFLINE 번들: 발간 승인은 서버 실행 시에만 동작합니다. 아래는 스냅샷 기준 ODIN 피드 목업입니다.</div>';
      (ctx.feed || []).filter(function (f) { return f["발간일"] <= ctx.st.date; }).slice(-6).reverse().forEach(function (f) {
        h += '<div class="pub"><div class="pub-t"><span>' + esc(f["제목"]) + "</span>" + chip("PUBLISHED", f["판단 방향"]) + '</div><div class="pub-b">' + esc(f["한 줄 결론"]) + "</div></div>";
      });
    }
    return h + "</div></div>";
  }

  var PANES = { signals: paneSignals, impact: paneImpact, cb: paneCB, log: paneLog, similar: paneSimilar, publish: panePublish };
  return {
    inspector: inspector,
    pane: function (tab, ctx) {
      if (tab === "market" && VK.market) return VK.market.pane(ctx);
      if (tab === "node" && VK.insight) return VK.insight.paneNode(ctx);
      if (tab === "ask" && VK.ask) return VK.ask.pane(ctx);
      return (PANES[tab] || paneSignals)(ctx);
    },
    xcheck: xcheck,
    esc: esc, toolUrl: toolUrl
  };
})();
