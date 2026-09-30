"""00_RAW/research: REAL equity-lane samples that replace the DEMO IPO/CB tables in 10_MODEL.

Sources (public, read-only):
  CB Zero Finder  https://cb-zero-finder.vercel.app/api/cb-latest   CB issues from DART (김유찬's tool)
  IPO Market Report https://ipo-market-report.vercel.app/report-meta.json  (김유찬's tool; report headline)
  38커뮤니케이션   https://www.38.co.kr/html/fund/?o=r1 (수요예측 결과) · ?o=nw (신규상장 수익률)
  NAVER            ac.stock.naver.com (name -> code), m.stock.naver.com/api/stock/{code}/basic | finance/annual

Output: data/00_RAW/research/
  cb_issues.json      CB rows; merged across runs by receiptNo (the API serves the current year only)
  ipo_demand.csv      name, forecast_date, band, final price, amount, 기관 경쟁률, 의무보유확약, 주간사
  ipo_listings.csv    name, listing_date, current price, offer price, return vs offer, open, first close
  companies.json      code -> market, price, annual financials (actual years only, consensus dropped)
  ipo_report_meta.json
  _manifest.json

Each dataset fails independently and keeps its previous file.
"""
import csv
import html
import json
import re
import ssl
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from valkyrie.paths import RAW  # noqa: E402

OUT = RAW / "research"
SINCE = "2023-10-01"          # one quarter before the 10_MODEL frame starts (2024-01-02)
MAX_PAGES = 30
UA = {"User-Agent": "Mozilla/5.0 (VALKYRIE-local)", "Accept": "application/json,text/html,*/*"}
# 38.co.kr still negotiates legacy TLS ciphers that Python 3.12+ rejects at the default security level
LEGACY_TLS = ssl.create_default_context()
LEGACY_TLS.set_ciphers("DEFAULT:@SECLEVEL=1")


def fetch(url, timeout=25, ctx=None, referer=None):
    h = dict(UA)
    if referer:
        h["Referer"] = referer
    req = urllib.request.Request(url, headers=h)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
                return r.read()
        except Exception:
            if attempt == 2:
                raise
            time.sleep(1.2 * (attempt + 1))


def fetch_json(url, **kw):
    return json.loads(fetch(url, **kw))


