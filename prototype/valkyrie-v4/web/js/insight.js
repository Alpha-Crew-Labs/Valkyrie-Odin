/* Node insight workspace + risk thermometer (Fear & Greed style) + action-plan strip.
   Every number comes from the engine state (risk = 1y percentile, valkyrie/risk.py) or the owners' models. */
"use strict";
var VK = window.VK || {};
window.VK = VK;

VK.viz = (function () {
  var RC = function (s) { return VK.fmt.riskColor(s); };
  /* semicircle gauge 0..100 with five zones and a needle */
  function gauge(v, label, sub, size) {
    var W = size || 210, R = W / 2 - 14, rin = R - 16, cx = W / 2, cy = R + 16, H = Math.round(cy + 44);
    var zones = [[0, 20, "#1E6B52"], [20, 40, "#31C08C"], [40, 55, "#8A94A6"], [55, 70, "#EFA83A"], [70, 85, "#EF7A4A"], [85, 100, "#EF5A61"]];
    function pt(p, r) { var a = Math.PI * (1 - p / 100); return [cx + r * Math.cos(a), cy - r * Math.sin(a)]; }
    function arc(a, b, color) {
      var p1 = pt(a, R), p2 = pt(b, R), p3 = pt(b, rin), p4 = pt(a, rin);
      return '<path d="M' + p1[0].toFixed(1) + "," + p1[1].toFixed(1) + " A" + R + "," + R + " 0 0 1 " + p2[0].toFixed(1) + "," + p2[1].toFixed(1) +
        " L" + p3[0].toFixed(1) + "," + p3[1].toFixed(1) + " A" + rin + "," + rin + " 0 0 0 " + p4[0].toFixed(1) + "," + p4[1].toFixed(1) + ' Z" fill="' + color + '" opacity=".85"/>';
    }
    var h = '<svg class="gauge" viewBox="0 0 ' + W + " " + H + '">';
    zones.forEach(function (z) { h += arc(z[0] + 0.4, z[1] - 0.4, z[2]); });
    [0, 25, 50, 75, 100].forEach(function (t) { var p = pt(t, R + 7); h += '<text x="' + p[0].toFixed(1) + '" y="' + (p[1] + 3).toFixed(1) + '" class="gt-tick">' + t + "</text>"; });
    if (v !== null && v !== undefined) {
      var n1 = pt(v, rin - 6), c = RC(v / 100);
      h += '<line class="gneedle" x1="' + cx + '" y1="' + cy + '" x2="' + n1[0].toFixed(1) + '" y2="' + n1[1].toFixed(1) + '" stroke="' + c + '"/>';
      h += '<circle cx="' + cx + '" cy="' + cy + '" r="5" fill="' + c + '"/>';
      h += '<text x="' + cx + '" y="' + (cy + 29) + '" class="gval" fill="' + c + '">' + Math.round(v) + "</text>";
    }
    h += '<text x="' + cx + '" y="' + (cy - rin * 0.42) + '" class="glab">' + VK.views.esc(label || "") + "</text>";
    if (sub) h += '<text x="' + cx + '" y="' + (H - 1) + '" class="gsub">' + VK.views.esc(sub) + "</text>";
    return h + "</svg>";
  }
  /* horizontal thermometer bar */
  function thermo(name, v, label, extra) {
    var c = RC(v === null || v === undefined ? null : v / 100);
    return '<div class="thm"><div class="thm-h"><b>' + VK.views.esc(name) + '</b><span style="color:' + c + '">' + (v === null || v === undefined ? "—" : Math.round(v)) +
      " · " + VK.views.esc(label || "") + '</span></div><div class="thm-b"><i style="width:' + (v || 0) + "%;background:linear-gradient(90deg,#31C08C,#EFA83A 55%," + c + ')"></i>' +
      "<em style=\"left:20%\"></em><em style=\"left:40%\"></em><em style=\"left:55%\"></em><em style=\"left:70%\"></em><em style=\"left:85%\"></em></div>" + (extra || "") + "</div>";
  }
  /* line chart with optional p20/p80 band and markers */
  function chart(dates, vals, opts) {
    opts = opts || {};
    var W = opts.w || 520, H = opts.h || 150, pl = 6, pr = 46, pt = 10, pb = 16;
    var idx = [];
    for (var i = 0; i < vals.length; i++) if (vals[i] !== null && vals[i] !== undefined) idx.push(i);
    if (idx.length < 3) return '<div class="note">시계열 없음</div>';
    var ys = idx.map(function (i) { return vals[i]; });
    var lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys);
    if (opts.after !== undefined && opts.after !== null) { lo = Math.min(lo, opts.after); hi = Math.max(hi, opts.after); }
    if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
    var pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
    var X = function (i) { return pl + (W - pl - pr) * i / Math.max(1, vals.length - 1); };
    var Y = function (v) { return pt + (H - pt - pb) * (1 - (v - lo) / (hi - lo)); };
    var h = '<svg class="ichart" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none">';
    if (opts.band) {
      var s = ys.slice().sort(function (a, b) { return a - b; }), q = function (p) { return s[Math.floor(p * (s.length - 1))]; };
      var b1 = Y(q(0.8)), b2 = Y(q(0.2));
      h += '<rect x="' + pl + '" y="' + b1.toFixed(1) + '" width="' + (W - pl - pr) + '" height="' + Math.max(1, b2 - b1).toFixed(1) + '" class="band"/>';
      h += '<text x="' + (W - pr + 4) + '" y="' + (b1 + 3).toFixed(1) + '" class="axl">p80</text><text x="' + (W - pr + 4) + '" y="' + (b2 + 3).toFixed(1) + '" class="axl">p20</text>';
    }
    var d = idx.map(function (i, k) { return (k ? "L" : "M") + X(i).toFixed(1) + "," + Y(vals[i]).toFixed(1); }).join("");
    h += '<path d="' + d + '" class="ln" style="stroke:' + (opts.color || "var(--cy)") + '"/>';
    (opts.marks || []).forEach(function (m) {
      var i = dates.indexOf(m[0]);
      if (i >= 0) h += '<line x1="' + X(i).toFixed(1) + '" x2="' + X(i).toFixed(1) + '" y1="' + pt + '" y2="' + (H - pb) + '" class="mk"/><text x="' + X(i).toFixed(1) + '" y="' + (H - 4) + '" class="axl" text-anchor="middle">' + VK.views.esc(m[1]) + "</text>";
    });
    var li = idx[idx.length - 1];
    h += '<circle cx="' + X(li).toFixed(1) + '" cy="' + Y(vals[li]).toFixed(1) + '" r="3.5" class="dot"/>';
    if (opts.after !== undefined && opts.after !== null) {
      h += '<line x1="' + X(li).toFixed(1) + '" x2="' + (X(li) + 14).toFixed(1) + '" y1="' + Y(vals[li]).toFixed(1) + '" y2="' + Y(opts.after).toFixed(1) + '" stroke="#EFA83A" stroke-dasharray="2 2"/>';
      h += '<circle cx="' + (X(li) + 14).toFixed(1) + '" cy="' + Y(opts.after).toFixed(1) + '" r="3.5" fill="#EFA83A"/>';
    }
    var f = opts.fmt || function (v) { return v.toFixed(2); };
    h += '<text x="' + (W - pr + 4) + '" y="' + (pt + 6) + '" class="axl">' + f(hi - pad) + '</text><text x="' + (W - pr + 4) + '" y="' + (H - pb) + '" class="axl">' + f(lo + pad) + "</text>";
    h += '<text x="' + pl + '" y="' + (H - 4) + '" class="axl">' + VK.views.esc(dates[0] || "") + '</text><text x="' + (W - pr) + '" y="' + (H - 4) + '" class="axl" text-anchor="end">' + VK.views.esc(dates[dates.length - 1] || "") + "</text>";
    return h + "</svg>";
  }
  function bars(items) {   // [[label, value0..1, text]]
    return '<div class="ibars">' + items.map(function (x) {
      return '<div class="ib"><span>' + VK.views.esc(x[0]) + '</span><i><b style="width:' + Math.round(100 * Math.max(0, Math.min(1, x[1]))) + "%;background:" + RC(x[1]) + '"></b></i><em>' + VK.views.esc(x[2]) + "</em></div>";
    }).join("") + "</div>";
  }
  return { gauge: gauge, thermo: thermo, chart: chart, bars: bars };
})();

