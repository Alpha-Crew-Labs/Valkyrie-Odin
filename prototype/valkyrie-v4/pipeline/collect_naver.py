"""00_RAW/naver: public read-only NAVER(Npay) Finance data for the EQUITY layer.

Run before the demo, not during it. Complements collect.py (ECOS/FRED) with what those
sources lack: investor flows, market liquidity, OHLCV, sectors, large caps, IPO pipeline.

Output: data/00_RAW/naver/
  KR
  investor_flow_{kospi,kosdaq}.csv  date + net buy by investor type (억원); API serves the latest
                                    200 sessions only, so older rows accumulate across runs
  liquidity.csv                     고객예탁금 · 신용잔고 · 주식/채권/혼합형 수익증권 (억원) START..today
  ohlcv_{kospi,kosdaq,kpi200}.csv   date,open,high,low,close,volume                  START..today
  sectors.json                      업종(79) snapshot: changeRate, 3-day change, breadth, market cap
  large_caps.json                   market-cap top N: price, PER/PBR/ROE, foreign ownership, 52w range
  briefing.json                     top movers / trading-value leaders
  ipo_pipeline.json                 KRX IPO pipeline (real names; replaces the DEMO ipo.csv sample)
  news.json                         main market headlines
  GLOBAL (live board)
  market_board.json                 tiles: Russell2000 fut, US10Y, Nasdaq, S&P, Dow, WTI, Gold, USD/KRW,
                                    KOSPI, KOSDAQ, BTC — quote + intraday spark + ~110d closes
  us_sectors.json                   11 SPDR sector ETFs (XL*) — quote + intraday spark
  us_watchlist.json                 US ETFs / mega caps — quote + intraday spark
  world_news.json                   Reuters-via-NAVER world headlines
  calendar.json                     economic indicators / earnings / holidays, yesterday..+7d
  policy_rates.json                 central-bank policy rates (17 countries)
  _manifest.json                    provenance + row counts

Endpoints are undocumented; each dataset fails independently and keeps the previous file.
"""
import csv
import io
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from valkyrie.paths import RAW  # noqa: E402

OUT = RAW / "naver"
START = "2023-01-01"
TODAY = date.today()
LARGE_CAP_N = 50

S = "https://stock.naver.com"
M = "https://m.stock.naver.com"
HEADERS = {"User-Agent": "Mozilla/5.0 (VALKYRIE-local)", "Referer": "https://stock.naver.com/",
           "Accept": "application/json,text/plain,*/*"}

# investorGubun -> column (labels from the stock.naver.com trader page bundle)
INVESTORS = {
    "8000": "individual",       # 개인
    "9000": "foreign",          # 외국인
    "9999": "institution",      # 기관계 (not served; = sum of 1000..6000, filled in investor_flow)
    "1000": "fin_invest",       # 금융투자
    "2000": "insurance",        # 보험
    "3000": "trust",            # 투신
    "3100": "private_equity",   # 사모
    "4000": "bank",             # 은행
    "5000": "other_fin",        # 기타금융
    "6000": "pension",          # 연기금등
    "7100": "other_corp",       # 기타법인
    "9001": "other_foreign",    # 기타외국인
}
INSTITUTION_PARTS = ("1000", "2000", "3000", "3100", "4000", "5000", "6000")
LIQUIDITY = {
    "customerDeposit": "customer_deposit",           # 고객예탁금
    "creditLoan": "credit_loan",                     # 신용잔고
    "beneficiaryCertificateStock": "fund_equity",    # 주식형 수익증권
    "beneficiaryCertificateBond": "fund_bond",       # 채권형 수익증권
    "beneficiaryCertificateMixing": "fund_mixed",    # 혼합형 수익증권
}
OHLCV = {"kospi": "KOSPI", "kosdaq": "KOSDAQ", "kpi200": "KPI200"}


def get(url, timeout=20, encoding="utf-8"):
    req = urllib.request.Request(url, headers=HEADERS)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read().decode(encoding, "replace")
        except Exception:
            if attempt == 2:
                raise
            time.sleep(1.5 * (attempt + 1))


def get_json(url, **kw):
    return json.loads(get(url, **kw))


