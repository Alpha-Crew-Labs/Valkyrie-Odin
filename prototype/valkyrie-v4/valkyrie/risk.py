"""Node LEVEL (0..1) and the VALKYRIE stress-level thermometer — one formula for history (model.py) and state (engine).

IMPORTANT (user, 2026-09-30): this is a *current level*, not a forecast. Each object's score is the point-in-time
percentile of its value within the previous WINDOW business days, oriented so that 1 = the adverse tail for a Hanwha AMC
book (e.g. higher yields, wider credit, weaker IPO demand). It says where today sits in the last year — how to respond
is the job of the terminal signals, the owner models and the action plan (valkyrie/plan.py).
KOSPI uses the 8512 equity model's composite directly (it is already a 0..1 risk score).
Lane temperature = mean of its objects' risks; overall = mean of the three lanes (0..100, Fear & Greed style).
"""

WINDOW = 250

# node -> (daily column, adverse direction, short explanation)
KEYS = {
    "mac_gdp": ("gdp_now", "low", "성장 둔화일수록 불리(상단)"),
    "mac_uscpi": ("us_cpi", "high", "US 물가 상승일수록 불리(상단)"),
    "mac_krcpi": ("kr_cpi_fcst", "high", "KR 물가 예측 상승일수록 불리(상단)"),
    "mac_fed": ("fed", "high", "연준 금리 높을수록 불리(상단)"),
    "mac_bok": ("taylor_gap", "high", "테일러 갭(적정−기준) 클수록 긴축 압력(상단)"),
    "rat_ust": ("ust10", "high", "미국채 금리 높을수록 불리(상단)"),
    "rat_ktb": ("ktb3", "high", "국고 금리 높을수록 채권 평가손(상단)"),
    "rat_curve": ("curve_bp", "low", "커브 평탄·역전일수록 불리(상단)"),
    "rat_credit": ("credit_bp", "high", "크레딧 스프레드 확대일수록 불리(상단)"),
    "eq_fin": ("loss_share", "high", "적자 IPO 비중 높을수록 불리(상단)"),
    "eq_val": ("ktb10", "high", "할인율(국고10Y+ERP) 높을수록 불리(상단)"),
    "eq_ipo": ("ipo_demand", "low", "수요예측 경쟁률 낮을수록 불리(상단)"),
    "eq_kospi": ("kospi_risk", "abs", "8512 코스피 위험점수 (변동성·고점대비·60일선·빚투·예탁금)"),
}
LANE_NODES = {
    "mac": ["mac_gdp", "mac_uscpi", "mac_krcpi", "mac_fed", "mac_bok"],
    "rat": ["rat_ust", "rat_ktb", "rat_curve", "rat_credit"],
    "eq": ["eq_fin", "eq_val", "eq_ipo", "eq_kospi"],
}
LANE_LABEL = {"mac": "MACRO", "rat": "RATES", "eq": "EQUITY"}


def clip(x, lo=0.0, hi=1.0):
    return max(lo, min(hi, x))


def kospi_abs(c):
    """8512 composite -> risk scale (its bands .30/.45/.60 land at .38/.56/.75)."""
    return None if c is None else clip(c / 0.8)


def pct_risk(window, v, bad):
    """Share of the trailing window below v (bad=high) or above v (bad=low)."""
    vals = [x for x in window if x is not None]
    if v is None or len(vals) < 20:
        return None
    below = sum(1 for x in vals if x < v) + 0.5 * sum(1 for x in vals if x == v)
    p = below / len(vals)
    return p if bad == "high" else 1 - p


def level(score):
    if score is None:
        return "NA"
    return "LOW" if score < 0.35 else "MID" if score < 0.65 else "HIGH"


def temp_label(t):
    """0..100 level label (current position within the last year; not a forecast)."""
    if t is None:
        return "—"
    return ("매우 낮음" if t < 20 else "낮음" if t < 40 else "중간" if t < 55 else "높음" if t < 70
            else "매우 높음" if t < 85 else "극단")


LEVEL_KR = {"LOW": "1년 하단", "MID": "1년 중간", "HIGH": "1년 상단", "NA": "—"}


def temps(risks):
    """risks: {node: score|None} -> lane temps and overall (0..100)."""
    out = {}
    for lane, nodes in LANE_NODES.items():
        vals = [risks.get(n) for n in nodes if risks.get(n) is not None]
        out[lane] = round(100 * sum(vals) / len(vals), 1) if vals else None
    lanes = [v for v in out.values() if v is not None]
    out["all"] = round(sum(lanes) / len(lanes), 1) if lanes else None
    return out
