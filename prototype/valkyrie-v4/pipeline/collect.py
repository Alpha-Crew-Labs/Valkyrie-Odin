"""00_RAW: public time series from 한국은행 ECOS and FRED.

Run before the demo, not during it. Output: data/00_RAW/<series>.csv (date,value)
plus data/00_RAW/_manifest.json with provenance.

Without API keys (the public GitHub Pages build) the daily series keep moving from keyless public sources:
  FRED           fredgraph.csv (full history)
  KTB 3Y / 10Y,  the latest public market-rate quote, appended as that day's close once the KR market has
  회사채 AA- 3Y,  closed (intraday quotes are never written); the BOK base rate fills the calendar days since
  기준금리        the last row
  KOSPI / KOSDAQ daily closes from the OHLCV files collected by collect_naver.py
Monthly / quarterly ECOS series (KR CPI, KR GDP) have no keyless source and keep their previous file.
"""
import csv
import json
import sys
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from valkyrie.paths import RAW, load_env  # noqa: E402

START = "2023-01-01"      # one extra year so YoY CPI exists from 2024-01
END = date.today().isoformat()
KST = timezone(timedelta(hours=9))
KR_CLOSE = (15, 40)       # KRX / KTB cash market close 15:30 KST + settling time

ECOS_SERIES = {
    # name: (stat code, cycle, item code, label)
    "bok_rate": ("722Y001", "D", "0101000", "한국은행 기준금리"),
    "ktb3": ("817Y002", "D", "010200000", "국고채(3년)"),
    "ktb10": ("817Y002", "D", "010210000", "국고채(10년)"),
    "corp_aa3": ("817Y002", "D", "010300000", "회사채(3년, AA-)"),
    "kr_cpi_index": ("901Y009", "M", "0", "소비자물가지수 총지수(2020=100)"),
    "kospi": ("802Y001", "D", "0001000", "KOSPI지수"),
    "kosdaq": ("802Y001", "D", "0089000", "KOSDAQ지수"),
    "kr_gdp_qoq": ("200Y102", "Q", "10111", "국내총생산(실질, 계절조정, 전기비)"),
}
FRED_SERIES = {
    "ust10": ("DGS10", "미국채 10년 (Treasury Constant Maturity)"),
    "us_cpi_index": ("CPIAUCSL", "US CPI-U (SA)"),
    "fed_funds": ("DFF", "Federal Funds Effective Rate"),
    # 8501 QUANT MACRO TERMINAL regime inputs (reproduced in valkyrie/tools.py)
    "us_core_pce": ("PCEPILFE", "US Core PCE Price Index (SA)"),
    "us_gdp_real": ("GDPC1", "US Real GDP (SAAR, chained 2017$)"),
}

# Keyless public market-rate quotes (latest value only; the same endpoints the v3 public collector uses).
MARKET_RATES = {
    "bonds": "https://m.stock.naver.com/front-api/marketIndex/bondList?countryCode=KOR",
    "policy": "https://m.stock.naver.com/front-api/marketIndex/standardInterestList",
    "domestic": "https://m.stock.naver.com/front-api/marketIndex/domesticInterestList",
}
QUOTE_CODE = {"ktb3": ("bonds", "KR3YT=RR"), "ktb10": ("bonds", "KR10YT=RR"),
              "corp_aa3": ("domestic", "KFIA103009"), "bok_rate": ("policy", "KROCRT=ECIX")}
PUBLIC_NOTE = "공개 시장금리 최신값 이어붙임"