def num(v):
    if v is None or v == "":
        return None
    try:
        return float(str(v).replace(",", "").replace("%", "").replace("+", ""))
    except ValueError:
        return None


def iso(yyyymmdd):
    return f"{yyyymmdd[:4]}-{yyyymmdd[4:6]}-{yyyymmdd[6:8]}"


def write_atomic(path, text):
    """Readers (equity app, v4 valkyrie/tools.py) may read while we write: write a per-process temp file,
    then os.replace. On Windows the replace fails while a reader holds the target open, so retry briefly."""
    tmp = path.with_name(f"{path.name}.{os.getpid()}.tmp")
    tmp.write_text(text, encoding="utf-8", newline="")
    for attempt in range(40):          # ~10 s; real readers hold a file for milliseconds
        try:
            os.replace(tmp, path)
            return
        except PermissionError:
            if attempt == 39:
                tmp.unlink(missing_ok=True)   # give up: previous file stays intact, job reports FAILED
                raise
            time.sleep(0.25)


def write_csv(name, header, rows):
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(header)
    w.writerows(rows)
    write_atomic(OUT / f"{name}.csv", buf.getvalue())


def write_json(name, payload):
    write_atomic(OUT / f"{name}.json", json.dumps(payload, ensure_ascii=False, indent=2))


# ---------------------------------------------------------------- time series

def investor_flow(market):
    """Daily net buy (억원) by investor type. The API serves only the latest 200 sessions (bizdate,
    startIdx and date ranges are ignored), so older days already on disk are kept and merged."""
    path = OUT / f"investor_flow_{market.lower()}.csv"
    rows = {}
    if path.exists():
        with open(path, encoding="utf-8") as f:
            for r in csv.reader(list(f)[1:]):
                rows[r[0]] = [r[0]] + [float(v) if v else None for v in r[1:]]
    qs = urllib.parse.urlencode({"tradeType": "KRX", "marketType": market, "bizdate": TODAY.strftime("%Y%m%d"),
                                 "startIdx": 0, "pageSize": 200})
    content = get_json(f"{S}/api/domestic/market/trend/daily?{qs}").get("content") or []
    if not content:
        raise RuntimeError("trend/daily returned no rows")
    for day in content:
        net = {a["investorGubun"]: num(a["diffValue"]) for a in day.get("netAmounts", [])}
        if net.get("9999") is None and all(net.get(k) is not None for k in INSTITUTION_PARTS):
            net["9999"] = sum(net[k] for k in INSTITUTION_PARTS)
        rows[iso(day["bizdate"])] = [iso(day["bizdate"])] + [
            round(net[k] / 1e8, 1) if net.get(k) is not None else None for k in INVESTORS]
    out = [rows[k] for k in sorted(rows)]
    write_csv(f"investor_flow_{market.lower()}", ["date", *INVESTORS.values()], out)
    return out


def liquidity():
    """Daily market money: deposits, margin credit, fund balances (억원). Newest first, 200/page;
    startIdx is a page number, not a row offset."""
    rows, page, stop = {}, 0, START.replace("-", "")
    while page < 50:
        content = get_json(f"{S}/api/domestic/market/trendDeposit?startIdx={page}&pageSize=200").get("content") or []
        for r in content:
            if r["bizdate"] >= stop:
                rows[r["bizdate"]] = [iso(r["bizdate"])] + [num(r.get(k)) for k in LIQUIDITY]
        if not content or content[-1]["bizdate"] < stop:
            break
        page += 1
        time.sleep(0.3)
    out = [rows[k] for k in sorted(rows)]
    write_csv("liquidity", ["date", *LIQUIDITY.values()], out)
    return out


def ohlcv(name, symbol):
    url = (f"https://api.finance.naver.com/siseJson.naver?symbol={symbol}&requestType=1"
           f"&startTime={START.replace('-', '')}&endTime={TODAY.strftime('%Y%m%d')}&timeframe=day")
    txt = get(url)
    out = []
    for m in re.finditer(r'\["(\d{8})",\s*([^\]]+)\]', txt):
        vals = [num(v) for v in m.group(2).split(",")]
        o, h, l, c, v = vals[:5]
        out.append([iso(m.group(1)), o, h, l, c, int(v) if v is not None else None])
    if not out:
        raise RuntimeError("siseJson returned no rows")
    write_csv(f"ohlcv_{name}", ["date", "open", "high", "low", "close", "volume"], out)
    return out