VK.insight = (function () {
  var esc = function (s) { return VK.views.esc(s); };
  var F = VK.fmt, news = {}, pending = {};
  var LV = { LOW: "1년 하단", MID: "1년 중간", HIGH: "1년 상단", NA: "—" };

  function kv(k, v) { return '<div class="kv"><span>' + esc(k) + "</span><b class='num'>" + v + "</b></div>"; }
  function card(t, o, body, cls) {
    return '<div class="cd' + (cls ? " " + cls : "") + '"><div class="cdh"><span class="cdt">' + esc(t) + '</span><span class="cdo">' + o + "</span></div>" + body + "</div>";
  }
  function riskChip(r) {
    if (!r || r.score === null || r.score === undefined) return '<span class="chip">LEVEL —</span>';
    return '<span class="chip rk" style="color:' + F.riskColor(r.score) + ";border-color:" + F.riskColor(r.score) + '" title="현재 값의 지난 1년 분포 내 위치 (백분위) · 전망 아님">LEVEL ' + Math.round(r.score * 100) + " · " + LV[r.level] + "</span>";
  }

  /* ------------------------------------------------------------ action guide per object (deterministic) */
  var G = {
    mac_gdp: ["성장 견조 → 경기민감·가치주 선호, 크레딧 캐리 유지", "성장 평범 → 섹터 중립, 지표 확인", "성장 둔화 → 경기민감주·하위등급 크레딧 축소, 듀레이션 확대 여지 점검"],
    mac_uscpi: ["US 디스인플레이션 → 장기채·성장주 우호", "US 물가 둔화 확인 전 중립", "US 물가 경계 → 연준 인하 기대 후퇴, 미국채 장기물·고밸류 성장주 보수적"],
    mac_krcpi: ["KR 물가 안정 → 인하 여지, 듀레이션 확대 검토", "KR 물가 중립 → 한은 데이터 의존", "KR 물가 압력 → 한은 인상·동결 장기화, 단기채·현금성 선호"],
    mac_fed: ["연준 완화적 → 위험자산·신흥국 우호", "연준 중립 → 달러 방향 확인", "연준 긴축 수준 높음 → 달러 강세·외국인 수급 부담, 원화자산 환헤지 점검"],
    mac_bok: ["기준금리 적정 이상 → 인하 여지, 국고 단기물 강세 기대", "테일러 갭 중립 → 금통위 문구 모니터링", "테일러 갭 확대 → 추가 인상 리스크, 국고 단기물 금리 상승 대비"],
    rat_ust: ["미국채 금리 하락 국면 → 국고 듀레이션 확대 기회", "미국채 중립 → UST→국고 전이(β0.62) 모니터링", "미국채 금리 상단 테스트 → 국고 장기물 신규 매수 자제, 전이 경계"],
    rat_ktb: ["국고 금리 하단권 → 추가 강세 제한, 이익 실현 검토", "국고 금리 중립 → 벤치마크 듀레이션", "국고 금리 1년 고점권 → 평가손 관리·듀레이션 축소 유지, 상단 확인 후 분할 매수"],
    rat_curve: ["커브 스티프 → 스티프너(단기 매수·장기 매도) 유지", "커브 중립 → 불릿 포지션", "커브 플래트닝 → 중단기물 축소, 초단기+장기 바벨"],
    rat_credit: ["스프레드 축소 → 우량 크레딧 캐리 확대", "크레딧 중립 → 만기 분산", "크레딧 확대 → AA- 이하 신규 매입 보류, 우량 단기물 위주 · CB 차환 리스크 연동"],
    eq_fin: ["IPO 질 개선 → 선별 참여 확대", "적자 비중 평범 → 흑자·확약 비율 기준 선별", "적자 IPO 비중 높음 → 흑자 기업 위주, 기술특례 보수적"],
    eq_val: ["할인율 하락 → 성장주 재진입 여지", "할인율 중립 → 밸류 중립", "할인율 상승 → 고밸류 성장주·장기 듀레이션 주식 축소"],
    eq_ipo: ["수요 강세 → 선별 청약 확대, 의무보유확약 높은 종목 우선", "수요 평범 → 공모가 밴드 상단 종목만", "수요예측 부진 → 청약 보수적, 공모가 하단 확정 종목 회피"],
    eq_cb: ["차환 여건 양호 → 제로쿠폰 CB 선별 투자 가능", "차환 여건 중립 → 발행사 런웨이 점검", "CB 차환 유출 압력 높음 → 신규 CB 투자 보류, Put 도래 발행사 점검"],
    eq_kospi: ["코스피 위험 낮음 → 주식 비중 유지·확대", "코스피 주의 → 비중 중립, 변동성 모니터링", "코스피 경계 → 주식 비중 축소·선물 헤지"],
  };
  function guide(id, st) {
    var n = st.nodes[id], r = n && n.risk, lvl = r ? r.level : "NA";
    var g = G[id];
    if (!g || lvl === "NA") return null;
    var text = g[{ LOW: 0, MID: 1, HIGH: 2 }[lvl]];
    return { text: text, level: lvl, score: r.score };
  }

  /* ------------------------------------------------------------ series per node */
  var SER = {
    mac_gdp: ["gdp_now", "GDP 나우캐스트 %"], mac_uscpi: ["us_cpi", "US CPI YoY %"], mac_krcpi: ["kr_cpi_fcst", "KR CPI 익월 예측 %"],
    mac_fed: ["fed", "Fed Funds %"], mac_bok: ["taylor_gap", "테일러 갭 %p (적정 − 기준)"], rat_ust: ["ust10", "UST 10Y %"], rat_ktb: ["ktb3", "국고 3Y %"],
    rat_curve: ["curve_bp", "3s10s bp"], rat_credit: ["credit_bp", "AA- 3Y − 국고3Y bp"], eq_fin: ["loss_share", "적자 IPO 비중 %"],
    eq_val: ["ktb10", "국고 10Y % (+ERP 6%)"], eq_ipo: ["ipo_demand", "기관 경쟁률 중앙값 :1"], eq_kospi: ["kospi", "KOSPI"],
    eq_cb: ["credit_bp", "크레딧 (CB 차환 여건) bp"],
    sig_macro: ["temp_mac", "MACRO 영역 온도"], sig_rates: ["temp_rat", "RATES 영역 온도"], sig_equity: ["temp_eq", "EQUITY 영역 온도"],
  };
  function window1y(S, key, date) {
    if (!S || !S[key]) return null;
    var end = S.dates.length - 1;
    while (end > 0 && S.dates[end] > date) end--;
    var start = Math.max(0, end - 250);
    return { dates: S.dates.slice(start, end + 1), vals: S[key].slice(start, end + 1) };
  }
  function stats(w) {
    var v = w.vals.filter(function (x) { return x !== null && x !== undefined; });
    if (!v.length) return null;
    var last = v[v.length - 1], prev20 = v[Math.max(0, v.length - 21)];
    return { min: Math.min.apply(null, v), max: Math.max.apply(null, v), last: last, d20: last - prev20 };
  }

  /* ------------------------------------------------------------ node-specific deep block */
  function special(id, ctx) {
    var st = ctx.st, T = st.tools && st.tools.items ? st.tools.items : [];
    var tool = function (k) { return T.filter(function (i) { return i.id === k; })[0] || {}; };
    if (id === "eq_kospi") {
      var n = st.nodes.eq_kospi, mr = n.market_risk || {}, et = tool("equity"), kp = ((et.plan || {}).kospi) || {};
      var h = '<div class="sec-t">8512 코스피 위험점수 구성 (김유찬)</div>';
      if (kp.contrib) {
        var L = { score_vol: "변동성 급등 25%", score_dd: "고점 대비 하락 25%", score_trend: "60일선 이탈 20%", score_lev: "빚투 과열 15%", score_liq: "예탁금 이탈 15%" };
        var W = { score_vol: .25, score_dd: .25, score_trend: .20, score_lev: .15, score_liq: .15 };
        h += VK.viz.bars(Object.keys(L).map(function (k) { var c = kp.contrib[k] || 0; return [L[k], c / W[k], (c).toFixed(3)]; }));
      }
      h += kv("위험점수", (mr.value === null || mr.value === undefined ? "—" : mr.value.toFixed(2)) + " · " + esc({ NORMAL: "안정", WARNING: "주의", HIGH: "경계", SEVERE: "위기" }[mr.state] || "—") +
        (st.mode === "WHAT-IF" && mr.base !== null ? " <span class='mu'>(기준 " + mr.base.toFixed(2) + ")</span>" : ""));
      var mk = (st.signals.equity || {}).market || {};
      if (kp.w_target !== undefined) h += kv("권장 주식비중", Math.round(kp.w_target * 100) + "%" + (kp.exposure ? " <span class='am'>(보유 " + Math.round(kp.exposure.current * 100) + "% → " + F.sg(kp.exposure.change * 100, 0) + "%p" +
        (kp.exposure.rebalance ? "" : " · ±10%p 밴드 내 유지") + ")</span> <span class='mu'>" + (mk.current_src === "기록" ? "보유 기록" : "보유 100% 가정") + "</span>" : ""));
      if (kp.futures && kp.futures.contracts && (!kp.exposure || kp.exposure.rebalance)) h += kv("선물 헤지", esc(kp.futures.contract) + " " + Math.abs(kp.futures.contracts).toFixed(0) + "계약 " + esc(kp.futures.side));
      if (kp.driver) h += kv("주된 원인", esc(kp.driver));
      if (kp.asof) h += kv("8512 기준", esc(kp.asof) + (kp.provisional ? " <span class='am'>장중 · 잠정값</span>" : " <span class='mu'>종가</span>"));
      var fl = VK.market && VK.market.state.sets.investor_flow;
      if (fl && fl.data && fl.data.markets.KOSPI) {
        var rows = fl.data.markets.KOSPI.slice(-20), sum = function (k) { return rows.reduce(function (s, r) { return s + (r[k] || 0); }, 0); };
        h += kv("20일 외국인 · 기관", "<span class='" + (sum("foreign") >= 0 ? "up" : "dw") + "'>" + F.sg(sum("foreign") / 1e4, 2) + "조</span> · <span class='" + (sum("institution") >= 0 ? "up" : "dw") + "'>" + F.sg(sum("institution") / 1e4, 2) + "조</span>");
      }
      return h;
    }
    if (/^rat_|^sig_rates$/.test(id)) {
      var rt = tool("rates"), p = rt.plan || {};
      if (p.target === undefined) return "";
      var h2 = '<div class="sec-t">8511 채권 위기 진단 (정훈) · ' + esc(rt.verdict || "") + "</div>";
      var mx = Math.max(p.benchmark || 0, p.target || 0, 6);
      h2 += '<div class="durbar"><div><span>BM</span><i style="width:' + (100 * p.benchmark / mx).toFixed(1) + '%"></i><b>' + p.benchmark.toFixed(2) + '년</b></div><div><span>목표</span><i class="t" style="width:' +
        (100 * p.target / mx).toFixed(1) + '%"></i><b>' + p.target.toFixed(2) + "년 <em class='" + (p.change < 0 ? "dw" : "up") + "'>" + F.sg(p.change, 2) + "</em></b></div></div>";
      var sz = (st.signals.rates || {}).sizing || {}, rsg = st.signals.rates || {};
      if (sz.mult !== undefined && sz.mult !== null) h2 += kv("변동성 타깃", "BM × " + sz.mult.toFixed(2) + " (기준 " + (sz.sigma_ref || 0).toFixed(1) + " ÷ 20일 " + (sz.sigma20 || 0).toFixed(1) + "bp/일) <span class='mu'>위험 사이징 · 금리 전망 아님</span>");
      if (sz.shocked) h2 += kv("충격 반영", "변동성 " + sz.sigma_shock.toFixed(1) + "bp/일 → ×" + sz.mult_shock.toFixed(2) + " = " + sz.target_shock.toFixed(2) + "년 <span class='am'>방향 무관하게 축소</span>");
      if (sz.current !== undefined && sz.current !== null) h2 += kv("보유 → 헤지", sz.current.toFixed(2) + "년 <span class='mu'>" + (sz.current_src === "기록" ? "기록" : "= BM 가정") + "</span>" +
        (sz.contracts !== null && sz.contracts !== undefined ? " · " + (sz.trade ? "3년 국채선물 " + Math.abs(sz.contracts).toFixed(0) + "계약 " + (sz.contracts < 0 ? "매도" : "매수") : "0.5년 밴드 내 → 매매 없음") : ""));
      else if (p.hedge) h2 += kv("헤지", esc(p.hedge));
      if (rsg.pressure_kr) h2 += kv("금리 방향 압력", esc(rsg.pressure_kr) + " (" + F.sg(rsg.pressure, 1) + "bp) <span class='mu'>VALKYRIE 규칙 · 별도 판단</span>");
      if (p.curve_trade) h2 += kv("커브", esc(p.curve + " → " + p.curve_trade));
      if (p.credit) h2 += kv("신용", esc(p.credit));
      h2 += kv("위기점수", (rt.score || 0).toFixed(2) + " (경고 0.40)");
      return h2;
    }
    if (/^mac_|^sig_macro$/.test(id)) {
      var mt = tool("macro"), m = mt.metrics;
      if (!m) return "";
      var X = function (g) { return 60 + Math.max(-50, Math.min(50, (g - 2) * 25)); }, Y = function (p) { return 60 - Math.max(-50, Math.min(50, (p - 2) * 25)); };
      var q = '<svg class="quad" viewBox="0 0 120 120"><rect x="60" y="0" width="60" height="60" class="q1"/><rect x="0" y="0" width="60" height="60" class="q2"/>' +
        '<rect x="0" y="60" width="60" height="60" class="q3"/><rect x="60" y="60" width="60" height="60" class="q4"/>' +
        '<text x="90" y="12">과열</text><text x="30" y="12">스태그</text><text x="30" y="116">침체</text><text x="90" y="116">골디락스</text>' +
        '<line x1="60" y1="0" x2="60" y2="120"/><line x1="0" y1="60" x2="120" y2="60"/>' +
        '<circle cx="' + X(m.gdp_yoy).toFixed(1) + '" cy="' + Y(m.core_pce_yoy).toFixed(1) + '" r="5" class="qp"/></svg>';
      return '<div class="sec-t">8501 매크로 국면 (정희강 규칙 재현)</div><div class="quadw">' + q + "<div>" + kv("국면", esc(mt.verdict)) +
        kv("근원 PCE YoY", m.core_pce_yoy.toFixed(2) + "% (" + esc(m.pce_month) + ")") + kv("실질 GDP YoY", F.sg(m.gdp_yoy, 2) + "% (" + esc(m.gdp_quarter) + ")") +
        '<div class="note">가로 = GDP − 2%, 세로 = PCE − 2%</div></div></div>';
    }
    if (id === "eq_cb") {
      var list = (st.cb.all || []).filter(function (c) { return c.put_risk; }).sort(function (a, b) { return a.months_to_put - b.months_to_put; }).slice(0, 7);
      var fl2 = st.signals.equity.cb_flow || {};
      var cz = ((st.tools && st.tools.public_tools) || {}).cb_zero_finder, hz = "";
      if (cz) hz = '<div class="sec-t">CB Zero Finder (김유찬 · DART 공시 통계)</div>' + kv("올해 CB 발행", (cz.issues || 0) + "건 (코스닥 " + (cz.kosdaq_issues || 0) + ") · " + Math.round(cz.amount_eok || 0).toLocaleString() + "억") +
        kv("제로쿠폰(표면·만기 0%)", (cz.zero_zero_count || 0) + "건 · " + (cz.zero_zero_share_pct === null ? "—" : cz.zero_zero_share_pct + "%")) +
        kv("평균 희석률", (cz.avg_dilution_pct === null ? "—" : cz.avg_dilution_pct + "%") + " · 20% 이상 " + (cz.high_dilution_share_pct === null ? "—" : cz.high_dilution_share_pct + "%")) +
        '<div class="evs" style="margin-bottom:6px"><a class="dlink" href="' + esc(cz.url) + '" target="_blank" rel="noopener noreferrer">CB Zero Finder 열기 ↗</a></div>';
      return hz + '<div class="sec-t">차환 유출 압력 ' + (fl2.share || 0).toFixed(0) + "% · Put 임박 발행사</div>" +
        '<table class="tb"><tbody>' + list.map(function (c) {
          return "<tr><td>" + esc(c.name) + '</td><td class="n">' + c.months_to_put.toFixed(1) + '개월</td><td class="n">' + Math.round(c.balance_eok) + '억</td><td class="n">' + c.score + "/5</td></tr>";
        }).join("") + "</tbody></table>";
    }
    if (id === "eq_ipo" || id === "eq_fin") {
      var pt = (st.tools && st.tools.public_tools) || {}, ir = pt.ipo_market_report, h0 = "";
      if (ir) h0 += '<div class="sec-t">IPO Market Report (김유찬 · 공개 도구)</div>' + kv("리포트", esc(ir.period || "") + " · " + (ir.companies || "—") + "개 기업 · 데이터 " + esc(ir.dataDate || "")) +
        '<div class="evs" style="margin-bottom:6px"><a class="dlink" href="' + esc(ir.url) + '" target="_blank" rel="noopener noreferrer">리포트 열기 ↗</a></div>';
      var pipe = VK.market && VK.market.state.sets.ipo_pipeline && VK.market.state.sets.ipo_pipeline.data;
      if (!pipe) return h0;
      var up = [].concat(pipe.demandForecastingList || [], pipe.forecastingCompleteList || [], pipe.subscriptionList || []).slice(0, 6);
      return h0 + '<div class="sec-t">IPO 파이프라인 (NAVER 실데이터)</div>' + up.map(function (x) {
        return kv(esc(x.compName) + " · " + esc(x.ipoStatus || ""), esc((x.dfEndDate || x.poStartDate || "").slice(5)) + (x.fnlCmptRatio ? " · " + Math.round(+x.fnlCmptRatio) + ":1" : ""));
      }).join("");
    }
    if (id === "sig_equity" || id === "sig_rates" || id === "sig_macro") return "";
    return "";
  }

  /* ------------------------------------------------------------ relations */
  function relations(id, st, O) {
    var inE = O.edges.filter(function (e) { return e.to === id; }), outE = O.edges.filter(function (e) { return e.from === id; });
    var row = function (e, dir) {
      var o = dir < 0 ? e.from : e.to, sn = st.nodes[o] || {}, r = sn.risk || {};
      var KD = { linear: "선형", "function": "재계산", evidence: "판단 입력" };
      return '<div class="rel" data-sel="' + o + '" title="' + esc((e.meaning || "") + (e.basis ? "\n근거: " + e.basis : "")) + '"><i style="background:' + F.riskColor(r.score) + '"></i><span>' + (dir < 0 ? "← " : "→ ") + esc(O.nodes[o].label) +
        (e.meaning ? "<small>" + esc(e.meaning) + "</small>" : "") + "</span><em>" + (e.sign < 0 ? "−" : "") + "β" + e.beta.toFixed(2) + " · " + (KD[e.kind] || e.kind) + "</em><b>" + (F.delta(sn) || "") + "</b></div>";
    };
    return inE.map(function (e) { return row(e, -1); }).concat(outE.map(function (e) { return row(e, 1); })).join("");
  }

  /* ------------------------------------------------------------ news */
  function newsBox(key) {
    var n = news[key];
    if (!n) { load(key); return '<div class="note">뉴스 불러오는 중…</div>'; }
    if (!n.items || !n.items.length) return '<div class="note">관련 뉴스 없음' + (n.error ? " · " + esc(n.error) : "") + "</div>";
    return n.items.slice(0, 9).map(function (x) {
      return '<a class="nws" href="' + esc(x.url) + '" target="_blank" rel="noopener noreferrer"><span class="num mu">' + esc((x.publishedAt || "").slice(5, 16).replace("T", " ")) +
        "</span> " + esc(x.title) + " <em>" + esc(x.source || "") + "</em></a>";
    }).join("") + '<div class="note">' + esc(n.query ? "검색어: " + n.query : "") + " · " + esc(n.source || "") + "</div>";
  }
  function load(key) {
    if (pending[key]) return;
    pending[key] = VK.api.news(key).then(function (r) {
      news[key] = r; pending[key] = null;
      var box = document.querySelector('[data-news="' + key + '"]');
      if (box) box.innerHTML = newsBox(key);
    }).catch(function () { pending[key] = null; news[key] = { items: [], error: "불러오기 실패" }; });
  }

  /* ------------------------------------------------------------ node pane */
  function paneNode(ctx) {
    var st = ctx.st, O = ctx.meta.ontology, id = ctx.sel;
    if (!id) return tempBlock(ctx, true);
    var n = O.nodes[id], sn = st.nodes[id], r = sn.risk || {};
    var isSig = !!n.signal, sig = isSig ? st.signals[{ sig_macro: "macro", sig_rates: "rates", sig_equity: "equity" }[id]] : null;
    var sp = SER[id], w = sp && window1y(ctx.series, sp[0], st.date), s = w && stats(w);
    var fmtv = function (v) { return isSig ? Math.round(v) + "" : F.val(n, v); };
    // column 1: gauge + stats
    var c1 = VK.viz.gauge(r.score === null || r.score === undefined ? null : r.score * 100, "현재 수준 · " + LV[r.level || "NA"], "지난 1년 분포 내 위치 · 전망 아님", 200) +
      '<div class="note" style="text-align:center">' + esc(r.why || "") + " · " + esc(r.basis || "") + "</div>";
    if (isSig) c1 += kv("판단", esc(sig.call)) + kv("컨피던스", sig.confidence);
    else {
      c1 += kv("현재", F.val(n, sn.value) + (F.delta(sn) ? " <span class='am'>" + F.delta(sn) + "</span>" : ""));
      if (s) c1 += kv("1년 범위", fmtv(s.min) + " ~ " + fmtv(s.max)) + kv("20일 변화", (s.d20 >= 0 ? "+" : "−") + Math.abs(s.d20).toFixed(n.unit === "bp" || n.unit === ":1" ? 0 : 2));
    }
    // column 2: chart + formula
    var rw = window1y(ctx.series, "risk_" + id, st.date);
    var c2 = w ? VK.viz.chart(w.dates, w.vals, { band: !isSig, after: st.mode === "WHAT-IF" && !isSig && typeof sn.value === "number" && id !== "eq_cb" && id !== "mac_bok" && id !== "eq_val" ? sn.value : null,
      marks: (ctx.meta.snapshot_dates || []).map(function (d) { return [d, d.slice(5)]; }), h: 150,
      fmt: function (v) { return Math.abs(v) >= 1000 ? Math.round(v).toLocaleString() : v.toFixed(Math.abs(v) >= 100 ? 0 : 2); } }) +
      '<div class="legend-row"><span><i style="background:var(--cy)"></i>' + esc(sp[1]) + "</span>" + (isSig ? "" : "<span><i style='background:#1B2A36'></i>1년 20~80% 분포</span>") +
      (st.mode === "WHAT-IF" ? "<span><i style='background:var(--am)'></i>WHAT-IF</span>" : "") + "</div>" : '<div class="note">시계열 없음</div>';
    if (rw && !isSig) c2 += '<div class="sec-t" style="margin-top:4px">수준 추이 (1년 백분위 · 현재 위치)</div>' + VK.viz.chart(rw.dates, rw.vals.map(function (v) { return v === null ? null : v * 100; }), { h: 54, color: F.riskColor(r.score), fmt: function (v) { return Math.round(v) + ""; } });
    c2 += '<div class="fx" style="margin-top:5px">' + (sn.formula ? sn.formula.lines.map(esc).join("\n") : "") + "</div>";
    // column 3: action guide + special
    var gd = guide(id, st), plan = st.plan;
    var c3 = "";
    if (isSig && plan) {
      var desk = plan.desks.filter(function (d) { return d.desk === { sig_macro: "매크로", sig_rates: "채권", sig_equity: "주식" }[id]; })[0];
      if (desk) c3 += '<div class="act-h" style="border-color:' + F.riskColor(r.score) + '">' + esc(desk.call) + "</div>" + desk.items.map(function (i) {
        return '<div class="act-i"><em>' + esc(i.src) + "</em><b>" + esc(i.text) + "</b><span>" + esc(i.why || "") + "</span></div>";
      }).join("");
    } else if (gd) {
      c3 += '<div class="act-h" style="border-color:' + F.riskColor(gd.score) + '"><em style="color:' + F.riskColor(gd.score) + '">' + LV[gd.level] + " 수준</em> " + esc(gd.text) + "</div>";
    }
    if (!isSig && plan) {   // how we respond: the desk action plan for this object's domain (VALKYRIE + owner model)
      var dk = plan.desks.filter(function (d) { return d.desk === { mac: "매크로", rat: "채권", eq: "주식" }[n.domain]; })[0];
      if (dk) c3 += '<div class="sec-t" style="margin-top:6px">대응 · ' + esc(dk.desk) + " 데스크 액션 플랜 (" + esc(dk.owner) + ")</div>" +
        '<div class="act-h" style="border-color:var(--cy);font-size:11.5px">' + esc(dk.call) + "</div>" +
        dk.items.slice(0, 3).map(function (i) { return '<div class="act-i"><em>' + esc(i.src) + "</em><b>" + esc(i.text) + "</b><span>" + esc(i.why || "") + "</span></div>"; }).join("");
    }
    c3 += special(id, ctx);
    // column 4: relations + cross-check + news
    var dom = { mac: "macro", rat: "rates", eq: "equity" }[n.domain];
    var tt = st.tools && st.tools.items ? st.tools.items.filter(function (i) { return i.id === dom; })[0] : null;
    var c4 = '<div class="sec-t">전이 경로 · 사전 정의 β</div>' + relations(id, st, O) +
      (tt ? '<div class="sec-t" style="margin-top:6px">담당 모델 교차검증</div>' + VK.views.xcheck(ctx, dom) : "") +
      '<div class="sec-t" style="margin-top:6px">관련 뉴스 · LIVE</div><div data-news="' + id + '">' + newsBox(id) + "</div>";
    return '<div class="grid nodep">' +
      card(n.label + " · " + (n.owner || ""), riskChip(r) + " " + '<span class="chip ' + esc(sn.status) + '">' + esc(sn.status) + "</span>", c1, "g1") +
      card(isSig ? "영역 온도 추이" : "1년 추이 · 분포", esc(st.date), c2, "g2") +
      card(isSig ? "데스크 액션 플랜 · 어떻게 대응할지" : "대응 · 어떻게 할지", isSig ? "VALKYRIE + 담당 모델" : "수준별 규칙 + 데스크 액션 플랜", c3 || '<div class="note">가이드 없음</div>', "g3") +
      card("연결 · 근거 · 뉴스", esc(n.sub || ""), c4, "g4") + "</div>";
  }

  /* ------------------------------------------------------------ risk thermometer + action strip */
  function tempBlock(ctx, full) {
    var st = ctx.st, rk = st.risk;
    if (!rk) return "";
    var t = rk.temps, lanes = rk.lanes || {};
    var hist = rk.history || {};
    var hs = hist.all && hist.all.filter(function (v) { return v !== null; }).length > 3 ?
      VK.viz.chart(hist.dates, hist.all, { h: 46, color: F.riskColor((t.all || 0) / 100), fmt: function (v) { return Math.round(v) + ""; } }) : "";
    var g = card("현재 스트레스 수준", "1년 분포 내 위치 · 0 낮음 ↔ 100 높음 · 전망 아님",
      '<div class="gwrap">' + VK.viz.gauge(t.all, rk.label, st.mode === "WHAT-IF" && rk.base && rk.base.all !== null ? "기준 " + Math.round(rk.base.all) + " → WHAT-IF " + Math.round(t.all) : "3개 영역 평균", 220) + "</div>" +
      '<div class="sec-t">120일 추이</div>' + hs + '<div class="note">이 숫자는 <b>지금이 지난 1년 중 어느 수준인지</b>를 보여줍니다. 앞으로의 대응은 오른쪽 <b>액션 플랜</b>과 판단 신호를 참고하세요.</div>', "thc");
    var top = (rk.top || []).map(function (x) {
      return '<span class="tp" data-sel="' + x.id + '" style="border-color:' + F.riskColor(x.score) + '"><i style="background:' + F.riskColor(x.score) + '"></i>' + esc(x.label) + " <b>" + Math.round(x.score * 100) + "</b></span>";
    }).join("");
    var th = card("영역별 수준", "노드 수준 평균 · 현재 위치",
      ["mac", "rat", "eq"].map(function (k) { return VK.viz.thermo(lanes[k].name + " · " + { mac: "정희강", rat: "정훈", eq: "김유찬" }[k], lanes[k].temp, lanes[k].label); }).join("") +
      '<div class="sec-t" style="margin-top:6px">1년 상단에 있는 노드 (클릭 → 인사이트)</div><div class="tps">' + top + "</div>", "thl");
    var ap = st.plan ? card("오늘의 액션 플랜 · 어떻게 대응할지", esc(st.date) + " · VALKYRIE + 담당 모델 (8501 · 8511 · 8512)", '<div class="apl">' + st.plan.desks.map(function (d) {
      var m = { AGREE: "ok", PARTIAL: "pt" }[d.match] || "na";
      return '<div class="apd"><div class="apd-h"><b>' + esc(d.desk) + "</b> <span>" + esc(d.owner) + "</span><em class='m-" + m + "'>" + esc({ ok: "✓ 모델 반영", pt: "△ 참고", na: "" }[m]) + "</em></div>" +
        '<div class="apd-c">' + esc(d.call) + "</div>" + d.items.slice(1, 4).map(function (i) { return '<div class="apd-i">· ' + esc(i.text) + "</div>"; }).join("") + "</div>";
    }).join("") + "</div>" + (st.offline ? "" : bookForm(st)), "apc") : "";
    return '<div class="grid tmp' + (full ? " full" : "") + '">' + g + th + ap + "</div>";
  }

  /* ------------------------------------------------------------ held book (D-013): what 8512 / 8511 trades are sized against */
  function bookForm(st) {
    var b = (st.tools && st.tools.book) || {}, e = b.equity || {}, r = b.rates || {};
    var stamp = e.asof || r.asof ? "기록 " + esc(e.asof || r.asof) : "미기록 → 8512는 보유 100%, 8511은 보유 = BM 가정";
    return '<div class="bookf"><span class="bk-t">보유 기록</span>' +
      '<label>주식 <input id="bkEq" type="number" min="0" max="150" step="1" placeholder="100" value="' + (e.weight !== undefined ? Math.round(e.weight * 100) : "") + '">%</label>' +
      '<label>듀레이션 <input id="bkDu" type="number" min="0" max="20" step="0.1" placeholder="BM" value="' + (r.duration !== undefined ? r.duration : "") + '">년</label>' +
      '<button id="bkSave" type="button">기록</button><span class="mu">' + stamp + "</span></div>";
  }
  document.addEventListener("click", function (ev) {
    if (!ev.target || ev.target.id !== "bkSave") return;
    var eq = document.getElementById("bkEq").value, du = document.getElementById("bkDu").value;
    ev.target.disabled = true;
    fetch("/api/book", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ equity: { weight: eq === "" ? null : +eq / 100 }, rates: { duration: du === "" ? null : +du } }) })
      .then(function (r) { return r.json(); })
      .then(function () { setTimeout(function () { if (VK.main && VK.main.reload) VK.main.reload(); }, 1500); })   // 8512 re-runs against the new book
      .catch(function () { ev.target.disabled = false; });
  });

  return { paneNode: paneNode, tempBlock: tempBlock, guide: guide, newsBox: newsBox, bookForm: bookForm };
})();