def http_get(url, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (VALKYRIE-local)", "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")


def ecos(key, stat, cycle, item):
    s, e = START.replace("-", ""), END.replace("-", "")
    if cycle == "M":
        s, e = s[:6], e[:6]
    elif cycle == "Q":
        s, e = f"{s[:4]}Q1", f"{e[:4]}Q4"
    url = f"https://ecos.bok.or.kr/api/StatisticSearch/{key}/json/kr/1/20000/{stat}/{cycle}/{s}/{e}/{item}"
    payload = json.loads(http_get(url))
    if "StatisticSearch" not in payload:
        raise RuntimeError(json.dumps(payload, ensure_ascii=False)[:200])
    rows = []
    for r in payload["StatisticSearch"]["row"]:
        t = r["TIME"]
        if "Q" in t:   # 2024Q1 -> first day of the quarter
            d = f"{t[:4]}-{(int(t[-1]) - 1) * 3 + 1:02d}-01"
        else:
            d = f"{t[:4]}-{t[4:6]}-{t[6:8]}" if len(t) == 8 else f"{t[:4]}-{t[4:6]}-01"
        try:
            rows.append((d, float(r["DATA_VALUE"])))
        except ValueError:
            continue
    return rows


def fred(key, sid):
    if key:
        url = (f"https://api.stlouisfed.org/fred/series/observations?series_id={sid}"
               f"&api_key={key}&file_type=json&observation_start={START}")
        try:
            obs = json.loads(http_get(url))["observations"]
            return [(o["date"], float(o["value"])) for o in obs if o["value"] not in (".", "")], "FRED API"
        except Exception as exc:  # fall through to keyless CSV
            print(f"  FRED API failed for {sid} ({exc}); trying fredgraph.csv")
    txt = http_get(f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={sid}&cosd={START}")
    rows = []
    for line in txt.strip().splitlines()[1:]:
        d, v = line.split(",")[:2]
        if v not in (".", ""):
            rows.append((d, float(v)))
    return rows, "fredgraph.csv"


def write(name, rows):
    with open(RAW / f"{name}.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["date", "value"])
        w.writerows(rows)


# ------------------------------------------------------------------ keyless fallbacks (daily ECOS series)
def read_existing(name):
    p = RAW / f"{name}.csv"
    if not p.exists():
        return []
    with open(p, encoding="utf-8") as f:
        return [(r["date"], float(r["value"])) for r in csv.DictReader(f) if r.get("value") not in (None, "")]


def upsert(rows, new):
    """Replace or append (date, value) pairs; keeps the series sorted and unique by date."""
    by = dict(rows)
    by.update(dict(new))
    return sorted(by.items())


def kr_closed(now, d):
    """A quote dated d may be written as that day's close: any past day, or today after the KR market close."""
    today = now.date().isoformat()
    return d < today or (d == today and (now.hour, now.minute) >= KR_CLOSE)


def market_quotes(url):
    """{reutersCode: (value, 'YYYY-MM-DD')} from a public market-rate list (walks the payload, shape-agnostic)."""
    out, stack = {}, [json.loads(http_get(url, timeout=30))]
    while stack:
        o = stack.pop()
        if isinstance(o, dict):
            code, px, at = o.get("reutersCode"), o.get("closePrice"), o.get("localTradedAt")
            if code and px not in (None, "", "-") and at:
                try:
                    out[code] = (float(str(px).replace(",", "")), str(at)[:10])
                except ValueError:
                    pass
            stack.extend(o.values())
        elif isinstance(o, list):
            stack.extend(o)
    return out


def fallback_quote(name, now, cache):
    group, code = QUOTE_CODE[name]
    if group not in cache:
        cache[group] = market_quotes(MARKET_RATES[group])
    if code not in cache[group]:
        raise RuntimeError(f"{code} not in public market-rate list")
    value, d = cache[group][code]
    rows = read_existing(name)
    if name == "bok_rate":
        # daily calendar series: fill every day since the last row; days before the decision date keep the old rate
        last = rows[-1][0] if rows else d
        prev = rows[-1][1] if rows else value
        day, new = date.fromisoformat(last) + timedelta(days=1), []
        while day <= now.date():
            ds = day.isoformat()
            new.append((ds, value if ds >= d else prev))
            day += timedelta(days=1)
        return upsert(rows, new), f"{len(new)} days filled, rate {value} (decided {d})"
    if name in ("ktb3", "ktb10") and not kr_closed(now, d):
        return rows, f"intraday quote {value} ({d}) not written; waiting for the close"
    return upsert(rows, [(d, value)]), f"{d} = {value}"


def fallback_index(name, now, cache):
    """KOSPI / KOSDAQ closes from the public OHLCV file (date,open,high,low,close,volume)."""
    p = RAW / "naver" / f"ohlcv_{name}.csv"
    if not p.exists():
        raise RuntimeError(f"{p.name} missing (run collect_naver.py first)")
    rows = read_existing(name)
    last = rows[-1][0] if rows else START
    new = []
    with open(p, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            d = r.get("date", "")[:10]
            if d > last and r.get("close") not in (None, "") and kr_closed(now, d):
                new.append((d, float(r["close"])))
    return upsert(rows, new), f"{len(new)} closes appended" + (f", last {new[-1][0]}" if new else "")


FALLBACK = {"ktb3": fallback_quote, "ktb10": fallback_quote, "corp_aa3": fallback_quote, "bok_rate": fallback_quote,
            "kospi": fallback_index, "kosdaq": fallback_index}


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    env = load_env()
    ecos_key, fred_key = env.get("ECOS_API_KEY"), env.get("FRED_API_KEY")
    manifest = {"collectedAt": datetime.now(timezone.utc).isoformat(), "start": START, "end": END, "series": {}}
    failures = 0
    now = datetime.now(KST)
    cache = {}

    for name, (stat, cycle, item, label) in ECOS_SERIES.items():
        try:
            if ecos_key:
                rows = ecos(ecos_key, stat, cycle, item)
                write(name, rows)
                manifest["series"][name] = {"source": "한국은행 ECOS", "stat": stat, "item": item, "cycle": cycle,
                                            "label": label, "rows": len(rows), "last": rows[-1][0]}
                print(f"ECOS {name:14s} {len(rows):5d} rows  last {rows[-1][0]} = {rows[-1][1]}")
            elif name in FALLBACK:
                rows, note = FALLBACK[name](name, now, cache)
                if not rows:
                    raise RuntimeError("no rows")
                write(name, rows)
                via = "공개 시세 종가 이어붙임" if name in ("kospi", "kosdaq") else PUBLIC_NOTE
                manifest["series"][name] = {"source": f"한국은행 ECOS + {via}", "stat": stat, "item": item,
                                            "cycle": cycle, "label": label, "rows": len(rows), "last": rows[-1][0]}
                print(f"PUBLIC {name:12s} {len(rows):5d} rows  last {rows[-1][0]} = {rows[-1][1]}  ({note})")
            else:
                print(f"ECOS {name:14s} no ECOS_API_KEY and no public fallback: previous file kept")
        except Exception as exc:
            failures += 1
            print(f"ECOS {name:14s} FAILED: {exc}")

    for name, (sid, label) in FRED_SERIES.items():
        try:
            rows, via = fred(fred_key, sid)
            write(name, rows)
            manifest["series"][name] = {"source": f"FRED ({via})", "id": sid, "label": label,
                                        "rows": len(rows), "last": rows[-1][0]}
            print(f"FRED {name:14s} {len(rows):5d} rows  last {rows[-1][0]} = {rows[-1][1]}")
        except Exception as exc:
            failures += 1
            print(f"FRED {name:14s} FAILED: {exc}")

    # Keep the previous manifest entries for series that failed this run (their CSVs are untouched).
    old = RAW / "_manifest.json"
    if old.exists():
        prev = json.loads(old.read_text(encoding="utf-8")).get("series", {})
        for k, v in prev.items():
            manifest["series"].setdefault(k, {**v, "stale": True})
    (RAW / "_manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"done · {len(manifest['series'])} series · {failures} failures")
    return failures


if __name__ == "__main__":
    sys.exit(1 if main() else 0)