# ---------------------------------------------------------------- snapshots

def sectors():
    raw = get_json(f"{S}/api/domestic/market/upjong/list?startIdx=0&pageSize=200&sortType=changeRate")
    items = [{
        "no": r["no"], "name": r["name"],
        "changeRate": num(r.get("changeRate")), "change3d": num(r.get("recent3daysChangeRate")),
        "rise": num(r.get("riseCnt")), "fall": num(r.get("fallCnt")), "steady": num(r.get("steadyCnt")),
        "total": num(r.get("totalCnt")),
        "marketCap": num(r.get("totalMarketSum")),     # 백만원
        "tradeAmount": num(r.get("totalAccAmount")),   # 백만원
        "leaders": [{"code": p[1], "name": p[2]} for p in
                    (x.split(",", 2) for x in (r.get("leadingItem") or "").split("|")) if len(p) == 3],
    } for r in raw]
    stamp = max((r.get("thistime") or "" for r in raw), default="")
    write_json("sectors", {"asOf": stamp, "units": {"marketCap": "백만원", "tradeAmount": "백만원"}, "items": items})
    return items


def large_caps():
    qs = urllib.parse.urlencode({"tradeType": "KRX", "marketType": "ALL", "orderType": "marketSum",
                                 "startIdx": 0, "pageSize": LARGE_CAP_N})
    raw = get_json(f"{S}/api/domestic/market/stock/default?{qs}")
    sign = {"2": 1, "1": 1, "3": 0, "5": -1, "4": -1}   # 상승/상한/보합/하락/하한
    items = []
    for r in raw:
        s = sign.get(str(r.get("upDownGb")), 1)
        items.append({
            "code": r["itemcode"], "name": r["itemname"], "market": "KOSPI" if r.get("sosok") == "0" else "KOSDAQ",
            "price": num(r.get("nowPrice")), "changeRate": (num(r.get("prevChangeRate")) or 0) * s,
            "marketCap": num(r.get("marketSum")),                      # 원
            "tradeAmount": num(r.get("tradeAmount")),                  # 원
            "per": num(r.get("per")), "pbr": num(r.get("pbr")), "roe": num(r.get("roe")),
            "eps": num(r.get("eps")), "dividendYield": num(r.get("dividendRate")),
            "foreignRatio": num(r.get("frgnHoldRate")),
            "high52w": num(r.get("week52HighPrice")), "low52w": num(r.get("week52LowPrice")),
            "salesGrowth": num(r.get("salesIncreasingRate")), "opGrowth": num(r.get("operatingProfitIncreasingRate")),
            "marketStatus": r.get("marketStatus"),
        })
    write_json("large_caps", {"asOf": datetime.now().isoformat(timespec="seconds"),
                              "units": {"marketCap": "원", "tradeAmount": "원"}, "items": items})
    return items


def policy_rates():
    raw = get_json(f"{S}/api/securityService/marketindex/standardInterest")
    items = [{"code": r["reutersCode"], "name": r["name"], "rate": num(r.get("closePrice")),
              "lastChange": num(r.get("fluctuations")) * (-1 if "FALL" in str(r.get("fluctuationsType")) else 1)
              if num(r.get("fluctuations")) is not None else None,
              "decidedAt": r.get("localTradedAt")} for r in raw]
    write_json("policy_rates", {"items": items})
    return items


def ipo_pipeline():
    raw = get_json(f"{S}/api/domestic/market/ipo/progress")
    lists = {k: v for k, v in raw.items() if isinstance(v, list)}
    write_json("ipo_pipeline", {"asOf": TODAY.isoformat(), **lists})
    return [x for v in lists.values() for x in v]


def news():
    raw = get_json(f"{M}/api/news/list?category=mainnews&page=1&pageSize=20")
    items = [{"title": r.get("tit"), "summary": r.get("subcontent"), "press": r.get("ohnm"),
              "publishedAt": r.get("dt"),
              "url": f"https://n.news.naver.com/mnews/article/{r.get('oid')}/{r.get('aid')}"} for r in raw]
    write_json("news", {"items": items})
    return items


