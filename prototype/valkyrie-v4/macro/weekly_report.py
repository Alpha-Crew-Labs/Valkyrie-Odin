"""Weekly Updates 보고서 렌더러: A4 가로 인쇄용 HTML → PDF (Chrome/Edge headless).

1쪽 Weekly Updates  시황 코멘트 3문단 + 좌우 2단 표 (주가지수·환율·스왑·CDS | 금리·원자재·VIX)
2쪽 VALKYRIE Intelligence Chain  주간 변화를 MACRO → RATES → EQUITY 레인에 올리고, 온톨로지 β 로 전이를
    분해한다. 엔진 판정·담당 모델(8501/8511/8512)·액션 플랜과 1년 추이를 붙인다.

숫자는 weekly_data.collect() 결과와 8501 엔진 값만 쓴다. 코멘트 수치도 같은 함수로 계산해 표와 일치한다.
VALKYRIE 스냅샷(data/20_SNAPSHOT)과 온톨로지(valkyrie/ontology.py)는 읽기만 한다.
"""
import base64
import html
import importlib.util
import json
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

import pandas as pd

import weekly_data as wd

HERE = Path(__file__).resolve().parent
DASH = HERE.parent
REPORTS = HERE / "reports"
LOGO = HERE / "assets" / "hanwha_am_logo.svg"
SNAPSHOTS = DASH / "data" / "20_SNAPSHOT"
ONTOLOGY = DASH / "valkyrie" / "ontology.py"
BROWSERS = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
]
UP, DN, GRAY = "#1f5fbf", "#d0312d", "#8a9099"


# ---------------------------------------------------------------- formatting
def esc(x):
    return html.escape("" if x is None else str(x))


def f_level(v, dec):
    return '<span class="na">N/A</span>' if v is None else f"{v:,.{dec}f}"


def f_pct(v, dec=1):
    if v is None:
        return '<span class="na">N/A</span>'
    r = round(v, dec)
    if r > 0:
        return f'<span class="up">+ {r:.{dec}f}%</span>'
    if r < 0:
        return f'<span class="dn">{r:.{dec}f}%</span>'
    return f"{0:.{dec}f}%"


def f_bp(v, dec=1):
    if v is None:
        return '<span class="na">N/A</span>'
    r = round(v, dec)
    if r > 0:
        return f'<span class="up">+ {r:.{dec}f} bp</span>'
    if r < 0:
        return f'<span class="dn">({abs(r):.{dec}f}) bp</span>'
    return f"{0:.{dec}f} bp"


def f_chg(v, unit):
    return f_pct(v) if unit == "pct" else f_bp(v)


def spark(vals, w=50, h=11):
    vals = [v for v in vals if v is not None]
    if len(vals) < 2:
        return '<span class="na">—</span>'
    lo, hi = min(vals), max(vals)
    rng = (hi - lo) or 1.0
    pts = [(2 + i * (w - 5) / (len(vals) - 1), h - 2 - (v - lo) / rng * (h - 4)) for i, v in enumerate(vals)]
    poly = " ".join(f"{x:.1f},{y:.1f}" for x, y in pts)
    lx, ly = pts[-1]
    return (f'<svg class="sp" width="{w}" height="{h}" viewBox="0 0 {w} {h}"><polyline points="{poly}" fill="none" '
            f'stroke="#50565e" stroke-width="1" stroke-linejoin="round"/><circle cx="{lx:.1f}" cy="{ly:.1f}" r="1.6" '
            f'fill="{DN}"/></svg>')


def bar_cell(v, vmax, unit="pct"):
    """등락률 데이터 막대: 가운데 축에서 상승은 오른쪽(파랑), 하락은 왼쪽(빨강)."""
    txt = f_chg(v, unit)
    if v is None or not vmax or round(v, 1) == 0:
        return f"<td>{txt}</td>"
    w = min(50.0, abs(v) / vmax * 50.0)
    side, cls = ("left:50%", "pos") if v > 0 else ("right:50%", "neg")
    return f'<td class="db"><i class="{cls}" style="{side};width:{w:.1f}%"></i><span>{txt}</span></td>'


def colmax(rows, key):
    vals = [abs(r["chg"][key]) for r in rows if r["chg"].get(key) is not None]
    return max(vals) if vals else 0


def logo_img():
    try:
        b64 = base64.b64encode(LOGO.read_bytes()).decode()
        return f'<img src="data:image/svg+xml;base64,{b64}" alt="한화자산운용">'
    except OSError:
        return '<span class="logo-txt">한화자산운용</span>'


def header(title, sub):
    return (f'<header class="hd"><div class="brand">VALKYRIE<span>{esc(sub)}</span></div>'
            f'<div class="bar">{esc(title)}</div><div class="logo">{logo_img()}</div></header>')


def section(title, body, note=""):
    return f'<div class="sec">{esc(title)}<small>{note}</small></div>{body}'


# ---------------------------------------------------------------- page 1 tables
class Marks:
    """기준일과 다른 날짜의 종가(†)와 스냅샷 값(ˢ)을 모아 각주로 보낸다."""

    def __init__(self, asof):
        self.asof, self.dates, self.snap = pd.Timestamp(asof), {}, set()

    def __call__(self, r):
        out = ""
        if r["date"] is not None and r["date"].normalize() < self.asof.normalize():
            self.dates.setdefault(r["date"].strftime("%m-%d"), []).append(r["label"].rstrip("*"))
            out += '<sup class="mk">†</sup>'
        if r["source"] == "SNAPSHOT":
            self.snap.add(r["label"])
            out += '<sup class="mk">s</sup>'
        return out


def t_indices(data, mark):
    rows = [wd.row(data, s["id"]) for s in wd.INDICES]
    vmax = {k: colmax(rows, k) for k in ("1W", "1M", "1Y")}
    body = []
    for grp in ("US", "Europe", "ASIA"):
        g = [r for r in rows if r["group"] == grp]
        for i, r in enumerate(g):
            cells = f'<td class="grp" rowspan="{len(g)}">{grp}</td>' if i == 0 else ""
            cells += f'<td class="l">{esc(r["label"])}{mark(r)}</td><td>{f_level(r["close"], 1)}</td>'
            cells += "".join(bar_cell(r["chg"][k], vmax[k]) for k in ("1W", "1M", "1Y"))
            body.append(f'<tr>{cells}<td class="c">{spark(r["spark"])}</td></tr>')
    return section("주가지수", table(["지역", "지수명", "종가", "전주 대비", "전월 대비", "전년 대비", "1W 추이"],
                                    body, [11, 27, 15, 14, 14, 14, 13], left=2))


def t_fx(data, mark):
    body = []
    for s in wd.FX:
        r = wd.row(data, s["id"])
        body.append(f'<tr><td class="l">{esc(r["label"])}{mark(r)}</td><td>{f_level(r["close"], r["dec"])}</td>'
                    + "".join(f"<td>{f_pct(r['chg'][k])}</td>" for k in ("1W", "1M", "1Y"))
                    + f'<td class="c">{spark(r["spark"])}</td></tr>')
    return section("주요국 환율 현황", table(["Currency", "종가", "전주 대비", "전월 대비", "전년 대비", "7 Day 추이"],
                                            body, [20, 17, 16, 16, 16, 15], left=1))


