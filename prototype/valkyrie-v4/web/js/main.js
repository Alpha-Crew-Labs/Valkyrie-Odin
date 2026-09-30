/* App controller: boot → meta → state; wires chain, inspector, panes, command, shocks, signature, replay. */
"use strict";
(function () {
  var A = VK.api, V = VK.views, C = VK.chain;
  var $ = function (id) { return document.getElementById(id); };
  var SERIES = ["ktb3", "ktb10", "aa3", "bok", "ust10", "fed", "kosdaq", "kospi", "credit_bp", "curve_bp",
                "kr_cpi", "us_cpi", "taylor", "taylor_gap", "gdp_now", "ipo_demand", "loss_share", "kr_cpi_fcst",
                "kospi_risk", "kosdaq_risk", "temp_all", "temp_mac", "temp_rat", "temp_eq",
                "risk_mac_gdp", "risk_mac_uscpi", "risk_mac_krcpi", "risk_mac_fed", "risk_mac_bok", "risk_rat_ust", "risk_rat_ktb",
                "risk_rat_curve", "risk_rat_credit", "risk_eq_fin", "risk_eq_val", "risk_eq_ipo", "risk_eq_kospi"];
  var TAB_NOTE = {
    signals: "현재 수준(온도계)은 전망이 아님 · 대응은 판단 신호와 액션 플랜 · 담당 모델 반영 (8501 · 8511 · 8512)",
    impact: "24개 사전 정의 관계를 따라 재계산",
    cb: "크레딧 → CB 크로스에셋 브리지 · CB Zero Finder · 38커뮤니케이션 · NAVER (REAL)",
    log: "벤치마크 대비 상대성과 · 적중률 대신 Decision Log",
    similar: "z-score 6차원 · 코사인 유사도",
    publish: "준비 질문 CACHED · 승인 후 발간",
    node: "선택 노드 인사이트 · 수준 = 지난 1년 분포 내 현재 위치(전망 아님) · 대응은 액션 플랜",
    ask: "자연어 질문 → 엔진 시나리오 계산 → AI 해석·액션 (수치는 엔진값만)",
    market: "NAVER 증권 · 10초 폴링 · LIVE / SNAPSHOT / STALE 표시"
  };
  var S = { meta: null, dates: [], date: null, shock: {}, st: null, sel: null, tab: "signals", series: null,
            logs: null, logFilter: "ALL", similar: null, cmd: null, pubs: [], req: 0, replaying: false };

  function ctx() {
    return { st: S.st, sel: S.sel, meta: S.meta, series: S.series, logs: S.logs, logFilter: S.logFilter,
             similar: S.similar, cmd: S.cmd, pubs: S.pubs, online: A.online, feed: A.feed() };
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function banner(t1, t2) {
    var b = $("ban");
    $("ban1").textContent = t1; $("ban2").textContent = t2 || "";
    b.classList.remove("on"); void b.offsetWidth; b.classList.add("on");
  }

  /* ---------------------------------------------------------------- boot */
  function boot() {
    var lines = ["b0", "b1", "b2", "b3", "b4", "b5"], i = 0;
    return new Promise(function (res) {
      (function next() {
        if (i < lines.length) { $(lines[i++]).classList.add("s"); setTimeout(next, 150); }
        else setTimeout(res, 260);
      })();
    });
  }

  function init() {
    var bootP = boot();
    A.init().then(function (meta) {
      S.meta = meta;
      $("b3v").textContent = (A.online ? "LOCAL SERVER · " : "OFFLINE BUNDLE · ") + meta.rows + " DAYS";
      var nO = Object.keys(meta.ontology.nodes).length, nR = meta.ontology.edges.length;
      $("b1v").textContent = nO + " / " + nO; $("b2v").textContent = nR + " / " + nR;
      C.build(meta.ontology);
      C.onSelect(function (id) {
        S.sel = id;
        if (id && S.lane) { S.lane = null; odinAct(); }   // a node click ends the lane spotlight
        renderSide();
        if (id) setTab("node", true);                     // workspace follows the selected object
        else if (S.tab === "node") { openWS(false); setTab("signals"); }   // second click = deselect: insight closes
        if (!id && $("inspBox").classList.contains("on")) renderSide();
      });
      chips();
      return A.dates(meta);
    }).then(function (dates) {
      S.dates = dates;
      S.date = dates[dates.length - 1];
      timeline();
      return A.series(SERIES);
    }).then(function (s) {
      S.series = s;
      return load();
    }).then(function () {
      VK.market.init({
        getState: function () { return S.st ? Object.assign({ nowcastable: A.online && S.date === S.dates[S.dates.length - 1] }, S.st) : null; },
        onOpen: function (code) { VK.market.focus(code); setTab("market", true); },
        onUpdate: function () { if (S.tab === "market") renderPane(); VK.market.refreshStatus(); if (VK.board.open) VK.board.render(); if (S.st) freshness(S.st); if (VK.sitrep) VK.sitrep.refresh(); if (VK.brief && VK.brief.live) VK.brief.live(); },
        onNowcast: nowcast
      });
      VK.board.init({
        getState: function () { return S.st ? Object.assign({ nowcastable: A.online && S.date === S.dates[S.dates.length - 1] }, S.st) : null; },
        getSeries: function () { return S.series; },
        getTools: function () { return S.st && S.st.tools; },
        onNowcast: nowcast
      });
      return bootP;
    }).then(function () {
      $("boot").classList.add("go");
      if (location.hash !== "#chain") homeShow(true);   // the kick: start like a search engine — ask VALKYRIE first
      if (VK.brief) VK.brief.init();
      if (VK.sitrep) VK.sitrep.init({ getState: function () { return S.st; }, onOpen: function (go) { setTab(go || "signals", true); } });
      Array.prototype.forEach.call(document.querySelectorAll(".hcell.kp"), function (el) { el.onclick = function () { setTab(el.dataset.go || "signals", true); }; });
      if (VK.ask) VK.ask.init({
        onChange: function () { if (S.tab === "ask") renderPane(); },
        submit: function (q) { command(q); },
        /* the chain mirrors what the AI is looking at: scenarios as they are computed, then the answer's causal path */
        onScenario: function (sc, job) {
          if (!sc || !sc.shock || !Object.keys(sc.shock).length) return;     // base runs leave the chain as it is
          aiShow(sc.shock, sc.date, null, "AI 계산 중 · " + (sc.label || ""), true);
        },
        onDone: function (job) {
          var r = job.result;
          if (!r) return;
          if (r.apply_scenario) aiShow(r.apply_scenario.shock, r.apply_scenario.date, r.focus_nodes, "AI 답변 · " + (r.headline || "").slice(0, 60), false);
          else if (r.focus_nodes && r.focus_nodes.length) { C.highlight(r.focus_nodes); banner("AI CAUSAL PATH", r.focus_nodes.length + " OBJECTS · " + (r.headline || "").slice(0, 60)); }
        },
        onApply: function (r) {
          aiShow(r.apply_scenario ? r.apply_scenario.shock : S.shock, r.apply_scenario ? r.apply_scenario.date : null, r.focus_nodes, (r.headline || "").slice(0, 60), false);
        },
        onRecord: function (job) {
          var d = job.result.proposed_decision;
          A.addDecision({ date: S.st.date, domain: d.domain, dir: d.dir, decision: d.decision, rationale: d.rationale + " (AI 제안, 사용자 승인)", author: "RAVENS · AI" })
            .then(function () { job.recorded = S.st.date; S.logs = null; renderPane(); $("tabNote").textContent = "판단 로그에 기록됨 · " + d.dir; })
            .catch(function (e) { $("tabNote").textContent = e.message; });
        },
        onDraft: function (job) {
          var sh = job.result.apply_scenario ? job.result.apply_scenario.shock : S.shock;
          A.publish({ action: "draft", date: S.st.date, shock: sh }).then(function () { S.pubsLoaded = false; setTab("publish", true); })
            .catch(function (e) { $("tabNote").textContent = e.message; });
        }
      }).then(function (info) {
        var pr = $("cpr"), box = $("askbox");
        if (info && info.enabled) { pr.textContent = "AI ▸"; pr.classList.add("ai"); pr.title = info.model + " · 자연어 질문"; box.classList.remove("off"); }
        else { pr.textContent = "규칙 ▸"; pr.title = (info && info.reason) || "AI 비활성 · 준비 질문 3개 + 키워드 라우팅"; box.classList.add("off");
               $("cin").placeholder = "AI 비활성 (" + ((info && info.reason) || "오프라인") + ") — 준비 질문: 커브 포지션 / UST 50bp / 크레딧 52→68bp"; }
        chips();
      });
      setTab("signals");
    }).catch(function (err) {
      $("b3v").textContent = "ERROR";
      $("b5").textContent = String(err && err.message || err);
      $("b5").classList.add("s");
      console.error(err);
    });
  }

  /* ---------------------------------------------------------------- state */
  function load(opts) {
    opts = opts || {};
    var my = ++S.req;
    return A.state(S.date, S.shock).then(function (st) {
      if (my !== S.req) return;
      var prevMode = S.st && S.st.mode;
      S.st = st;
      C.update(st);
      header();
      brief();
      renderSide();
      S.similar = null;
      renderPane(true);
      if (st.mode === "WHAT-IF" && !opts.quiet) C.sparkShock();
      if (st.mode === "WHAT-IF" && prevMode !== "WHAT-IF" && !opts.quiet) banner("SHOCK APPLIED", st.shock_label + " · " + S.meta.ontology.edges.length + " RELATIONS RECOMPUTED");
    });
  }

  function header() {
    var st = S.st;
    $("asof").textContent = st.date;
    var mode = st.offline ? "OFFLINE · " + st.mode : st.mode;
    $("mode").innerHTML = '<i class="dot' + (st.offline ? " off" : st.mode === "WHAT-IF" ? " wi" : "") + '"></i><span>' + mode + "</span>";
    if (VK.market) VK.market.refreshStatus();
    kpis(st);
    homeStat();
    var cf = [];
    if (st.conflict) cf.push(st.conflict);
    (st.replay_conflicts || []).forEach(function (c) { cf.push("REPLAY: " + c.text); });
    ((st.tools && st.tools.conflicts) || []).forEach(function (c) { cf.push("교차검증: " + c); });
    railInfo(st);
    var conf = $("conf");
    conf.title = cf.join("\n");
    var was = conf.classList.contains("on");
    conf.classList.toggle("on", cf.length > 0);
    if (cf.length && !was) { conf.classList.remove("on"); void conf.offsetWidth; conf.classList.add("on"); }
    $("snl").textContent = st.date + (S.meta.snapshot_dates.indexOf(st.date) >= 0 || snapIndex(st.date) >= 0 ? " · SNAPSHOT" : " · DAILY");
    // timeline position (S.date is the requested date; offline it is a snapshot date, the state may resolve earlier)
    var i = S.dates.indexOf(S.date);
    if (i < 0) i = nearestIdx(S.date);
    $("tlr").value = i;
    markTicks();
  }

  /* owner-model verdicts on the research rail (same date as the chain) */
  function railInfo(st) {
    if (!VK.rail || !st.tools) return;
    var tone = { AGREE: "ok", PARTIAL: "pt", CONFLICT: "cf", NA: "na" }, m = {};
    st.tools.items.forEach(function (i) {
      m[i.port] = { tone: tone[i.match] || "na", text: i.verdict + (i.score !== undefined && i.score !== null ? " " + (+i.score).toFixed(2) : "") + " · " +
        ({ AGREE: "VALKYRIE 반영", PARTIAL: "참고", CONFLICT: "VALKYRIE와 충돌", NA: "대기" }[i.match] || "") };
    });
    VK.rail.setInfo(m);
  }

  /* header KPIs: current level, the three calls, owner-model agreement, data freshness */
  function kpis(st) {
    var rk = st.risk || {}, t = rk.temps && rk.temps.all;
    $("kpTemp").textContent = t === null || t === undefined ? "—" : Math.round(t);
    $("kpTemp").style.color = VK.fmt.riskColor(t === null || t === undefined ? null : t / 100);
    $("kpBar").style.width = (t || 0) + "%";
    $("kpLab").textContent = (rk.label || "—") + (st.mode === "WHAT-IF" ? " · WHAT-IF " + st.shock_label : "");
    var tone = { HAWKISH: "am", SHORT: "am", AVOID: "rd", SELECTIVE: "am", DOVISH: "gr", LONG: "gr", ENGAGE: "gr", NEUTRAL: "mu" }, sg = st.signals;
    $("kpSig").innerHTML = [["매크로", sg.macro.dir], ["채권", sg.rates.dir], ["주식", sg.equity.dir]].map(function (x) {
      return '<span class="kd ' + (tone[x[1]] || "mu") + '"><small>' + x[0] + "</small>" + x[1] + "</span>";
    }).join("");
    var T = st.tools || {}, items = T.items || [], agree = T.agree || 0, all = agree === (items.length || 3);
    $("kpMatch").innerHTML = "<b class='" + (all ? "ok" : "pt") + "'>" + agree + "/" + (items.length || 3) + "</b>" +
      (all ? " <span class='mu'>반영</span>" : " <span class='am'>일부 반영</span>");
    $("kpMatch").title = items.map(function (i) { return i.owner + " " + i.app + ": " + i.verdict + " · " + (i.matchText || ""); }).join("\n");
    freshness(st);
  }
  function freshness(st) {
    var m = VK.market && VK.market.state, mb = m && m.sets.market_board, stat = (m && m.status.market_board) || {};
    var src = st && st.offline ? "SNAPSHOT" : (mb ? mb.source : "—"), age = stat.ageSec !== undefined ? stat.ageSec : (mb && mb.ageSec);
    var cls = src === "LIVE" ? "live" : src === "STALE" ? "stale" : "snap";
    var ago = age === undefined || age === null ? "" : age < 60 ? age + "s" : age < 3600 ? Math.round(age / 60) + "m" : Math.round(age / 3600) + "h";
    $("kpFresh").innerHTML = "<span class='fs " + cls + "'><i></i>NAVER " + src + (ago ? " · " + ago : "") + "</span>" +
      "<span class='fs snap' title='ECOS · FRED 일별 데이터 기준일'><i></i>EOD " + ((st && st.date) || "").slice(5) + "</span>";
  }

  function brief() {
    if (VK.sitrep) VK.sitrep.refresh();
  }

  function renderSide() {
    if (!S.st) return;
    $("insp").innerHTML = V.inspector(ctx());
    var n = S.sel && S.meta.ontology.nodes[S.sel];
    $("hud").textContent = n ? "ACQUIRED · " + n.label + " · " + n.owner : "NO OBJECT ACQUIRED";
    if (n) {
      var ins = S.meta.ontology.edges.filter(function (e) { return e.to === S.sel; }).length;
      var outs = S.meta.ontology.edges.filter(function (e) { return e.from === S.sel; }).length;
      $("flowInfo").textContent = "IN " + ins + " · OUT " + outs + " · 상·하류 인과 경로 강조";
    } else {
      $("flowInfo").textContent = "24 RELATIONS · β 표시: 노드 선택";
    }
  }

  /* ---------------------------------------------------------------- panes */
  function autoTab(id) {
    if (/^eq_(cb|ipo|fin)$/.test(id)) setTab("cb");
    else if (/^sig_/.test(id)) setTab("signals");
    else renderPane();
  }

  /* ---------------------------------------------------------------- drawers */
  var TAB_NAME = { signals: "판단 3종", impact: "충격 영향표", cb: "CB · IPO", log: "판단 로그", similar: "유사 국면", publish: "명령 · 발간", market: "LIVE 마켓", node: "노드 인사이트", ask: "AI 어시스턴트" };
  function openWS(on) {
    if (on === undefined) on = !$("ws").classList.contains("on");
    $("ws").classList.toggle("on", on);
    var b = $("wsBtn");
    b.classList.toggle("on", on);
    b.innerHTML = (on ? "▼" : "▲") + " WORKSPACE<span class='ct'>" + (TAB_NAME[S.tab] || "") + "</span>";
    fitChain();
  }
  function openInsp(on) {
    if (on === undefined) on = !$("inspBox").classList.contains("on");
    $("inspBox").classList.toggle("on", on);
    $("inBtn").classList.toggle("on", on);
    $("inBtn").textContent = on ? "INSPECTOR ▸" : "INSPECTOR ◂";
    fitChain();
  }
  /* The chain re-fits into the space the open drawers leave, so no node hides behind a drawer. */
  function fitChain() {
    var svg = $("chain"), cw = $("cw").getBoundingClientRect(), ws = $("ws"), ib = $("inspBox");
    // workspace sits right above the command bar so shocks/commands stay usable while it is open
    var cmdTop = document.querySelector(".cmd").getBoundingClientRect().top;
    ws.style.bottom = Math.round(innerHeight - cmdTop + 6) + "px";
    ws.style.height = Math.round(Math.min(440, Math.max(200, (cmdTop - cw.top) * 0.62))) + "px";
    var right = ib.classList.contains("on") ? ib.offsetWidth + 6 : 0;
    var bottom = 0;
    if (ws.classList.contains("on")) {
      var wsTop = innerHeight - parseFloat(getComputedStyle(ws).bottom) - ws.offsetHeight;   // final, not mid-animation
      bottom = Math.max(0, Math.min(cw.height - 150, cw.bottom - wsTop + 6));
    }
    svg.style.width = Math.max(200, cw.width - right) + "px";
    svg.style.height = Math.max(150, cw.height - bottom) + "px";
    $("ban").style.left = "calc(50% - " + right / 2 + "px)";
    $("ban").style.top = "calc(50% - " + bottom / 2 + "px)";
  }
  window.addEventListener("resize", fitChain);

  function setTab(t, open) {
    S.tab = t;
    if (open) openWS(true);
    else openWS($("ws").classList.contains("on"));   // refresh the button label
    Array.prototype.forEach.call(document.querySelectorAll("#tabs .tab"), function (el) { el.classList.toggle("act", el.dataset.t === t); });
    renderPane(true);
  }

  /* ODIN tabs above the chain only ever show the chain: 매크로/채권/코스닥 주식 spotlight that lane (drawers close),
     인텔리전스 체인 shows everything. Workspace tabs are opened from their own buttons. */
  var LANE = { signals: ["mac_", "sig_macro"], impact: ["rat_", "sig_rates"], cb: ["eq_", "sig_equity"] };
  function odinAct() {
    Array.prototype.forEach.call(document.querySelectorAll("#odinTabs span"), function (el) {
      el.classList.toggle("act", (el.dataset.go === "chain" && !S.lane) || el.dataset.go === S.lane);
    });
  }
  function setLane(go) {
    S.lane = LANE[go] ? go : null;
    openWS(false); openInsp(false);
    C.select(null, true); S.sel = null; renderSide();
    var ids = S.lane ? Object.keys(S.meta.ontology.nodes).filter(function (id) { return id.indexOf(LANE[S.lane][0]) === 0 || id === LANE[S.lane][1]; }) : [];
    C.highlight(ids);
    odinAct();
  }

  function renderPane(anim) {
    if (!S.st) return;
    var t = S.tab, pane = $("pane");
    $("tabNote").textContent = TAB_NOTE[t] || "";
    var need = null;
    if (t === "log" && !S.logs) need = A.decisions(S.date).then(function (l) { S.logs = l; });
    if (t === "similar" && !S.similar) need = A.similar(S.date, S.shock).then(function (s) { S.similar = s; });
    if (t === "publish" && A.online && !S.pubsLoaded) need = A.publishList().then(function (p) { S.pubs = p; S.pubsLoaded = true; });
    pane.innerHTML = V.pane(t, ctx());
    if (t === "log" && S.logs) logNote();
    if (anim) { pane.classList.remove("sw"); void pane.offsetWidth; pane.classList.add("sw"); }
    if (need) need.then(function () { if (S.tab === t) { pane.innerHTML = V.pane(t, ctx()); if (t === "log") logNote(); } })
      .catch(function (e) { $("tabNote").textContent = "오류: " + e.message; });
  }

  function logNote() {
    var fin = (S.logs || []).filter(function (l) { return l.source === "SIMULATED" && l.vs_bm !== null; });
    if (!fin.length) return;
    var avg = fin.reduce(function (a, l) { return a + l.vs_bm; }, 0) / fin.length;
    $("tabNote").textContent = "SIMULATED " + fin.length + "건 BM 대비 평균 " + VK.fmt.sg(avg) + "bp · 투자 권유 아님";
  }

  /* ---------------------------------------------------------------- controls */
  /* command bar: compact example questions + SHOCK keywords (AI on: insert into the question; AI off: apply to the engine) */
  var EXAMPLES = [["지금 주식 상황은?", "지금 주식 상황 설명해줘"], ["커브 포지션?", "지금 커브 포지션 어떻게 가져가나?"],
                  ["채권 액션 플랜", "오늘 채권 데스크 액션 플랜 요약해줘"], ["코스피 비중?", "코스피 비중 얼마로 가져가야 해?"],
                  ["CB 리스크?", "코스닥 CB 차환 리스크 어떻게 봐?"], ["IPO 청약?", "이번 주 IPO 청약 스탠스는?"],
                  ["코스피 1개월 전망?", "코스피 한 달 뒤 전망은? 경로별로 판단해줘"]];
  var KEYWORDS = ["UST +50bp", "UST −25bp", "US CPI +30bp", "BOK −25bp", "BOK +25bp", "크레딧 80bp", "GDP −50bp"];
  function parseKw(kw) {
    var m = kw.replace("−", "-").match(/^(UST|US CPI|BOK|GDP|크레딧)\s*([+-]?\d+)bp$/), key = { UST: "ust", "US CPI": "uscpi", BOK: "bok", GDP: "gdp", "크레딧": "credit_level" };
    if (!m) return null;
    var o = {}; o[key[m[1]]] = +m[2]; return o;
  }
  function chips() {
    var q = $("qchips"), ai = VK.ask && VK.ask.enabled;
    q.innerHTML = "";
    (ai ? EXAMPLES : (S.meta.questions || []).map(function (x) { return [x.q.length > 18 ? x.q.slice(0, 18) + "…" : x.q, x.q]; })).forEach(function (x) {
      var c = document.createElement("span");
      c.className = "cp"; c.textContent = x[0]; c.title = x[1];
      c.onclick = function () { $("cin").value = x[1]; command(x[1]); };
      q.appendChild(c);
    });
    var k = $("kchips");
    k.innerHTML = "";
    KEYWORDS.forEach(function (kw) {
      var c = document.createElement("span");
      c.className = "cp kc"; c.textContent = kw;
      c.title = ai ? "질문에 삽입 (Enter로 AI에게 질문)" : "엔진에 직접 적용";
      c.onclick = function () {
        if (ai) {
          var i = $("cin"), v = i.value.replace(/\s+$/, "");
          i.value = (v ? v + " " : "") + kw + " ";
          i.focus();
        } else {
          var sh = parseKw(kw) || {};
          S.shock = sameShock(S.shock, sh) ? {} : sh;
          S.nowcast = null; S.cmd = null;
          clearInputs(); markPresets();
          load().then(function () { if (Object.keys(S.shock).length) setTab("impact", true); });
        }
      };
      k.appendChild(c);
    });
  }
  function applyPreset(k) {
    var same = sameShock(S.shock, S.meta.presets[k].shock);
    S.shock = same ? {} : JSON.parse(JSON.stringify(S.meta.presets[k].shock));
    S.nowcast = null; S.cmd = null;
    clearInputs(); markPresets();
    load().then(function () { setTab("impact", true); });
  }  function sameShock(a, b) {
    var ka = Object.keys(a || {}), kb = Object.keys(b || {});
    return ka.length === kb.length && ka.every(function (k) { return +a[k] === +b[k]; });
  }
  function markPresets() {
    Array.prototype.forEach.call(document.querySelectorAll("#stress .cp[data-k]"), function (c) {
      c.classList.toggle("on", Object.keys(S.shock).length > 0 && sameShock(S.shock, S.meta.presets[c.dataset.k].shock));
    });
  }
  function clearInputs() { ["shUst", "shCpi", "shBok", "shCr"].forEach(function (i) { if ($(i)) $(i).value = ""; }); }

  function applyCustom() {
    var sh = {}, m = { shUst: "ust", shCpi: "uscpi", shBok: "bok", shCr: "credit_level" };
    Object.keys(m).forEach(function (id) { var v = $(id) ? parseFloat($(id).value) : NaN; if (!isNaN(v) && v !== 0) sh[m[id]] = v; });
    S.shock = sh;
    S.cmd = null;
    S.nowcast = null;
    markPresets();
    load().then(function () {
      if (Object.keys(sh).length) setTab("impact", true);
      if (S.st.offlineNote) $("tabNote").textContent = S.st.offlineNote;
    });
  }

  /* LIVE NOWCAST: intraday UST move vs the engine's EOD (FRED) level, applied as a UST shock on the latest date */
  function nowcast(n) {
    stopReplay();
    S.shock = { ust: n.bp };
    S.nowcast = n;
    S.cmd = null;
    clearInputs(); markPresets();
    load({ quiet: true }).then(function () {
      C.sparkShock();
      banner("LIVE NOWCAST", "장중 UST " + n.live.toFixed(3) + "% − EOD " + n.eod.toFixed(3) + "% = " + VK.fmt.sg(n.bp) + "bp → " + S.meta.ontology.edges.length + " RELATIONS");
      setTab("impact", true);
    });
  }

  /* apply an AI-chosen scenario to the chain (shock + optional date), then highlight its causal path */
  function aiShow(shock, date, focus, label, live) {
    stopReplay();
    S.nowcast = null; S.cmd = null;
    S.shock = shock || {};
    if (date) S.date = nearestDate(date);
    clearInputs(); markPresets();
    return load({ quiet: true }).then(function () {
      if (focus && focus.length) C.highlight(focus);
      if (Object.keys(S.shock).length) C.sparkShock();
      banner(live ? "AI SCENARIO · LIVE" : "AI SCENARIO ON CHAIN", (S.st.shock_label || "충격 없음") + (label ? " · " + label : ""));
      if (S.tab === "ask") renderPane();
    });
  }

  /* ---------------------------------------------------------------- HOME: ask first (Google-style start), then the chain */
  var HOME_PH = ["미국 10년물이 30bp 오르면 채권 데스크는 뭘 해야 해?", "지금 코스피 비중 얼마로 가져가야 해?", "BOK가 25bp 내리면 코스닥 IPO 청약은?",
                 "오늘 주목해야 할 섹터는?", "크레딧이 80bp로 벌어지면 CB 포지션은?", "오늘 3개 데스크 액션 플랜 한 줄씩"];
  var homePh = 0, homeTimer = null;
  function homeShow(on) {
    var h = $("home"); if (!h) return;
    on = on !== false;
    h.classList.toggle("on", on);
    clearInterval(homeTimer); homeTimer = null;
    if (!on) return;
    $("homeQ").placeholder = HOME_PH[homePh];
    homeTimer = setInterval(function () { homePh = (homePh + 1) % HOME_PH.length; $("homeQ").placeholder = HOME_PH[homePh]; }, 3500);
    setTimeout(function () { try { $("homeQ").focus(); } catch (e) {} }, 350);
    homeStat();
  }
  function homeStat() {
    var st = S.st, esc = VK.views.esc;
    if (!st || !$("homeCalls")) return;
    var sg = st.signals, T = st.tools || {};
    $("homeCalls").innerHTML = [["매크로 · " + sg.macro.owner, sg.macro.call, "signals"], ["채권 · " + sg.rates.owner, sg.rates.call, "impact"], ["주식 · " + sg.equity.owner, sg.equity.call, "cb"]]
      .map(function (x) { return '<div class="hm-call" data-go="' + x[2] + '" title="오늘의 결론 · 클릭: 체인과 근거"><em>' + esc(x[0]) + "</em><b>" + esc(x[1]) + "</b></div>"; }).join("");
    $("homeStat").textContent = "EOD " + st.date + " · 담당 모델 반영 " + (T.agree || 0) + "/3 · " + (st.offline ? "OFFLINE 번들" : "NAVER LIVE") + " · 질문하면 체인이 판단합니다";
  }
  function homeSubmit(q) {
    q = (q || $("homeQ").value || "").trim();
    homeShow(false);
    if (!q) return;
    $("homeQ").value = "";
    $("cin").value = q;
    command(q);
  }
  function homeWire() {
    if (!$("home")) return;
    $("homeForm").addEventListener("submit", function (e) { e.preventDefault(); homeSubmit(); });
    $("homeSkip").addEventListener("click", function (e) { e.preventDefault(); homeShow(false); });
    $("homeCalls").addEventListener("click", function (e) { var t = e.target.closest("[data-go]"); if (t) { homeShow(false); setTab(t.dataset.go, true); } });
    var ch = $("homeChips");
    EXAMPLES.forEach(function (x) { var c = document.createElement("span"); c.textContent = x[1]; c.onclick = function () { homeSubmit(x[1]); }; ch.appendChild(c); });
    var nav = document.querySelector(".odin-nav span"), lg = document.querySelector(".hd .lg");
    if (nav) { nav.style.cursor = "pointer"; nav.title = "VALKYRIE 홈 (질문으로 시작)"; nav.onclick = function () { homeShow(true); }; }
    if (lg) { lg.style.cursor = "pointer"; lg.title = "VALKYRIE 홈 (질문으로 시작)"; lg.onclick = function () { homeShow(true); }; }
  }

  function command(q) {
    q = (q || "").trim();
    if (!q) return;
    if (VK.ask && VK.ask.enabled) {            // free-form questions go to the AI assistant; numbers still come from the engine
      VK.ask.submit(q, S.date === S.dates[S.dates.length - 1] ? null : S.date, S.shock);
      $("cin").value = "";
      setTab("ask", true);
      return;
    }
    A.command(S.date, q).then(function (res) {
      S.cmd = res;
      var hasShock = res.shock && Object.keys(res.shock).length;
      S.shock = hasShock ? res.shock : {};
      S.nowcast = null;
      clearInputs();
      markPresets();
      return load({ quiet: true }).then(function () {
        C.highlight(res.path || []);
        banner("COMMAND RESOLVED", res.mode + " · " + (res.path || []).length + " OBJECTS");
        setTab("publish", true);
      });
    });
  }

  function reset() {
    stopReplay();
    S.shock = {}; S.sel = null; S.cmd = null; S.nowcast = null;
    clearInputs(); markPresets();
    $("cin").value = "";
    C.select(null, true);
    S.date = S.dates[S.dates.length - 1];
    S.logs = null;
    openWS(false); openInsp(false);
    load({ quiet: true }).then(function () { setTab("signals"); });
  }

  function signature() {
    var b = $("sigBtn");
    b.disabled = true;
    banner("RUN SIGNATURE", "MACRO → RATES → EQUITY · " + S.st.date);
    C.signature().then(function () {
      var sg = S.st.signals;
      banner("SIGNAL LOCK", sg.macro.dir + " · " + sg.rates.dir + " · " + sg.equity.dir);
      setTab("signals", true);
      b.disabled = false;
    });
  }

  /* ---------------------------------------------------------------- timeline / replay */
  function snapIndex(d) {
    var sd = S.meta.snapshot_dates;
    for (var i = 0; i < sd.length; i++) if (nearestDate(sd[i]) === d) return i;
    return -1;
  }
  function nearestIdx(d) {
    var i = S.dates.length - 1;
    while (i > 0 && S.dates[i] > d) i--;
    return i;
  }
  function nearestDate(d) { return S.dates[nearestIdx(d)]; }

  function timeline() {
    var r = $("tlr"), n = S.dates.length;
    r.min = 0; r.max = n - 1; r.value = n - 1;
    var tks = $("tks");
    tks.innerHTML = "";
    var real = "2026-05-04", lastPos = -99, flip = false;
    S.meta.snapshot_dates.forEach(function (d) {
      var i = nearestIdx(d);
      var pos = n > 1 ? i / (n - 1) * 100 : 50;
      var t = document.createElement("div");
      t.className = "tk" + (d === real ? " real" : "");
      t.style.left = pos + "%";
      t.dataset.d = S.dates[i];
      t.title = d + (d === real ? " · REAL 판단 발신일" : "");
      flip = pos - lastPos < 3.5 ? !flip : false;   // alternate label above/below when ticks crowd
      lastPos = pos;
      t.innerHTML = "<i></i><div class='tkl'" + (flip ? " style='top:-14px'" : "") + ">" + d.slice(5) + "</div>";
      t.onclick = function () { stopReplay(); goDate(S.dates[i]); };
      tks.appendChild(t);
    });
    var tm = null;
    r.addEventListener("input", function () {
      stopReplay();
      var d = S.dates[+r.value];
      $("snl").textContent = d + " …";
      clearTimeout(tm);
      tm = setTimeout(function () { goDate(d); }, 140);
    });
  }
  function markTicks() {
    Array.prototype.forEach.call(document.querySelectorAll("#tks .tk"), function (t) { t.classList.toggle("on", t.dataset.d === S.date); });
  }
  function goDate(d) {
    if (S.nowcast) { S.nowcast = null; S.shock = {}; markPresets(); }   // a nowcast only belongs to the latest date
    S.date = d;
    S.logs = null;
    S.pubsLoaded = false;
    return load({ quiet: true });
  }

  function stopReplay() {
    if (!S.replaying) return;
    S.replaying = false;
    $("rpBtn").textContent = "◀ REPLAY";
  }
  function replay() {
    if (S.replaying) return stopReplay();
    S.replaying = true;
    $("rpBtn").textContent = "■ STOP";
    S.shock = {}; clearInputs(); markPresets();
    var ds = S.meta.snapshot_dates.map(nearestDate), i = 0;
    setTab("signals");
    (function next() {
      if (!S.replaying) return;
      if (i >= ds.length) { stopReplay(); return; }
      var d = ds[i++];
      banner("REPLAY · " + d, "SNAPSHOT " + i + " / " + ds.length + " · 당시 관측 가능한 데이터만 사용 (PIT)");
      goDate(d).then(function () { return sleep(2300); }).then(next);
    })();
  }

  /* ---------------------------------------------------------------- delegated clicks */
  function onPaneClick(ev) {
    var t = ev.target.closest("[data-sel],[data-act]");
    if (!t) return;
    if (t.dataset.sel) { C.select(t.dataset.sel); return; }
    var act = t.dataset.act;
    if (act === "logf") { S.logFilter = t.dataset.v; renderPane(); }
    else if (act === "preset") applyPreset(t.dataset.k);
    else if (act === "applyCustom") applyCustom();
    else if (act === "clearShock") { S.shock = {}; S.nowcast = null; S.cmd = null; clearInputs(); markPresets(); load({ quiet: true }); }
    else if (act === "unfocus") { VK.market.focus(null); renderPane(); }
    else if (act === "ask") { $("cin").value = t.dataset.q; command(t.dataset.q); }
    else if (act === "logadd") {
      var body = { date: S.st.date, domain: $("lgDom").value, dir: $("lgDir").value,
                   decision: $("lgDec").value.trim(), rationale: $("lgWhy").value.trim(), author: "RAVENS" };
      if (!body.decision) { $("lgDec").focus(); return; }
      A.addDecision(body).then(function () { S.logs = null; S.logFilter = "USER"; renderPane(); })
        .catch(function (e) { $("tabNote").textContent = e.message; });
    } else if (act === "draft" || act === "submit" || act === "approve" || act === "reject") {
      var p = act === "draft" ? { action: "draft", date: S.st.date, shock: S.shock } : { action: act, id: t.dataset.id, by: "RAVENS 리서치센터" };
      A.publish(p).then(function () { S.pubsLoaded = false; renderPane(); })
        .catch(function (e) { $("tabNote").textContent = e.message; });
    }
  }

  function wire() {
    Array.prototype.forEach.call(document.querySelectorAll("#tabs .tab"), function (el) { el.onclick = function () { setTab(el.dataset.t); }; });
    Array.prototype.forEach.call(document.querySelectorAll("#odinTabs span"), function (el) { el.onclick = function () { setLane(el.dataset.go); }; });
    $("pane").addEventListener("click", function (e) { if (!(VK.ask && VK.ask.onClick(e))) onPaneClick(e); });
    $("insp").addEventListener("click", onPaneClick);
    $("cin").addEventListener("keydown", function (e) { if (e.key === "Enter") command(e.target.value); });
    $("askGo").onclick = function () { command($("cin").value); };
    homeWire();
    $("pane").addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target.closest && e.target.closest("#stress .custom")) applyCustom(); });
    $("sigBtn").onclick = signature;
    $("rstBtn").onclick = reset;
    $("rpBtn").onclick = replay;
    $("mkBoard").onclick = function () { VK.board.toggle(); };
    $("wsBtn").onclick = function () { openWS(); };
    $("wsClose").onclick = function () { openWS(false); };
    $("inBtn").onclick = function () { openInsp(); };
    $("inClose").onclick = function () { C.select(null, true); S.sel = null; renderSide(); openInsp(false); };
    document.addEventListener("keydown", function (e) {
      var typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
      if (e.key === "Escape") {
        if ($("home") && $("home").classList.contains("on")) homeShow(false);
        else if (VK.board.open) VK.board.toggle(false);
        else if ($("inspBox").classList.contains("on")) { C.select(null); openInsp(false); }
        else if ($("ws").classList.contains("on")) openWS(false);
        else C.select(null);
      } else if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key === "g" || e.key === "G") VK.board.toggle();
        else if (e.key === "w" || e.key === "W") openWS();
        else if (e.key === "i" || e.key === "I") openInsp();
      }
    });
    function clock() {
      var d = new Date(Date.now() + 9 * 3600e3);
      $("clock").textContent = d.toISOString().slice(11, 19) + " KST";
    }
    clock(); setInterval(clock, 1000);
  }

  VK.main = {   // small surface for other modules (insight.js book record, brief.js navigation / what-if apply)
    reload: function () { return load({ quiet: true }); },
    open: function (t) { setTab(t, true); },
    applyShock: function (shock, label) { return aiShow(shock, null, null, label); }
  };

  wire();
  init();
})();
