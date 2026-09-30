"""20_SNAPSHOT: freeze the demo.

Outputs
  data/20_SNAPSHOT/snapshot_<date>.json   5 dates x preset scenarios (nodes, 22 relations, 3 decisions)
  data/20_SNAPSHOT/decision_log.json      REAL 1 + SIMULATED ~30
  data/20_SNAPSHOT/decision_log.csv       9-column mock CSV (design doc)
  data/20_SNAPSHOT/odin_feed.json         ODIN research feed mock (5 snapshots, 7 fields)
  web/data/bundle.js                      offline bundle: the whole demo without the server (file://)
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from valkyrie import decisions as D  # noqa: E402
from valkyrie import ontology as O  # noqa: E402
from valkyrie.command import PRESET_QUESTIONS, answer  # noqa: E402
from valkyrie.engine import PRESETS, SNAPSHOT_DATES, Engine  # noqa: E402
from valkyrie.paths import SNAPSHOT, WEB  # noqa: E402
from valkyrie.similar import Similar  # noqa: E402
from valkyrie.live import Live  # noqa: E402
from valkyrie.tools import Tools  # noqa: E402

from valkyrie import briefing as BR  # noqa: E402
from valkyrie import plan as PL  # noqa: E402
from valkyrie import watch as WATCH  # noqa: E402
from valkyrie import risk as RK  # noqa: E402

SERIES_KEYS = ["ktb3", "ktb10", "aa3", "bok", "ust10", "fed", "kosdaq", "kospi", "credit_bp", "curve_bp",
               "kr_cpi", "us_cpi", "taylor", "taylor_gap", "gdp_now", "ipo_demand", "loss_share", "kr_cpi_fcst",
               "kospi_risk", "kosdaq_risk", "temp_all", "temp_mac", "temp_rat", "temp_eq"] + [f"risk_{n}" for n in RK.KEYS]


def slim(st):
    st = dict(st)
    cb = dict(st["cb"])
    cb["all"] = sorted(cb["all"], key=lambda c: (not c["put_risk"], c["score"]))[:12]
    st["cb"] = cb
    return st


def main():
    SNAPSHOT.mkdir(parents=True, exist_ok=True)
    e = Engine()
    sim = Similar(e)
    tools = Tools()
    tools.refresh_equity()
    live_payload = Live().snapshot_payload()
    cal = (live_payload.get("calendar") or {}).get("data") or {}
    cal_lines = [f"{x['date'][5:]} {({'KOR': 'KR', 'USA': 'US'}).get(x.get('nation'), '')} {x.get('title', '')}"
                 for x in cal.get("items", []) if x.get("category") == "economicIndicators"][:4]

    logs = [D.REAL_ENTRY] + D.generate_simulated(e)
    (SNAPSHOT / "decision_log.json").write_text(json.dumps(logs, ensure_ascii=False, indent=2), encoding="utf-8")
    with_perf = D.all_logs(e)
    (SNAPSHOT / "decision_log.csv").write_text(D.to_csv(with_perf), encoding="utf-8-sig", newline="")
    print(f"decision log: {len(logs)} entries ({sum(l['source'] == 'SIMULATED' for l in logs)} SIMULATED)")

    bundle = {"meta": meta(e), "ontology": O.ontology(), "presets": {k: v for k, v in PRESETS.items()},
              "questions": PRESET_QUESTIONS, "snapshots": {}, "similar": {}, "commands": {}, "decisions": {},
              "series": e.series(SERIES_KEYS)}
    feed = []
    live_sets = {k: (v or {}).get("data") for k, v in live_payload.items()}
    for d in SNAPSHOT_DATES:
        anc = tools.anchors(e.resolve(d))
        states = {k: e.state(d, p["shock"], anc) for k, p in PRESETS.items()}
        rd = states["base"]["date"]
        logs_asof = D.all_logs(e, as_of=rd)
        for st in states.values():
            st["replay_conflicts"] = D.replay_conflicts(e, st, logs_asof)
            st["tools"] = tools.verdicts(st["date"], st["signals"])
            st["plan"] = PL.build(st, cal_lines)
            st["watch"] = WATCH.build(st, live_sets)
        (SNAPSHOT / f"snapshot_{d}.json").write_text(json.dumps({
            "mode": "SNAPSHOT", "as_of": rd, "requested": d, "vintage": states["base"]["vintage"],
            "ontology": O.ontology(), "states": states}, ensure_ascii=False, indent=1), encoding="utf-8")
        bundle["snapshots"][d] = {k: slim(v) for k, v in states.items()}
        bundle["similar"][d] = {k: sim.search(v, logs_asof) for k, v in states.items()}
        bundle["commands"][d] = {q["q"]: answer(e, rd, q["q"]) for q in PRESET_QUESTIONS}
        bundle["decisions"][d] = logs_asof
        b = states["base"]
        for dom, key in (("채권", "rates"), ("코스닥", "equity"), ("매크로", "macro")):
            s = b["signals"][key]
            feed.append({"발간일": rd, "자산군": dom, "제목": f"{rd} {dom} — {s['call']}",
                         "한 줄 결론": b["briefing"]["text"], "판단 방향": s["dir"], "컨피던스": s["confidence"],
                         "근거 노드": s["evidence"]})
        print(f"snapshot {d} -> {rd}: {b['briefing']['text']}")
    bundle["decisions"]["latest"] = with_perf
    bundle["live"] = live_payload   # last NAVER files on disk (offline market strip)
    last = bundle["snapshots"][SNAPSHOT_DATES[-1]]["base"]
    bundle["briefing"] = BR.build(last, last["plan"], {k: (v or {}).get("data") for k, v in live_payload.items()})
    bundle["feed"] = feed
    (SNAPSHOT / "odin_feed.json").write_text(json.dumps(feed, ensure_ascii=False, indent=2), encoding="utf-8")

    out = WEB / "data" / "bundle.js"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("window.VK_BUNDLE=" + json.dumps(bundle, ensure_ascii=False, separators=(",", ":")) + ";\n",
                   encoding="utf-8")
    print(f"bundle: {out.stat().st_size / 1024:.0f} KB")


def meta(e):
    return {"first": e.dates[0], "last": e.dates[-1], "rows": len(e.dates), "snapshot_dates": SNAPSHOT_DATES,
            "manifest": e.manifest, "model": e.model_meta}


if __name__ == "__main__":
    main()