def t_swap(data, mark):
    spot = {"USDKRW": wd.row(data, "USDKRW"), "EURKRW": wd.row(data, "EURKRW"), "GBPKRW": wd.row(data, "GBPKRW")}
    body = [f'<tr><td class="l">{c}{mark(spot[c])}</td><td>{f_level(spot[c]["close"], 2)}</td>'
            + '<td><span class="na">N/A</span></td>' * 4 + "</tr>" for c in wd.SWAP_ROWS]
    return section("통화별 구간 스왑레이트", table(["Currency", "Spot", "1M", "3M", "6M", "1Y"], body,
                                                [20, 18, 15, 15, 15, 15], left=1), "구간 스왑레이트 · 공개 소스 없음")


def t_cds():
    body = [f'<tr><td class="l">{c}</td>' + '<td><span class="na">N/A</span></td>' * 4
            + '<td class="c"><span class="na">—</span></td></tr>' for c in wd.CDS_ROWS]
    return section("CDS 프리미엄", table(["국가", "종가(bp)", "전주 대비", "전월 대비", "전년 대비", "1 Year 추이"], body,
                                        [20, 17, 16, 16, 16, 15], left=1), "무료 공개 소스 없음")


def t_rates(data, mark):
    body, rows = [], [wd.row(data, s["id"]) for s in wd.RATES]
    for grp in ("Korea", "US", "Japan", "UK", "Germany", "France", "Italy"):
        g = [r for r in rows if r["group"] == grp]
        for i, r in enumerate(g):
            cells = f'<td class="grp" rowspan="{len(g)}">{grp}</td>' if i == 0 else ""
            cells += f'<td class="l">{esc(r["label"])}{mark(r)}</td><td>{f_level(r["close"], 2)}</td>'
            cells += "".join(f"<td>{f_bp(r['chg'][k])}</td>" for k in ("1W", "1M", "1Y"))
            body.append(f'<tr>{cells}<td class="c">{spark(r["spark"])}</td></tr>')
    return section("국가별 금리 – 선진국", table(["국가", "만기", "종가(%)", "전주 대비", "전월 대비", "전년 대비", "7 Day 추이"],
                                               body, [12, 20, 13, 15, 15, 15, 13], left=2), "변화폭 bp")


def t_commodities(data, mark):
    keys = ("1W", "1M", "3M", "1Y")
    rows = [wd.row(data, s["id"], keys) for s in wd.COMMODITIES]
    vmax = {k: colmax(rows, k) for k in keys}
    body = []
    for grp in ("유가·천연가스", "메탈", "그 외"):
        g = [r for r in rows if r["group"] == grp]
        for i, r in enumerate(g):
            cells = f'<td class="grp" rowspan="{len(g)}">{grp}</td>' if i == 0 else ""
            cells += f'<td class="l">{esc(r["label"])}{mark(r)}</td><td>{f_level(r["close"], r["dec"])}</td>'
            cells += "".join(bar_cell(r["chg"][k], vmax[k]) for k in keys)
            body.append(f"<tr>{cells}</tr>")
    return section("원자재", table(["구분", "품목", "당일", "전주 대비", "전월 대비", "3개월 대비", "전년 대비"], body,
                                  [17, 23, 12, 12, 12, 12, 12], left=2))


def t_vix(data, mark):
    r = wd.row(data, "VIX")
    yr = wd.window(data["series"].get("VIX"), data["asof"], "1Y", thin=60)
    body = [f'<tr><td>{f_level(r["close"], 2)}{mark(r)}</td>'
            + "".join(f"<td>{f_pct(r['chg'][k])}</td>" for k in ("1W", "1M", "1Y"))
            + f'<td class="c">{spark(yr, w=110)}</td></tr>']
    return section("VIX Index (변동성 지수)", table(["종가", "전주 대비", "전월 대비", "전년 대비", "1 Year 추이"], body,
                                                  [16, 16, 16, 16, 26], left=0))


def table(heads, body, widths, left=1):
    cols = "".join(f'<col style="width:{w}%">' for w in widths)
    ths = "".join(f'<th class="{"l" if i < left else ("c" if "추이" in h else "")}">{esc(h)}</th>' for i, h in enumerate(heads))
    return f'<table class="t"><colgroup>{cols}</colgroup><thead><tr>{ths}</tr></thead><tbody>{"".join(body)}</tbody></table>'


# ---------------------------------------------------------------- page 1 comments (표와 같은 함수로 계산)
def _amt(v):
    a = abs(v)
    return f"{a / 1e4:,.2f}조원" if a >= 1e4 else f"{a:,.0f}억원"


def _eok(v):
    return "N/A" if v is None else f"{_amt(v)} {'순매수' if v > 0 else '순매도'}"


def _relative(kp, qp):
    """코스피·코스닥 상대 흐름 (어간까지 — 뒤에 '으며' 또는 '습니다.'를 붙인다)."""
    gap = round(kp, 1) - round(qp, 1)
    if abs(gap) < 1.0:
        return f"두 지수 격차가 {abs(gap):.1f}%p에 그쳐 대형주와 중소형주가 비슷하게 움직였"
    up_k, up_q = kp > 0, qp > 0
    if gap > 0:                                   # 코스피가 상대적으로 강함
        if up_k and up_q:
            return f"코스피가 코스닥을 {gap:.1f}%p 웃돌아 대형주 중심의 강세였"
        if not up_k and not up_q:
            return f"코스피의 낙폭이 코스닥보다 {gap:.1f}%p 작아 중소형주 쪽 약세가 더 컸"
        return "코스피는 오르고 코스닥은 내려 대형주 쪽으로 쏠림이 나타났"
    g = -gap
    if up_k and up_q:
        return f"코스닥이 코스피를 {g:.1f}%p 웃돌아 중소형·성장주 중심의 강세였"
    if not up_k and not up_q:
        return f"코스닥의 낙폭이 코스피보다 {g:.1f}%p 작아 대형주 쪽 약세가 더 컸"
    return "코스닥은 오르고 코스피는 내려 중소형주 쪽으로 쏠림이 나타났"


def _verb(v, eps):
    return "상승" if v is not None and v > eps else "하락" if v is not None and v < -eps else "보합"


def _did(verb, cont=False):
    """상승 → 상승했습니다 / 상승했고 · 보합 → 보합을 유지했습니다 / 보합을 유지했고"""
    stem = "보합을 유지했" if verb == "보합" else f"{verb}했"
    return stem + ("고" if cont else "습니다.")