def briefing():
    """stock.naver.com home briefing: KR top movers / trading-value leaders (the '중요 정리' feed)."""
    raw = get_json(f"{S}/api/securityService/home/v3/briefing")
    items = []
    for b in raw:
        r = b.get("rankingInfo") or {}
        sign = -1 if "FALL" in str((r.get("compareToPreviousPrice") or {}).get("name")) else 1
        items.append({"type": b.get("briefingType"), "nation": b.get("nationType"), "rank": r.get("ranking"),
                      "code": r.get("itemCode"), "name": r.get("itemName"), "price": num(r.get("closePrice")),
                      "changeRate": abs(num(r.get("fluctuationsRatio")) or 0) * sign,
                      "tradeValue": num(r.get("accumulatedTradingValue")), "updatedAt": b.get("updatedAt")})
    write_json("briefing", {"items": items})
    return items


# ---------------------------------------------------------------- global board (US / commodities / crypto)

API = "https://api.stock.naver.com"
CHART = f"{S}/api/securityService/chart"
SPARK_POINTS = 80

# Top tiles. kind picks the intraday chart path; US10Y history lives in 00_RAW/ust10.csv (FRED).
BOARD = [
    ("RTYcv1", "러셀2000", "futures"), ("US10YT=RR", "미10년물", None), (".IXIC", "나스닥", "index"),
    (".INX", "S&P 500", "index"), (".DJI", "다우", "index"), ("CLcv1", "WTI 유가", "futures"),
    ("GCcv1", "금", "futures"), ("FX_USDKRW", "원/달러", "fx"), ("KOSPI", "코스피", "kr_index"),
    ("KOSDAQ", "코스닥", "kr_index"),
]
US_SECTORS = [("XLB", "소재"), ("XLC", "커뮤니케이션"), ("XLY", "임의소비재"), ("XLP", "필수소비재"),
              ("XLE", "에너지"), ("XLF", "금융"), ("XLV", "헬스케어"), ("XLI", "산업재"),
              ("XLRE", "부동산"), ("XLK", "기술"), ("XLU", "유틸리티")]
US_WATCH = ["SPY", "QQQ", "DIA", "IWM", "TLT", "GLD", "USO", "UUP", "HYG", "SOXX",
            "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "AVGO", "AMD", "MU",
            "PLTR", "LITE", "IONQ"]


def thin(series, n=SPARK_POINTS):
    if len(series) <= n:
        return series
    step = (len(series) - 1) / (n - 1)
    return [series[round(i * step)] for i in range(n)]


def intraday(path):
    """Latest session's price path, thinned for sparklines: [[localDateTime, price], ...]."""
    try:
        p = get_json(f"{CHART}/{path}?periodType=day").get("priceInfos") or []
    except Exception:
        return []
    return thin([[x["localDateTime"], x["currentPrice"]] for x in p if x.get("currentPrice") is not None])


def daily_closes(path):
    """~110 sessions of daily closes: [[date, close], ...]."""
    try:
        p = get_json(f"{CHART}/{path}?periodType=dayCandle").get("priceInfos") or []
    except Exception:
        return []
    return [[iso(x["localDate"]), x["closePrice"]] for x in p if x.get("closePrice") is not None]


def chart_path(code, kind):
    return {"futures": f"foreign/futures/{code}", "index": f"foreign/index/{code}", "item": f"foreign/item/{code}",
            "fx": f"domestic/marketindex/{code}", "kr_index": f"domestic/index/{code}"}.get(kind)


def market_board():
    codes = ",".join(c for c, _, _ in BOARD)
    raw = get_json(f"{S}/api/securityService/integration/indicators?indicatorCodes={urllib.parse.quote(codes)}")
    by = {x.get("itemCode") or x.get("reutersCode"): x for x in raw}
    items = []
    for code, label, kind in BOARD:
        x = by.get(code) or {}
        path = chart_path(code, kind)
        items.append({"code": code, "label": label, "name": x.get("stockName"),
                      "price": num(x.get("currentPrice")), "change": num(x.get("fluctuations")),
                      "changeRate": num(x.get("fluctuationsRatio")),
                      "high52w": num(x.get("highPriceOf52Weeks")), "low52w": num(x.get("lowPriceOf52Weeks")),
                      "marketStatus": x.get("marketStatus"), "tradedAt": x.get("localTradedAt"),
                      "spark": intraday(path) if path else [],
                      "daily": daily_closes(path) if kind in ("futures", "index", "kr_index") else []})
        time.sleep(0.15)
    items.append(bitcoin(by.get("FX_USDKRW")))
    write_json("market_board", {"asOf": datetime.now().isoformat(timespec="seconds"), "items": items})
    return items


