"""VALKYRIE v4 local server (Python standard library only).

    python server.py                    -> http://0.0.0.0:4134  (teammates: http://<내부IP>:4134)
    python server.py --port 8080
    python server.py --no-refresh       -> demo mode: never re-collect / re-model while running

It serves web/, computes states from data/10_MODEL, polls NAVER market data for /api/live (valkyrie/live.py; falls
back to data/00_RAW/naver snapshots), cross-checks the owners' deep models (valkyrie/tools.py), searches asset news
(valkyrie/news.py), builds the hourly briefing (valkyrie/briefing.py) and refreshes the EOD data every hour.
"""
import argparse
import json
import mimetypes
import socket
import subprocess
import sys
import threading
import time
import traceback
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from valkyrie import ai as AI
from valkyrie import book as BK
from valkyrie import briefing as BR
from valkyrie import command as C
from valkyrie import decisions as D
from valkyrie import ontology as O
from valkyrie import plan as PL
from valkyrie import risk as RK
from valkyrie import watch as WATCH
from valkyrie.engine import PRESETS, SNAPSHOT_DATES, Engine
from valkyrie.live import Live
from valkyrie.news import News
from valkyrie.paths import ROOT, WEB
from valkyrie.similar import Similar
from valkyrie.tools import Tools

KST = timezone(timedelta(hours=9))
REPORTS = ROOT / "macro" / "reports"     # 정희강's Weekly Updates (PDF/HTML), served read-only under /reports
ENGINE = Engine()
SIM = Similar(ENGINE)
LIVE = Live()
TOOLS = Tools()
NEWS = News()
ASK = AI.Ask(lambda d, s: state_with_context(d, s), NEWS)
SHOCK_PARAMS = ("ust", "uscpi", "gdp", "bok", "credit", "credit_level")
SERIES_KEYS = ["ktb3", "ktb10", "aa3", "bok", "ust10", "fed", "kosdaq", "kospi", "credit_bp", "curve_bp",
               "kr_cpi", "us_cpi", "taylor", "taylor_gap", "gdp_now", "ipo_demand", "loss_share", "kr_cpi_fcst",
               "kospi_risk", "kosdaq_risk", "temp_all", "temp_mac", "temp_rat", "temp_eq"] + [f"risk_{n}" for n in RK.KEYS]
REFRESH = {"enabled": True, "every_min": 60, "lastAt": None, "lastOk": None, "log": [], "running": False}
BRIEF = {}


def shock_from(qs):
    out = {}
    for k in SHOCK_PARAMS:
        if k in qs and qs[k][0] not in ("", "0"):
            out[k] = float(qs[k][0])
    return out


def calendar_lines(n=4):
    cal = (LIVE.sets.get("calendar") or {}).get("data") or {}
    today = datetime.now(KST).strftime("%Y-%m-%d")
    out = []
    for x in cal.get("items", []):
        if x.get("category") == "economicIndicators" and x.get("date", "") >= today:
            nat = {"KOR": "KR", "USA": "US"}.get(x.get("nation"), x.get("nation") or "")
            out.append(f"{x['date'][5:]} {nat} {x.get('title', '')} ({(x.get('subtitle') or '').split(' ')[0]})")
        if len(out) >= n:
            break
    return out


