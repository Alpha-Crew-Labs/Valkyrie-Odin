"""LIVE market layer: NAVER(Npay) public endpoints polled in background threads.

Parsing is reused from pipeline/collect_naver.py (one source of truth for these undocumented endpoints).
Its write_json is swapped for a thread-local capture, so results stay in memory: data/00_RAW/naver is
only *read* here, as the fallback snapshot shown when a live fetch fails (labelled SNAPSHOT on screen).
Polling pauses when no browser has asked for live data for IDLE_PAUSE seconds.
"""
import importlib.util
import json
import threading
import time
from datetime import date, datetime

from .paths import RAW, ROOT

NAVER = RAW / "naver"
IDLE_PAUSE = 300

# name: (refresh seconds, lane). Lanes run in separate threads so a slow US batch never delays the tiles.
JOBS = {
    "market_board": (20, "fast"), "market_extra": (30, "fast"), "briefing": (60, "fast"), "sectors": (60, "fast"), "themes": (120, "fast"),
    "us_sectors": (90, "slow"), "news": (120, "slow"), "world_news": (180, "slow"),
    "us_watchlist": (180, "slow"), "calendar": (900, "slow"), "ipo_pipeline": (900, "slow"),
    "policy_rates": (3600, "slow"),
}


def _now():
    return datetime.now().isoformat(timespec="seconds")


# Extra ticker instruments (NAVER integration/indicators codes verified 2026-09-30): code, label, chart kind (None = no spark)
EXTRA = [
    (".N225", "니케이 225", "index"), (".HSI", "항셍", "index"), (".SSEC", "상해종합", "index"), (".TWII", "대만 가권", "index"),
    (".GDAXI", "독일 DAX", "index"), (".FTSE", "영국 FTSE", "index"), (".STOXX50E", "유로스톡스 50", "index"), (".VIX", "VIX", "index"),
    ("US2YT=RR", "미2년물", None), ("US30YT=RR", "미30년물", None), ("KR3YT=RR", "국고 3년", None), ("KR10YT=RR", "국고 10년", None),
    ("FX_JPYKRW", "엔/원 (100엔)", None), ("FX_EURKRW", "유로/원", None), ("FX_CNYKRW", "위안/원", None), (".DXY", "달러인덱스", "index"),
    ("HGcv1", "구리", "futures"), ("SIcv1", "은", "futures"), ("NGcv1", "천연가스", "futures"),
]
SPARK_EVERY = 300


