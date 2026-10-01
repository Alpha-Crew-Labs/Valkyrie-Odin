"""주목 섹터 · 테마 · 종목 (auto watch list) for the equity desk.

Deterministic ranking over live NAVER 업종/테마 (move, breadth, turnover), the NAVER briefing feed (trading-value /
mover leaders), the IPO calendar and DART CB filings, tilted by VALKYRIE's current judgement: rate pressure (growth
sectors' discount rate), the credit level (funding-dependent sectors) and the 8512 KOSPI risk (cyclicals).
No LLM. Every row carries its reason and source so a PM can trace it. Not investment advice.
"""
import json
from .paths import RAW

CB_FILE = RAW / "research" / "cb_issues.json"
_cb = {"mtime": None, "rows": []}

RATE_SENS = ("제약", "생물공학", "바이오", "생명과학", "소프트웨어", "게임", "인터넷", "IT서비스", "헬스케어", "우주항공", "로봇", "AI")
RATE_BENEF = ("은행", "보험", "생명보험", "손해보험")
CREDIT_SENS = ("건설", "부동산", "캐피탈", "여신", "증권", "해운", "항공")
CYCLICAL = ("반도체", "자동차", "화학", "철강", "조선", "기계", "디스플레이", "전기제품", "정유", "비철")
EXPORT = ("반도체", "자동차", "조선", "전자장비", "2차전지")


def _f(v):
    try:
        return None if v in (None, "", "-") else float(str(v).replace(",", ""))
    except ValueError:
        return None


def _pct_rank(vals):
    """percentile rank 0..1 of each value among vals (None counts as the minimum)."""
    xs = [(-1e18 if v is None else v) for v in vals]
    order = sorted(range(len(xs)), key=lambda i: xs[i])
    n = max(len(xs) - 1, 1)
    out = [0.0] * len(xs)
    for r, i in enumerate(order):
        out[i] = r / n
    return out


def _cb_rows():
    try:
        mt = CB_FILE.stat().st_mtime
    except OSError:
        return []
    if mt != _cb["mtime"]:
        try:
            _cb["rows"], _cb["mtime"] = json.loads(CB_FILE.read_text(encoding="utf-8")).get("rows", []), mt
        except (OSError, ValueError):
            _cb["rows"] = []
    return _cb["rows"]


def _tilt(name, tilt):
    """VALKYRIE-judgement tags for a sector/theme name: why the desk should look at it today."""
    tags = []
    has = lambda keys: any(k in name for k in keys)
    if tilt["rates_up"] and has(RATE_SENS):
        tags.append({"t": "할인율 민감", "why": f"VALKYRIE 금리 {tilt['pressure_kr']} → 성장주 할인율 부담 (국고10Y+ERP)"})
    if tilt["rates_up"] and has(RATE_BENEF):
        tags.append({"t": "금리 상승 수혜", "why": "금리 상승 압력 → 예대마진·운용수익 개선 검토"})
    if tilt["credit_hi"] and has(CREDIT_SENS):
        tags.append({"t": "크레딧 경계", "why": f"AA- {tilt['credit']:.0f}bp ≥ 65 → 조달 의존 업종 차환 부담"})
    if tilt["kospi_risk"] and has(CYCLICAL):
        tags.append({"t": "시장 위험 경계", "why": f"8512 코스피 위험 {tilt['kospi_risk_v']:.2f} ≥ 0.45 → 경기민감 비중은 권장 비중 안에서"})
    if tilt["fx_up"] and has(EXPORT):
        tags.append({"t": "환율 수혜", "why": "원달러 상승 → 수출주 원화 환산 이익"})
    if tilt["ipo_dir"] == "AVOID" and ("신규상장" in name or "IPO" in name):
        tags.append({"t": "IPO 보류 국면", "why": "VALKYRIE 조달 여건 → 적자 코스닥 청약 보류"})
    return tags


def _rank(items, kind, tilt, n=6, min_cap=None):
    rows = [x for x in (items or []) if (x.get("total") or 0) >= 5 and x.get("changeRate") is not None]
    if min_cap:
        rows = [x for x in rows if (x.get("marketCap") or 0) >= min_cap]
    mv = _pct_rank([abs(x["changeRate"]) for x in rows])
    tn = _pct_rank([(x.get("tradeAmount") or 0) / max(x.get("marketCap") or 1, 1) for x in rows])
    out = []
    for i, x in enumerate(rows):
        tot = max(x.get("total") or 1, 1)
        breadth = ((x.get("rise") or 0) - (x.get("fall") or 0)) / tot
        aligned = breadth * x["changeRate"] >= 0
        tags = _tilt(x["name"], tilt)
        score = 0.45 * mv[i] + 0.25 * tn[i] + 0.30 * (abs(breadth) if aligned else 0) + (0.15 if tags else 0)
        why = f"{'상승' if x['changeRate'] > 0 else '하락'} 주도 {x['changeRate']:+.2f}% · 폭 {int(x.get('rise') or 0)}↑{int(x.get('fall') or 0)}↓"
        if x.get("change3d") is not None:
            why += f" · 3일 {x['change3d']:+.1f}%"
        out.append({"name": x["name"], "kind": kind, "changeRate": x["changeRate"], "change3d": x.get("change3d"),
                    "rise": x.get("rise"), "fall": x.get("fall"), "total": x.get("total"), "breadth": round(breadth, 2),
                    "turnover_pct": round(100 * (x.get("tradeAmount") or 0) / 1000 / max(x.get("marketCap") or 1, 1), 2),   # 거래대금 천원 / 시총 백만원
                    "leaders": (x.get("leaders") or [])[:2], "score": round(100 * min(score, 1.15) / 1.15), "tags": tags, "why": why})
    out.sort(key=lambda r: -r["score"])
    return out[:n]