def comments(data, memo=""):
    asof, S = data["asof"], data["series"]
    week_ago = asof - wd.OFFSETS["1W"]
    out = []

    # 1) 주식
    k0, _ = wd.value_at(S.get("KOSPI"), asof)
    k1, _ = wd.value_at(S.get("KOSPI"), week_ago)
    q0, _ = wd.value_at(S.get("KOSDAQ"), asof)
    q1, _ = wd.value_at(S.get("KOSDAQ"), week_ago)
    kp, qp = wd.change(S.get("KOSPI"), asof, "1W", "pct"), wd.change(S.get("KOSDAQ"), asof, "1W", "pct")
    if None not in (k0, k1, q0, q1, kp, qp):
        s1 = (f"코스피는 {k1:,.1f} -> {k0:,.1f}({kp:+.1f}%)로 {_did(_verb(kp, 0.05), True)}, 코스닥은 {q1:,.1f} -> "
              f"{q0:,.1f}({qp:+.1f}%)로 {_did(_verb(qp, 0.05))}")
        rel = _relative(kp, qp)     # 어간까지만 두고 "으며" / "습니다." 로 끝맺는다
        fl = wd.week_flows(data, "KOSPI")
        if fl and None not in (fl["foreign"], fl["institution"], fl["individual"]):
            who = {"외국인": fl["foreign"], "기관": fl["institution"], "개인": fl["individual"]}
            top = max(who, key=who.get)
            days = f"(주간 {fl['days']}거래일)" if fl["days"] < 5 else ""
            lead = f"{top}의 매수 우위가 가장 컸습니다." if who[top] > 0 else "주요 투자자가 모두 순매도했습니다."
            s2 = (f"{rel}으며, 코스피 수급{days}은 외국인 {_eok(fl['foreign'])}, 기관 {_eok(fl['institution'])}, "
                  f"개인 {_eok(fl['individual'])}로 {lead}")      # 순매수/순매도 뒤에는 '로'
        else:
            s2 = f"{rel}습니다."
        out.append(("주식 시황", s1 + " " + s2))
    else:
        out.append(("주식 시황", "코스피·코스닥 데이터를 받지 못해 코멘트를 생략합니다 (N/A)."))

    # 2) 채권
    a0, _ = wd.value_at(S.get("KR3Y"), asof)
    a1, _ = wd.value_at(S.get("KR3Y"), week_ago)
    b0, _ = wd.value_at(S.get("KR10Y"), asof)
    b1, _ = wd.value_at(S.get("KR10Y"), week_ago)
    d3, d10 = wd.change(S.get("KR3Y"), asof, "1W", "bp"), wd.change(S.get("KR10Y"), asof, "1W", "bp")
    if None not in (a0, a1, b0, b1, d3, d10):
        both = _verb(d3, 0.05) if _verb(d3, 0.05) == _verb(d10, 0.05) else None
        s1 = (f"국고채 3년은 {a1:.2f}% -> {a0:.2f}%({d3:+.1f}bp), 10년은 {b1:.2f}% -> {b0:.2f}%({d10:+.1f}bp)로 "
              + (_did(both) if both else "만기별로 엇갈렸습니다."))
        slope, dslope, level = (b0 - a0) * 100, round(d10, 1) - round(d3, 1), (d3 + d10) / 2
        if abs(level) < 1.0 and abs(dslope) < 1.0:
            s2 = f"10년-3년 스프레드는 {slope:.0f}bp({dslope:+.1f}bp)로 금리와 커브 모두 보합권에 머물렀습니다."
        else:
            bear = level > 0
            if dslope > 0.5:
                name = "베어 스티프닝" if bear else "불 스티프닝"
                why = ("장기물 금리가 더 올라 기간 프리미엄이 확대된" if bear
                       else "단기물 금리가 더 내려 정책금리 인하 기대가 반영된")
            elif dslope < -0.5:
                name = "베어 플래트닝" if bear else "불 플래트닝"
                why = ("단기물 금리가 더 올라 통화정책 경로가 더 크게 반영된" if bear
                       else "장기물 금리가 더 내려 성장 둔화·안전자산 선호가 반영된")
            else:
                name = "평행 상승" if bear else "평행 하락"
                why = "만기 전반이 비슷한 폭으로 움직인"
            move = (f"{abs(dslope):.1f}bp 확대되어" if dslope > 0 else f"{abs(dslope):.1f}bp 축소되어" if dslope < 0
                    else "변화 없이")
            s2 = f"10년-3년 스프레드는 {slope:.0f}bp로 {move} {name} 흐름을 보였으며, {why} 움직임으로 해석됩니다."
        out.append(("채권 시황", s1 + " " + s2))
    else:
        out.append(("채권 시황", "국고채 금리 데이터를 받지 못해 코멘트를 생략합니다 (N/A)."))

    # 3) 환율
    u0, _ = wd.value_at(S.get("USDKRW"), asof)
    u1, _ = wd.value_at(S.get("USDKRW"), week_ago)
    if None not in (u0, u1):
        du = round(u0, 2) - round(u1, 2)
        s1 = f"달러-원 환율은 {u1:,.2f}원 -> {u0:,.2f}원({du:+.2f}원)으로 {_did(_verb(du, 0.005))}"
        rg, dxy = wd.week_range(data, "USDKRW"), wd.change(S.get("DXY"), asof, "1W", "pct")
        fl = wd.week_flows(data, "KOSPI")
        rng = f"주중에는 종가 기준 {rg[0]:,.2f}~{rg[1]:,.2f}원(폭 {rg[1] - rg[0]:.2f}원)에서 움직였고" if rg else ""
        # 주요 재료를 원화 약세 쪽(달러 강세·외국인 순매도)과 강세 쪽(달러 약세·외국인 순매수)으로 나눠 방향을 맞춰 본다
        weak, strong = [], []
        if dxy is not None and abs(dxy) > 0.2:
            (weak if dxy > 0 else strong).append(f"달러 {'강세' if dxy > 0 else '약세'}(DXY {dxy:+.1f}%)")
        ff = fl.get("foreign") if fl else None
        if ff is not None and abs(ff) >= 100:
            (weak if ff < 0 else strong).append(f"외국인 코스피 {'순매도' if ff < 0 else '순매수'}({_amt(ff)})")
        won = "강세" if du < 0 else "약세" if du > 0 else "보합"
        if won == "보합":
            drv = "원화는 보합권을 유지했습니다."
        else:
            same, other = (strong, weak) if won == "강세" else (weak, strong)
            opp = "약세" if won == "강세" else "강세"
            if same and not other:
                drv = f"{', '.join(same)} 속에 원화가 {won}를 보였습니다."
            elif other and not same:
                drv = f"{', '.join(other)}에도 원화는 {won}를 보여, 이들 외의 요인이 더 크게 작용한 것으로 보입니다."
            elif same and other:
                drv = f"원화 {won} 재료({', '.join(same)})가 {opp} 재료({', '.join(other)})보다 우세했던 것으로 보입니다."
            else:
                drv = f"달러와 외국인 수급 변화가 크지 않은 가운데 원화가 {won}를 보였습니다."
        s2 = f"{rng}, {drv}" if rng else drv
        out.append(("환율 동향", f"{s1} {s2}"))
    else:
        out.append(("환율 동향", "달러-원 환율 데이터를 받지 못해 코멘트를 생략합니다 (N/A)."))

    memo = (memo or "").strip()
    if memo:
        out.append(("주요 이슈", memo))
    return out


def page1(data, memo):
    asof = data["asof"]
    mark = Marks(asof)
    left = t_indices(data, mark) + t_fx(data, mark) + t_swap(data, mark) + t_cds()
    right = t_rates(data, mark) + t_commodities(data, mark) + t_vix(data, mark)
    cm = "".join(f"<p><b>- [{esc(k)}]</b> {esc(v)}</p>" for k, v in comments(data, memo))
    notes = list(wd.NA_NOTES)
    if mark.dates:
        notes.append("† 기준일 이전 마지막 거래일 종가: " + " · ".join(
            f"{', '.join(dict.fromkeys(v))} ({d})" for d, v in sorted(mark.dates.items())))
    if mark.snap:
        notes.append("s 수집 실패로 마지막 저장본 사용: " + ", ".join(sorted(mark.snap)))
    src = sum(1 for k, v in data["status"].items() if v["source"] == "LIVE")
    notes.append(f"출처: NAVER(Npay) 증권 공개 데이터, 한국은행 ECOS · 수집 {data['fetchedAt'].replace('T', ' ')} "
                 f"· LIVE {src}/{len(data['status'])} · 등락률: 상승 파랑·하락 빨강, 스파크라인 마지막 점 = 기준일")
    return (f'<section class="page">{header(f"Weekly Updates ({asof:%Y-%m-%d})", "Research Intelligence · MACRO DESK")}'
            f'<div class="cm">{cm}</div><div class="cols"><div>{left}</div><div>{right}</div></div>'
            f'<div class="fn">{"<br>".join(esc(n) for n in notes)}</div></section>')


