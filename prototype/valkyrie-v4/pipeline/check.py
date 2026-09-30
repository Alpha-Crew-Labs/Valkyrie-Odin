"""Acceptance checks for the design-doc success criteria (run: python pipeline/check.py)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from valkyrie.engine import Engine, SNAPSHOT_DATES  # noqa: E402
from valkyrie import ontology as O  # noqa: E402

e = Engine()
ok = True


def check(name, cond, detail=""):
    global ok
    ok &= bool(cond)
    print(f"[{'PASS' if cond else 'FAIL'}] {name}  {detail}")


check("ontology 17 nodes / 24 edges", len(O.NODES) == 17 and len(O.EDGES) == 24)

base = e.state()
s = e.state(shock={"ust": 50})
dk = s["nodes"]["rat_ktb"]["delta_bp"]
b_uk = next(w for a, b, w, sg_, k in O.EDGES if (a, b) == ("rat_ust", "rat_ktb"))
check("1. UST +50bp -> 국고3Y recomputed by beta", abs(dk - b_uk * 50) < 1e-9, f"Δ국고3Y={dk:.1f}bp (β{b_uk:.2f})")
print("   ", " | ".join(s["nodes"]["rat_ktb"]["formula"]["lines"]))
for row in s["impact"]:
    print(f"    {row['label']:10s} {row['before']:9.2f} -> {row['after']:9.2f}")

lo = e.state(shock={"credit_level": 52})
hi = e.state(shock={"credit_level": 68})
d_lo, d_hi = lo["cb"]["demo"], hi["cb"]["demo"]
check("2. credit 52->68bp lowers demo CB score", d_hi["score"] < d_lo["score"], f"{d_lo['score']}/5 -> {d_hi['score']}/5")
check("2b. CB put risk in IPO decision reasons", any("CB" in r for r in hi["signals"]["equity"]["reasons"]),
      str(hi["signals"]["equity"]["reasons"]))
for it_lo, it_hi in zip(d_lo["items"], d_hi["items"]):
    print(f"    {it_lo['key']:6s} {it_lo['fmt']:>10s} {'O' if it_lo['pass'] else 'X'}  ->  {it_hi['fmt']:>10s} {'O' if it_hi['pass'] else 'X'}")

for d in SNAPSHOT_DATES:
    st = e.state(d)
    sg = st["signals"]
    print(f"  {d} ({st['date']}): {sg['macro']['call']} | {sg['rates']['call']} | {sg['equity']['call']}"
          f" | conflict={bool(st['conflict'])}  | {st['briefing']['text']}")

r = e.state()
check("3. risk thermometer + KOSPI node", r["risk"]["temps"]["all"] is not None and r["nodes"]["eq_kospi"]["market_risk"]["base"] is not None,
      f"temp {r['risk']['temps']} · KOSPI risk {r['nodes']['eq_kospi']['market_risk']['base']}")
sh = e.state(shock={"ust": 50})
check("3b. UST +50bp lowers KOSPI and raises its risk", sh["nodes"]["eq_kospi"]["value"] < r["nodes"]["eq_kospi"]["value"]
      and sh["nodes"]["eq_kospi"]["market_risk"]["value"] > r["nodes"]["eq_kospi"]["market_risk"]["value"],
      f"{r['nodes']['eq_kospi']['value']:.0f} -> {sh['nodes']['eq_kospi']['value']:.0f} · temp {r['risk']['temps']['all']} -> {sh['risk']['temps']['all']}")
print("ALL PASS" if ok else "SOME CHECKS FAILED")
sys.exit(0 if ok else 1)
