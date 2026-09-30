/* AI decision assistant (Claude via the local server): natural-language question -> engine scenarios -> action plan.
   Renders a decision console (not a chat): question, trace of what was computed, verdict, actions with sizes,
   risks, checkpoints, and one-click "apply to chain" / "record decision". Numbers all come from the engine. */
"use strict";
var VK = window.VK || {};
window.VK = VK;

VK.ask = (function () {
  var esc = function (s) { return VK.views.esc(s); };
  var info = { enabled: false }, items = [], timer = null, onApply = null, onRecord = null, onChange = null, onScenario = null, onDone = null;
  var SUGGEST = [["UST +50bp → IPO?", "UST가 50bp 오르면 코스닥 IPO는?"], ["크레딧 52→68bp → CB?", "크레딧이 52bp에서 68bp로 벌어지면 CB는?"],
                 ["BOK −25bp → 듀레이션?", "BOK가 25bp 인하하면 듀레이션은?"], ["3개 데스크 액션 요약", "오늘 3개 데스크 액션 플랜을 한 줄씩 요약해줘"],
                 ["담당 모델 충돌?", "VALKYRIE 판단과 담당 모델 판정이 충돌하는 곳과 이유는?"]];

  /* markdown-lite over escaped text: **bold**, `code`, headings, bullets */
  function md(s) {
    var lines = esc(s || "").split(/\r?\n/), out = [], inList = false;
    lines.forEach(function (l) {
      var t = l.trim();
      var isLi = /^[-*•]\s+/.test(t);
      if (inList && !isLi) { out.push("</ul>"); inList = false; }
      if (!t) return;
      t = t.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`([^`]+)`/g, "<code>$1</code>")
           .replace(/\[(VALKYRIE|8511[^\]]*|8512[^\]]*|8501[^\]]*|NAVER[^\]]*|NEWS|뉴스|잠정)\]/g, '<span class="src">$1</span>');
      if (/^(SITUATION|CAUSAL PATH|EVIDENCE|CROSS-CHECK|PATHS|JUDGEMENT|ACTION|RISK|TRIGGER|VERDICT)\s*:?$/.test(t)) out.push('<div class="ai-h tag">' + t.replace(/:$/, "") + "</div>");
      else if (/^#{1,3}\s+/.test(t)) out.push('<div class="ai-h">' + t.replace(/^#{1,3}\s+/, "") + "</div>");
      else if (isLi) { if (!inList) { out.push("<ul>"); inList = true; } out.push("<li>" + t.replace(/^[-*•]\s+/, "") + "</li>"); }
      else out.push("<p>" + t + "</p>");
    });
    if (inList) out.push("</ul>");
    return out.join("");
  }
  var URG = { "즉시": "rd", "이번 주": "am", "모니터링": "mu" };
  var DIRC = { SHORT: "am", LONG: "gr", NEUTRAL: "mu", AVOID: "rd", SELECTIVE: "am", ENGAGE: "gr" };

  function trace(job) {
    var K = { route: "ROUTE", tool: "ENGINE", update: "MODEL", note: "MODEL", done: "DONE", error: "ERROR" };
    return '<div class="ai-tr">' + (job.trace || []).map(function (t) {
      return '<div class="ai-t k-' + esc(t.kind) + '"><em>' + esc(t.t) + "</em><b>" + esc(K[t.kind] || t.kind) + "</b><span>" + esc(t.text) + "</span></div>";
    }).join("") + (job.status === "running" ? '<div class="ai-t k-run"><em></em><b>…</b><span>' + esc(job.model || info.model || "") + " 작성 중</span></div>" : "") + "</div>";
  }

  function result(job) {
    var r = job.result;
    if (!r) return "";
    var h = '<div class="ai-hd"><div class="ai-headline">' + esc(r.headline) + '</div><div class="ai-conf"><span class="ml">CONF</span><b>' + r.confidence + "</b></div></div>";
    h += '<div class="ai-body">' + md(r.interpretation) + "</div>";
    if (r.actions && r.actions.length) {
      h += '<div class="sec-t">액션 플랜 · 데스크별</div><div class="ai-acts">' + r.actions.map(function (a) {
        return '<div class="ai-a"><div class="ai-a1"><span class="chip">' + esc(a.desk) + '</span><span class="chip u-' + (URG[a.urgency] || "mu") + '">' + esc(a.urgency) + "</span><b>" + esc(a.action) + "</b></div>" +
          (a.size ? '<div class="ai-a2">' + esc(a.size) + "</div>" : "") + '<div class="ai-a3">' + esc(a.rationale) + " <em>· " + esc(a.source) + "</em></div></div>";
      }).join("") + "</div>";
    }
    if (r.risks && r.risks.length) h += '<div class="sec-t">리스크 · 반대 근거</div><ul class="ai-ul rk">' + r.risks.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>";
    if (r.checkpoints && r.checkpoints.length) h += '<div class="sec-t">체크포인트 · 판단이 바뀌는 조건</div><ul class="ai-ul cp">' + r.checkpoints.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>";
    var btns = "";
    if (r.apply_scenario || (r.focus_nodes && r.focus_nodes.length)) btns += '<button class="btn sm g" data-ai="apply" data-id="' + esc(job.id) + '" title="이 답의 시나리오·경로를 체인에 다시 표시">↻ 체인 다시 표시' + (r.apply_scenario ? " · " + esc(shockLabel(r.apply_scenario.shock)) : "") + "</button>";
    if (r.proposed_decision) btns += '<button class="btn sm g" data-ai="record" data-id="' + esc(job.id) + '" title="' + esc(r.proposed_decision.decision) + '">✎ 판단 로그에 기록 (' + esc(r.proposed_decision.dir) + ")</button>";
    btns += '<button class="btn sm g" data-ai="draft" data-id="' + esc(job.id) + '">발간 초안</button>';
    h += '<div class="ai-btns">' + btns + (job.recorded ? '<span class="chip USER">기록됨 · ' + esc(job.recorded) + "</span>" : "") +
      '<span class="ai-cost">' + (job.cost_usd !== undefined ? "≈$" + job.cost_usd.toFixed(3) + " · " : "") + esc(job.model || "") + (r.unstructured ? " · 비구조화 응답" : "") + "</span></div>";
    return h;
  }
  function shockLabel(s) {
    var L = { ust: "UST", uscpi: "US CPI", gdp: "GDP", bok: "BOK", credit_level: "크레딧" };
    return Object.keys(s || {}).map(function (k) { return L[k] + " " + (k === "credit_level" ? s[k] + "bp" : (s[k] > 0 ? "+" : "") + s[k] + "bp"); }).join(" · ") || "충격 없음";
  }

  function item(job, i) {
    var st = job.status;
    return '<div class="ai-item s-' + esc(st) + '" data-job="' + esc(job.id) + '"><div class="ai-q"><span class="ml">Q' + (items.length - i) + "</span><b>" + esc(job.question) + "</b>" +
      '<span class="ai-meta">' + esc((job.startedAt || "").slice(11, 16)) + (job.date ? " · 기준 " + esc(job.date) : "") + (job.shock && Object.keys(job.shock).length ? " · 화면 충격 " + esc(shockLabel(job.shock)) : "") + "</span>" +
      '<button class="dx" data-ai="toggle" data-id="' + esc(job.id) + '" title="계산 과정">' + (job.showTrace || st !== "done" ? "▾" : "▸") + "</button></div>" +
      (job.showTrace || st !== "done" ? trace(job) : "") +
      (st === "error" ? '<div class="banner">' + esc(job.error) + "</div>" : "") + result(job) + "</div>";
  }

  function pane(ctx) {
    if (!info.enabled) {
      return '<div class="cd"><div class="cdh"><span class="cdt">AI 어시스턴트</span><span class="cdo">' + esc(info.reason || "비활성") + "</span></div>" +
        '<div class="note">Claude API 연결이 없어 준비 질문 3개와 키워드 라우팅(규칙)으로 답합니다. 서버의 .env에 ANTHROPIC_API_KEY를 넣고 재시작하면 자연어 질문이 켜집니다.</div></div>';
    }
    var h = '<div class="ai-top"><span class="ml">AI 의사결정 어시스턴트</span><span class="ml2">' + esc(info.model) + " · 숫자는 전부 VALKYRIE 엔진·담당 모델 계산값 · 해석·액션 문구만 AI가 작성</span>" +
      '<span class="ai-sug">' + SUGGEST.map(function (q) { return '<span class="cp" data-ai="ask" data-q="' + esc(q[1]) + '" title="' + esc(q[1]) + '">' + esc(q[0]) + "</span>"; }).join("") + "</span></div>";
    if (!items.length) h += '<div class="note">위 명령창에 자연어로 질문하세요. 예: "미국 10년물이 30bp 오르면 채권 데스크는 뭘 해야 해?" · what-if는 엔진이 시나리오를 계산하고, AI가 인과 경로와 액션으로 풀어 줍니다.</div>';
    var sorted = items.slice().sort(function (a, b) { return String(b.startedAt || "").localeCompare(String(a.startedAt || "")); });   // newest first, always
    return h + sorted.map(item).join("");
  }

  /* ------------------------------------------------------------ flow */
  function submit(q, date, shock) {
    q = (q || "").trim();
    if (!q || !info.enabled) return Promise.resolve(false);
    return VK.api.ask(q, date, shock).then(function (r) {
      items.unshift({ id: r.id, question: q, status: "running", trace: [], date: date, shock: shock, startedAt: new Date().toISOString(), showTrace: true });
      busy(true);
      if (onChange) onChange();
      poll();
      return true;
    });
  }
  function busy(on) { var b = document.getElementById("askbox"), s = document.getElementById("askStatus"); if (b) b.classList.toggle("busy", !!on); if (s) s.textContent = on ? "THINKING" : "READY"; }
  function poll() {
    clearTimeout(timer);
    var running = items.filter(function (j) { return j.status === "running"; });
    busy(running.length > 0);
    if (!running.length) return;
    Promise.all(running.map(function (j) {
      return VK.api.askJob(j.id).then(function (job) {
        var keep = { showTrace: j.showTrace, recorded: j.recorded };
        Object.assign(j, job, keep);
        // the chain follows the model: every scenario it computes is applied as soon as the trace shows it
        var seen = j._seen || 0;
        (job.trace || []).slice(seen).forEach(function (t) { if (t.kind === "tool" && t.scenario && onScenario) onScenario(t.scenario, j); });
        j._seen = (job.trace || []).length;
        if (j.status === "done") { j.showTrace = false; if (!j._doneFired && onDone) { j._doneFired = true; onDone(j); } }
      }).catch(function () {});
    })).then(function () {
      if (onChange) onChange();
      timer = setTimeout(poll, 800);
    });
  }
  function find(id) { return items.filter(function (j) { return j.id === id; })[0]; }
  function onClick(e) {
    var t = e.target.closest("[data-ai]");
    if (!t) return false;
    var a = t.dataset.ai, job = find(t.dataset.id);
    if (a === "ask") { submitFromUI(t.dataset.q); }
    else if (a === "toggle" && job) { job.showTrace = !job.showTrace; if (onChange) onChange(); }
    else if (a === "apply" && job && onApply) onApply(job.result);
    else if (a === "record" && job && onRecord) onRecord(job);
    else if (a === "draft" && job && VK.ask.onDraft) VK.ask.onDraft(job);
    return true;
  }
  var submitFromUI = function (q) { submit(q); };
  function init(opts) {
    onApply = opts.onApply; onRecord = opts.onRecord; onChange = opts.onChange; onScenario = opts.onScenario; onDone = opts.onDone; submitFromUI = opts.submit || submitFromUI;
    VK.ask.onDraft = opts.onDraft;
    // rotating placeholder examples while the box is empty and unfocused
    var PH = ["미국 10년물이 30bp 오르면 채권 데스크는 뭘 해야 해?", "지금 주식 상황 설명해줘", "코스피 비중 얼마로 가져가야 해?", "크레딧이 80bp까지 벌어지면 CB는?",
              "오늘 3개 데스크 액션 플랜 한 줄씩", "BOK가 25bp 인하하면 듀레이션은?", "담당 모델이랑 VALKYRIE 판단이 충돌하는 곳은?"], phi = 0;
    setInterval(function () {
      var i = document.getElementById("cin");
      if (!i || !info.enabled || i.value || document.activeElement === i) return;
      phi = (phi + 1) % PH.length;
      i.style.setProperty("--ph", "0"); i.placeholder = "예: " + PH[phi];
    }, 4500);
    return VK.api.ai().then(function (s) {
      info = s || { enabled: false };
      if (info.enabled) VK.api.askHistory().then(function (h) {
        (h || []).forEach(function (e) { if (!find(e.id)) items.push(Object.assign({ status: "done", showTrace: false }, e)); });
        if (onChange) onChange();
      });
      return info;
    });
  }
  return { init: init, pane: pane, submit: submit, onClick: onClick, get enabled() { return !!info.enabled; }, get info() { return info; }, get items() { return items; } };
})();
