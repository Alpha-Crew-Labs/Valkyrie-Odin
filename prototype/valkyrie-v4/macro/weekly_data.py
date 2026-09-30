"""Weekly Updates 보고서 데이터: NAVER(Npay) 공개 엔드포인트 + 한국은행 ECOS.

규칙
- 기준일 값은 "기준일 이전 마지막 거래일 종가"다. 전주·전월·3개월·전년 비교 시점도 같은 규칙을 쓴다.
- 시리즈마다 따로 실패한다. 받지 못하면 reports/cache 의 마지막 수집본(SNAPSHOT)을 쓰고, 그것도 없으면 N/A로 둔다.
  숫자는 만들지 않는다. 무료 공개 소스가 없는 스왑레이트(1M~1Y)와 CDS 프리미엄은 항상 N/A다.
- 대체 표기: USDCNH는 NAVER에 없어 역내 USDCNY, AAA 회사채 3Y는 공개 데이터가 없어 AA-(ECOS 817Y002).

엔드포인트 특이점 (2026-09-30 확인)
- chart/{path}?periodType=dayCandle 은 약 110거래일, weekCandle 은 약 110주다. 주봉 날짜는 그 주의 마지막 거래일이라
  일봉과 그대로 이어 붙인다.
- front-api/marketIndex/prices 는 pageSize 60만 받는다(5·100은 400). page 를 넘기며 1년 이상 받는다.
  채권(…YT=RR)의 일별 이력은 chart 가 아니라 여기서만 나온다.
"""
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent            # 대시보드/macro
DASH = HERE.parent                                 # 대시보드
CACHE = HERE / "reports" / "cache"
NAVER_RAW = DASH / "data" / "00_RAW" / "naver"     # VALKYRIE 파이프라인 수집본 (읽기 전용 폴백)
ENV_FILES = [DASH / ".env", DASH.parent / "채권" / ".env"]   # valkyrie/paths.py 와 같은 순서, 읽기만

HEADERS = {"User-Agent": "Mozilla/5.0 (VALKYRIE-local)", "Accept": "application/json,text/plain,*/*"}
CHART = "https://stock.naver.com/api/securityService/chart"
PRICES = "https://m.stock.naver.com/front-api/marketIndex/prices"
TREND = "https://stock.naver.com/api/domestic/market/trend/daily"
ECOS = "https://ecos.bok.or.kr/api/StatisticSearch"
PAGE_SIZE = 60
MAX_PAGES = 12
KEEP_CACHE = 8


def _s(sid, label, src, dec, unit="pct", **kw):
    return {"id": sid, "label": label, "src": src, "dec": dec, "unit": unit, **kw}


