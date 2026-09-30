"""10_MODEL: 00_RAW -> daily point-in-time frame + macro model outputs + equity samples.

Outputs
  data/10_MODEL/daily.csv        one row per KTB business day (as-of joined, publication-lagged)
  data/10_MODEL/macro_model.csv  date, kr_gdp_now, us_gdp_now, kr_cpi_fcst, kr_cpi_actual, taylor_rate,
                                 bok_actual, model_version, mae   (design-doc schema)
  data/10_MODEL/ipo.csv          REAL KOSDAQ IPO sample (00_RAW/research: 38커뮤니케이션 + NAVER financials);
                                 DEMO generator only when the research snapshot is missing
  data/10_MODEL/cb.csv           REAL KOSDAQ CB issues (CB Zero Finder / DART + NAVER); DEMO fallback likewise

Everything is deterministic: same RAW in, same MODEL out.
"""
import bisect
import csv
import json
import math
import random
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from valkyrie import risk as RK  # noqa: E402
from valkyrie.paths import MODEL, RAW  # noqa: E402


def equity_history():
    """{'kospi': [[date, composite, state, w_target], ...], 'kosdaq': [...]} from the 8512 equity model, run read-only
    through valkyrie.tools (project venv); falls back to the last cached run, else empty."""
    try:
        from valkyrie.tools import Tools
        t = Tools()
        t.refresh_equity()
        eq = t.equity or {}
        return {mk: (eq.get(mk) or {}).get("history") or [] for mk in ("kospi", "kosdaq")}
    except Exception as exc:   # the macro/rates model must not depend on the equity app being importable
        print(f"equity model unavailable: {exc}")
        return {}

START = "2024-01-02"
MODEL_VERSION = "valkyrie-macro-0.1 (taylor+ar1)"
R_STAR = 0.5          # neutral real rate (%), KR
POTENTIAL_GDP = 2.0   # potential growth (%), KR
CPI_TARGET = 2.0