def bitcoin(usdkrw):
    """BTC from Upbit via NAVER (KRW); USD shown by dividing by the NAVER USD/KRW quote."""
    rows = get_json(f"{S}/api/coin/price/BTC")
    x = next((r for r in rows if r.get("exchangeType") == "UPBIT"), rows[0])
    fx = num((usdkrw or {}).get("currentPrice"))
    now = datetime.now(timezone.utc)
    frm = (now - timedelta(hours=24)).strftime("%Y-%m-%dT%H:%M:%S")
    try:
        c = get_json(f"{S}/api/coin/candle/UPBIT/KRW/BTC/minutes/60/marketInfo?from={frm}"
                     f"&to={now.strftime('%Y-%m-%dT%H:%M:%S')}").get("priceInfos") or []
    except Exception:
        c = []
    return {"code": "BTC", "label": "비트코인", "name": x.get("krName"),
            "priceKrw": x.get("tradePrice"), "price": round(x["tradePrice"] / fx, 2) if fx else None,
            "change": None, "changeRate": x.get("changeRate"), "krwPremiumRate": x.get("krwPremiumRate"),
            "marketStatus": "OPEN", "tradedAt": x.get("koreaTradedAt"),
            "spark": [[k["tradeBaseAt"], k["closePrice"]] for k in c], "daily": [],
            "units": {"price": "USD (KRW ÷ USD/KRW)", "spark": "KRW"}}


def resolve_us(symbol):
    """Ticker -> NAVER reutersCode (e.g. NVDA -> NVDA.O, SPY -> SPY) via the autocomplete API."""
    hits = get_json(f"https://ac.stock.naver.com/ac?q={symbol}&target=stock").get("items") or []
    for h in hits:
        if h.get("code") == symbol and h.get("nationCode") == "USA":
            return h["reutersCode"]
    raise RuntimeError(f"{symbol}: not found")


def us_quote(symbol, label=None):
    rc = resolve_us(symbol)
    b = get_json(f"{API}/stock/{rc}/basic")
    over = b.get("overMarketPriceInfo") or {}
    return {"symbol": symbol, "code": rc, "label": label or symbol, "name": b.get("stockName"),
            "type": b.get("stockEndType"), "exchange": b.get("stockExchangeName"),
            "price": num(b.get("closePriceRaw") or b.get("closePrice")),
            "change": num(b.get("compareToPreviousClosePriceRaw")), "changeRate": num(b.get("fluctuationsRatioRaw")),
            "open": num(b.get("openPriceRaw")), "high": num(b.get("highPriceRaw")), "low": num(b.get("lowPriceRaw")),
            "volume": num(b.get("accumulatedTradingVolumeRaw")),
            "marketValueKrw": num(b.get("marketValueKrwRaw")),
            "marketStatus": b.get("marketStatus"), "tradedAt": b.get("localTradedAt"),
            "overMarket": {"session": over.get("tradingSessionType"), "price": num(over.get("overPrice")),
                           "changeRate": num(over.get("fluctuationsRatio"))} if over else None,
            "spark": intraday(f"foreign/item/{rc}")}


def us_group(name, specs):
    items, missing = [], []
    for sym, label in specs:
        try:
            items.append(us_quote(sym, label))
        except Exception as exc:
            missing.append(f"{sym}: {exc}")
        time.sleep(0.15)
    if not items:
        raise RuntimeError("; ".join(missing))
    write_json(name, {"asOf": datetime.now().isoformat(timespec="seconds"), "items": items, "missing": missing})
    return items


