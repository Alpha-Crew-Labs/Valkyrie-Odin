"""Decision Log: REAL + SIMULATED + USER entries with D+5 / D+20 / D+60 benchmark-relative outcomes.

Benchmark (BM) = 국고 3Y total return.  Bond total return over [t0, t1] (%):
    R = y0 × days/365 − D × (y1 − y0)          D: 국고3Y 2.8, 국고10Y 8.0
Relative outcome (bp) of a decision vs BM:
    SHORT DURATION (장기채 축소·단기채 확대):  R(3Y) − R(10Y)
    LONG DURATION:                             R(10Y) − R(3Y)
    코스닥 AVOID (청약 보류/비중 축소):         R(3Y) − R(KOSDAQ)
    코스닥 ENGAGE (청약 참여/비중 확대):         R(KOSDAQ) − R(3Y)
    코스닥 SELECTIVE (선별):                    0.5 × (R(KOSDAQ) − R(3Y))
Horizons not yet observable are PENDING (never 0).
"""
import csv
import io
import json
import uuid
from datetime import date as Date, datetime

from . import ontology as O
from .paths import SNAPSHOT, STATE

HORIZONS = (5, 20, 60)
USER_FILE = STATE / "decisions.json"
LOG_FILE = SNAPSHOT / "decision_log.json"

REAL_ENTRY = {
    "id": "real-2026-05-04", "date": "2026-05-04", "asset": "국고채", "domain": "rat",
    "decision": "장기채 축소 · 단기채 확대", "dir": "SHORT", "source": "REAL",
    "rationale": "실제 발신 판단 (공개 가능 리서치). 테일러 갭 확대 · UST 상승 압력 → 듀레이션 축소.",
}


def _ret_bond(e, i0, i1, key, dur):
    a, b = e.daily[i0], e.daily[i1]
    days = (Date.fromisoformat(b["date"]) - Date.fromisoformat(a["date"])).days
    return a[key] * days / 365 - dur * (b[key] - a[key])


def _ret_eq(e, i0, i1):
    return (e.daily[i1]["kosdaq"] / e.daily[i0]["kosdaq"] - 1) * 100


def relative_bp(e, entry, i0, i1):
    r3 = _ret_bond(e, i0, i1, "ktb3", O.D_KTB3)
    if entry["domain"] == "rat":
        r10 = _ret_bond(e, i0, i1, "ktb10", O.D_KTB10)
        rel = {"SHORT": r3 - r10, "LONG": r10 - r3}.get(entry["dir"], 0.0)
    else:
        rk = _ret_eq(e, i0, i1)
        rel = {"AVOID": r3 - rk, "ENGAGE": rk - r3, "SELECTIVE": 0.5 * (rk - r3)}.get(entry["dir"], 0.0)
    return rel * 100


def with_performance(e, entry, as_of=None):
    """Attach D+N outcomes. `as_of` limits what is observable (used by REPLAY)."""
    i0 = e.idx.get(e.resolve(entry["date"]))
    last = e.idx[e.resolve(as_of)] if as_of else len(e.dates) - 1
    out = dict(entry)
    perf = {}
    for h in HORIZONS:
        i1 = i0 + h
        if i1 > last:
            perf[f"d{h}"] = {"status": "PENDING", "bp": None, "date": e.dates[i1] if i1 < len(e.dates) else None}
        else:
            perf[f"d{h}"] = {"status": "FINAL", "bp": round(relative_bp(e, entry, i0, i1), 1), "date": e.dates[i1]}
    out["perf"] = perf
    finals = [p for p in perf.values() if p["status"] == "FINAL"]
    out["status"] = "FINAL" if len(finals) == len(HORIZONS) else ("PARTIAL" if finals else "PENDING")
    last_final = finals[-1]["bp"] if finals else None
    out["vs_bm"] = last_final
    return out