def read(name):
    with open(RAW / f"{name}.csv", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    return [(r["date"], float(r["value"])) for r in rows]


class AsOf:
    """Value known on day d: latest observation whose availability date <= d."""

    def __init__(self, rows, lag=lambda d: d):
        pairs = sorted((lag(d), d, v) for d, v in rows)
        self.avail = [p[0] for p in pairs]
        self.obs = [(p[1], p[2]) for p in pairs]

    def __call__(self, d):
        i = bisect.bisect_right(self.avail, d) - 1
        return self.obs[i] if i >= 0 else (None, None)


def shift_month(d, months, day):
    y, m = int(d[:4]), int(d[5:7]) + months
    y, m = y + (m - 1) // 12, (m - 1) % 12 + 1
    return f"{y:04d}-{m:02d}-{day:02d}"


def yoy(rows):
    by = {d[:7]: v for d, v in rows}
    out = []
    for d, v in rows:
        prev = by.get(f"{int(d[:4]) - 1}{d[4:7]}")
        if prev:
            out.append((d, (v / prev - 1) * 100))
    return out


def main():
    MODEL.mkdir(parents=True, exist_ok=True)
    s = {n: read(n) for n in ["bok_rate", "ktb3", "ktb10", "corp_aa3", "kospi", "kosdaq", "ust10", "fed_funds",
                               "kr_cpi_index", "us_cpi_index", "kr_gdp_qoq"]}

    # Publication lags (point-in-time): KR CPI ~ 2nd business day of M+1, US CPI ~ mid M+1,
    # KR GDP advance estimate ~ 4 weeks after quarter end.
    kr_cpi = yoy(s["kr_cpi_index"])
    us_cpi = yoy(s["us_cpi_index"])
    asof = {
        "bok": AsOf(s["bok_rate"]), "ktb3": AsOf(s["ktb3"]), "ktb10": AsOf(s["ktb10"]),
        "aa3": AsOf(s["corp_aa3"]), "kospi": AsOf(s["kospi"]), "kosdaq": AsOf(s["kosdaq"]),
        "ust10": AsOf(s["ust10"]), "fed": AsOf(s["fed_funds"]),
        "kr_cpi": AsOf(kr_cpi, lambda d: shift_month(d, 1, 3)),
        "us_cpi": AsOf(us_cpi, lambda d: shift_month(d, 1, 13)),
        "gdp": AsOf(s["kr_gdp_qoq"], lambda d: shift_month(d, 3, 28)),
    }
    gdp_rows = sorted(s["kr_gdp_qoq"])

    def gdp_now(d):
        """Sum of the last 4 published QoQ prints ~ YoY growth proxy."""
        pub = [v for q, v in gdp_rows if shift_month(q, 3, 28) <= d]
        return sum(pub[-4:]) if len(pub) >= 4 else None

    # KR CPI model: AR(1) toward target on published YoY, forecasting next month.
    cpi_months = sorted(kr_cpi)
    fcst_by_month, errors = {}, []
    for i in range(1, len(cpi_months)):
        prev_m, prev_v = cpi_months[i - 1]
        m, actual = cpi_months[i]
        f = CPI_TARGET + 0.85 * (prev_v - CPI_TARGET)
        fcst_by_month[m[:7]] = f
        errors.append(abs(actual - f))

    dates = [d for d, _ in s["ktb3"] if d >= START]
    daily, model_rows = [], []
    for d in dates:
        row = {"date": d}
        for k in ["bok", "ktb3", "ktb10", "aa3", "kospi", "kosdaq", "ust10", "fed"]:
            row[k] = asof[k](d)[1]
        cm, cv = asof["kr_cpi"](d)
        um, uv = asof["us_cpi"](d)
        row["kr_cpi"], row["kr_cpi_month"] = cv, cm[:7] if cm else None
        row["us_cpi"], row["us_cpi_month"] = uv, um[:7] if um else None
        # forecast for the month *after* the latest published one
        nxt = shift_month(cm, 1, 1)[:7] if cm else None
        f_next = CPI_TARGET + 0.85 * (cv - CPI_TARGET) if cv is not None else None
        row["kr_cpi_fcst"] = f_next
        row["cpi_surprise"] = (cv - fcst_by_month[cm[:7]]) if cm and cm[:7] in fcst_by_month else 0.0
        g = gdp_now(d)
        row["gdp_now"] = g
        gap = (g - POTENTIAL_GDP) if g is not None else 0.0
        pi = cv if cv is not None else CPI_TARGET
        row["taylor"] = R_STAR + pi + 0.5 * (pi - CPI_TARGET) + 0.5 * gap
        row["credit_bp"] = (row["aa3"] - row["ktb3"]) * 100
        row["curve_bp"] = (row["ktb10"] - row["ktb3"]) * 100
        daily.append(row)
        mae_hist = [e for (m2, _), e in zip(cpi_months[1:], errors) if shift_month(m2, 1, 3) <= d]
        model_rows.append({
            "date": d, "kr_gdp_now": g, "us_gdp_now": None, "kr_cpi_fcst": f_next, "kr_cpi_actual": cv,
            "taylor_rate": row["taylor"], "bok_actual": row["bok"], "model_version": MODEL_VERSION,
            "mae": sum(mae_hist) / len(mae_hist) if mae_hist else None,
        })

    # KOSDAQ valuation proxy: level vs trailing 250-day mean (%)
    for i, row in enumerate(daily):
        win = [r["kosdaq"] for r in daily[max(0, i - 249):i + 1]]
        row["kosdaq_val"] = (row["kosdaq"] / (sum(win) / len(win)) - 1) * 100

    R = _research()
    if R:
        ipo, cb = make_ipo_real(R), make_cb_real(R)
        known = "known_date"
    else:   # no research snapshot on disk: fall back to the labelled DEMO generators
        ipo, cb = make_ipo(daily), make_cb()
        known = "listing_date"
    # Rolling median 기관 경쟁률 of the last 10 forecasts known on each day; loss share of the last 40 with a known flag
    ipo_sorted = sorted(ipo, key=lambda r: r[known])
    for row in daily:
        seen = [r for r in ipo_sorted if r[known] <= row["date"]]
        past = sorted(r["demand_ratio"] for r in seen[-10:])
        row["ipo_demand"] = (past[(len(past) - 1) // 2] + past[len(past) // 2]) / 2 if past else None
        loss = [r["loss_making"] for r in seen if r["loss_making"] is not None][-40:]
        row["loss_share"] = 100 * sum(loss) / len(loss) if loss else None

    # Early rows precede the first publication of some series: back-fill with the first published value
    # (documented limitation; affects Jan-2024 only) and recompute the Taylor rate.
    for k in ["kr_cpi", "us_cpi", "kr_cpi_fcst", "gdp_now", "ipo_demand", "loss_share"]:
        first = next(r[k] for r in daily if r[k] is not None)
        for r in daily:
            if r[k] is not None:
                break
            r[k] = first
    for r, m in zip(daily, model_rows):
        gap = r["gdp_now"] - POTENTIAL_GDP
        r["taylor"] = R_STAR + r["kr_cpi"] + 0.5 * (r["kr_cpi"] - CPI_TARGET) + 0.5 * gap
        m["taylor_rate"] = r["taylor"]
        r["taylor_gap"] = r["taylor"] - r["bok"]

    # KOSPI / KOSDAQ market risk from the 8512 equity model (expanding windows -> point-in-time), as-of joined
    eq_hist = equity_history()
    for mk in ("kospi", "kosdaq"):
        h = eq_hist.get(mk) or []
        dates_h = [x[0] for x in h]
        for r in daily:
            j = bisect.bisect_right(dates_h, r["date"]) - 1
            comp, state, w = (h[j][1], h[j][2], h[j][3]) if j >= 0 else (None, None, None)
            r[f"{mk}_risk"], r[f"{mk}_state"], r[f"{mk}_wt"] = comp, state, w

    # Node risk = PIT percentile within the previous WINDOW days (valkyrie/risk.py) + lane / overall thermometer
    cols = {n: [r[k] for r in daily] for n, (k, _, _) in RK.KEYS.items()}
    for i, r in enumerate(daily):
        risks = {}
        for n, (k, bad, _) in RK.KEYS.items():
            v = r[k]
            risks[n] = RK.kospi_abs(v) if bad == "abs" else RK.pct_risk(cols[n][max(0, i - RK.WINDOW):i], v, bad)
            r[f"risk_{n}"] = risks[n]
        t = RK.temps(risks)
        r["temp_mac"], r["temp_rat"], r["temp_eq"], r["temp_all"] = t["mac"], t["rat"], t["eq"], t["all"]

    write_csv(MODEL / "daily.csv", daily)
    write_csv(MODEL / "macro_model.csv", model_rows)
    write_csv(MODEL / "ipo.csv", ipo)
    write_csv(MODEL / "cb.csv", cb)
    meta = {"rows": len(daily), "first": daily[0]["date"], "last": daily[-1]["date"],
            "model_version": MODEL_VERSION, "cpi_mae": sum(errors) / len(errors),
            "equity_sample": "REAL" if R else "DEMO", "ipo_rows": len(ipo), "cb_rows": len(cb),
            "equity_sources": ("38커뮤니케이션 수요예측·신규상장 · CB Zero Finder(DART) · NAVER 시세·재무"
                               if R else "DEMO 가상 표본")}
    (MODEL / "_meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(meta, ensure_ascii=False))
    last = daily[-1]
    print({k: (round(v, 3) if isinstance(v, float) else v) for k, v in last.items()})


def write_csv(path, rows):
    keys = list(rows[0].keys())
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=keys)
        w.writeheader()
        for r in rows:
            w.writerow({k: ("" if r[k] is None else (round(r[k], 6) if isinstance(r[k], float) else r[k])) for k in keys})


SECTORS = ["바이오", "2차전지소재", "반도체장비", "AI소프트웨어", "로봇", "의료기기", "게임", "화장품", "방산부품", "핀테크"]
SUFFIX = ["A", "B", "C", "D", "E", "F", "G", "H", "J", "K"]


RESEARCH = RAW / "research"


def _research():
    """REAL equity samples from pipeline/collect_research.py, or None (then the DEMO generators are used)."""
    need = ["ipo_demand.csv", "ipo_listings.csv", "cb_issues.json", "companies.json"]
    if not all((RESEARCH / f).exists() for f in need):
        return None
    with open(RESEARCH / "ipo_demand.csv", encoding="utf-8") as f:
        demand = list(csv.DictReader(f))
    with open(RESEARCH / "ipo_listings.csv", encoding="utf-8") as f:
        listings = {r["name"]: r for r in csv.DictReader(f)}
    cb = json.loads((RESEARCH / "cb_issues.json").read_text(encoding="utf-8"))
    co = json.loads((RESEARCH / "companies.json").read_text(encoding="utf-8"))
    return {"demand": demand, "listings": listings, "cb": cb, "co": co}


def _f(v):
    if v in (None, "", "-"):
        return None
    try:
        return float(str(v).replace(",", "").replace("%", ""))
    except ValueError:
        return None


def _fin(co, code, key, year=None):
    """Annual actual value (억원 / %) for `year` (e.g. 2025), else the latest actual year."""
    series = ((co["byCode"].get(code) or {}).get("fin") or {}).get(key) or {}
    vals = {int(k[:4]): v for k, v in series.items() if v is not None}
    if not vals:
        return None, None
    if year is not None:
        if year in vals:
            return vals[year], year
        later = sorted(y for y in vals if y > year)     # IPO filers often have no audited year before listing
        return (vals[later[0]], later[0]) if later else (None, None)
    y = max(vals)
    return vals[y], y


def make_ipo_real(R):
    """REAL: 38커뮤니케이션 수요예측 결과 (기관 경쟁률) joined with 신규상장 수익률 and NAVER financials.
    Point-in-time: a forecast result is known the day after its forecast date; loss-making = net income of the
    fiscal year before the forecast (first audited year if none)."""
    rows = []
    for r in R["demand"]:
        hit = R["co"]["nameToCode"].get(r["name"]) or {}
        market = hit.get("market")
        if market and market != "KOSDAQ":
            continue
        code = hit.get("code")
        ni, fy = _fin(R["co"], code, "당기순이익", int(r["forecast_date"][:4]) - 1) if code else (None, None)
        ls = R["listings"].get(r["name"]) or {}
        known = (date.fromisoformat(r["forecast_date"]) + timedelta(days=1)).isoformat()
        rows.append({
            "name": r["name"], "code": f"A{code}" if code else "", "market": market or "KOSDAQ?",
            "forecast_date": r["forecast_date"], "known_date": known, "listing_date": ls.get("listing_date") or "",
            "offer_price": _f(r["final_price"]), "band_lo": _f(r["band_lo"]), "band_hi": _f(r["band_hi"]),
            "demand_ratio": _f(r["demand_ratio"]), "lockup_pct": _f(r["lockup_pct"]),
            "return_vs_offer_pct": _f(ls.get("return_vs_offer_pct")), "open_vs_offer_pct": _f(ls.get("open_vs_offer_pct")),
            "loss_making": None if ni is None else int(ni < 0), "net_income_eok": ni, "net_income_fy": fy,
            "underwriter": r["underwriter"], "flag": "REAL",
        })
    return [r for r in rows if r["demand_ratio"] is not None]


def make_cb_real(R):
    """REAL: KOSDAQ CB issues from CB Zero Finder (DART) + NAVER price and latest annual financials.
    Existing shares are implied by the disclosed dilution: new/(existing+new) = dilution.
    ASSUMPTIONS (labelled on screen): put exercisable 12 months after the receipt date; no refixing floor
    disclosed ('-') means no downward refixing; equity duration / credit beta by profitability class."""
    rows = []
    for r in R["cb"].get("rows", []):
        if r.get("market") != "KOSDAQ":
            continue
        conv, amt, dil = _f(r.get("convertPrice")), _f(r.get("amountEok")), _f(r.get("dilutionRate"))
        code = r.get("stockCode")
        c = R["co"]["byCode"].get(code) or {}
        if not conv or not amt or not c.get("price"):
            continue
        floor = _f(r.get("refixingFloor")) or conv
        new_m = amt * 1e8 / conv / 1e6
        d = (dil or 10.0) / 100
        opm, fy = _fin(R["co"], code, "영업이익률")
        opm_prev, _ = _fin(R["co"], code, "영업이익률", fy - 1) if fy else (None, None)
        ni, _ = _fin(R["co"], code, "당기순이익")
        loss = ni is not None and ni < 0
        issue = r.get("receiptDate")
        y, m = int(issue[:4]), int(issue[5:7])
        rows.append({
            "name": r.get("corpName"), "code": f"A{code}", "sector": c.get("industry") or "KOSDAQ",
            "issue_date": issue, "conv_price": conv, "refix_floor": floor, "refix_clause": int(floor < conv),
            "put_date": f"{y + 1:04d}-{m:02d}-{issue[8:10]}", "maturity": r.get("maturityDate"),
            "balance_eok": amt, "dilution_disclosed": dil, "price": c["price"], "shares_m": round(new_m * (1 - d) / d, 3),
            "surface_rate": _f(r.get("surfaceRate")), "maturity_rate": _f(r.get("maturityRate")),
            "credit_beta": 1.6 if loss else 0.9, "eq_duration": 22 if loss else 15,
            "d_opm": None if opm is None or opm_prev is None else round(opm - opm_prev, 2), "fin_fy": fy,
            "debt_ratio": _fin(R["co"], code, "부채비율")[0], "quick_ratio": _fin(R["co"], code, "당좌비율")[0],
            "revenue_eok": _fin(R["co"], code, "매출액")[0], "net_income_eok": ni,
            "receipt_no": f"R{r.get('receiptNo')}", "flag": "REAL",
        })
    rows.sort(key=lambda x: x["issue_date"])
    return rows


def make_ipo(daily):
    """DEMO: ~100 fictional KOSDAQ IPOs. Demand falls when the discount rate (KTB10) is high."""
    rng = random.Random(20260929)
    ktb10 = {r["date"]: r["ktb10"] for r in daily}
    kosdaq = {r["date"]: r["kosdaq"] for r in daily}
    dates = [r["date"] for r in daily]
    mean10 = sum(ktb10.values()) / len(ktb10)
    rows = []
    for i in range(100):
        d = dates[min(len(dates) - 1, int(i * len(dates) / 100) + rng.randint(0, 4))]
        loss = rng.random() < 0.6
        sector = SECTORS[i % len(SECTORS)]
        base = 900 if not loss else 700
        demand = base * math.exp(-1.6 * (ktb10[d] - mean10)) * math.exp(rng.gauss(0, 0.35))
        lockup = max(1.0, min(60.0, rng.gauss(18 if loss else 26, 9)))
        # 20-business-day performance of the index after listing + idiosyncratic
        j = dates.index(d)
        fwd = kosdaq[dates[min(j + 20, len(dates) - 1)]] / kosdaq[d] - 1
        ret = 100 * (0.9 * fwd + 0.0006 * (demand - 700) + rng.gauss(0, 0.35 if loss else 0.25))
        rows.append({
            "name": f"{sector}{SUFFIX[i // 10]}{i % 10}", "sector": sector, "listing_date": d,
            "offer_price": rng.choice([8000, 10000, 12000, 15000, 18000, 22000, 25000]),
            "demand_ratio": round(demand, 1), "lockup_pct": round(lockup, 1),
            "return_vs_offer_pct": round(ret, 1), "loss_making": int(loss),
            "lockup_release": (date.fromisoformat(d) + timedelta(days=180)).isoformat(),
            "flag": "DEMO",
        })
    return rows


def make_cb():
    """DEMO: 50 fictional KOSDAQ CB issuers. Row 0 is the scripted demo company."""
    rng = random.Random(4172)
    rows = [{
        # Scripted demo issuer: scores 4/5 at a 52bp AA- spread, 2/5 at 68bp (see engine.score_cb).
        "name": "레이븐바이오텍(DEMO)", "sector": "바이오", "issue_date": "2025-09-15",
        "conv_price": 12000, "refix_floor": 8400, "put_date": "2027-03-15",
        "balance_eok": 300, "cash_eok": 380, "burn_eok_m": 12, "price": 10800, "shares_m": 15,
        "credit_beta": 1.6, "eq_duration": 22, "d_gpm": 1.8, "accruals": 6.5, "asset_turnover": 0.42,
        "flag": "DEMO",
    }]
    for i in range(1, 50):
        conv = rng.choice([5000, 7000, 9000, 12000, 15000, 20000])
        rows.append({
            "name": f"코스닥CB{SUFFIX[i % 10]}{i:02d}(DEMO)", "sector": SECTORS[i % len(SECTORS)],
            "issue_date": f"202{rng.choice([4, 5, 5, 6])}-{rng.randint(1, 12):02d}-15",
            "conv_price": conv, "refix_floor": round(conv * 0.7),
            "put_date": f"202{rng.choice([6, 7, 7, 8])}-{rng.randint(1, 12):02d}-15",
            "balance_eok": rng.choice([80, 120, 150, 200, 300, 500]),
            "cash_eok": rng.randint(60, 900), "burn_eok_m": rng.choice([3, 5, 8, 12, 18]),
            "price": round(conv * rng.uniform(0.7, 1.35)), "shares_m": rng.randint(12, 60),
            "credit_beta": round(rng.uniform(0.6, 2.0), 2), "eq_duration": rng.randint(12, 30),
            "d_gpm": round(rng.gauss(0, 3), 1), "accruals": round(abs(rng.gauss(7, 5)), 1),
            "asset_turnover": round(rng.uniform(0.25, 1.1), 2), "flag": "DEMO",
        })
    return rows


if __name__ == "__main__":
    main()