def _stocks(sets, st, top, cb_rows):
    out = []
    L = {"TRADING_AMOUNT_TOP": "거래대금 1위", "RATE_UP_TOP": "상승률 1위", "RATE_DOWN_TOP": "하락률 1위",
         "DISCUSSION_HIT_TOP": "관심 1위", "END_HIT_TOP": "검색 1위", "TRADING_VOLUME_TOP": "거래량 1위"}
    for b in ((sets.get("briefing") or {}).get("items") or []):
        if b.get("nation") != "KOR" or b.get("type") not in L or not b.get("name"):
            continue
        out.append({"name": b["name"], "code": b.get("code"), "kind": L[b["type"]],
                    "value": f"{b.get('changeRate') or 0:+.2f}%", "why": f"거래대금 {(b.get('tradeValue') or 0) / 1e8:,.0f}억", "source": "시장 브리핑"})
    for s in top[:3]:
        for ld in s["leaders"][:1]:
            out.append({"name": ld["name"], "code": ld.get("code"), "kind": "주도주", "value": f"{s['name']} {s['changeRate']:+.2f}%",
                        "why": " · ".join(t["t"] for t in s["tags"]) or s["why"], "source": f"{s['kind']} 실시간"})
    ipo = sets.get("ipo_pipeline") or {}
    for key, lab, dk in (("subscriptionList", "IPO 청약", "poStartDate"), ("listingList", "IPO 상장", "lcalDate")):
        for x in (ipo.get(key) or [])[:1]:
            why = (f"경쟁률 {_f(x.get('fnlCmptRatio')):,.0f}:1" if _f(x.get("fnlCmptRatio")) else "") \
                + (f" · 공모가 {int(_f(x['fixPubPrice'])):,}원" if _f(x.get("fixPubPrice")) else "")
            out.append({"name": x.get("compName"), "code": None, "kind": lab, "value": str(x.get(dk) or "")[5:],
                        "why": (why.strip(" ·") or (x.get("marketType") or "")), "source": "IPO 일정"})
    heavy = sorted([r for r in cb_rows if r.get("market") == "KOSDAQ" and (_f(r.get("dilutionRate")) or 0) >= 15],
                   key=lambda r: -(r.get("amountEok") or 0))[:2]
    for r in heavy:
        out.append({"name": r["corpName"], "code": r.get("stockCode"), "kind": "CB 희석 주의",
                    "value": f"{r.get('amountEok') or 0:,.0f}억 · 희석 {_f(r.get('dilutionRate')):.1f}%",
                    "why": f"접수 {r.get('receiptDate')} · 전환가 {r.get('convertPrice')}원", "source": "CB Zero Finder"})
    puts = sorted([c for c in ((st.get("cb") or {}).get("all") or []) if c.get("put_risk")], key=lambda c: c.get("months_to_put") or 99)[:2]
    for c in puts:
        out.append({"name": c["name"], "code": None, "kind": "Put 임박", "value": f"{c.get('months_to_put') or 0:.1f}개월",
                    "why": f"재무 {c.get('score')}/5 · 잔액 {c.get('balance_eok') or 0:,.0f}억", "source": "VALKYRIE CB 표본"})
    seen, res = set(), []
    for x in out:
        if not x["name"] or x["name"] in seen:
            continue
        seen.add(x["name"])
        res.append(x)
    return res[:10]


def build(st, sets):
    sets = sets or {}
    sg, nodes = st["signals"], st["nodes"]
    credit = nodes["rat_credit"]["value"]
    mr = ((nodes.get("eq_kospi") or {}).get("market_risk") or {}).get("value")
    fx = next((t for t in ((st.get("market") or {}).get("tiles") or []) if t.get("code") == "FX_USDKRW"), None)
    tilt = {"rates_up": sg["rates"].get("rule_dir") == "SHORT", "pressure_kr": sg["rates"].get("pressure_kr") or "상승 압력",
            "credit_hi": credit >= 65, "credit": credit, "kospi_risk": mr is not None and mr >= 0.45, "kospi_risk_v": mr,
            "fx_up": bool(fx and (fx.get("changeRate") or 0) >= 0.5), "ipo_dir": sg["equity"].get("dir")}
    sectors = _rank((sets.get("sectors") or {}).get("items"), "업종", tilt, 6, min_cap=500000)   # ≥ 5,000억 (백만원)
    themes = _rank((sets.get("themes") or {}).get("items"), "테마", tilt, 6)
    stocks = _stocks(sets, st, sectors[:2] + themes[:1], _cb_rows())
    active = [k for k, v in (("금리 압력", tilt["rates_up"]), ("크레딧 ≥65", tilt["credit_hi"]), ("코스피 위험 ≥0.45", tilt["kospi_risk"]), ("환율 상승", tilt["fx_up"])) if v]
    return {"asOf": (sets.get("sectors") or {}).get("asOf"), "sectors": sectors, "themes": themes, "stocks": stocks,
            "tilt": {k: v for k, v in tilt.items() if k != "pressure_kr"}, "tilt_active": active,
            "basis": "업종·테마 실시간(등락·폭·회전율 순위) + 시장 브리핑·IPO 일정 + DART CB 공시 · VALKYRIE 기준 태그",
            "note": "자동 선정 · 투자 권유 아님"}
