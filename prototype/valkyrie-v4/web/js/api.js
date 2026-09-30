/* Data layer. ONLINE: local Python server (/api/*). OFFLINE: window.VK_BUNDLE (file:// or server down).
   Neither mode calls an external API. */
"use strict";
var VK = window.VK || {};
window.VK = VK;

VK.api = (function () {
  var B = window.VK_BUNDLE || null;
  var online = false;

  function qs(o) {
    var p = [];
    for (var k in o) if (o[k] !== undefined && o[k] !== null && o[k] !== "") p.push(k + "=" + encodeURIComponent(o[k]));
    return p.length ? "?" + p.join("&") : "";
  }
  function get(path, params) {
    return fetch(path + qs(params || {}), { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    });
  }
  function post(path, body) {
    if (!online) return Promise.reject(new Error("OFFLINE 번들 모드에서는 저장할 수 없습니다 (서버 실행 필요)"));
    return fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || r.status); return j; }); });
  }

  /* ---- offline resolution: nearest snapshot date <= requested, preset matching the shock ---- */
  function snapDate(d) {
    var ds = B.meta.snapshot_dates, pick = ds[0];
    for (var i = 0; i < ds.length; i++) if (!d || ds[i] <= d) pick = ds[i];
    return d ? pick : ds[ds.length - 1];
  }
  function presetKey(shock) {
    var keys = Object.keys(shock || {});
    if (!keys.length) return "base";
    for (var k in B.presets) {
      var s = B.presets[k].shock, sk = Object.keys(s);
      if (sk.length === keys.length && sk.every(function (x) { return +s[x] === +shock[x]; })) return k;
    }
    return null;
  }
  function offlineState(d, shock) {
    var sd = snapDate(d), pk = presetKey(shock);
    var st = JSON.parse(JSON.stringify(B.snapshots[sd][pk || "base"]));
    st.offline = true;
    st.offlineNote = pk ? null : "OFFLINE 번들: 프리셋 외 충격은 서버 실행 시에만 계산됩니다";
    return st;
  }

  return {
    get online() { return online; },
    bundle: B,
    init: function () {
      var probe = location.protocol === "file:" ? Promise.reject(new Error("file://")) : get("/api/meta");
      return probe.then(function (m) { online = true; return m; }).catch(function () {
        online = false;
        if (!B) throw new Error("서버에 연결할 수 없고 오프라인 번들도 없습니다");
        var m = JSON.parse(JSON.stringify(B.meta));
        m.ontology = B.ontology; m.presets = B.presets; m.questions = B.questions;
        return m;
      });
    },
    dates: function (meta) {
      if (online) return get("/api/series", { keys: "ktb3" }).then(function (s) { return s.dates; });
      return Promise.resolve(B.meta.snapshot_dates.slice());
    },
    state: function (d, shock) {
      if (!online) return Promise.resolve(offlineState(d, shock));
      var p = Object.assign({ date: d }, shock || {});
      return get("/api/state", p).catch(function () { online = false; return offlineState(d, shock); });
    },
    series: function (keys) {
      if (!online) return Promise.resolve(B.series);
      return get("/api/series", { keys: keys.join(",") });
    },
    decisions: function (asOf) {
      if (!online) {
        var sd = asOf ? snapDate(asOf) : null;
        return Promise.resolve(sd && B.decisions[sd] ? B.decisions[sd] : B.decisions.latest);
      }
      return get("/api/decisions", { as_of: asOf });
    },
    addDecision: function (body) { return post("/api/decisions", body); },
    similar: function (d, shock) {
      if (!online) {
        var sd = snapDate(d), pk = presetKey(shock) || "base";
        return Promise.resolve(B.similar[sd][pk]);
      }
      return get("/api/similar", Object.assign({ date: d }, shock || {}));
    },
    command: function (d, q) {
      if (!online) {
        var c = B.commands[snapDate(d)] || {};
        return Promise.resolve(c[q] || { mode: "OFFLINE", question: q, path: [], shock: {},
          answer: ["OFFLINE 번들 모드: 준비 질문 3개만 응답합니다."] });
      }
      return get("/api/command", { date: d, q: q });
    },
    publishList: function () { return online ? get("/api/publish") : Promise.resolve([]); },
    publish: function (body) { return post("/api/publish", body); },
    feed: function () { return B ? B.feed : []; },
    news: function (key, q) {
      var offline = function () {
        var n = B && B.live && B.live.news && B.live.news.data;
        return { key: key, query: null, items: n ? n.items.slice(0, 9).map(function (x) {
          var s = String(x.publishedAt || ""); return { title: x.title, source: x.press, url: x.url, publishedAt: s.slice(0, 4) + "-" + s.slice(4, 6) + "-" + s.slice(6, 8) + "T" + s.slice(8, 10) + ":" + s.slice(10, 12) };
        }) : [], source: "OFFLINE 번들 · 국내 주요 뉴스 (자산별 검색은 서버 실행 시)" };
      };
      if (!online) return Promise.resolve(offline());
      return get("/api/news", { key: key, q: q }).catch(function () { return offline(); });
    },
    ai: function () { return online ? get("/api/ai").catch(function () { return { enabled: false }; }) : Promise.resolve({ enabled: false, reason: "OFFLINE" }); },
    ask: function (q, date, shock) { return post("/api/ask", { q: q, date: date, shock: shock || {} }); },
    askJob: function (id) { return get("/api/ask", { id: id }); },
    askHistory: function () { return online ? get("/api/ask/history").catch(function () { return []; }) : Promise.resolve([]); },
    briefing: function () {
      if (!online) return B && B.briefing ? Promise.resolve(B.briefing) : Promise.reject(new Error("브리핑 없음"));
      return get("/api/briefing").catch(function () { if (B && B.briefing) return B.briefing; throw new Error("브리핑 없음"); });
    },
    /* NAVER market layer. known = {set: ver}; the server returns only newer sets. Offline: bundle snapshot once. */
    live: function (known) {
      var offline = function () {
        if (!B || !B.live) return { sets: {}, status: {}, offline: true };
        var sets = {};
        Object.keys(B.live).forEach(function (k) { if (!(known && known[k] >= 1)) sets[k] = B.live[k]; });
        return { sets: sets, status: {}, offline: true };
      };
      if (!online) return Promise.resolve(offline());
      var v = Object.keys(known || {}).map(function (k) { return k + ":" + known[k]; }).join(",");
      return get("/api/live", { v: v }).catch(function () { return offline(); });
    }
  };
})();