INDICES = [
    _s("DJI", "Dow Jones Industrial Avg", ("chart", "foreign/index/.DJI"), 1, group="US"),
    _s("SPX", "S&P 500", ("chart", "foreign/index/.INX"), 1, group="US"),
    _s("IXIC", "NASDAQ Composite", ("chart", "foreign/index/.IXIC"), 1, group="US"),
    _s("SX5E", "Euro Stoxx50", ("chart", "foreign/index/.STOXX50E"), 1, group="Europe"),
    _s("DAX", "DAX", ("chart", "foreign/index/.GDAXI"), 1, group="Europe"),
    _s("FTSE", "FTSE100", ("chart", "foreign/index/.FTSE"), 1, group="Europe"),
    _s("KOSPI", "KOSPI", ("chart", "domestic/index/KOSPI"), 1, group="ASIA"),
    _s("N225", "Nikkei 225", ("chart", "foreign/index/.N225"), 1, group="ASIA"),
    _s("SSEC", "SSE(China)", ("chart", "foreign/index/.SSEC"), 1, group="ASIA"),
    _s("HSI", "Hang Seng", ("chart", "foreign/index/.HSI"), 1, group="ASIA"),
]
KOSDAQ = _s("KOSDAQ", "KOSDAQ", ("chart", "domestic/index/KOSDAQ"), 1)
FX = [
    _s("DXY", "DXY", ("chart", "foreign/index/.DXY"), 2),
    _s("USDJPY", "USDJPY", ("prices", "exchangeWorld", "USDJPY"), 2),
    _s("EURUSD", "EURUSD", ("prices", "exchangeWorld", "EURUSD"), 4),
    _s("GBPUSD", "GBPUSD", ("prices", "exchangeWorld", "GBPUSD"), 4,
       alt=("prices", "exchangeWorld", "USDGBP"), alt_inverse=True),
    _s("USDKRW", "USDKRW", ("prices", "exchange", "FX_USDKRW"), 2),
    _s("USDCNY", "USDCNY*", ("prices", "exchangeWorld", "USDCNY"), 4, note="USDCNH 미제공 → 역내 USDCNY"),
]
SWAP_SPOT = [   # 스왑레이트 표의 Spot 열 (구간 스왑레이트는 N/A)
    _s("EURKRW", "EURKRW", ("prices", "exchange", "FX_EURKRW"), 2, spot_only=True),
    _s("GBPKRW", "GBPKRW", ("prices", "exchange", "FX_GBPKRW"), 2, spot_only=True),
]
RATES = [
    _s("KR3Y", "3Y", ("prices", "bond", "KR3YT=RR"), 2, "bp", group="Korea"),
    _s("KR5Y", "5Y", ("prices", "bond", "KR5YT=RR"), 2, "bp", group="Korea"),
    _s("KR10Y", "10Y", ("prices", "bond", "KR10YT=RR"), 2, "bp", group="Korea"),
    _s("KR30Y", "30Y", ("prices", "bond", "KR30YT=RR"), 2, "bp", group="Korea"),
    _s("KRAA3Y", "Corp 3Y (AA-)*", ("ecos", "817Y002", "010300000"), 2, "bp", group="Korea",
       note="AAA 3Y 공개 데이터 부재 → AA- (ECOS)"),
    _s("US2Y", "2Y", ("prices", "bond", "US2YT=RR"), 2, "bp", group="US"),
    _s("US5Y", "5Y", ("prices", "bond", "US5YT=RR"), 2, "bp", group="US"),
    _s("US10Y", "10Y", ("prices", "bond", "US10YT=RR"), 2, "bp", group="US"),
    _s("US30Y", "30Y", ("prices", "bond", "US30YT=RR"), 2, "bp", group="US"),
    _s("JP2Y", "2Y", ("prices", "bond", "JP2YT=RR"), 2, "bp", group="Japan"),
    _s("JP5Y", "5Y", ("prices", "bond", "JP5YT=RR"), 2, "bp", group="Japan"),
    _s("JP10Y", "10Y", ("prices", "bond", "JP10YT=RR"), 2, "bp", group="Japan"),
    _s("JP30Y", "30Y", ("prices", "bond", "JP30YT=RR"), 2, "bp", group="Japan"),
    _s("UK10Y", "10Y", ("prices", "bond", "GB10YT=RR"), 2, "bp", group="UK"),
    _s("DE10Y", "10Y", ("prices", "bond", "DE10YT=RR"), 2, "bp", group="Germany"),
    _s("FR10Y", "10Y", ("prices", "bond", "FR10YT=RR"), 2, "bp", group="France"),
    _s("IT10Y", "10Y", ("prices", "bond", "IT10YT=RR"), 2, "bp", group="Italy"),
]
COMMODITIES = [
    _s("WTI", "WTI", ("prices", "energy", "CLcv1"), 2, group="유가·천연가스"),
    _s("DUBAI", "Dubai", ("prices", "energy", "DCBc1"), 2, group="유가·천연가스"),
    _s("BRENT", "Brent", ("prices", "energy", "LCOcv1"), 2, group="유가·천연가스"),
    _s("NG", "NYMEX Natural Gas", ("prices", "energy", "NGcv1"), 3, group="유가·천연가스"),
    _s("GOLD", "Gold", ("prices", "metals", "GCcv1"), 1, group="메탈"),
    _s("SILVER", "Silver", ("prices", "metals", "SIcv1"), 2, group="메탈"),
    _s("COPPER", "Copper", ("prices", "metals", "HGcv1"), 3, group="메탈"),
    _s("BDI", "Baltic Dry Index", ("chart", "foreign/index/.BADI"), 0, group="그 외"),
]
VIX = _s("VIX", "VIX", ("chart", "foreign/index/.VIX"), 2)
# 크레딧 스프레드(AA- − 국고 3Y)는 같은 출처(ECOS)끼리 뺀다 — 표에는 나오지 않는 보조 시리즈
KTB3_ECOS = _s("KR3Y_ECOS", "국고 3Y (ECOS)", ("ecos", "817Y002", "010200000"), 2, "bp")
SWAP_ROWS = ["USDKRW", "EURKRW", "GBPKRW"]
CDS_ROWS = ["Germany", "China", "Korea", "Brazil", "Turkey", "Japan"]
ALL_SPECS = INDICES + [KOSDAQ] + FX + SWAP_SPOT + RATES + COMMODITIES + [VIX, KTB3_ECOS]
SPEC = {s["id"]: s for s in ALL_SPECS}