class Live:
    def __init__(self):
        self.mod = None
        self.load_error = None
        self._tls = threading.local()
        self.lock = threading.Lock()
        self.sets = {}           # name -> {data, source, fetchedAt, ver, error}
        self.due = {k: 0.0 for k in JOBS}
        self.last_access = 0.0
        self.started = False
        for name in JOBS:
            f = NAVER / f"{name}.json"
            if f.exists():
                try:
                    data = json.loads(f.read_text(encoding="utf-8"))
                    at = datetime.fromtimestamp(f.stat().st_mtime).isoformat(timespec="seconds")
                    self.sets[name] = {"data": data, "source": "SNAPSHOT", "fetchedAt": at, "ver": 1, "error": None}
                except (OSError, ValueError):
                    pass
        try:
            spec = importlib.util.spec_from_file_location("collect_naver_live", ROOT / "pipeline" / "collect_naver.py")
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            tls = self._tls
            mod.write_json = lambda n, payload: setattr(tls, "box", {**getattr(tls, "box", {}), n: payload})
            self.mod = mod
        except Exception as exc:   # live layer degrades to snapshots only
            self.load_error = f"collect_naver import failed: {exc}"

    # ------------------------------------------------------------ fetching
    def market_extra(self):
        """Quotes for the extra ticker instruments every refresh; intraday sparks only every SPARK_EVERY seconds."""
        import urllib.parse
        m = self.mod
        codes = ",".join(c for c, _, _ in EXTRA)
        raw = m.get_json(f"{m.S}/api/securityService/integration/indicators?indicatorCodes={urllib.parse.quote(codes)}")
        by = {x.get("itemCode") or x.get("reutersCode"): x for x in raw}
        cache = getattr(self, "_xspark", None) or {"t": 0, "sparks": {}}
        if time.time() - cache["t"] > SPARK_EVERY:
            sparks = {}
            for code, _, kind in EXTRA:
                path = m.chart_path(code, kind) if kind else None
                if path:
                    sparks[code] = m.intraday(path)
                    time.sleep(0.1)
            cache = {"t": time.time(), "sparks": sparks}
            self._xspark = cache
        items = []
        for code, label, kind in EXTRA:
            x = by.get(code) or {}
            items.append({"code": code, "label": label, "name": x.get("stockName"), "price": m.num(x.get("currentPrice")),
                          "change": m.num(x.get("fluctuations")), "changeRate": m.num(x.get("fluctuationsRatio")),
                          "marketStatus": x.get("marketStatus"), "tradedAt": x.get("localTradedAt"), "spark": cache["sparks"].get(code, []), "daily": []})
        return {"asOf": _now(), "items": items}

    def themes(self):
        """NAVER 테마 ranking (stock.naver.com theme/list, verified 2026-09-30) in the same shape as the 업종 set, so the
        watch list (valkyrie/watch.py) ranks sectors and themes with one rule."""
        m = self.mod
        raw = m.get_json(f"{m.S}/api/domestic/market/theme/list?startIdx=0&pageSize=120&sortType=changeRate")
        items = []
        for t in raw or []:
            leaders = []
            for part in str(t.get("leadingItem") or "").split("|"):
                bits = part.split(",")
                if len(bits) >= 3:
                    leaders.append({"code": bits[1], "name": ",".join(bits[2:])})
            items.append({"no": t.get("no"), "name": t.get("name"), "changeRate": m.num(t.get("changeRate")), "change3d": m.num(t.get("recent3daysChangeRate")),
                          "rise": m.num(t.get("riseCnt")), "fall": m.num(t.get("fallCnt")), "steady": m.num(t.get("steadyCnt")), "total": m.num(t.get("totalCnt")),
                          "marketCap": m.num(t.get("totalMarketSum")), "tradeAmount": m.num(t.get("totalAccAmount")), "leaders": leaders})
        return {"asOf": (raw[0].get("thistime") if raw else _now()), "units": {"marketCap": "백만원", "tradeAmount": "백만원"}, "items": items}

    def _call(self, name):
        m = self.mod
        m.TODAY = date.today()
        if name == "market_extra":
            return self.market_extra()
        if name == "themes":
            return self.themes()
        self._tls.box = {}
        if name == "us_sectors":
            m.us_group("us_sectors", m.US_SECTORS)
        elif name == "us_watchlist":
            m.us_group("us_watchlist", [(s, None) for s in m.US_WATCH])
        else:
            getattr(m, name)()
        return self._tls.box[name]

    def refresh(self, name):
        try:
            data = self._call(name)
            with self.lock:
                old = self.sets.get(name, {})
                self.sets[name] = {"data": data, "source": "LIVE", "fetchedAt": _now(), "ver": old.get("ver", 0) + 1, "error": None}
        except Exception as exc:
            with self.lock:
                cur = self.sets.get(name)
                if cur:
                    cur["error"] = f"{type(exc).__name__}: {exc}"[:200]
                    cur["ver"] += 1
                    if cur["source"] == "LIVE":
                        cur["source"] = "STALE"
        self.due[name] = time.time() + JOBS[name][0]

    def _loop(self, lane):
        names = [n for n, (_, ln) in JOBS.items() if ln == lane]
        while True:
            if time.time() - self.last_access < IDLE_PAUSE:
                for n in names:
                    if time.time() >= self.due[n]:
                        self.refresh(n)
            time.sleep(1.0)

    # ------------------------------------------------------------ file-backed sets (NAVER daily CSVs)
    # investor flows / market money are daily series that pipeline/collect_naver.py keeps on disk (the equity
    # app re-runs it every 10 minutes); they are re-read only when the file changes.
    def _file_sets(self):
        specs = {
            "investor_flow": [NAVER / "investor_flow_kospi.csv", NAVER / "investor_flow_kosdaq.csv"],
            "liquidity": [NAVER / "liquidity.csv"],
        }
        for name, files in specs.items():
            if not all(f.exists() for f in files):
                continue
            mt = max(f.stat().st_mtime for f in files)
            cur = self.sets.get(name)
            if cur and cur.get("_mtime") == mt:
                continue
            try:
                data = self._read_flow(files) if name == "investor_flow" else self._read_liquidity(files[0])
            except (OSError, ValueError, KeyError):
                continue
            with self.lock:
                self.sets[name] = {"data": data, "source": "FILE", "_mtime": mt, "error": None,
                                   "fetchedAt": datetime.fromtimestamp(mt).isoformat(timespec="seconds"),
                                   "ver": (cur or {}).get("ver", 0) + 1}

    @staticmethod
    def _csv(path):
        import csv
        with open(path, encoding="utf-8") as f:
            return list(csv.DictReader(f))

    def _read_flow(self, files):
        out = {}
        for f in files:
            rows = self._csv(f)[-60:]
            mk = "KOSPI" if "kospi" in f.name else "KOSDAQ"
            out[mk] = [{"date": r["date"], **{k: (float(r[k]) if r.get(k) not in (None, "") else None)
                                             for k in ("individual", "foreign", "institution", "pension")}} for r in rows]
        return {"units": "억원 순매수", "markets": out}

    def _read_liquidity(self, f):
        rows = self._csv(f)[-260:]
        keys = ("customer_deposit", "credit_loan", "fund_equity", "fund_bond")
        return {"units": "억원", "rows": [{"date": r["date"], **{k: (float(r[k]) if r.get(k) not in (None, "") else None)
                                                             for k in keys}} for r in rows]}

    def _file_loop(self):
        while True:
            try:
                self._file_sets()
            except Exception:
                pass
            time.sleep(30)

    def start(self):
        self._file_sets()
        if self.started or not self.mod:
            return
        self.started = True
        for lane in ("fast", "slow"):
            threading.Thread(target=self._loop, args=(lane,), daemon=True, name=f"live-{lane}").start()
        threading.Thread(target=self._file_loop, daemon=True, name="live-files").start()

    # ------------------------------------------------------------ serving
    def get(self, known=None, names=None):
        """Sets newer than the client's known versions ({name: ver}); `names` limits which sets."""
        self.last_access = time.time()
        known = known or {}
        out, now = {}, datetime.now()
        with self.lock:
            for n, s in self.sets.items():
                if names and n not in names:
                    continue
                if known.get(n, -1) >= s["ver"]:
                    continue
                age = (now - datetime.fromisoformat(s["fetchedAt"])).total_seconds()
                out[n] = {k: v for k, v in s.items() if not k.startswith("_")}
                out[n]["ageSec"] = round(age)
            status = {n: {"source": s["source"], "fetchedAt": s["fetchedAt"], "ver": s["ver"], "error": s["error"],
                          "ageSec": round((now - datetime.fromisoformat(s["fetchedAt"])).total_seconds()),
                          "every": JOBS.get(n, (600,))[0]} for n, s in self.sets.items()}
        return {"now": _now(), "running": self.started, "loadError": self.load_error, "sets": out, "status": status}

    def snapshot_payload(self):
        """Latest known data for the offline bundle (whatever is on disk)."""
        self._file_sets()
        return {n: {"data": s["data"], "source": "SNAPSHOT", "fetchedAt": s["fetchedAt"], "ver": 1, "error": None}
                for n, s in self.sets.items()}