def world_news():
    raw = get_json(f"{API}/news/worldNews?pageSize=30&page=1")
    items = [{"title": r.get("tit"), "summary": r.get("subcontent"), "press": r.get("ohnm"),
              "publishedAt": r.get("dt"),
              "related": [x.get("reutersCode") or x.get("symbolCode") for x in (r.get("relatedItems") or [])]}
             for r in raw]
    write_json("world_news", {"items": items})
    return items


def calendar():
    """Economic-indicator + earnings schedule, yesterday..+7d (stock.naver.com market calendar)."""
    body = {"codes": [], "from": (TODAY - timedelta(days=1)).isoformat(),
            "to": (TODAY + timedelta(days=7)).isoformat(), "myStocksOnly": False}
    items = []
    for cat in ("economicIndicators", "earnings", "holiday"):
        req = urllib.request.Request(f"{S}/api/marketCalendars/v1/events/search", method="POST",
                                     data=json.dumps({**body, "category": cat}).encode(),
                                     headers={**HEADERS, "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=20) as r:
            groups = json.loads(r.read()).get("dateGroups") or []
        for g in groups:
            for e in g.get("events", []):
                info = {i.get("label"): i.get("value") for i in e.get("information", [])}
                items.append({"date": g["date"], "category": e.get("category"), "nation": e.get("nationType"),
                              "title": e.get("title"), "subtitle": e.get("subtitle"),
                              "code": (e.get("productKey") or {}).get("itemCode"), "info": info})
    write_json("calendar", {"from": body["from"], "to": body["to"], "items": items})
    return items


# ---------------------------------------------------------------- main

JOBS = {
    "investor_flow_kospi": (lambda: investor_flow("KOSPI"), "trend/daily (투자자별 매매동향)", "D"),
    "investor_flow_kosdaq": (lambda: investor_flow("KOSDAQ"), "trend/daily (투자자별 매매동향)", "D"),
    "liquidity": (liquidity, "trendDeposit (증시자금동향)", "D*"),
    **{f"ohlcv_{k}": ((lambda k=k, s=s: ohlcv(k, s)), f"siseJson {s}", "D") for k, s in OHLCV.items()},
    "sectors": (sectors, "upjong/list (업종)", "snapshot"),
    "large_caps": (large_caps, "stock/default marketSum", "snapshot"),
    "policy_rates": (policy_rates, "marketindex/standardInterest", "snapshot"),
    "ipo_pipeline": (ipo_pipeline, "ipo/progress", "snapshot"),
    "news": (news, "news/list mainnews", "snapshot"),
    "briefing": (briefing, "home/v3/briefing", "snapshot"),
    "market_board": (market_board, "integration/indicators + chart + coin/price", "snapshot"),
    "us_sectors": (lambda: us_group("us_sectors", US_SECTORS), "SPDR sector ETFs basic + chart", "snapshot"),
    "us_watchlist": (lambda: us_group("us_watchlist", [(s, None) for s in US_WATCH]), "stock basic + chart", "snapshot"),
    "world_news": (world_news, "news/worldNews", "snapshot"),
    "calendar": (calendar, "marketCalendars/v1/events/search", "snapshot"),
}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = {"collectedAt": datetime.now(timezone.utc).isoformat(), "start": START,
                "provider": "NAVER/Npay Securities public read-only endpoints", "series": {}}
    failures = 0
    for name, (fn, endpoint, cycle) in JOBS.items():
        try:
            rows = fn()
            last = rows[-1][0] if rows and isinstance(rows[-1], list) else None
            manifest["series"][name] = {"source": "NAVER", "endpoint": endpoint, "cycle": cycle,
                                        "rows": len(rows), **({"last": last} if last else {})}
            print(f"NAVER {name:22s} {len(rows):5d} rows" + (f"  last {last}" if last else ""))
        except Exception as exc:
            failures += 1
            print(f"NAVER {name:22s} FAILED: {exc}")
    old = OUT / "_manifest.json"
    if old.exists():
        prev = json.loads(old.read_text(encoding="utf-8")).get("series", {})
        for k, v in prev.items():
            manifest["series"].setdefault(k, {**v, "stale": True})
    write_atomic(old, json.dumps(manifest, ensure_ascii=False, indent=2))   # last write = "all files done"
    print(f"done · {len(manifest['series'])} datasets · {failures} failures")
    return failures


if __name__ == "__main__":
    sys.exit(1 if main() else 0)