NA_NOTES = [
    "통화별 구간 스왑레이트(1M~1Y)·CDS 프리미엄: 무료 공개 소스 없음 → N/A (Spot 은 NAVER 환율)",
    "USDCNY*: USDCNH 미제공 → 역내 위안 · Corp 3Y (AA-)*: AAA 3Y 공개 데이터 부재 → AA- (한국은행 ECOS)",
]


# ---------------------------------------------------------------- fetching
def _env():
    env = {}
    for f in ENV_FILES:
        try:
            for line in f.read_text(encoding="utf-8-sig").splitlines():
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    env.setdefault(k.strip(), v.strip().strip("'\""))
        except OSError:
            continue
    return env


def _get_json(url, referer, timeout=20):
    req = urllib.request.Request(url, headers={**HEADERS, "Referer": referer})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read().decode("utf-8", "replace"))
        except urllib.error.HTTPError as exc:
            if exc.code in (400, 404) or attempt == 2:   # 잘못된 코드·파라미터는 재시도해도 같다
                raise
        except Exception:
            if attempt == 2:
                raise
        time.sleep(1.0 * (attempt + 1))


def _num(v):
    if v is None or v == "":
        return None
    try:
        return float(str(v).replace(",", "").replace("+", ""))
    except ValueError:
        return None


def _series(points):
    s = pd.Series({pd.Timestamp(d): v for d, v in points.items()}, dtype="float64").sort_index()
    return s[~s.index.duplicated(keep="last")]


def _chart(path):
    points = {}
    for period in ("weekCandle", "dayCandle"):          # 주봉(약 2년) 위에 일봉(약 110거래일)을 덮는다
        rows = _get_json(f"{CHART}/{path}?periodType={period}", "https://stock.naver.com/").get("priceInfos") or []
        for x in rows:
            v, d = _num(x.get("closePrice")), x.get("localDate")
            if v is not None and d:
                points[f"{d[:4]}-{d[4:6]}-{d[6:8]}"] = v
    if not points:
        raise RuntimeError(f"{path}: 빈 응답")
    return _series(points)


def _prices(category, code, since, spot_only=False):
    points = {}
    for page in range(1, (1 if spot_only else MAX_PAGES) + 1):
        url = (f"{PRICES}?category={category}&reutersCode={urllib.parse.quote(code)}"
               f"&page={page}&pageSize={PAGE_SIZE}")
        j = _get_json(url, "https://m.stock.naver.com/")
        rows = j.get("result") or []
        if not rows:
            if page == 1:
                raise RuntimeError(f"{code}: 데이터 없음 (isSuccess={j.get('isSuccess')})")
            break
        for r in rows:
            v, d = _num(r.get("closePrice")), (r.get("localTradedAt") or "")[:10]
            if v is not None and d:
                points[d] = v
        if min((r.get("localTradedAt") or "9")[:10] for r in rows) < since:
            break
        time.sleep(0.12)
    return _series(points)


def _ecos(stat, item, since, key):
    if not key:
        raise RuntimeError("ECOS_API_KEY 없음")
    url = (f"{ECOS}/{key}/json/kr/1/5000/{stat}/D/{since.replace('-', '')}/"
           f"{date.today().strftime('%Y%m%d')}/{item}")
    payload = _get_json(url, "https://ecos.bok.or.kr/", timeout=40)
    rows = (payload.get("StatisticSearch") or {}).get("row")
    if not rows:
        raise RuntimeError(json.dumps(payload, ensure_ascii=False)[:160])
    return _series({f"{r['TIME'][:4]}-{r['TIME'][4:6]}-{r['TIME'][6:8]}": _num(r["DATA_VALUE"])
                    for r in rows if _num(r.get("DATA_VALUE")) is not None})