def market_summary():
    """Live NAVER market snapshot folded into the engine state (tiles, 20-day flows, market money) — for the SITREP, the
    header KPIs and the AI assistant's context. Labelled by the live layer's source (LIVE / SNAPSHOT / STALE / FILE)."""
    mb = LIVE.sets.get("market_board") or {}
    b = mb.get("data") or {}
    x = (LIVE.sets.get("market_extra") or {}).get("data") or {}
    tiles = [{k: it.get(k) for k in ("code", "label", "price", "change", "changeRate", "marketStatus", "tradedAt")}
             for it in (b.get("items") or []) + (x.get("items") or [])]
    fl = (LIVE.sets.get("investor_flow") or {}).get("data") or {}
    flows = {}
    for mk, rows in (fl.get("markets") or {}).items():
        r20 = rows[-20:]
        flows[mk] = {"date": rows[-1]["date"] if rows else None, "units": "억원 · 20일 누적",
                     **{k: round(sum((r.get(k) or 0) for r in r20)) for k in ("individual", "foreign", "institution", "pension")},
                     "today": {k: rows[-1].get(k) for k in ("individual", "foreign", "institution")} if rows else None}
    lq = ((LIVE.sets.get("liquidity") or {}).get("data") or {}).get("rows") or []
    money = None
    if len(lq) > 21 and lq[-1].get("customer_deposit") and lq[-21].get("customer_deposit"):
        l, p = lq[-1], lq[-21]
        money = {"date": l["date"], "customer_deposit_eok": l["customer_deposit"], "deposit_chg20_pct": round((l["customer_deposit"] / p["customer_deposit"] - 1) * 100, 2),
                 "credit_loan_eok": l["credit_loan"], "credit_chg20_pct": round((l["credit_loan"] / p["credit_loan"] - 1) * 100, 2) if p.get("credit_loan") else None}
    return {"source": mb.get("source"), "asOf": b.get("asOf"), "tiles": tiles, "flows_20d": flows, "money": money,
            "note": "장중 실시간 시세는 엔진 EOD 값과 다를 수 있음 · UST는 NOWCAST로 전이 가능"}


def state_with_context(date, shock):
    st = ENGINE.state(date, shock, TOOLS.anchors(ENGINE.resolve(date)))
    logs = D.all_logs(ENGINE, as_of=st["date"])
    st["replay_conflicts"] = D.replay_conflicts(ENGINE, st, logs)
    st["tools"] = TOOLS.verdicts(st["date"], st["signals"])
    st["plan"] = PL.build(st, calendar_lines())
    st["market"] = market_summary()
    st["watch"] = WATCH.build(st, {k: (v or {}).get("data") for k, v in LIVE.sets.items()})   # 주목 섹터·테마·종목
    return st


def briefing(force=False):
    ed = BR.edition()
    hit = BRIEF.get("payload")
    if hit and not force and hit["edition"]["key"] == ed["key"] and hit["date"] == ENGINE.dates[-1]:
        return hit
    st = state_with_context(None, {})
    live = {k: (v or {}).get("data") for k, v in LIVE.sets.items()}
    BRIEF["payload"] = BR.build(st, st["plan"], live)
    return BRIEF["payload"]


# ---------------------------------------------------------------- hourly EOD refresh (collect -> model -> reload)
def _run(script, timeout=900):
    t0 = time.time()
    p = subprocess.run([sys.executable, str(ROOT / "pipeline" / script)], cwd=str(ROOT), capture_output=True,
                       timeout=timeout, env={**__import__("os").environ, "PYTHONIOENCODING": "utf-8", "PYTHONDONTWRITEBYTECODE": "1"})
    tail = (p.stdout.decode("utf-8", "replace").strip().splitlines() or [""])[-1][:160]
    return {"script": script, "rc": p.returncode, "sec": round(time.time() - t0, 1), "tail": tail}


def refresh_once():
    global ENGINE, SIM
    if REFRESH["running"]:
        return
    REFRESH["running"] = True
    log = []
    try:
        log.append(_run("collect.py"))                                      # ECOS / FRED
        hour = datetime.now(KST).hour
        if REFRESH["lastAt"] is None or hour in (7, 13, 19):                 # heavier real-sample collector 3x a day
            log.append(_run("collect_research.py"))
        m = _run("model.py")
        log.append(m)
        if m["rc"] == 0:
            e = Engine()
            s = Similar(e)
            ENGINE, SIM = e, s                                               # atomic swap for request threads
            TOOLS.macro = TOOLS._load_macro()
            BRIEF.clear()
        REFRESH["lastOk"] = m["rc"] == 0
    except Exception as exc:
        log.append({"error": f"{type(exc).__name__}: {exc}"[:200]})
        REFRESH["lastOk"] = False
    finally:
        REFRESH["lastAt"] = datetime.now(KST).isoformat(timespec="seconds")
        REFRESH["log"] = log
        REFRESH["running"] = False


def refresh_loop():
    while True:
        time.sleep(REFRESH["every_min"] * 60)
        refresh_once()