def num(v):
    if v is None:
        return None
    s = str(v).replace(",", "").replace("%", "").replace(":1", "").strip()
    if s in ("", "-", "N/A"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def clean_name(n):
    """멜콘(구.에스앤에프솔루션) -> 멜콘, 디에스단석(구,단석산업) -> 디에스단석, 시프트업 (유가) -> 시프트업"""
    n = re.sub(r"\s*\(구[.,][^)]*\)", "", n or "")
    return re.sub(r"\s*\((유가|코스닥|코넥스)\)", "", n).strip()


# ---------------------------------------------------------------- CB Zero Finder
def cb_issues():
    raw = fetch_json("https://cb-zero-finder.vercel.app/api/cb-latest", timeout=40)
    rows = raw.get("rows") or []
    if not rows:
        raise RuntimeError("cb-latest returned no rows")
    path = OUT / "cb_issues.json"
    merged = {}
    if path.exists():
        for r in json.loads(path.read_text(encoding="utf-8")).get("rows", []):
            merged[r.get("receiptNo") or (r.get("corpName"), r.get("receiptDate"))] = r
    for r in rows:
        merged[r.get("receiptNo") or (r.get("corpName"), r.get("receiptDate"))] = r
    out = sorted(merged.values(), key=lambda r: r.get("receiptDate") or "", reverse=True)
    (OUT / "cb_issues.json").write_text(json.dumps({"updatedAt": raw.get("updatedAt"), "period": raw.get("period"),
                                                    "source": "CB Zero Finder (DART)", "rows": out},
                                                   ensure_ascii=False, indent=1), encoding="utf-8")
    return out


def ipo_report_meta():
    meta = fetch_json("https://ipo-market-report.vercel.app/report-meta.json")
    (OUT / "ipo_report_meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    return [meta]


# ---------------------------------------------------------------- 38커뮤니케이션
def _rows38(url):
    t = fetch(url, ctx=LEGACY_TLS).decode("cp949", "replace")
    out = []
    for r in re.findall(r"<tr[^>]*>(.*?)</tr>", t, re.S | re.I):
        c = [re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", x))).strip()
             for x in re.findall(r"<td[^>]*>(.*?)</td>", r, re.S | re.I)]
        out.append(c)
    return out


def ipo_demand():
    rows, seen = [], set()
    for page in range(1, MAX_PAGES + 1):
        got = [c for c in _rows38(f"https://www.38.co.kr/html/fund/index.htm?o=r1&page={page}")
               if len(c) >= 8 and re.match(r"\d{4}\.\d{2}\.\d{2}$", c[1]) and ":1" in c[5]]
        if not got:
            break
        for c in got:
            d = c[1].replace(".", "-")
            name = clean_name(c[0])
            if "스팩" in name or (name, d) in seen:
                continue
            seen.add((name, d))
            band = [num(x) for x in c[2].split("~")] if "~" in c[2] else [num(c[2]), num(c[2])]
            rows.append([name, d, band[0], band[1], num(c[3]), num(c[4]), num(c[5]), num(c[6]), c[7]])
        if min(c[1] for c in got).replace(".", "-") < SINCE:
            break
        time.sleep(0.4)
    rows = [r for r in rows if r[1] >= SINCE]
    if not rows:
        raise RuntimeError("38 수요예측 결과: no rows")
    rows.sort(key=lambda r: r[1])
    with open(OUT / "ipo_demand.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["name", "forecast_date", "band_lo", "band_hi", "final_price", "amount_mil", "demand_ratio",
                    "lockup_pct", "underwriter"])
        w.writerows(rows)
    return rows


def ipo_listings():
    rows, seen = [], set()
    for page in range(1, MAX_PAGES + 1):
        got = [c for c in _rows38(f"https://www.38.co.kr/html/fund/index.htm?o=nw&page={page}")
               if len(c) >= 9 and re.match(r"\d{4}/\d{2}/\d{2}$", c[1])]
        if not got:
            break
        for c in got:
            d = c[1].replace("/", "-")
            name = clean_name(c[0])
            if "스팩" in name or (name, d) in seen:
                continue
            seen.add((name, d))
            rows.append([name, d, num(c[2]), num(c[4]), num(c[5]), num(c[6]), num(c[7]), num(c[8])])
        if min(c[1] for c in got).replace("/", "-") < SINCE:
            break
        time.sleep(0.4)
    rows = [r for r in rows if r[1] >= SINCE]
    if not rows:
        raise RuntimeError("38 신규상장: no rows")
    rows.sort(key=lambda r: r[1])
    with open(OUT / "ipo_listings.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["name", "listing_date", "current_price", "offer_price", "return_vs_offer_pct", "open_price",
                    "open_vs_offer_pct", "first_close"])
        w.writerows(rows)
    return rows


# ---------------------------------------------------------------- NAVER company facts
FIN_ROWS = ["매출액", "영업이익", "당기순이익", "영업이익률", "순이익률", "ROE", "부채비율", "당좌비율", "유보율", "EPS", "PBR"]


def resolve_code(name):
    items = fetch_json("https://ac.stock.naver.com/ac?q=" + urllib.parse.quote(name) + "&target=stock").get("items") or []
    kr = [h for h in items if h.get("nationCode") == "KOR"]
    exact = [h for h in kr if h.get("name") == name]
    hit = (exact or kr or [None])[0]
    return hit and {"code": hit["code"], "name": hit["name"], "market": hit.get("typeCode")}