def generate_simulated(e):
    """Rule-based virtual decisions from the real 2024-01~ history (SIMULATED, not investment advice)."""
    logs, step = [], 20
    for k, i in enumerate(range(20, len(e.dates) - 1, step)):
        d = e.dates[i]
        if d >= "2026-09-01":
            break
        st = e.state(d)
        if k % 2 == 0:
            s = st["signals"]["rates"]
            if s["dir"] == "NEUTRAL":
                continue
            act = "국고10Y 매도 · 국고3Y 매수" if s["dir"] == "SHORT" else "국고10Y 매수 · 국고3Y 매도"
            logs.append({"id": f"sim-{d}-rat", "date": d, "asset": "국고채", "domain": "rat", "dir": s["dir"],
                         "decision": f"{s['call']} ({act})", "source": "SIMULATED",
                         "rationale": " / ".join(s["reasons"][:2])})
        else:
            s = st["signals"]["equity"]
            act = {"AVOID": "코스닥 IPO 청약 보류 · 비중 축소", "SELECTIVE": "흑자 IPO 선별 청약",
                   "ENGAGE": "코스닥 IPO 청약 참여 · 비중 확대"}[s["dir"]]
            logs.append({"id": f"sim-{d}-eq", "date": d, "asset": "코스닥", "domain": "eq", "dir": s["dir"],
                         "decision": act, "source": "SIMULATED", "rationale": " / ".join(s["reasons"][:2])})
    return logs


def load_user():
    if USER_FILE.exists():
        return json.loads(USER_FILE.read_text(encoding="utf-8"))
    return []


def add_user(e, payload):
    entry = {
        "id": f"user-{uuid.uuid4().hex[:8]}", "date": e.resolve(payload.get("date")),
        "asset": payload.get("asset") or ("국고채" if payload.get("domain") == "rat" else "코스닥"),
        "domain": payload.get("domain", "rat"), "dir": payload.get("dir", "SHORT"),
        "decision": payload.get("decision", ""), "rationale": payload.get("rationale", ""),
        "source": "USER", "recorded_at": datetime.now().isoformat(timespec="seconds"),
        "author": payload.get("author", ""),
    }
    STATE.mkdir(parents=True, exist_ok=True)
    rows = load_user() + [entry]
    USER_FILE.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    return entry


def all_logs(e, as_of=None):
    base = json.loads(LOG_FILE.read_text(encoding="utf-8")) if LOG_FILE.exists() else [REAL_ENTRY]
    rows = base + load_user()
    if as_of:
        rows = [r for r in rows if r["date"] <= as_of]
    rows = [with_performance(e, r, as_of) for r in rows]
    rows.sort(key=lambda r: (r["date"], r["id"]), reverse=True)
    return rows


def replay_conflicts(e, st, logs):
    """At a REPLAY date: latest logged decision per domain vs the engine signal of that day."""
    out = []
    sig = {"rat": st["signals"]["rates"], "eq": st["signals"]["equity"]}
    for dom in ("rat", "eq"):
        past = [l for l in logs if l["domain"] == dom and l["date"] <= st["date"]]
        if not past:
            continue
        l = past[0]
        if l["dir"] != sig[dom]["dir"]:
            out.append({"domain": dom, "log": l["decision"], "log_date": l["date"], "signal": sig[dom]["call"],
                        "text": f"{l['date']} 기록 '{l['decision']}' ↔ 현재 신호 '{sig[dom]['call']}'"})
    return out


def to_csv(rows):
    """Mock CSV with the 9 columns from the design doc."""
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["발신일", "판단", "근거", "D+5", "D+20", "D+60", "BM 대비", "상태", "출처 구분"])
    for r in rows:
        p = r["perf"]
        cell = lambda x: "PENDING" if x["status"] == "PENDING" else f"{x['bp']:+.1f}bp"
        w.writerow([r["date"], f"[{r['asset']}] {r['decision']}", r["rationale"], cell(p["d5"]), cell(p["d20"]),
                    cell(p["d60"]), "PENDING" if r["vs_bm"] is None else f"{r['vs_bm']:+.1f}bp", r["status"],
                    {"REAL": "실제", "SIMULATED": "시뮬레이션", "USER": "실제(사용자 기록)"}[r["source"]]])
    return buf.getvalue()