class Handler(BaseHTTPRequestHandler):
    server_version = "VALKYRIE/4"

    def log_message(self, fmt, *args):
        sys.stderr.write("%s  %s\n" % (self.address_string(), fmt % args))

    def _send(self, code, body, ctype="application/json; charset=utf-8"):
        data = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        u = urlparse(self.path)
        qs = parse_qs(u.query)
        q1 = lambda k, d=None: qs.get(k, [d])[0]
        try:
            if u.path == "/api/meta":
                return self._send(200, {"first": ENGINE.dates[0], "last": ENGINE.dates[-1], "rows": len(ENGINE.dates),
                                        "snapshot_dates": SNAPSHOT_DATES, "presets": PRESETS,
                                        "manifest": ENGINE.manifest, "model": ENGINE.model_meta,
                                        "ontology": O.ontology(), "questions": C.PRESET_QUESTIONS,
                                        "refresh": {k: v for k, v in REFRESH.items() if k != "log"}})
            if u.path == "/api/state":
                return self._send(200, state_with_context(q1("date"), shock_from(qs)))
            if u.path == "/api/series":
                keys = [k for k in (q1("keys") or ",".join(SERIES_KEYS)).split(",") if k in SERIES_KEYS]
                return self._send(200, ENGINE.series(keys, q1("from"), q1("to")))
            if u.path == "/api/decisions":
                return self._send(200, D.all_logs(ENGINE, as_of=q1("as_of")))
            if u.path == "/api/decisions.csv":
                return self._send(200, D.to_csv(D.all_logs(ENGINE)).encode("utf-8-sig"), "text/csv; charset=utf-8")
            if u.path == "/api/similar":
                st = ENGINE.state(q1("date"), shock_from(qs))
                return self._send(200, SIM.search(st, D.all_logs(ENGINE, as_of=st["date"])))
            if u.path == "/api/command":
                return self._send(200, C.answer(ENGINE, q1("date"), q1("q", "")))
            if u.path == "/api/publish":
                return self._send(200, C.publish_list())
            if u.path == "/api/tools":
                st = ENGINE.state(q1("date"), shock_from(qs), TOOLS.anchors(ENGINE.resolve(q1("date"))))
                return self._send(200, TOOLS.verdicts(st["date"], st["signals"]))
            if u.path == "/api/news":
                return self._send(200, NEWS.search(q1("key"), q1("q"), int(q1("n", "12"))))
            if u.path == "/api/briefing":
                return self._send(200, briefing(q1("force") == "1"))
            if u.path == "/api/refresh":
                return self._send(200, REFRESH)
            if u.path == "/api/ai":
                return self._send(200, ASK.status())
            if u.path == "/api/ask":
                job = ASK.get(q1("id") or "")
                return self._send(200 if job else 404, job or {"error": "unknown job"})
            if u.path == "/api/ask/history":
                return self._send(200, ASK.recent(int(q1("n", "20"))))
            if u.path == "/api/book":
                return self._send(200, BK.load())
            if u.path == "/api/reports":
                return self._send(200, [{"name": f.name, "date": f.stem.replace("Weekly_Updates_", ""), "bytes": f.stat().st_size,
                                         "url": f"/reports/{f.name}", "html": f"/reports/{f.stem}.html" if f.with_suffix(".html").exists() else None}
                                        for f in sorted(REPORTS.glob("Weekly_Updates_*.pdf"), reverse=True)])
            if u.path.startswith("/reports"):
                return self._report(u.path)
            if u.path == "/api/live":
                known = {}
                for part in (q1("v") or "").split(","):
                    if ":" in part:
                        k, v = part.split(":", 1)
                        known[k] = int(v) if v.isdigit() else -1
                names = [n for n in (q1("sets") or "").split(",") if n] or None
                return self._send(200, LIVE.get(known, names))
            return self._static(u.path)
        except Exception as exc:
            traceback.print_exc()
            return self._send(500, {"error": str(exc)})

    def do_POST(self):
        u = urlparse(self.path)
        try:
            n = int(self.headers.get("Content-Length") or 0)
            payload = json.loads(self.rfile.read(n) or b"{}")
            if u.path == "/api/decisions":
                entry = D.add_user(ENGINE, payload)
                return self._send(200, D.with_performance(ENGINE, entry))
            if u.path == "/api/publish":
                return self._send(200, C.publish_action(ENGINE, payload))
            if u.path == "/api/book":     # D-013: held equity weight / duration -> owner-model trades sized against them
                book = BK.record(payload)
                threading.Thread(target=TOOLS.refresh_equity, daemon=True).start()
                return self._send(200, book)
            if u.path == "/api/ask":
                if not ASK.enabled:
                    return self._send(503, {"error": ASK.reason or "AI disabled"})
                q = (payload.get("q") or "").strip()
                if not q:
                    return self._send(400, {"error": "empty question"})
                shock = {k: float(v) for k, v in (payload.get("shock") or {}).items() if k in SHOCK_PARAMS and v not in (None, "", 0)}
                return self._send(202, {"id": ASK.start(q[:600], payload.get("date") or None, shock)})
            if u.path == "/api/refresh":
                if not REFRESH["enabled"]:
                    return self._send(409, {"error": "refresh disabled (--no-refresh)"})
                threading.Thread(target=refresh_once, daemon=True).start()
                return self._send(202, {"started": True})
            return self._send(404, {"error": "not found"})
        except (KeyError, ValueError) as exc:
            return self._send(400, {"error": str(exc)})
        except Exception as exc:
            traceback.print_exc()
            return self._send(500, {"error": str(exc)})

    def _report(self, path):
        """Weekly Updates from the macro desk (macro/reports, written by macro/weekly_report.py; read-only here):
        /reports/latest -> newest PDF, /reports/<file>.pdf|.html -> that file, /api/reports -> listing."""
        name = path[len("/reports"):].lstrip("/")
        if name in ("", "latest", "latest.pdf"):
            pdfs = sorted(REPORTS.glob("Weekly_Updates_*.pdf"))
            if not pdfs:
                return self._send(404, {"error": "no weekly report yet (macro/weekly_report.py)"})
            f = pdfs[-1]
        else:
            f = (REPORTS / name).resolve()
            if REPORTS.resolve() not in f.parents or not f.is_file() or f.suffix.lower() not in (".pdf", ".html"):
                return self._send(404, {"error": "not found"})
        return self._send(200, f.read_bytes(), "application/pdf" if f.suffix.lower() == ".pdf" else "text/html; charset=utf-8")

    def _static(self, path):
        rel = "index.html" if path in ("/", "") else path.lstrip("/")
        f = (WEB / rel).resolve()
        if WEB.resolve() not in f.parents or not f.is_file():   # no path traversal outside web/
            return self._send(404, {"error": "not found"})
        ctype = mimetypes.guess_type(f.name)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype.endswith("javascript"):
            ctype += "; charset=utf-8"
        return self._send(200, f.read_bytes(), ctype)