def company_facts(code):
    ref = "https://m.stock.naver.com/"
    b = fetch_json(f"https://m.stock.naver.com/api/stock/{code}/basic", referer=ref)
    fin = {}
    try:
        fi = fetch_json(f"https://m.stock.naver.com/api/stock/{code}/finance/annual", referer=ref).get("financeInfo") or {}
        periods = [(t.get("key"), t.get("title"), t.get("isConsensus")) for t in fi.get("trTitleList") or []]
        for row in fi.get("rowList") or []:
            if row.get("title") not in FIN_ROWS:
                continue
            cols = row.get("columns") or {}
            fin[row["title"]] = {title.strip("."): num((cols.get(key) or {}).get("value"))
                                 for key, title, cons in periods if cons != "Y"}
    except Exception:
        pass
    return {"price": num(b.get("closePrice")), "market": (b.get("stockExchangeType") or {}).get("code")
            if isinstance(b.get("stockExchangeType"), dict) else b.get("stockExchangeType"),
            "industry": b.get("industryCodeType", {}).get("industryGroupKor") if isinstance(b.get("industryCodeType"), dict) else None,
            "fin": fin, "fetchedAt": datetime.now().isoformat(timespec="seconds")}


def companies():
    path = OUT / "companies.json"
    cache = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"byCode": {}, "nameToCode": {}}
    names = set()
    for f in ("ipo_demand.csv", "ipo_listings.csv"):
        p = OUT / f
        if p.exists():
            with open(p, encoding="utf-8") as fh:
                names |= {r["name"] for r in csv.DictReader(fh)}
    codes = {}
    cbp = OUT / "cb_issues.json"
    if cbp.exists():
        for r in json.loads(cbp.read_text(encoding="utf-8")).get("rows", []):
            if r.get("stockCode"):
                codes[r["stockCode"]] = r.get("corpName")

    todo = [n for n in names if n not in cache["nameToCode"]]

    def res(n):
        try:
            return n, resolve_code(n)
        except Exception:
            return n, None
    with ThreadPoolExecutor(6) as ex:
        for n, hit in ex.map(res, todo):
            cache["nameToCode"][n] = hit
    for n, hit in cache["nameToCode"].items():
        if hit:
            codes.setdefault(hit["code"], n)

    def facts(code):
        try:
            return code, company_facts(code)
        except Exception:
            return code, None
    with ThreadPoolExecutor(6) as ex:
        for code, fct in ex.map(facts, sorted(codes)):
            if fct:
                cache["byCode"][code] = {"name": codes[code], **fct}
    cache["updatedAt"] = datetime.now().isoformat(timespec="seconds")
    path.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")
    return list(cache["byCode"].values())


JOBS = {
    "cb_issues": (cb_issues, "cb-zero-finder.vercel.app/api/cb-latest"),
    "ipo_report_meta": (ipo_report_meta, "ipo-market-report.vercel.app/report-meta.json"),
    "ipo_demand": (ipo_demand, "38.co.kr 수요예측 결과 (o=r1)"),
    "ipo_listings": (ipo_listings, "38.co.kr 신규상장 (o=nw)"),
    "companies": (companies, "NAVER ac + stock basic + finance/annual"),
}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = {"collectedAt": datetime.now(timezone.utc).isoformat(), "since": SINCE, "series": {}}
    failures = 0
    for name, (fn, src) in JOBS.items():
        t0 = time.time()
        try:
            rows = fn()
            manifest["series"][name] = {"source": src, "rows": len(rows)}
            print(f"RESEARCH {name:16s} {len(rows):5d} rows  {time.time() - t0:5.1f}s")
        except Exception as exc:
            failures += 1
            print(f"RESEARCH {name:16s} FAILED: {exc}")
    old = OUT / "_manifest.json"
    if old.exists():
        for k, v in json.loads(old.read_text(encoding="utf-8")).get("series", {}).items():
            manifest["series"].setdefault(k, {**v, "stale": True})
    old.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"done · {len(manifest['series'])} datasets · {failures} failures")
    return failures


if __name__ == "__main__":
    sys.exit(1 if main() else 0)