def _fetch(spec, since, env):
    kind, *args = spec["src"]
    try:
        if kind == "chart":
            return _chart(args[0])
        if kind == "prices":
            return _prices(args[0], args[1], since, spec.get("spot_only", False))
        if kind == "ecos":
            return _ecos(args[0], args[1], since, env.get("ECOS_API_KEY"))
        raise ValueError(kind)
    except Exception:
        if not spec.get("alt"):
            raise
        s = _prices(spec["alt"][1], spec["alt"][2], since)      # 예: GBPUSD 가 없으면 1 / USDGBP
        return 1.0 / s if spec.get("alt_inverse") else s


# ---------------------------------------------------------------- snapshot cache
def _load_cache():
    out = {}
    for f in sorted(CACHE.glob("series_*.json"), reverse=True):   # 최신 파일부터, 시리즈별로 가장 최근 것
        try:
            blob = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        for sid, item in blob.get("series", {}).items():
            if sid not in out and item.get("points"):
                out[sid] = {"series": _series(dict(item["points"])), "fetchedAt": item.get("fetchedAt") or blob.get("savedAt")}
    return out


def _save_cache(live, fetched_at):
    if not live:
        return
    CACHE.mkdir(parents=True, exist_ok=True)
    blob = {"savedAt": fetched_at, "series": {sid: {"fetchedAt": fetched_at,
                                                    "points": [[d.strftime("%Y-%m-%d"), float(v)] for d, v in s.items()]}
                                              for sid, s in live.items()}}
    path = CACHE / f"series_{datetime.now():%Y%m%d_%H%M%S}.json"
    path.write_text(json.dumps(blob, ensure_ascii=False), encoding="utf-8")
    for old in sorted(CACHE.glob("series_*.json"), reverse=True)[KEEP_CACHE:]:
        try:
            old.unlink()
        except OSError:
            pass


# ---------------------------------------------------------------- investor flows (KOSPI/KOSDAQ 순매수, 억원)
def _flows_live(market):
    qs = urllib.parse.urlencode({"tradeType": "KRX", "marketType": market, "bizdate": date.today().strftime("%Y%m%d"),
                                 "startIdx": 0, "pageSize": 200})
    content = _get_json(f"{TREND}?{qs}", "https://stock.naver.com/").get("content") or []
    rows = {}
    for day in content:
        net = {a.get("investorGubun"): _num(a.get("diffValue")) for a in day.get("netAmounts", [])}
        inst = net.get("9999")
        parts = [net.get(k) for k in ("1000", "2000", "3000", "3100", "4000", "5000", "6000")]
        if inst is None and all(p is not None for p in parts):
            inst = sum(parts)                     # 기관계는 응답에 없어 세부 항목을 합산한다
        d = day.get("bizdate") or ""
        rows[f"{d[:4]}-{d[4:6]}-{d[6:8]}"] = {k: (v / 1e8 if v is not None else None) for k, v in
                                               (("foreign", net.get("9000")), ("institution", inst),
                                                ("individual", net.get("8000")))}
    if not rows:
        raise RuntimeError("trend/daily 빈 응답")
    return pd.DataFrame.from_dict(rows, orient="index").sort_index().rename(index=pd.Timestamp)


def _flows(market):
    try:
        return _flows_live(market), "LIVE"
    except Exception:
        f = NAVER_RAW / f"investor_flow_{market.lower()}.csv"
        try:
            df = pd.read_csv(f, index_col="date", parse_dates=True)[["foreign", "institution", "individual"]]
            return df, "SNAPSHOT"
        except Exception:
            return None, "N/A"


