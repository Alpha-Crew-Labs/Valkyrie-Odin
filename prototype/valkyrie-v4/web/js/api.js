/* Data layer. ONLINE: local Python server (/api/*). OFFLINE: window.VK_BUNDLE — either the public web build
   (GitHub Pages: "web", the bundle is rebuilt by CI) or a file:// / server-down session ("file").
   Neither mode calls an external API. */
"use strict";
var VK = window.VK || {};
window.VK = VK;

VK.api = (function () {
  var B = window.VK_BUNDLE || null;
  var online = false;
  var mode = "file";     // "server" | "web" | "file" — decided by init()
  function web() { return mode === "web"; }

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
  /* Older snapshot dates live in data/snap_<date>.js (bundle.lazy) and are loaded once, on demand. */
  var loading = {};
  function ensure(sd) {
    if (!B || !B.lazy || B.lazy.indexOf(sd) < 0 || B.snapshots[sd]) return Promise.resolve(true);
    if (loading[sd]) return loading[sd];
    loading[sd] = new Promise(function (res) {
      var s = document.createElement("script");
      s.src = "data/snap_" + sd + ".js";
      s.async = true;
      s.onload = function () {
        var part = window.VK_SNAP && window.VK_SNAP[sd];
        if (part) { B.snapshots[sd] = part.snapshots; B.similar[sd] = part.similar; B.commands[sd] = part.commands; B.decisions[sd] = part.decisions; }
        res(!!part);
      };
      s.onerror = function () { delete loading[sd]; res(false); };
      document.head.appendChild(s);
    });
    return loading[sd];
  }
  function loadedDate(sd) {   // the requested snapshot, else the nearest earlier one that is in memory
    if (B.snapshots[sd]) return sd;
    var have = Object.keys(B.snapshots).sort(), pick = null;
    for (var i = 0; i < have.length; i++) if (have[i] <= sd) pick = have[i];
    return pick || have[have.length - 1];
  }
  function prefetchLazy() {   // after boot, while idle: make REPLAY instant without delaying the first paint
    if (!B || !B.lazy || (navigator.connection && navigator.connection.saveData)) return;
    var i = 0;
    (function next() {
      if (i >= B.lazy.length) return;
      if (document.hidden) { setTimeout(next, 5000); return; }
      ensure(B.lazy[i++]).then(function () { setTimeout(next, 400); });
    })();
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
    var want = snapDate(d), sd = loadedDate(want), pk = presetKey(shock);
    var st = JSON.parse(JSON.stringify(B.snapshots[sd][pk || "base"]));
    st.offline = true;
    st.offlineNote = pk ? null : web() ? "웹 스냅샷: 프리셋 외 충격은 로컬 서버(run.ps1)에서 계산됩니다"
                                        : "OFFLINE 번들: 프리셋 외 충격은 서버 실행 시에만 계산됩니다";
    if (sd !== want) st.offlineNote = "스냅샷 " + want + "을(를) 불러오지 못해 " + sd + " 스냅샷을 표시합니다";
    return st;
  }

  return {
    get online() { return online; },
    get mode() { return mode; },
    get offlineTag() { return web() ? "WEB" : "OFFLINE"; },           // short mode label (header, chips)
    get offlineName() { return web() ? "웹 스냅샷" : "OFFLINE 번들"; }, // sentence label (notes, banners)
    bundle: B,
    init: function () {
      var isFile = location.protocol === "file:";
      var probe = isFile ? Promise.reject(new Error("file://")) : get("/api/meta");
      return probe.then(function (m) { online = true; mode = "server"; return m; }).catch(function () {
        online = false;
        mode = isFile ? "file" : "web";
        if (!B) throw new Error("서버에 연결할 수 없고 오프라인 번들도 없습니다");
        var m = JSON.parse(JSON.stringify(B.meta));
        m.ontology = B.ontology; m.presets = B.presets; m.questions = B.questions;
        setTimeout(prefetchLazy, 12000);
        return m;
      });
    },
    dates: function (meta) {
      if (online) return get("/api/series", { keys: "ktb3" }).then(function (s) { return s.dates; });
      return Promise.resolve(B.meta.snapshot_dates.slice());
    },
    state: function (d, shock) {
      if (!online) return ensure(snapDate(d)).then(function () { return offlineState(d, shock); });
      var p = Object.assign({ date: d }, shock || {});
      return get("/api/state", p).catch(function () {
        online = false;
        return ensure(snapDate(d)).then(function () { return offlineState(d, shock); });
      });
    },
    series: function (keys) {
      if (!online) return Promise.resolve(B.series);
      return get("/api/series", { keys: keys.join(",") });
    },
    decisions: function (asOf) {
      if (!online) {
        var sd = asOf ? snapDate(asOf) : null;
        if (!sd) return Promise.resolve(B.decisions.latest);
        return ensure(sd).then(function () { return B.decisions[sd] || B.decisions.latest; });
      }
      return get("/api/decisions", { as_of: asOf });
    },
    addDecision: function (body) { return post("/api/decisions", body); },
    similar: function (d, shock) {
      if (!online) {
        var want = snapDate(d), pk = presetKey(shock) || "base";
        return ensure(want).then(function () { var sd = loadedDate(want); return (B.similar[sd] || {})[pk] || []; });
      }
      return get("/api/similar", Object.assign({ date: d }, shock || {}));
    },
    command: function (d, q) {
      if (!online) {
        var want = snapDate(d);
        return ensure(want).then(function () {
          var c = B.commands[loadedDate(want)] || {};
          return c[q] || { mode: web() ? "WEB" : "OFFLINE", question: q, path: [], shock: {},
            answer: [web() ? "웹 스냅샷: 준비 질문 3개와 SHOCK 프리셋에 답합니다. 자연어 AI 질문은 로컬 서버(run.ps1 + ANTHROPIC_API_KEY)에서 켜집니다."
                           : "OFFLINE 번들 모드: 준비 질문 3개만 응답합니다."] };
        });
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
        }) : [], source: (web() ? "웹 스냅샷" : "OFFLINE 번들") + " · 국내 주요 뉴스 (자산별 검색은 로컬 서버 실행 시)" };
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