# ---------------------------------------------------------------- page 2: VALKYRIE Intelligence Chain
FALLBACK_EDGES = {   # valkyrie/ontology.py 를 읽지 못할 때만 (2026-09-30 v4.2 값)
    ("mac_fed", "rat_ust"): (0.45, +1, "linear"), ("rat_ust", "rat_ktb"): (0.35, +1, "linear"),
    ("rat_ktb", "rat_curve"): (0.10, -1, "linear"), ("rat_ktb", "rat_credit"): (0.20, +1, "linear"),
    ("rat_ust", "eq_kospi"): (0.30, -1, "function"),
}


def _ontology():
    try:
        spec = importlib.util.spec_from_file_location("vk_ontology_ro", ONTOLOGY)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        return {"edges": {(a, b): (w, s, k) for a, b, w, s, k in mod.EDGES}, "meta": mod.EDGE_META,
                "d_kospi": mod.D_KOSPI, "owner": mod.OWNER, "ok": True}
    except Exception:
        return {"edges": FALLBACK_EDGES, "meta": {}, "d_kospi": 12.0,
                "owner": {"mac": "정희강", "rat": "정훈", "eq": "김유찬"}, "ok": False}


def _valkyrie():
    files = sorted(SNAPSHOTS.glob("snapshot_*.json"))
    if not files:
        return None
    try:
        d = json.loads(files[-1].read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    b = (d.get("states") or {}).get("base") or {}
    plan = b.get("plan") or {}
    return {"file": files[-1].name, "date": b.get("date") or d.get("as_of"), "signals": b.get("signals") or {},
            "lanes": (b.get("risk") or {}).get("lanes") or {}, "risk_label": (b.get("risk") or {}).get("label"),
            "tools": {i.get("id"): i for i in (b.get("tools") or {}).get("items", [])},
            "desks": {x.get("desk"): x for x in plan.get("desks", [])}, "watch": plan.get("watch") or []}


def _pos1y(s, asof):
    """1년 분포 안의 현재 위치(0~1) — 수준이지 전망이 아니다."""
    if s is None:
        return None
    asof = pd.Timestamp(asof)
    sub = s.loc[asof - pd.DateOffset(years=1):asof].dropna()
    if len(sub) < 10 or sub.max() == sub.min():
        return None
    return float((sub.iloc[-1] - sub.min()) / (sub.max() - sub.min()))


def _chain_nodes(data, ctx):
    asof, S = data["asof"], data["series"]
    week = asof - wd.OFFSETS["1W"]

    def lvl(sid, unit):
        s = S.get(sid)
        v, _ = wd.value_at(s, asof)
        return v, wd.change(s, asof, "1W", unit), _pos1y(s, asof)

    n = {}
    fed = ctx.get("fed") if ctx else None
    if fed is not None:
        f0, _ = wd.value_at(fed, asof)
        f1, _ = wd.value_at(fed, week)
        n["mac_fed"] = {"label": "FED 목표금리 상단", "value": f"{f0:.2f}%" if f0 is not None else "N/A",
                        "d": (f0 - f1) * 100 if None not in (f0, f1) else None, "unit": "bp", "pos": _pos1y(fed, asof)}
    else:
        n["mac_fed"] = {"label": "FED 목표금리 상단", "value": "N/A", "d": None, "unit": "bp", "pos": None}
    v, d, p = lvl("US2Y", "bp")
    n["us2y"] = {"label": "UST 2Y · 정책 경로 기대", "value": f"{v:.2f}%" if v is not None else "N/A", "d": d, "unit": "bp", "pos": p}
    v, d, p = lvl("DXY", "pct")
    n["dxy"] = {"label": "달러인덱스 DXY", "value": f"{v:,.2f}" if v is not None else "N/A", "d": d, "unit": "pct", "pos": p}
    n["regime"] = {"label": "8501 US 국면 (실데이터)", "value": (ctx or {}).get("regime", "N/A"), "d": None, "unit": "",
                   "pos": None, "sub": (f"근원 PCE {ctx['core_pce']:.2f}% · GDP {ctx['gdp']:.2f}%" if ctx else "")}
    v, d, p = lvl("US10Y", "bp")
    n["rat_ust"] = {"label": "UST 10Y", "value": f"{v:.2f}%" if v is not None else "N/A", "d": d, "unit": "bp", "pos": p}
    v, d, p = lvl("KR3Y", "bp")
    n["rat_ktb"] = {"label": "국고 3Y", "value": f"{v:.2f}%" if v is not None else "N/A", "d": d, "unit": "bp", "pos": p}
    k3, k10 = S.get("KR3Y"), S.get("KR10Y")
    if k3 is not None and k10 is not None:
        curve = ((k10 - k3.reindex(k10.index)) * 100).dropna()
        c0, _ = wd.value_at(curve, asof)
        c1, _ = wd.value_at(curve, week)
        n["rat_curve"] = {"label": "3s10s CURVE (10Y−3Y)", "value": f"{c0:.0f}bp" if c0 is not None else "N/A",
                          "d": c0 - c1 if None not in (c0, c1) else None, "unit": "bp_abs", "pos": _pos1y(curve, asof)}
    else:
        n["rat_curve"] = {"label": "3s10s CURVE (10Y−3Y)", "value": "N/A", "d": None, "unit": "bp_abs", "pos": None}
    aa, g3 = S.get("KRAA3Y"), S.get("KR3Y_ECOS")
    if aa is not None and g3 is not None:
        cr = ((aa - g3.reindex(aa.index)) * 100).dropna()
        c0, _ = wd.value_at(cr, asof)
        c1, _ = wd.value_at(cr, week)
        n["rat_credit"] = {"label": "CREDIT AA- 3Y 스프레드", "value": f"{c0:.0f}bp" if c0 is not None else "N/A",
                           "d": c0 - c1 if None not in (c0, c1) else None, "unit": "bp_abs", "pos": _pos1y(cr, asof)}
    else:
        n["rat_credit"] = {"label": "CREDIT AA- 3Y 스프레드", "value": "N/A", "d": None, "unit": "bp_abs", "pos": None}
    v, d, p = lvl("KOSPI", "pct")
    n["eq_kospi"] = {"label": "KOSPI", "value": f"{v:,.1f}" if v is not None else "N/A", "d": d, "unit": "pct", "pos": p}
    v, d, p = lvl("KOSDAQ", "pct")
    n["kosdaq"] = {"label": "KOSDAQ", "value": f"{v:,.1f}" if v is not None else "N/A", "d": d, "unit": "pct", "pos": p}
    fl = wd.week_flows(data, "KOSPI")
    fv = fl.get("foreign") if fl else None
    n["flow"] = {"label": "외국인 순매수 (코스피 주간)", "value": (f"{fv / 1e4:+,.2f}조" if fv is not None and abs(fv) >= 1e4
                                                          else f"{fv:+,.0f}억" if fv is not None else "N/A"),
                 "d": None, "unit": "", "pos": None, "sign": (fv or 0)}
    v, d, p = lvl("VIX", "pct")
    n["vix"] = {"label": "VIX", "value": f"{v:.2f}" if v is not None else "N/A", "d": d, "unit": "pct", "pos": p}
    return n


def _d_txt(d, unit):
    if d is None:
        return "주간 변화 N/A", GRAY
    r = round(d, 1)
    color = UP if r > 0 else DN if r < 0 else "#3a3f47"
    if unit == "pct":
        t = f"{'+' if r > 0 else ''}{r:.1f}%"
    else:
        t = f"{'+' if r > 0 else ''}{r:.1f}bp"
    return f"주간 {t}", color


LAYOUT = {   # lane, col
    "mac_fed": ("mac", 0), "us2y": ("mac", 1), "dxy": ("mac", 2), "regime": ("mac", 3),
    "rat_ust": ("rat", 0), "rat_ktb": ("rat", 1), "rat_curve": ("rat", 2), "rat_credit": ("rat", 3),
    "eq_kospi": ("eq", 0), "kosdaq": ("eq", 1), "flow": ("eq", 2), "vix": ("eq", 3),
}
LANE_Y = {"mac": 2, "rat": 106, "eq": 210}      # 레인 높이 92, 레인 사이 12
LANE_H, NODE_DY = 92, 14                         # 노드 위 14 는 옆 칸 화살표의 β 라벨 자리
COL_X = [78, 218, 358, 498]
NW, NH = 128, 70
VIEW_H = 304


def _node_xy(nid):
    lane, col = LAYOUT[nid]
    return COL_X[col], LANE_Y[lane] + NODE_DY


def _node_box(nid, nd):
    x, y = _node_xy(nid)
    dtxt, dcol = _d_txt(nd.get("d"), nd.get("unit"))
    accent = dcol if nd.get("d") is not None else ("#86b545" if nid == "regime" else "#c9d1da")
    if nid == "flow":
        accent = UP if nd.get("sign", 0) > 0 else DN if nd.get("sign", 0) < 0 else "#c9d1da"
        dtxt, dcol = "순매수(+) · 순매도(−)", GRAY
    if nid == "regime":
        dtxt, dcol = nd.get("sub", ""), GRAY
    out = [f'<rect x="{x}" y="{y}" width="{NW}" height="{NH}" rx="7" class="nb"/>',
           f'<rect x="{x}" y="{y + 7}" width="3.2" height="{NH - 14}" rx="1.6" fill="{accent}"/>',
           f'<text x="{x + 10}" y="{y + 14}" class="nl">{esc(nd["label"])}</text>',
           f'<text x="{x + 10}" y="{y + 33}" class="nv">{esc(nd["value"])}</text>',
           f'<text x="{x + 10}" y="{y + 46}" class="nd" fill="{dcol}">{esc(dtxt)}</text>']
    p = nd.get("pos")
    if p is not None:
        bx, bw, by = x + 10, NW - 20, y + NH - 8
        out += [f'<line x1="{bx}" y1="{by}" x2="{bx + bw}" y2="{by}" class="lvl"/>',
                f'<circle cx="{bx + bw * p:.1f}" cy="{by}" r="2.8" class="lvm"/>',
                f'<text x="{bx + bw}" y="{by - 4.5}" class="lvt" text-anchor="end">1년 위치 {p * 100:.0f}%</text>']
    return "".join(out)


def _edge_path(a, b):
    """경로와 β 라벨 위치. 수직: 선 오른쪽 · 옆 칸: 두 노드 사이 위쪽 여백 · 먼 칸: 노드 아래로 호."""
    (ax, ay), (bx, by) = _node_xy(a), _node_xy(b)
    if LAYOUT[a][0] != LAYOUT[b][0]:
        x = ax + NW / 2
        return f"M{x},{ay + NH} L{x},{by - 2}", (x + 5, (ay + NH + by) / 2 + 3, "start")
    if LAYOUT[b][1] == LAYOUT[a][1] + 1:
        yy = ay + NH / 2
        return f"M{ax + NW},{yy} L{bx - 2},{yy}", ((ax + NW + bx) / 2, ay - 4, "middle")
    x1, x2, y0 = ax + NW / 2, bx + NW / 2, ay + NH
    return f"M{x1},{y0} Q{(x1 + x2) / 2},{y0 + 34} {x2},{y0 + 1}", ((x1 + x2) / 2, y0 + 25, "middle")


CHAIN_EDGES = [("mac_fed", "rat_ust"), ("rat_ust", "rat_ktb"), ("rat_ktb", "rat_curve"), ("rat_ktb", "rat_credit"),
               ("rat_ust", "eq_kospi")]


def chain_svg(nodes, onto, valk):
    parts = [f'<svg class="chain" viewBox="0 0 640 {VIEW_H}" xmlns="http://www.w3.org/2000/svg">',
             '<defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">'
             '<path d="M0,0 L10,5 L0,10 z" fill="#7b8794"/></marker></defs>']
    names = {"mac": ("MACRO", "시장 반영 거시"), "rat": ("RATES", "금리 · 크레딧"), "eq": ("EQUITY", "주식 · 수급")}
    for lane, y in LANE_Y.items():
        temp = ((valk or {}).get("lanes") or {}).get(lane) or {}
        parts.append(f'<rect x="0" y="{y}" width="640" height="{LANE_H}" rx="8" class="lane lane-{lane}"/>')
        parts.append(f'<text x="10" y="{y + 20}" class="ln">{names[lane][0]}</text>')
        parts.append(f'<text x="10" y="{y + 32}" class="ls">{names[lane][1]}</text>')
        parts.append(f'<text x="10" y="{y + 43}" class="ls">{esc(onto["owner"].get(lane, ""))}</text>')
        if temp.get("temp") is not None:
            parts.append(f'<text x="10" y="{y + 64}" class="lt">{temp["temp"]:.0f}</text>'
                         f'<text x="10" y="{y + 75}" class="ls">스트레스 수준</text>'
                         f'<text x="10" y="{y + 85}" class="ls">{esc(temp.get("label", ""))} · 전망 아님</text>')
    labels = []
    for a, b in CHAIN_EDGES:
        e = onto["edges"].get((a, b))
        if not e:
            continue
        path, (lx, ly, anchor) = _edge_path(a, b)
        w, s, k = e
        lab = f"β {'−' if s < 0 else ''}{w:.2f}" + (" · 함수" if k == "function" else "")
        parts.append(f'<path d="{path}" class="edge" marker-end="url(#ar)"/>')
        labels.append(f'<text x="{lx:.1f}" y="{ly:.1f}" class="el" text-anchor="{anchor}">{lab}</text>')
    for nid, nd in nodes.items():
        parts.append(_node_box(nid, nd))
    parts += labels                                   # 라벨은 노드 위에 (흰 테두리로 선과 분리)
    parts.append("</svg>")
    return "".join(parts)


def beta_table(nodes, onto):
    """온톨로지 β 로 본 주간 전이 분해: 설명분 = β × 원인 변화, 나머지 = 실제 − 설명분 (관계 가정 기반, 인과 추정 아님)."""
    rows = []
    specs = [("mac_fed", "rat_ust", "FED 상단 → UST 10Y"), ("rat_ust", "rat_ktb", "UST 10Y → 국고 3Y"),
             ("rat_ktb", "rat_curve", "국고 3Y → 3s10s 커브"), ("rat_ktb", "rat_credit", "국고 3Y → AA- 스프레드"),
             ("rat_ust", "eq_kospi", "UST 10Y → KOSPI")]
    for a, b, name in specs:
        e = onto["edges"].get((a, b))
        src, dst = nodes.get(a, {}), nodes.get(b, {})
        if not e or src.get("d") is None or dst.get("d") is None:
            rows.append(f'<tr><td class="l">{esc(name)}</td><td colspan="4"><span class="na">N/A</span></td></tr>')
            continue
        w, s, k = e
        if k == "function" and b == "eq_kospi":
            expl, unit = -w * onto["d_kospi"] * src["d"] / 100.0, "pct"     # D_KOSPI × β: 100bp → −3.6%
            beta_txt = f"−{w * onto['d_kospi']:.1f}%<div class='mean'>/100bp</div>"
        else:
            expl, unit = s * w * src["d"], "bp"
            beta_txt = f"{'−' if s < 0 else ''}{w:.2f}"
        act = dst["d"]
        rest = act - expl
        f = f_pct if unit == "pct" else f_bp
        eps = 0.3 if unit == "pct" else 1.0
        if abs(act) < eps:
            verdict = "변화 미미"
        elif expl * act > 0 and abs(expl) >= 0.5 * abs(act):
            verdict = "전이로 대부분 설명"
        elif expl * act > 0:
            verdict = "전이 일부 · 다른 요인 우세"
        elif abs(expl) < eps / 2:
            verdict = "원인 변화 작음 · 다른 요인"
        else:
            verdict = "전이와 반대 방향 · 다른 요인"
        meaning = (onto["meta"].get((a, b)) or {}).get("meaning", "")
        rows.append(f'<tr><td class="l">{esc(name)}<div class="mean">{esc(meaning)}</div></td><td>{beta_txt}</td>'
                    f'<td>{f(expl)}</td><td>{f(act)}</td><td>{f(rest)}</td></tr>'
                    f'<tr class="vd"><td colspan="5" class="l">→ {verdict}</td></tr>')
    head = "<tr><th class='l'>관계 (온톨로지)</th><th>β</th><th>설명분</th><th>실제</th><th>나머지</th></tr>"
    return (f'<table class="t bt"><colgroup><col style="width:44%"><col style="width:14%"><col style="width:14%">'
            f'<col style="width:14%"><col style="width:14%"></colgroup><thead>{head}</thead><tbody>{"".join(rows)}</tbody></table>')


def _stress(temp):
    if not temp or temp.get("temp") is None:
        return '<span class="na">스트레스 수준 N/A</span>'
    t = max(0.0, min(100.0, float(temp["temp"])))
    return (f'<div class="st"><div class="stb"><i style="left:{t:.0f}%"></i></div>'
            f'<span>스트레스 수준 <b>{t:.0f}</b> · {esc(temp.get("label", ""))} (1년 분포 · 전망 아님)</span></div>')


def desk_cards(valk, ctx, onto):
    sig, tools, desks, lanes = (valk or {}).get("signals", {}), (valk or {}).get("tools", {}), (valk or {}).get("desks", {}), (valk or {}).get("lanes", {})
    cards = []
    spec = [("mac", "macro", "매크로", "MACRO", "8501 QUANT MACRO TERMINAL"),
            ("rat", "rates", "채권", "RATES", "8511 채권 위기 진단"),
            ("eq", "equity", "주식", "EQUITY", "8512 주식 시장 진단")]
    for lane, key, desk, title, tool_name in spec:
        s, t, d = sig.get(key) or {}, tools.get(key) or {}, desks.get(desk) or {}
        call = s.get("call") or "N/A"
        direction = s.get("dir") or ""
        tv = t.get("verdict")
        tool = f"{tool_name} · <b>{esc(tv)}</b>" if tv else f"{tool_name} · N/A"
        if t.get("score") is not None:
            tool += f" (점수 {t['score']:.2f})"
        extra = ""
        if key == "macro" and ctx:
            top = sorted(ctx["weights"].items(), key=lambda kv: -kv[1])[:3]
            extra = (f'<div class="kv">기준일 8501 국면 <b>{esc(ctx["regime"])}</b> · TAA 상위 '
                     + " · ".join(f"{esc(ctx['asset_ko'].get(k, k))} {v:.1f}%" for k, v in top) + "</div>")
        if key == "rates":
            # D-013: rates.dir(SHORT/LONG/NEUTRAL)는 BM 대비 듀레이션 '사이징' 스탠스(8511 변동성 타깃)이지 금리 방향이 아니다.
            # 금리 방향은 VALKYRIE 압력 규칙(pressure_kr)으로 따로 적는다.
            direction = f"사이징 {direction}" if direction else ""
            if s.get("pressure_kr"):
                extra = f'<div class="kv">금리 방향 <b>{esc(s["pressure_kr"])}</b> (VALKYRIE 압력 규칙 · 사이징과 별개)</div>'
        items = [i.get("text") for i in (d.get("items") or []) if i.get("text")][:2]
        acts = "".join(f"<li>{esc(x)}</li>" for x in items) or '<li class="na">액션 플랜 N/A</li>'
        cards.append(f'<div class="desk desk-{lane}"><div class="dh"><span><b>{title}</b> · {esc(onto["owner"].get(lane, ""))}</span>'
                     f'<span class="dir">{esc(direction)}</span></div><div class="call">{esc(call)}</div>'
                     f'<div class="kv">{tool}</div>{extra}{_stress(lanes.get(lane))}<ul class="acts">{acts}</ul></div>')
    return f'<div class="desks">{"".join(cards)}</div>'


def line_chart(title, lines, asof, fmt="{:,.1f}", rebase=False):
    """1년 추이 소형 차트. lines = [(이름, Series, 색)]. 마지막 1주는 음영, 마지막 점 = 기준일."""
    W, H, x0, x1, y0, y1 = 200, 80, 4, 158, 10, 68
    asof = pd.Timestamp(asof)
    start = asof - pd.DateOffset(years=1)
    prepared = []
    for name, s, color in lines:
        if s is None:
            continue
        sub = s.loc[start:asof].dropna()
        if len(sub) < 5:
            continue
        if rebase:
            sub = sub / sub.iloc[0] * 100
        prepared.append((name, sub, color))
    if not prepared:
        return f'<div class="ch"><div class="cht">{esc(title)}</div><div class="na chna">N/A</div></div>'
    lo = min(float(p[1].min()) for p in prepared)
    hi = max(float(p[1].max()) for p in prepared)
    rng = (hi - lo) or 1.0

    def X(d):
        return x0 + (d - start).days / max((asof - start).days, 1) * (x1 - x0)

    def Y(v):
        return y1 - (v - lo) / rng * (y1 - y0)

    wk = X(asof - pd.Timedelta(days=7))
    parts = [f'<svg viewBox="0 0 {W} {H}" class="lc">',
             f'<rect x="{wk:.1f}" y="{y0 - 2}" width="{x1 - wk:.1f}" height="{y1 - y0 + 4}" fill="#eef4e3"/>',
             f'<line x1="{x0}" y1="{y1}" x2="{x1}" y2="{y1}" class="ax"/>',
             f'<text x="{x1 + 3}" y="{y0 + 3}" class="tk">{fmt.format(hi)}</text>',
             f'<text x="{x1 + 3}" y="{y1}" class="tk">{fmt.format(lo)}</text>',
             f'<text x="{x0}" y="{H - 2}" class="tk">{start:%y.%m}</text>',
             f'<text x="{x1}" y="{H - 2}" class="tk" text-anchor="end">{asof:%y.%m.%d}</text>']
    legend = []
    for name, sub, color in prepared:
        pts = " ".join(f"{X(d):.1f},{Y(v):.1f}" for d, v in sub.items())
        parts.append(f'<polyline points="{pts}" fill="none" stroke="{color}" stroke-width="1.3" stroke-linejoin="round"/>')
        lx, ly = X(sub.index[-1]), Y(float(sub.iloc[-1]))
        parts.append(f'<circle cx="{lx:.1f}" cy="{ly:.1f}" r="2.2" fill="{DN}"/>')
        legend.append(f'<span><i style="background:{color}"></i>{esc(name)} {fmt.format(float(sub.iloc[-1]))}</span>')
    parts.append("</svg>")
    return f'<div class="ch"><div class="cht">{esc(title)}</div>{"".join(parts)}<div class="lg">{"".join(legend)}</div></div>'


def page2(data, ctx):
    asof, S = data["asof"], data["series"]
    onto, valk = _ontology(), _valkyrie()
    nodes = _chain_nodes(data, ctx)
    charts = "".join([
        line_chart("KOSPI · KOSDAQ (1년 전=100)", [("KOSPI", S.get("KOSPI"), "#2a78d6"), ("KOSDAQ", S.get("KOSDAQ"), "#eb6834")], asof, "{:,.0f}", rebase=True),
        line_chart("UST 10Y · 국고 10Y (%)", [("UST", S.get("US10Y"), "#2a78d6"), ("KTB", S.get("KR10Y"), "#1baf7a")], asof, "{:.2f}"),
        line_chart("USDKRW (원)", [("USDKRW", S.get("USDKRW"), "#8b5cf6")], asof, "{:,.0f}"),
        line_chart("WTI · Brent ($)", [("WTI", S.get("WTI"), "#eda100"), ("Brent", S.get("BRENT"), "#898781")], asof, "{:,.1f}"),
        line_chart("VIX", [("VIX", S.get("VIX"), "#e34948")], asof, "{:.1f}"),
    ])
    vnote = (f"VALKYRIE 엔진 EOD {valk['date']} ({valk['file']}, 보고서 생성 시점 최신 · 읽기 전용)" if valk
             else "VALKYRIE 스냅샷 없음 → 판정·액션 N/A")
    onote = "β·관계 = valkyrie/ontology.py (읽기 전용)" if onto["ok"] else "온톨로지 파일을 읽지 못해 2026-09-30 기준 β 사용"
    notes = [
        "주간 변화(노드)는 1쪽 표와 같은 데이터·같은 계산입니다. 전이 분해의 설명분 = β × 원인 변화, 나머지 = 실제 − 설명분으로, "
        "팀이 사전 정의한 관계 가정에 따른 분해이며 인과 추정이 아닙니다.",
        f"{vnote} · {onote} · 8501 국면·TAA는 기준일 FRED 실데이터(What-If 미적용) · 1년 위치·스트레스 수준은 현재 수준이며 전망이 아닙니다.",
        "본 자료는 VALKYRIE(한화자산운용 AI PLUSthon 2026 프로토타입)가 공개 데이터로 자동 생성한 참고 자료이며, 투자 권유나 공식 리서치 의견이 아닙니다.",
    ]
    watch = "".join(f"<li>{esc(w.get('text'))}</li>" for w in ((valk or {}).get("watch") or [])[:3] if w.get("text"))
    return (f'<section class="page p2">{header(f"VALKYRIE Intelligence Chain ({asof:%Y-%m-%d})", "Research Intelligence · WEEKLY CHAIN")}'
            f'<div class="g2"><div class="chainbox"><div class="sec">MACRO → RATES → EQUITY · 주간 변화<small>노드 값 = 기준일 · 막대 = 1년 분포 위치</small></div>'
            f'{chain_svg(nodes, onto, valk)}</div>'
            f'<div><div class="sec">β 전이 분해 · 이번 주<small>설명분 = β × 원인 변화</small></div>{beta_table(nodes, onto)}'
            + (f'<div class="sec">체크포인트 · 판단이 바뀌는 조건<small>VALKYRIE</small></div><ul class="watch">{watch}</ul>' if watch else "")
            + f'</div></div><div class="sec">데스크 판정 · 담당 모델 · 액션 플랜<small>{esc(vnote)}</small></div>'
            f'{desk_cards(valk, ctx, onto)}<div class="sec">1년 추이<small>음영 = 이번 주 · 빨간 점 = 기준일</small></div>'
            f'<div class="charts">{charts}</div><div class="fn">{"<br>".join(esc(n) for n in notes)}</div></section>')


# ---------------------------------------------------------------- document
CSS = """
@page { size: A4 landscape; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { background: #dfe3e8; font-family: "Malgun Gothic", "맑은 고딕", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
  color: #16181d; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: 297mm; height: 210mm; padding: 6.5mm 8mm 5mm; margin: 12px auto; background: #fff; overflow: hidden;
  box-shadow: 0 4px 18px rgba(0,0,0,.18); display: flex; flex-direction: column; break-after: page; page-break-after: always; }
.page:last-of-type { break-after: auto; page-break-after: auto; }
@media print { body { background: #fff; } .page { margin: 0; box-shadow: none; zoom: 1 !important; } }
.hd { display: grid; grid-template-columns: 50mm 1fr 50mm; align-items: center; gap: 4mm; margin-bottom: 2mm; }
.brand { font-size: 10pt; font-weight: 800; letter-spacing: .14em; color: #1d2a3a; line-height: 1.1; }
.brand span { display: block; font-size: 6.2pt; font-weight: 600; letter-spacing: .05em; color: #6b7280; margin-top: .7mm; }
.bar { background: #cfe8a9; border-bottom: 2px solid #86b545; text-align: center; font-size: 14.5pt; font-weight: 800;
  padding: 1.3mm 0 1.1mm; color: #1c2a10; }
.logo { text-align: right; } .logo img { height: 8.5mm; } .logo-txt { font-weight: 800; color: #F37321; font-size: 11pt; }
.cm { border: 1px solid #e3e7ec; border-left: 3px solid #86b545; background: #fbfcf8; padding: 1.5mm 3mm;
  font-size: 7.9pt; line-height: 1.5; margin-bottom: .6mm; }
.cm p { margin: 0 0 .6mm; } .cm p:last-child { margin: 0; } .cm b { font-weight: 800; }
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; flex: 1; min-height: 0; }
.sec { display: flex; justify-content: space-between; align-items: baseline; font-size: 8.2pt; font-weight: 800;
  border-bottom: 2px solid #16181d; padding-bottom: .4mm; margin: 1.3mm 0 .4mm; }
.sec small { font-size: 5.9pt; font-weight: 500; color: #6b7280; }
table.t { width: 100%; border-collapse: collapse; font-size: 6.8pt; font-variant-numeric: tabular-nums; table-layout: fixed; }
.t th { font-weight: 700; color: #3a3f47; background: #f3f5f7; border-bottom: 1px solid #b9c0c8; padding: .5mm 1.1mm;
  text-align: right; white-space: nowrap; }
.t td { border-bottom: 1px solid #eceef1; padding: .25mm 1.1mm; text-align: right; white-space: nowrap; height: 3.45mm;
  line-height: 1.25; overflow: hidden; text-overflow: ellipsis; }
.t .l { text-align: left; } .t .c { text-align: center; } .t td.c { overflow: visible; text-overflow: clip; }
.t td.grp { text-align: left; font-weight: 700; background: #f7faf2; border-right: 1px solid #e3e7ec; vertical-align: middle; }
.up { color: #1f5fbf; } .dn { color: #d0312d; } .na { color: #9aa1aa; }
td.db { position: relative; } td.db i { position: absolute; top: 20%; bottom: 20%; }
td.db i.pos { background: #d8e5fa; } td.db i.neg { background: #f8d9d8; } td.db span { position: relative; }
svg.sp { vertical-align: middle; }
.mk { color: #6b7280; font-size: 5.5pt; margin-left: .3mm; }
.fn { font-size: 5.6pt; color: #6b7280; line-height: 1.4; margin-top: auto; border-top: 1px solid #e3e7ec; padding-top: .6mm; }
/* page 2 */
.g2 { display: grid; grid-template-columns: 1.55fr 1fr; gap: 5mm; }
svg.chain { width: 100%; height: auto; display: block; margin-top: .6mm; }
.lane { fill: #f6f8fb; } .lane-mac { fill: #f5f8ff; } .lane-rat { fill: #f4fbf6; } .lane-eq { fill: #fff8f1; }
.ln { font-size: 11px; font-weight: 800; letter-spacing: .08em; fill: #1d2a3a; }
.ls { font-size: 7px; fill: #6b7280; } .lt { font-size: 16px; font-weight: 800; fill: #1d2a3a; }
.nb { fill: #fff; stroke: #cfd6de; stroke-width: 1; }
.nl { font-size: 8px; font-weight: 700; fill: #4a5563; } .nv { font-size: 16px; font-weight: 800; fill: #16181d; }
.nd { font-size: 8.5px; font-weight: 700; } .lvl { stroke: #d5dbe2; stroke-width: 3; stroke-linecap: round; }
.lvm { fill: #1d2a3a; } .lvt { font-size: 6.5px; fill: #6b7280; }
.edge { fill: none; stroke: #7b8794; stroke-width: 1.4; }
.el { font-size: 7.5px; font-weight: 700; fill: #4a5563; paint-order: stroke; stroke: #fff; stroke-width: 3px; stroke-linejoin: round; }
.bt td { white-space: normal; height: auto; } .bt .mean { font-size: 5.6pt; color: #6b7280; font-weight: 400; line-height: 1.3; }
.bt tr.vd td { border-bottom: 1px solid #d5dbe2; color: #1d2a3a; font-weight: 700; font-size: 6.3pt; padding-top: 0; }
ul.watch { margin: .8mm 0 0; padding-left: 4mm; font-size: 6.6pt; line-height: 1.45; color: #2b3139; }
.desks { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; }
.desk { border: 1px solid #e3e7ec; border-radius: 2mm; padding: 1.3mm 2.4mm; font-size: 6.7pt; line-height: 1.4; }
.desk-mac { border-top: 2.5px solid #2a78d6; } .desk-rat { border-top: 2.5px solid #1baf7a; } .desk-eq { border-top: 2.5px solid #eb6834; }
.dh { font-size: 7.4pt; display: flex; justify-content: space-between; color: #3a3f47; }
.dir { font-size: 6pt; font-weight: 800; letter-spacing: .06em; color: #6b7280; border: 1px solid #d5dbe2; border-radius: 99px; padding: 0 1.8mm; }
.call { font-size: 8.6pt; font-weight: 800; margin: .5mm 0 .4mm; color: #16181d; }
.kv { color: #3a3f47; }
.st { margin: .6mm 0; } .st span { font-size: 6.2pt; color: #4a5563; }
.stb { position: relative; height: 1.6mm; border-radius: 99px; background: linear-gradient(90deg, #cfe8d8, #f5e3b3, #f3c2c0); margin-bottom: .5mm; }
.stb i { position: absolute; top: -.6mm; width: 1.2mm; height: 2.8mm; margin-left: -.6mm; background: #1d2a3a; border-radius: 1px; }
ul.acts { margin: .4mm 0 0; padding-left: 3.6mm; color: #2b3139; }
.charts { display: grid; grid-template-columns: repeat(5, 1fr); gap: 3mm; }
.ch { border: 1px solid #eceef1; border-radius: 1.5mm; padding: 1mm 1.4mm .6mm; }
.cht { font-size: 6.8pt; font-weight: 700; color: #3a3f47; }
svg.lc { width: 100%; height: auto; display: block; }
.ax { stroke: #d5dbe2; stroke-width: .8; } .tk { font-size: 6.5px; fill: #8a9099; }
.lg { display: flex; gap: 2mm; flex-wrap: wrap; font-size: 5.8pt; color: #4a5563; }
.lg i { display: inline-block; width: 2mm; height: 2mm; border-radius: 50%; margin-right: .6mm; vertical-align: -.2mm; }
.chna { font-size: 8pt; padding: 8mm 0; text-align: center; }
"""

FIT_JS = """<script>
(function () {
  function fit() {
    var pw = 297 * 96 / 25.4, w = document.documentElement.clientWidth;
    var s = Math.min(1, (w - 16) / pw);
    document.querySelectorAll('.page').forEach(function (p) { p.style.zoom = s; });
  }
  window.addEventListener('resize', fit); fit();
})();
</script>"""


def render(data, ctx=None, memo="", include_chain=True):
    asof = data["asof"]
    body = page1(data, memo) + (page2(data, ctx) if include_chain else "")
    return (f'<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
            f'<title>Weekly Updates ({asof:%Y-%m-%d})</title><style>{CSS}</style></head><body>{body}{FIT_JS}</body></html>')


def find_browser():
    for p in BROWSERS:
        if Path(p).exists():
            return p
    return shutil.which("chrome") or shutil.which("msedge")


def to_pdf(html_path, pdf_path):
    """반환: (저장 경로 | None, PDF 바이트 | None, 오류 문구 | None).
    파일명은 v4 서버(/reports/latest, /api/reports)가 읽는 Weekly_Updates_{기준일}.pdf 로 고정한다.
    같은 이름의 PDF가 뷰어에 열려 잠겨 있어도 다른 이름으로 우회 저장하지 않는다 (다운로드용 바이트는 돌려준다)."""
    exe = find_browser()
    if not exe:
        return None, None, "Chrome/Edge를 찾지 못했습니다"
    profile = tempfile.mkdtemp(prefix="vk_pdf_")          # 다른 Chrome(디버그 세션 등)과 프로필이 겹치지 않게
    tmp = pdf_path.with_suffix(".tmp.pdf")
    try:
        cmd = [exe, "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
               f"--user-data-dir={profile}", "--no-pdf-header-footer", f"--print-to-pdf={tmp}",
               "--virtual-time-budget=4000", Path(html_path).resolve().as_uri()]
        subprocess.run(cmd, capture_output=True, timeout=120)
        if not tmp.exists() or tmp.stat().st_size < 2000:
            return None, None, "PDF 출력에 실패했습니다"
        pdf = tmp.read_bytes()
        for _ in range(20):                               # 약 5초: 뷰어·v4 서버가 잠깐 잡고 있는 경우
            try:
                tmp.replace(pdf_path)
                return pdf_path, pdf, None
            except PermissionError:
                time.sleep(0.25)
        return None, pdf, f"{pdf_path.name}이(가) 다른 프로그램에 열려 있어 파일로 저장하지 못했습니다 (다운로드는 가능)"
    except subprocess.TimeoutExpired:
        return None, None, "PDF 출력 시간 초과"
    finally:
        tmp.unlink(missing_ok=True)
        shutil.rmtree(profile, ignore_errors=True)


def build(data, ctx=None, memo="", include_chain=True, make_pdf=True):
    """보고서를 만들고 reports/ 에 저장한다. 반환: {html, html_path, pdf_path, pdf_bytes, error, name}."""
    REPORTS.mkdir(parents=True, exist_ok=True)
    doc = render(data, ctx, memo, include_chain)
    stem = f"Weekly_Updates_{data['asof']:%Y-%m-%d}"      # 파일명 패턴 고정 (v4 서버가 읽는다)
    html_path = REPORTS / f"{stem}.html"
    html_path.write_text(doc, encoding="utf-8")
    pdf_path, pdf_bytes, err = (to_pdf(html_path, REPORTS / f"{stem}.pdf") if make_pdf else (None, None, "PDF 생략"))
    return {"html": doc, "html_path": html_path, "pdf_path": pdf_path, "pdf_bytes": pdf_bytes, "error": err, "name": stem}