# ---------------------------------------------------------------- collect
def collect(asof):
    """기준일 보고서에 필요한 모든 시리즈. 반환값은 pickle 가능한 dict (st.cache_data 용)."""
    asof = pd.Timestamp(asof)
    since = (asof - pd.DateOffset(years=1) - pd.Timedelta(days=21)).strftime("%Y-%m-%d")
    env = _env()

    def job(spec):
        try:
            s = _fetch(spec, since, env).dropna()
            return spec["id"], s if len(s) else None, None
        except Exception as exc:
            return spec["id"], None, f"{type(exc).__name__}: {exc}"[:160]

    with ThreadPoolExecutor(max_workers=4) as pool:          # NAVER 차단을 피하려고 동시 4개까지만
        results = list(pool.map(job, ALL_SPECS))

    fetched_at = datetime.now().isoformat(timespec="seconds")
    cache = _load_cache()
    series, status, live = {}, {}, {}
    for sid, s, err in results:
        if s is not None:
            series[sid] = live[sid] = s
            status[sid] = {"source": "LIVE", "at": fetched_at}
        elif sid in cache:
            series[sid] = cache[sid]["series"]
            status[sid] = {"source": "SNAPSHOT", "at": cache[sid]["fetchedAt"], "error": err}
        else:
            status[sid] = {"source": "N/A", "error": err}
    _save_cache(live, fetched_at)

    flows = {}
    for market in ("KOSPI", "KOSDAQ"):
        df, src = _flows(market)
        flows[market] = df
        status[f"FLOW_{market}"] = {"source": src, "at": fetched_at}
    return {"asof": asof, "series": series, "status": status, "flows": flows, "fetchedAt": fetched_at}


# ---------------------------------------------------------------- metrics
OFFSETS = {"1W": pd.Timedelta(days=7), "1M": pd.DateOffset(months=1), "3M": pd.DateOffset(months=3),
           "1Y": pd.DateOffset(years=1)}
STALE_REF_DAYS = 12          # 비교 시점보다 이만큼 이전 값밖에 없으면 비교하지 않는다 (시리즈 시작 전)


def value_at(s, when):
    if s is None:
        return None, None
    sub = s.loc[:pd.Timestamp(when)]
    return (float(sub.iloc[-1]), sub.index[-1]) if len(sub) else (None, None)


def change(s, asof, key, unit):
    v0, _ = value_at(s, asof)
    target = pd.Timestamp(asof) - OFFSETS[key]
    v1, d1 = value_at(s, target)
    if v0 is None or v1 is None or (target - d1).days > STALE_REF_DAYS or (unit == "pct" and v1 == 0):
        return None
    return (v0 / v1 - 1) * 100 if unit == "pct" else (v0 - v1) * 100


def window(s, asof, key="1W", thin=None):
    """[비교 시점 직전 값 … 기준일] 구간. 1W 추이는 전주 종가부터 금주 종가까지 이어진다."""
    if s is None:
        return []
    asof = pd.Timestamp(asof)
    _, d1 = value_at(s, asof - OFFSETS[key])
    sub = s.loc[(d1 if d1 is not None else asof - OFFSETS[key]):asof]
    vals = [float(v) for v in sub.values]
    if thin and len(vals) > thin:
        step = (len(vals) - 1) / (thin - 1)
        vals = [vals[round(i * step)] for i in range(thin)]
    return vals


def row(data, sid, keys=("1W", "1M", "1Y")):
    spec, s = SPEC[sid], data["series"].get(sid)
    v0, d0 = value_at(s, data["asof"])
    return {"id": sid, "label": spec["label"], "group": spec.get("group"), "dec": spec["dec"], "unit": spec["unit"],
            "close": v0, "date": d0, "chg": {k: change(s, data["asof"], k, spec["unit"]) for k in keys},
            "spark": window(s, data["asof"], "1W"), "source": data["status"].get(sid, {}).get("source", "N/A")}


def week_flows(data, market):
    df = data["flows"].get(market)
    if df is None or not len(df):
        return None
    asof = pd.Timestamp(data["asof"])
    wk = df.loc[(df.index > asof - pd.Timedelta(days=7)) & (df.index <= asof)]
    if not len(wk):
        return None
    return {k: (float(wk[k].sum()) if wk[k].notna().all() else None) for k in ("foreign", "institution", "individual")} | \
        {"days": len(wk), "from": wk.index[0], "to": wk.index[-1]}


def week_range(data, sid):
    """주중(전주 종가 다음 거래일 ~ 기준일) 종가 기준 최저·최고."""
    s = data["series"].get(sid)
    if s is None:
        return None
    asof = pd.Timestamp(data["asof"])
    wk = s.loc[(s.index > asof - pd.Timedelta(days=7)) & (s.index <= asof)]
    return (float(wk.min()), float(wk.max())) if len(wk) else None


def last_friday(today=None):
    today = today or date.today()
    return today - timedelta(days=(today.weekday() - 4) % 7)