def lan_ips():
    ips = set()
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))   # no packet is sent; picks the LAN interface
        ips.add(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ips.add(info[4][0])
    except OSError:
        pass
    return sorted(i for i in ips if not i.startswith("127."))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--port", type=int, default=4134)
    ap.add_argument("--no-refresh", action="store_true", help="demo mode: no hourly collect/model while running")
    a = ap.parse_args()
    httpd = ThreadingHTTPServer((a.host, a.port), Handler)
    LIVE.start()
    TOOLS.start()
    REFRESH["enabled"] = not a.no_refresh
    if REFRESH["enabled"]:
        threading.Thread(target=refresh_loop, daemon=True, name="eod-refresh").start()
    print(f"VALKYRIE v4 · data {ENGINE.dates[0]} ~ {ENGINE.dates[-1]} ({len(ENGINE.dates)} days) · "
          f"NAVER live {'on' if LIVE.started else 'off: ' + str(LIVE.load_error)} · "
          f"EOD refresh {'every %d min' % REFRESH['every_min'] if REFRESH['enabled'] else 'off'} · "
          f"AI {ASK.status()['model'] if ASK.enabled else 'off: ' + str(ASK.reason)}")
    print(f"  local : http://127.0.0.1:{a.port}/")
    for ip in lan_ips():
        print(f"  team  : http://{ip}:{a.port}/")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
