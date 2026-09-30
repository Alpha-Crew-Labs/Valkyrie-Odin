import datetime
import os
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import streamlit as st

import weekly_data as wd
import weekly_report as wr

# =============================================================================
# 1. PAGE CONFIG & STYLING  (디자인 언어: bond/explainer_app.py 와 동일)
# =============================================================================
st.set_page_config(
    page_title="QUANT MACRO TERMINAL",
    page_icon="⚡",
    layout="wide",
    initial_sidebar_state="expanded",
)

# 색: 주 계열=categorical 1(blue), 비교군=muted gray, 상태=status palette(항상 라벨 동반)
BLUE, ORANGE, AQUA, YELLOW, GRAY, RED, VIOLET = ("#2a78d6", "#eb6834", "#1baf7a", "#eda100",
                                                 "#898781", "#e34948", "#8b5cf6")
NAVY = "#104281"   # 면(fill) 전용. 선·점에 쓰면 다크 모드에서 안 보인다
STATUS = {"good": "#0ca30c", "warning": "#fab219", "serious": "#ec835a", "critical": "#d03b3b"}
BLUE_SCALE = [[0, "rgba(42,120,214,0.18)"], [1, BLUE]]   # 투명도 램프: 라이트/다크 모두에서 읽힘
MULTI_SCALE = [[0, AQUA], [0.5, BLUE], [1, VIOLET]]      # 중간 명도 다색 스케일
DIVERGING = [[0, RED], [0.5, "#f0efec"], [1, BLUE]]
GRID = "rgba(128,128,128,.18)"


def rgba(hex_, a):
    h = hex_.lstrip("#")
    return f"rgba({int(h[0:2], 16)},{int(h[2:4], 16)},{int(h[4:6], 16)},{a})"


st.markdown("""<style>
@property --i {syntax:'<integer>'; inherits:false; initial-value:0;}
@property --f {syntax:'<integer>'; inherits:false; initial-value:0;}
@keyframes cnt {from {--i:0; --f:0;}}
@keyframes fadeUp {from {opacity:0; transform:translateY(14px);} to {opacity:1; transform:none;}}
@keyframes draw {to {stroke-dashoffset:0;}}
@keyframes pulse {0% {box-shadow:0 0 0 0 var(--c);} 70% {box-shadow:0 0 0 14px transparent;} 100% {box-shadow:0 0 0 0 transparent;}}
@keyframes shimmer {0% {background-position:0% 50%;} 100% {background-position:200% 50%;}}
.block-container {padding-top:1.6rem; max-width:1400px;}
.count {animation:cnt 1.6s cubic-bezier(.2,.8,.2,1) both; counter-reset:i var(--i) f var(--f);}
.count.d0::after {content:counter(i);}
.count.d1::after {content:counter(i) "." counter(f);}
.count.d2::after {content:counter(i) "." counter(f, decimal-leading-zero);}
.hero {display:flex; flex-wrap:wrap; gap:24px; justify-content:space-between; align-items:center;
  padding:28px 32px; border-radius:20px; color:#fff;
  background:linear-gradient(120deg,#0d366b,#1c5cab 45%,#2a78d6 70%,#0d366b); background-size:200% 100%;
  animation:fadeUp .6s ease both, shimmer 14s linear infinite;}
.hero > div:first-child {flex:1 1 380px;}
.hero h1 {color:#fff; font-size:2.1rem; margin:4px 0 6px; padding:0;}
.hero p {color:rgba(255,255,255,.85); margin:0; max-width:720px; font-size:1rem;}
.eyebrow {font-size:.78rem; letter-spacing:.14em; text-transform:uppercase; color:rgba(255,255,255,.7);}
.hero .tags {display:flex; gap:8px; flex-wrap:wrap; margin-top:12px;}
.hero .tag {font-size:.76rem; padding:2px 10px; border-radius:99px; background:rgba(255,255,255,.12);
  border:1px solid rgba(255,255,255,.22); color:rgba(255,255,255,.9);}
.verdict {background:rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.25); border-radius:16px;
  padding:16px 22px; min-width:240px; backdrop-filter:blur(6px);}
.verdict .big {font-size:2.2rem; font-weight:700; line-height:1.1; display:flex; align-items:center; gap:12px;}
.dot {width:16px; height:16px; border-radius:50%; background:var(--c); animation:pulse 1.8s infinite; flex:none;}
.verdict small {color:rgba(255,255,255,.8);}
.kpi-grid {display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:14px; margin:18px 0 6px;}
.kpi {border:1px solid rgba(128,128,128,.22); border-radius:16px; padding:16px 18px 10px;
  background:rgba(128,128,128,.06); animation:fadeUp .6s ease both; transition:transform .2s, box-shadow .2s;}
.kpi:hover {transform:translateY(-4px); box-shadow:0 10px 28px rgba(0,0,0,.12);}
.kpi-t {font-size:.85rem; opacity:.72;}
.kpi-v {font-size:2rem; font-weight:700; line-height:1.2; font-variant-numeric:tabular-nums;}
.kpi-v .unit {font-size:1rem; font-weight:500; opacity:.7; margin-left:3px;}
.kpi-s {font-size:.82rem; opacity:.8;}
.kpi-s .chip {margin-right:4px;}
.chip {display:inline-flex; align-items:center; gap:5px; padding:1px 9px; border-radius:99px; font-size:.78rem;
  border:1px solid rgba(128,128,128,.3);}
.chip i {width:8px; height:8px; border-radius:50%; background:var(--c); display:inline-block;}
.spark {width:100%; height:38px; margin-top:6px;}
.spark polyline {stroke-dasharray:1; stroke-dashoffset:1; animation:draw 1.8s ease forwards;}
.callout {border-left:4px solid #2a78d6; padding:12px 16px; border-radius:8px; background:rgba(42,120,214,.08);
  animation:fadeUp .6s ease both; margin:6px 0 14px;}
.kpi-grid.tight {grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); margin-top:4px;}
.legend-row {display:flex; gap:10px; flex-wrap:wrap; font-size:.8rem; margin:-4px 0 8px;}
div[data-baseweb="tab-panel"] > div {animation:fadeUp .45s ease both;}
button[data-baseweb="tab"] p {font-size:1.02rem; font-weight:600;}
[data-testid="stPlotlyChart"] {animation:fadeUp .6s ease both;}
section[data-testid="stSidebar"] h3 {margin-bottom:.2rem;}
@media (prefers-reduced-motion: reduce) {* {animation:none !important; transition:none !important;}}
</style>""", unsafe_allow_html=True)


def html(s):
    st.markdown(s, unsafe_allow_html=True)


def num(v, d=2, sign=False, unit=""):
    """CSS counter 로 0부터 올라가는 숫자."""
    if v is None or pd.isna(v):
        return "—"
    s = "−" if v < 0 else ("+" if sign and v > 0 else "")
    a = abs(v)
    i, f = int(a), round((a - int(a)) * 10 ** d)
    if f >= 10 ** d:
        i, f = i + 1, 0
    u = f'<span class="unit">{unit}</span>' if unit else ""
    return f'{s}<span class="count d{d}" style="--i:{i};--f:{f}"></span>{u}'


def spark(series, color=BLUE, n=240):
    v = series.dropna().iloc[-n:].to_numpy()
    if len(v) < 2:
        return ""
    lo, hi = v.min(), v.max()
    pts = " ".join(f"{k / (len(v) - 1) * 200:.1f},{36 - (x - lo) / (hi - lo + 1e-9) * 32:.1f}" for k, x in enumerate(v))
    return (f'<svg class="spark" viewBox="0 0 200 40" preserveAspectRatio="none"><polyline pathLength="1" '
            f'points="{pts}" fill="none" stroke="{color}" stroke-width="2.2" stroke-linecap="round" '
            f'stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>')


def swatch(label, color):
    return f'<span class="chip"><i style="--c:{color}"></i>{label}</span>'


def chip(label, key):
    return swatch(label, STATUS[key])


def kpi(title, value_html, sub_html, spark_html="", delay=0.0):
    return (f'<div class="kpi" style="animation-delay:{delay}s"><div class="kpi-t">{title}</div>'
            f'<div class="kpi-v">{value_html}</div><div class="kpi-s">{sub_html}</div>{spark_html}</div>')


def kpi_grid(cards, tight=False):
    html(f'<div class="kpi-grid{" tight" if tight else ""}">' + "".join(cards) + "</div>")


def callout(text):
    html(f'<div class="callout">{text}</div>')


def delta_chip(delta, unit="%p"):
    """모형 − 실제 괴리 칩: 작으면 정상, 클수록 경고."""
    a = abs(delta)
    key = "good" if a < 0.5 else "warning" if a < 1.0 else "serious"
    return chip(f"{delta:+.2f}{unit}", key)


# =============================================================================
# 2. FRED DATA PIPELINE
# =============================================================================
ENV_FILE = Path(__file__).resolve().parent.parent / ".env"   # 대시보드/.env


def _read_env_file(path, name):
    """KEY=VALUE 형식의 .env 파일에서 값 하나를 읽는다 (python-dotenv 없이)."""
    try:
        for line in path.read_text(encoding="utf-8-sig").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            if k.strip() == name:
                return v.strip().strip('"').strip("'")
    except OSError:
        pass
    return ""


def _default_api_key():
    """st.secrets → 환경변수 → 대시보드/.env 순으로 API Key를 읽는다 (코드에 키를 넣지 않는다)."""
    try:
        key = st.secrets.get("FRED_API_KEY", "")
    except Exception:
        key = ""
    return key or os.environ.get("FRED_API_KEY", "") or _read_env_file(ENV_FILE, "FRED_API_KEY")


REQUIRED_SERIES = {
    "DGS2", "DGS10", "VIX", "HY_Spread", "FedAssets", "TGA", "ReverseRepo",
    "SahmRule", "FedRate", "GDPC1", "GDPPOT", "UNRATE", "NROU",
    "CPI_YoY", "CorePCE_YoY", "GDP_YoY",
}

YIELD_COLS = ["DGS1MO", "DGS3MO", "DGS6MO", "DGS1", "DGS2", "DGS3",
              "DGS5", "DGS7", "DGS10", "DGS20", "DGS30"]
YIELD_LABELS = ["1M", "3M", "6M", "1Y", "2Y", "3Y", "5Y", "7Y", "10Y", "20Y", "30Y"]

SERIES_MAP = {
    **{c: c for c in YIELD_COLS},
    "RealRate10Y": "DFII10",
    "VIX": "VIXCLS",
    "HY_Spread": "BAMLH0A0HYM2",
    "FedAssets": "WALCL",
    "TGA": "WDTGAL",
    "ReverseRepo": "RRPONTSYD",
    "Reserves": "TOTRESNS",
    "SahmRule": "SAHMREALTIME",
    "FedRate": "DFEDTARU",       # 목표금리 상단(일별). FEDFUNDS(월평균)는 최근 변경이 늦게 반영된다
    "GDPC1": "GDPC1",
    "GDPPOT": "GDPPOT",
    "UNRATE": "UNRATE",
    "NROU": "NROU",
    "SP500": "SP500",
    "WTI_Oil": "DCOILWTICO",
    "DE_10Y": "IRLTLT01DEM156N",
    "UK_10Y": "IRLTLT01GBM156N",
    "JP_10Y": "IRLTLT01JPM156N",
}

# 관측일이 아니라 "공개일"부터 값이 보이도록 인덱스를 미룬다 (미래정보 누수 방지)
RELEASE_LAG = {
    "GDPC1": 90, "GDPPOT": 90, "NROU": 90, "GDP_YoY": 90,
    "UNRATE": 7, "SahmRule": 7, "CPI_YoY": 15, "CorePCE_YoY": 30,
    "Reserves": 30, "DE_10Y": 45, "UK_10Y": 45, "JP_10Y": 45,
}


def fetch_strict_fred_data(api_key):
    """래퍼 (캐시 없음): 예외를 (None, 메시지)로 바꾼다. 예외는 캐시되지 않는다."""
    if not api_key:
        return None, ("FRED API Key가 입력되지 않았습니다. 사이드바에 키를 입력하거나 "
                      "대시보드/.env 에 FRED_API_KEY 를 설정하세요.")
    try:
        return _fetch_fred_cached(api_key)
    except ImportError:
        return None, "'fredapi' 라이브러리가 설치되지 않았습니다. pip install fredapi 후 다시 실행하세요."
    except Exception as e:
        return None, f"FRED 데이터 수집 과정에서 에러가 발생했습니다: {str(e)}"


@st.cache_data(ttl=3600, show_spinner="FRED 실데이터 수집 중...")
def _fetch_fred_cached(api_key):
    """본체 (캐시됨): 실패 시 예외를 던진다."""
    from fredapi import Fred

    fred = Fred(api_key=api_key)
    dates = pd.date_range(end=pd.Timestamp(datetime.datetime.today()).normalize(), periods=730, freq="D")
    raw, failed = {}, []
    # 전체 기록(수십 년) 대신 표시 구간 − 3년부터만 받는다: YoY(12개월)·발표 지연(최대 90일)에 충분, 결과 동일, 수집 시간 대폭 단축
    obs_start = (dates[0] - pd.DateOffset(years=3)).strftime("%Y-%m-%d")

    def _load(label, s_id, transform=None):
        try:
            ser = fred.get_series(s_id, observation_start=obs_start).dropna()
            if transform is not None:
                ser = transform(ser).dropna()          # pct_change 등은 lag 적용 전에
            lag = RELEASE_LAG.get(label, 0)
            if lag:
                ser = ser.copy()
                ser.index = pd.DatetimeIndex(ser.index).shift(lag, freq="D")   # "+ Timedelta"는 numpy 2.5에서 경고
            raw[label] = ser.reindex(dates, method="ffill")
        except Exception:
            failed.append(label)                       # 한 시리즈 실패가 전체를 죽이지 않게

    jobs = [(label, s_id, None) for label, s_id in SERIES_MAP.items()] + [
        ("CPI_YoY", "CPIAUCSL", lambda s: s.pct_change(12, fill_method=None) * 100),
        ("CorePCE_YoY", "PCEPILFE", lambda s: s.pct_change(12, fill_method=None) * 100),
        ("GDP_YoY", "GDPC1", lambda s: s.pct_change(4, fill_method=None) * 100),
    ]
    with ThreadPoolExecutor(max_workers=8) as pool:   # 32개 요청을 병렬로 (FRED 한도 120회/분 이내)
        list(pool.map(lambda j: _load(*j), jobs))

    missing_required = sorted(REQUIRED_SERIES & set(failed))
    if missing_required:
        raise RuntimeError(f"필수 FRED 시리즈 수집 실패: {', '.join(missing_required)}")

    df = pd.DataFrame({label: raw[label] for label, _, _ in jobs if label in raw})   # 컬럼 순서 고정
    for label in failed:
        df[label] = np.nan
    df = df.ffill()                                    # bfill은 쓰지 않는다 (미래값 누수)

    # 단위 보정 → 조 달러
    df["FedAssets"] = df["FedAssets"] / 1e6
    df["TGA"] = df["TGA"] / 1e6
    df["ReverseRepo"] = df["ReverseRepo"] / 1e3
    df["Reserves"] = df["Reserves"] / 1e3

    df["NetLiquidity"] = df["FedAssets"] - df["TGA"] - df["ReverseRepo"]
    df["US10Y"] = df["DGS10"]
    df["US2Y"] = df["DGS2"]
    df["Spread10Y2Y"] = df["US10Y"] - df["US2Y"]
    df["OutputGap"] = (df["GDPC1"] - df["GDPPOT"]) / df["GDPPOT"] * 100.0
    df["UnempGap"] = df["UNRATE"] - df["NROU"]
    df["GDPNow"] = df["GDP_YoY"]                       # 이름은 유지, 값은 실제 GDP 성장률(%)

    msg = "FRED Direct API Protocol (100% Live Verified)"
    optional_failed = sorted(set(failed) - REQUIRED_SERIES)
    if optional_failed:
        msg += f" — 일부 선택 시리즈 누락: {', '.join(optional_failed)}"
    return df, msg


# =============================================================================
# 3. QUANT MATH & SCENARIO ENGINE
# =============================================================================
def sigmoid_prob(val, threshold, sensitivity=1.2, invert=False):
    p = 1.0 / (1.0 + np.exp(-sensitivity * (val - threshold)))
    return float(1.0 - p if invert else p)


HAWKISH_PATTERNS = [r"\btighten(ing)?\b", r"\bhik(e|es|ed|ing)\b", r"\bpersistent\b",
                    r"\brestrictive\b", r"\bhawkish\b", r"\belevated\b", r"\bstrong(er)?\b"]
DOVISH_PATTERNS = [r"\bcuts?\b", r"\beasing\b", r"\bslowdown\b", r"\btransitory\b", r"\bneutral\b",
                   r"\bdovish\b", r"\bcooling\b", r"\bprogress\b", r"\bweak(er|ening)?\b"]


def analyze_fed_sentiment(fed_text):
    """−1(매파) ~ +1(비둘기). 단어 경계 정규식으로 센다. 'inflation'은 방향성이 없어 제외."""
    text = (fed_text or "").lower()
    hawkish = sum(len(re.findall(p, text)) for p in HAWKISH_PATTERNS)
    dovish = sum(len(re.findall(p, text)) for p in DOVISH_PATTERNS)
    if hawkish + dovish == 0:
        return 0.0
    return (dovish - hawkish) / (dovish + hawkish)


def compute_3tier_network_and_weights(inputs, fed_score):
    real_rate = inputs["RealRate10Y"] - fed_score * 0.3
    if pd.isna(real_rate):
        real_rate = 1.6

    probs = {
        "M_GROWTH_EXP": sigmoid_prob(inputs["GDPNow"], 2.0, 1.5),
        "M_GROWTH_SLOW": sigmoid_prob(inputs["SahmRule"], 0.5, 3.0),
        "M_INFL_HIGH": sigmoid_prob(inputs["CPI_YoY"], 2.8, 1.2),
        "M_LIQ_EXP": sigmoid_prob(inputs["NetLiquidity"], 6.0, 1.0),
        "T_CURVE_INV": sigmoid_prob(inputs["Spread10Y2Y"], 0.0, 2.0, invert=True),
        "T_REAL_HAWK": sigmoid_prob(real_rate, 1.6, 1.5),
        "T_CREDIT_STRESS": sigmoid_prob(inputs["HY_Spread"], 4.0, 1.2),
    }
    g_exp, g_slow, infl = probs["M_GROWTH_EXP"], probs["M_GROWTH_SLOW"], probs["M_INFL_HIGH"]
    curve, hawk, credit = probs["T_CURVE_INV"], probs["T_REAL_HAWK"], probs["T_CREDIT_STRESS"]

    probs["A_EQ_TECH"] = g_exp * (1 - hawk) * 0.95
    probs["A_EQ_CYCLICAL"] = g_exp * (1 - credit) * 0.85
    probs["A_EQ_DEFENSIVE"] = (g_slow + credit) * 0.5
    probs["A_FI_LONG"] = g_slow * (1 - infl) * 0.90
    probs["A_FI_CREDIT"] = (1 - credit) * g_exp * 0.75
    probs["A_FI_SHORT"] = (hawk + curve) * 0.55
    probs["A_ALT_GOLD"] = infl * 0.6 + hawk * 0.4

    asset_keys = [k for k in probs if k.startswith("A_")]
    total = sum(probs[k] for k in asset_keys)
    weights = {k[2:]: round(probs[k] / (total + 1e-5) * 100, 2) for k in asset_keys}
    return probs, weights


ASSET_ASSUMPTIONS = {   # (연 기대수익률, 연 변동성, boost 적용 여부)
    "EQ_TECH": (0.12, 0.22, True),
    "EQ_CYCLICAL": (0.09, 0.16, True),
    "EQ_DEFENSIVE": (0.06, 0.11, True),
    "FI_LONG": (0.04, 0.13, True),
    "FI_CREDIT": (0.055, 0.08, True),
    "FI_SHORT": (0.04, 0.012, False),
    "ALT_GOLD": (0.075, 0.15, True),
}


def run_portfolio_monte_carlo(weights, initial_nav, days, n_sims, vol_mult, return_boost, seed=42):
    p_mu, p_var = 0.0, 0.0
    for k, (mu, sig, boosted) in ASSET_ASSUMPTIONS.items():
        w = weights.get(k, 0.0) / 100.0
        p_mu += w * (mu + (return_boost if boosted else 0.0))
        p_var += (w * sig * vol_mult) ** 2              # 자산 간 상관 0 가정
    p_sig = float(np.sqrt(p_var * 1.25))

    dt = 1.0 / 252.0
    shocks = np.random.default_rng(seed).standard_normal((days, n_sims))
    daily_ret = np.exp((p_mu - 0.5 * p_sig ** 2) * dt + p_sig * np.sqrt(dt) * shocks)
    paths = np.vstack([np.full((1, n_sims), initial_nav), initial_nav * np.cumprod(daily_ret, axis=0)])

    final = paths[-1]
    p1, p5, p50, p95 = np.percentile(final, [1, 5, 50, 95])
    var_95 = (initial_nav - p5) / initial_nav * 100
    var_99 = (initial_nav - p1) / initial_nav * 100
    cvar_95 = (initial_nav - final[final <= p5].mean()) / initial_nav * 100
    return paths, p5, p50, p95, var_95, var_99, cvar_95, p_mu, p_sig


# ---- 차트 공통 헬퍼 ---------------------------------------------------------
def style_fig(fig, height=420, hovermode="x unified", **layout):
    """투명 배경 + 옅은 격자. 템플릿은 Streamlit 테마(라이트/다크)를 따른다."""
    if isinstance(layout.get("title"), str):
        layout["title"] = dict(text=layout["title"], font=dict(size=14))
    layout.setdefault("margin", dict(l=8, r=8, t=56 if "title" in layout else 36, b=8))
    layout.setdefault("legend", dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1,
                                     bgcolor="rgba(0,0,0,0)"))
    fig.update_layout(
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        height=height,
        hovermode=hovermode,
        hoverlabel=dict(namelength=-1),
        **layout,
    )
    fig.update_xaxes(showgrid=False)
    fig.update_yaxes(gridcolor=GRID, zerolinecolor="rgba(128,128,128,.35)")
    return fig


def show(fig, key):
    st.plotly_chart(fig, width="stretch", key=key,
                    config={"displaylogo": False, "modeBarButtonsToRemove": ["lasso2d", "select2d"]})


_RANGE_BUTTONS = {
    "1M": dict(count=1, label="1M", step="month", stepmode="backward"),
    "3M": dict(count=3, label="3M", step="month", stepmode="backward"),
    "6M": dict(count=6, label="6M", step="month", stepmode="backward"),
    "1Y": dict(count=1, label="1Y", step="year", stepmode="backward"),
    "All": dict(label="전체", step="all"),
}
_CTRL = dict(bgcolor="rgba(128,128,128,.12)", bordercolor="rgba(128,128,128,.35)", borderwidth=1)


def add_time_controls(fig, buttons=("1M", "3M", "6M", "1Y", "All"), slider=True, top_only=False):
    """기간 버튼(rangeselector) + 하단 범위 슬라이더(rangeslider).
    top_only=True: 서브플롯일 때 맨 위 패널에만 버튼을 붙인다 (중복 방지)."""
    selector = dict(buttons=[_RANGE_BUTTONS[b] for b in buttons], activecolor=rgba(BLUE, .35),
                    font=dict(size=11), x=0, xanchor="left", y=1.02, yanchor="bottom", **_CTRL)
    if top_only:
        fig.update_xaxes(rangeselector=selector, row=1, col=1)
    else:
        fig.update_xaxes(rangeselector=selector)
        if slider:
            fig.update_xaxes(rangeslider=dict(visible=True, thickness=0.06, bgcolor="rgba(128,128,128,.08)"))
    return fig


def add_play_controls(fig, frame_names, duration=200, prefix="", labels=None, active=None):
    """▶ 재생 / ⏸ 정지 버튼 + 프레임 슬라이더 (축 제목 아래 y=0, pad t=55).
    프레임 이름은 str 이어야 하고 슬라이더 step args 와 일치해야 한다."""
    frame_names = [str(n) for n in frame_names]
    labels = labels if labels is not None else frame_names
    active = len(frame_names) - 1 if active is None else active
    play_args = dict(frame=dict(duration=duration, redraw=True), transition=dict(duration=0),
                     fromcurrent=False, mode="immediate")
    pause_args = dict(frame=dict(duration=0, redraw=False), transition=dict(duration=0), mode="immediate")
    fig.update_layout(
        updatemenus=[dict(
            type="buttons", direction="left", showactive=False,
            x=0, xanchor="left", y=0, yanchor="top", pad=dict(t=55, r=10), **_CTRL,
            buttons=[
                dict(label="▶ 재생", method="animate", args=[frame_names, play_args]),
                dict(label="⏸ 정지", method="animate", args=[[None], pause_args]),
            ],
        )],
        sliders=[dict(
            active=active, x=0.24, xanchor="left", y=0, yanchor="top", len=0.76, pad=dict(t=45),
            currentvalue=dict(prefix=prefix, visible=True, xanchor="right", font=dict(color=BLUE, size=13)),
            font=dict(size=10), bgcolor="rgba(128,128,128,.25)", activebgcolor=BLUE,
            bordercolor="rgba(128,128,128,.35)", tickcolor="rgba(128,128,128,.5)",
            steps=[dict(label=lab, method="animate",
                        args=[[n], dict(mode="immediate", frame=dict(duration=0, redraw=True),
                                        transition=dict(duration=0))])
                   for n, lab in zip(frame_names, labels)],
        )],
    )
    return fig


def _clamped_slider(label, lo, hi, value, step=None, key=None):
    """실데이터가 범위 밖이어도 예외 없이 끝값으로 맞춘다."""
    v = float(value)
    if np.isnan(v):
        v = (lo + hi) / 2
    v = min(max(v, lo), hi)
    return st.slider(label, lo, hi, v, step=step, key=key)


WF_KEYS = ["wf_cpi", "wf_pce", "wf_gdp", "wf_gap", "wf_fed", "wf_rstar", "wf_pistar", "wf_10y", "wf_2y",
           "wf_assets", "wf_tga", "wf_rrp", "wf_sahm", "wf_vix", "wf_hy", "wf_unemp"]


# =============================================================================
# 4. SIDEBAR
# =============================================================================
with st.sidebar:
    st.header("⚙️ 설정")
    api_key = st.text_input("FRED API Key", value=_default_api_key(), type="password")

    df_raw, status_msg = fetch_strict_fred_data(api_key)
    if df_raw is None:
        st.error(status_msg)
        st.stop()

    latest = df_raw.iloc[-1].to_dict()
    enable_override = st.toggle("⚡ What-If 시나리오 적용", value=True, key="override",
                                help="켜면 아래 슬라이더 값이 모든 탭의 계산에 반영됩니다.")

    st.markdown("### 🧪 What-If")
    if st.button("↺ 실데이터로 초기화", width="stretch", help="모든 What-If 슬라이더를 최신 FRED 값으로 되돌립니다."):
        for k in WF_KEYS:
            st.session_state.pop(k, None)
        st.rerun()
    with st.expander("1️⃣ 물가 & 성장", expanded=False):
        wf_cpi = _clamped_slider("CPI YoY (%)", 0.0, 8.0, latest["CPI_YoY"], 0.1, key="wf_cpi")
        wf_pce = _clamped_slider("Core PCE YoY (%)", 0.0, 8.0, latest["CorePCE_YoY"], 0.1, key="wf_pce")
        wf_gdp = _clamped_slider("GDP Proxy Growth (%)", -3.0, 6.0, latest["GDPNow"], 0.1, key="wf_gdp")
        wf_gap = _clamped_slider("Output Gap (%)", -4.0, 4.0, latest["OutputGap"], 0.1, key="wf_gap")

    with st.expander("2️⃣ 정책금리 & 국채", expanded=False):
        wf_fed = _clamped_slider("Fed Funds Rate (%)", 0.0, 8.0, latest["FedRate"], 0.25, key="wf_fed")
        wf_rstar = st.slider("Neutral Real Rate r* (%)", 0.0, 3.5, 1.25, 0.25, key="wf_rstar")
        wf_pistar = st.slider("Inflation Target π* (%)", 1.0, 4.0, 2.0, 0.25, key="wf_pistar")
        wf_10y = _clamped_slider("US 10Y (%)", 1.0, 7.0, latest["US10Y"], 0.05, key="wf_10y")
        wf_2y = _clamped_slider("US 2Y (%)", 1.0, 7.0, latest["US2Y"], 0.05, key="wf_2y")

    with st.expander("3️⃣ 연준 유동성", expanded=False):
        wf_assets = _clamped_slider("Fed Assets ($T)", 4.0, 10.0, latest["FedAssets"], 0.1, key="wf_assets")
        wf_tga = _clamped_slider("TGA ($T)", 0.0, 1.5, latest["TGA"], 0.05, key="wf_tga")
        wf_rrp = _clamped_slider("Reverse Repo ($T)", 0.0, 2.5, latest["ReverseRepo"], 0.05, key="wf_rrp")

    with st.expander("4️⃣ 경기침체 & 리스크", expanded=False):
        wf_sahm = _clamped_slider("Sahm Rule", -1.0, 3.0, latest["SahmRule"], 0.05, key="wf_sahm")   # 음수 가능: 하한 -1
        wf_vix = _clamped_slider("VIX", 10.0, 60.0, latest["VIX"], 0.5, key="wf_vix")
        wf_hy = _clamped_slider("HY Spread (%)", 1.0, 12.0, latest["HY_Spread"], 0.1, key="wf_hy")
        wf_unemp = _clamped_slider("Unemployment (%)", 3.0, 8.0, latest["UNRATE"], 0.1, key="wf_unemp")

    st.markdown("### 💼 포트폴리오")
    with st.expander("5️⃣ 몬테카를로", expanded=False):
        wf_nav = st.number_input("Initial NAV ($)", min_value=1000, value=10000, step=1000)
        wf_horizon = st.slider("Simulation Days", 60, 504, 252, 21)
        wf_vol = st.slider("Volatility Multiplier", 0.5, 3.0, 1.0, 0.1)
        wf_ret = st.slider("Market Return Shift (%)", -5.0, 5.0, 0.0, 0.5) / 100

    with st.expander("6️⃣ FOMC 문장 감성 분석", expanded=False):
        fed_text = st.text_area(
            "FOMC Statement / Speech",
            value="Inflation remains somewhat elevated. The Committee seeks to achieve maximum "
                  "employment and inflation at 2 percent.",
            height=140,
        )
    fed_score = analyze_fed_sentiment(fed_text)

    st.markdown("### 📰 리포트")
    with st.expander("Weekly Updates 보고서 (PDF)", expanded=True):
        today = datetime.date.today()
        rep_asof = st.date_input("기준일 (금요일 종가)", value=wd.last_friday(today), key="rep_asof",
                                 min_value=today - datetime.timedelta(days=365), max_value=today, format="YYYY-MM-DD",
                                 help="각 지표는 기준일 이전 마지막 거래일 종가로 계산합니다 (휴장 시 †).")
        rep_memo = st.text_area("주요 이슈 메모 (선택)", key="rep_memo", height=68,
                                placeholder="시황 코멘트에 덧붙일 이슈·뉴스")
        rep_chain = st.checkbox("2쪽 VALKYRIE 인텔리전스 체인 포함", value=True, key="rep_chain")
        make_report = st.button("📰 보고서 생성", type="primary", width="stretch", key="rep_make",
                                help="NAVER·ECOS 실데이터로 A4 가로 보고서를 만들고 PDF로 저장합니다.")
        reopen_report = (st.button("↗ 마지막 보고서 열기", width="stretch", key="rep_open")
                         if "weekly_report" in st.session_state else False)

    st.download_button("⬇️ 수집 데이터 CSV", df_raw.to_csv(index_label="date").encode("utf-8-sig"),
                       file_name=f"fred_macro_{df_raw.index[-1]:%Y%m%d}.csv", mime="text/csv", width="stretch")
    st.caption(f"데이터 기준일 **{df_raw.index[-1]:%Y-%m-%d}** · 출처 FRED (St. Louis Fed) · 1시간 캐시")
    st.caption(status_msg)

    if enable_override:
        macro_inputs = {
            **latest,
            "CPI_YoY": wf_cpi,
            "CorePCE_YoY": wf_pce,
            "GDPNow": wf_gdp,
            "OutputGap": wf_gap,
            "FedRate": wf_fed,
            "US10Y": wf_10y,
            "US2Y": wf_2y,
            "FedAssets": wf_assets,
            "TGA": wf_tga,
            "ReverseRepo": wf_rrp,
            "NetLiquidity": wf_assets - wf_tga - wf_rrp,
            "SahmRule": wf_sahm,
            "VIX": wf_vix,
            "HY_Spread": wf_hy,
            "UNRATE": wf_unemp,
            "UnempGap": wf_unemp - latest["NROU"],
            "Spread10Y2Y": wf_10y - wf_2y,
        }
    else:
        macro_inputs = latest

probs, weights = compute_3tier_network_and_weights(macro_inputs, fed_score)
m = macro_inputs

SLIDER_FIELDS = ["CPI_YoY", "CorePCE_YoY", "GDPNow", "OutputGap", "FedRate", "US10Y", "US2Y", "FedAssets",
                 "TGA", "ReverseRepo", "SahmRule", "VIX", "HY_Spread", "UNRATE"]


def is_changed(k):
    """What-If 값이 실데이터와 (표시 자릿수 기준으로) 다른가."""
    return enable_override and abs(float(m[k]) - float(latest[k])) >= 0.005


def live(k, fmt=".2f", pre="", unit=""):
    return f' · <span style="opacity:.7">실데이터 {pre}{latest[k]:{fmt}}{unit}</span>' if is_changed(k) else ""


n_changed = sum(is_changed(k) for k in SLIDER_FIELDS)

# =============================================================================
# 5. HERO + TOP METRICS
# =============================================================================
QUADRANTS = {   # (인플레 갭 > 0, 성장 갭 > 0) → 국면
    (True, True): ("과열", "REFLATION", "serious"),
    (False, True): ("골디락스", "GOLDILOCKS", "good"),
    (False, False): ("침체", "DEFLATION", "warning"),
    (True, False): ("스태그플레이션", "STAGFLATION", "critical"),
}
q_ko, q_en, q_key = QUADRANTS[(m["CorePCE_YoY"] - 2.0 > 0, m["GDPNow"] - 2.0 > 0)]
top_asset = max(weights, key=weights.get)
ASSET_KO = {"EQ_TECH": "기술주", "EQ_CYCLICAL": "경기민감주", "EQ_DEFENSIVE": "방어주", "FI_LONG": "장기채",
            "FI_CREDIT": "회사채", "FI_SHORT": "단기채", "ALT_GOLD": "금"}

html(f'<div class="hero"><div><div class="eyebrow">US Macro Quant Terminal · {df_raw.index[-1]:%Y.%m.%d} · FRED Live</div>'
     f'<h1>매크로 퀀트 터미널</h1>'
     f'<p>미국 거시 지표를 FRED 실데이터로 매일 읽고, <b>3단계 확률 네트워크</b>로 '
     f'<b>"어떤 자산을 얼마나 들고 갈지"</b>까지 이어 드립니다.</p>'
     f'<div class="tags"><span class="tag">'
     f'{("⚡ What-If " + (f"{n_changed}개 값 변경" if n_changed else "켜짐 · 실데이터와 동일")) if enable_override else "📡 실데이터 그대로"}'
     f'</span>'
     f'<span class="tag">FOMC 감성 {fed_score:+.2f}</span>'
     f'<span class="tag">최대 비중 {ASSET_KO[top_asset]} {weights[top_asset]:.1f}%</span></div></div>'
     f'<div class="verdict"><small>현재 매크로 국면</small><div class="big"><span class="dot" style="--c:{STATUS[q_key]}">'
     f'</span>{q_ko}</div><small>{q_en} · 근원 PCE {m["CorePCE_YoY"]:.2f}% · 성장 {m["GDPNow"]:.2f}%</small></div></div>')

spread_inv = m["Spread10Y2Y"] < 0
sahm_hot = m["SahmRule"] >= 0.5
kpi_grid([
    kpi("근원 PCE 물가", num(m["CorePCE_YoY"], 2, unit="%"),
        chip("목표 상회" if m["CorePCE_YoY"] > 2.5 else "목표 근접", "warning" if m["CorePCE_YoY"] > 2.5 else "good")
        + f' CPI {m["CPI_YoY"]:.2f}%' + live("CorePCE_YoY", unit="%"), spark(df_raw["CorePCE_YoY"], YELLOW), 0),
    kpi("실질 GDP 성장률", num(m["GDPNow"], 2, sign=True, unit="%"),
        chip("확장" if m["GDPNow"] >= 2 else "둔화", "good" if m["GDPNow"] >= 2 else "warning") + " 전년 대비"
        + live("GDPNow", "+.2f", unit="%"), spark(df_raw["GDPNow"], AQUA), .06),
    kpi("GDP 갭", num(m["OutputGap"], 2, sign=True, unit="%"), "잠재 GDP 대비" + live("OutputGap", "+.2f", unit="%"),
        spark(df_raw["OutputGap"]), .12),
    kpi("10Y−2Y 금리차", num(m["Spread10Y2Y"], 2, sign=True, unit="%p"),
        chip("역전" if spread_inv else "정상 곡선", "critical" if spread_inv else "good")
        + live("Spread10Y2Y", "+.2f", unit="%p"), spark(df_raw["Spread10Y2Y"], RED if spread_inv else BLUE), .18),
    kpi("Sahm 침체 지표", num(m["SahmRule"], 2),
        chip("침체 신호" if sahm_hot else "정상", "critical" if sahm_hot else "good") + " 기준 0.50"
        + live("SahmRule"), spark(df_raw["SahmRule"], RED if sahm_hot else BLUE), .24),
    kpi("순유동성", "$" + num(m["NetLiquidity"], 2, unit="T"),
        "자산 − TGA − RRP" + live("NetLiquidity", pre="$", unit="T"), spark(df_raw["NetLiquidity"], BLUE), .30),
])
st.write("")

# =============================================================================
# 6. DASHBOARD TABS
# =============================================================================
(tab_net, tab_taylor, tab_sankey, tab_3d,
 tab_corr, tab_stress, tab_clock, tab_globe) = st.tabs([
    "🧠 확률 네트워크 & TAA",
    "🏛️ 테일러 준칙",
    "🌊 연준 유동성",
    "📈 수익률 곡선",
    "⚡ 상관관계 & Lab",
    "💥 스트레스 & VaR",
    "🎬 매크로 시계",
    "🌍 글로벌 & CIO 메모",
])

# ---- 탭 1: 3-Tier 네트워크 & TAA ---------------------------------------------
with tab_net:
    callout("<b>거시 지표 → 전달 경로 → 자산</b>의 3단계로 확률이 흘러가며 목표 비중을 정합니다. "
            "노드가 클수록 확률이 높고, <b>▶ 흐름</b>을 누르면 신호가 전달되는 모습을 볼 수 있습니다.")
    col_l, col_r = st.columns([1.6, 1.0], gap="large")
    with col_l:
        st.markdown("#### 🧠 3-Tier 확률 네트워크")
        nodes = {
            "M_GROWTH_EXP": (0.0, 5.0, f"Expansion (GDP {m['GDPNow']:.2f}%)"),
            "M_GROWTH_SLOW": (0.0, 4.0, f"Slowdown (Sahm {m['SahmRule']:.2f})"),
            "M_INFL_HIGH": (0.0, 3.0, f"High Infl (CPI {m['CPI_YoY']:.2f}%)"),
            "M_LIQ_EXP": (0.0, 2.0, f"Liquidity (${m['NetLiquidity']:.2f}T)"),
            "T_CURVE_INV": (1.5, 4.5, f"Curve Inversion ({m['Spread10Y2Y']:+.2f}%p)"),
            "T_REAL_HAWK": (1.5, 3.5, f"Real-Rate Hawk ({m['RealRate10Y']:.2f}%)"),
            "T_CREDIT_STRESS": (1.5, 2.5, f"Credit Stress (HY {m['HY_Spread']:.2f}%)"),
            "EQ_TECH": (3.0, 5.5, f"EQ Tech {weights['EQ_TECH']:.1f}%"),
            "EQ_CYCLICAL": (3.0, 4.5, f"EQ Cyclical {weights['EQ_CYCLICAL']:.1f}%"),
            "EQ_DEFENSIVE": (3.0, 3.5, f"EQ Defensive {weights['EQ_DEFENSIVE']:.1f}%"),
            "FI_LONG": (3.0, 2.5, f"FI Long {weights['FI_LONG']:.1f}%"),
            "FI_CREDIT": (3.0, 1.5, f"FI Credit {weights['FI_CREDIT']:.1f}%"),
            "FI_SHORT": (3.0, 0.5, f"FI Short {weights['FI_SHORT']:.1f}%"),
            "ALT_GOLD": (3.0, -0.5, f"Gold {weights['ALT_GOLD']:.1f}%"),
        }
        edges = [("M_GROWTH_EXP", "T_CREDIT_STRESS"), ("M_GROWTH_SLOW", "T_CURVE_INV"),
                 ("M_INFL_HIGH", "T_REAL_HAWK"), ("T_CREDIT_STRESS", "EQ_DEFENSIVE"),
                 ("T_REAL_HAWK", "ALT_GOLD"), ("T_REAL_HAWK", "FI_SHORT"),
                 ("M_GROWTH_EXP", "EQ_TECH"), ("M_GROWTH_SLOW", "FI_LONG")]

        def node_p(nid):
            return probs.get(nid, probs.get("A_" + nid, 0.5))

        fig_net = go.Figure()
        for x0, x1, lab in [(0.0, 0.0, "MACRO"), (1.5, 1.5, "TRANSMISSION"), (3.0, 3.0, "ASSETS")]:
            fig_net.add_annotation(x=x0, y=6.25, text=f"<b>{lab}</b>", showarrow=False,
                                   font=dict(size=11, color=GRAY))
        for src, dst in edges:
            p = node_p(src)
            x0, y0, _ = nodes[src]
            x1, y1, _ = nodes[dst]
            fig_net.add_trace(go.Scatter(
                x=[x0, x1], y=[y0, y1], mode="lines", hoverinfo="skip", showlegend=False,
                line=dict(width=max(1.5, p * 4.5), color=rgba(BLUE, round(max(0.15, p) * 0.8, 2))),
            ))

        ids = list(nodes)
        hover = []
        for nid in ids:
            h = f"<b>{nodes[nid][2]}</b><br>Probability: {node_p(nid):.1%}"
            if nid in weights:
                h += f"<br>Target weight: {weights[nid]:.2f}%"
            hover.append(h)
        fig_net.add_trace(go.Scatter(
            x=[nodes[i][0] for i in ids], y=[nodes[i][1] for i in ids],
            mode="markers+text", text=[nodes[i][2] for i in ids],
            textposition=["middle left" if nodes[i][0] == 0 else
                          "bottom center" if nodes[i][0] == 1.5 else "middle right" for i in ids],
            textfont=dict(size=12),
            hovertext=hover, hovertemplate="%{hovertext}<extra></extra>", showlegend=False,
            marker=dict(size=[16 + node_p(i) * 16 for i in ids],
                        opacity=[max(0.35, node_p(i)) for i in ids],
                        color=[AQUA if i in weights else BLUE for i in ids],
                        line=dict(width=2, color="rgba(255,255,255,.9)")),
        ))

        def particles(phase):
            xs, ys, sizes = [], [], []
            for src, dst in edges:
                p = node_p(src)
                x0, y0, _ = nodes[src]
                x1, y1, _ = nodes[dst]
                n = 1 + int(round(p * 3))
                for j in range(n):
                    t = (phase + j / n) % 1.0
                    xs.append(x0 + t * (x1 - x0))
                    ys.append(y0 + t * (y1 - y0))
                    sizes.append(4 + p * 6)
            return xs, ys, sizes

        px0, py0, ps0 = particles(0.0)
        fig_net.add_trace(go.Scatter(x=px0, y=py0, mode="markers", hoverinfo="skip", showlegend=False,
                                     marker=dict(size=ps0, color=ORANGE, opacity=0.9)))
        particle_idx = len(fig_net.data) - 1
        flow_names = []
        flow_frames = []
        for i in range(20):
            xs, ys, sz = particles(i * 0.05)
            flow_names.append(str(i))
            flow_frames.append(go.Frame(name=str(i), traces=[particle_idx],
                                        data=[go.Scatter(x=xs, y=ys, marker=dict(size=sz))]))
        fig_net.frames = flow_frames
        fig_net.update_layout(updatemenus=[dict(
            type="buttons", direction="left", showactive=False,
            x=0, xanchor="left", y=0, yanchor="top", pad=dict(t=10), **_CTRL,
            buttons=[
                dict(label="▶ 흐름", method="animate",
                     args=[flow_names * 6, dict(frame=dict(duration=70, redraw=False),
                                                transition=dict(duration=0), mode="immediate")]),
                dict(label="⏸ 정지", method="animate",
                     args=[[None], dict(frame=dict(duration=0, redraw=False), mode="immediate")]),
            ],
        )])
        style_fig(fig_net, height=560, hovermode="closest", margin=dict(l=8, r=8, t=10, b=60),
                  xaxis=dict(visible=False, range=[-1.6, 4.4]),
                  yaxis=dict(visible=False, range=[-1.1, 6.5]))
        show(fig_net, "net")

    with col_r:
        st.markdown("#### 🎯 목표 자산 비중")
        w_df = (pd.DataFrame({"자산": [ASSET_KO[k] for k in weights], "코드": list(weights),
                              "비중 (%)": list(weights.values())})
                .sort_values("비중 (%)", ascending=False))
        asset_colors = {"EQ_TECH": BLUE, "EQ_CYCLICAL": AQUA, "EQ_DEFENSIVE": VIOLET, "FI_LONG": NAVY,
                        "FI_CREDIT": ORANGE, "FI_SHORT": GRAY, "ALT_GOLD": YELLOW}
        # 자산군(안쪽 고리) → 개별 자산(바깥 고리) 선버스트
        classes = {"주식": (["EQ_TECH", "EQ_CYCLICAL", "EQ_DEFENSIVE"], BLUE),
                   "채권": (["FI_LONG", "FI_CREDIT", "FI_SHORT"], NAVY),
                   "대안": (["ALT_GOLD"], YELLOW)}
        class_w = {c: sum(weights[k] for k in ks) for c, (ks, _) in classes.items()}
        sb_ids, sb_labels, sb_parents, sb_values, sb_colors = [], [], [], [], []
        for cname, (ks, ccolor) in classes.items():
            sb_ids.append(cname); sb_labels.append(cname); sb_parents.append("")
            sb_values.append(0); sb_colors.append(ccolor)   # remainder: 부모 = 자식 합 (부동소수 오차로 조각이 빠지지 않게)
            for k in ks:
                sb_ids.append(k); sb_labels.append(ASSET_KO[k]); sb_parents.append(cname)
                sb_values.append(weights[k]); sb_colors.append(asset_colors[k])
        fig_pie = go.Figure(go.Sunburst(
            ids=sb_ids, labels=sb_labels, parents=sb_parents, values=sb_values, branchvalues="remainder",
            marker=dict(colors=sb_colors, line=dict(color="rgba(255,255,255,.85)", width=2)),
            leaf=dict(opacity=1),   # 기본 0.7이면 바깥 고리가 흐려진다
            insidetextorientation="horizontal", texttemplate="%{label}<br>%{percentRoot:.1%}",
            hovertemplate="%{label}: %{percentRoot:.2%}<extra></extra>", sort=False))
        style_fig(fig_pie, height=320, hovermode="closest", showlegend=False, margin=dict(l=4, r=4, t=4, b=4))
        show(fig_pie, "pie")
        html('<div class="legend-row">' + "".join(
            swatch(f"{c} {w:.1f}%", classes[c][1]) for c, w in class_w.items()) + '<span style="opacity:.7">· 조각을 누르면 확대</span></div>')
        st.dataframe(w_df[["자산", "코드", "비중 (%)"]], hide_index=True, width="stretch",
                     column_config={"비중 (%)": st.column_config.ProgressColumn(
                         "비중 (%)", min_value=0, max_value=float(max(weights.values())), format="%.2f%%")})

# ---- 탭 2: 테일러 준칙 ---------------------------------------------------------
with tab_taylor:
    df_calc = df_raw.copy()
    if enable_override:
        cols = [c for c in macro_inputs if c in df_calc.columns]
        df_calc.loc[df_calc.index[-1], cols] = [macro_inputs[c] for c in cols]

    pi = df_calc["CorePCE_YoY"]
    df_calc["Taylor_1993"] = wf_rstar + pi + 0.5 * (pi - wf_pistar) + 0.5 * df_calc["OutputGap"]
    df_calc["Taylor_Okun"] = wf_rstar + pi + 0.5 * (pi - wf_pistar) - 1.0 * df_calc["UnempGap"]
    df_calc["Taylor_Inertial"] = (0.85 * df_calc["FedRate"].shift(1) + 0.15 * df_calc["Taylor_1993"])
    df_calc.loc[df_calc.index[0], "Taylor_Inertial"] = df_calc["FedRate"].iloc[0]

    last = df_calc.iloc[-1]
    actual = last["FedRate"]
    gap93 = last["Taylor_1993"] - actual
    callout(f"테일러 준칙은 <b>물가와 경기 상황에 맞는 기준금리</b>를 계산합니다. 지금 연준 금리는 1993 공식보다 "
            f"<b>{abs(gap93):.2f}%p {'낮습니다 (완화적)' if gap93 > 0 else '높습니다 (긴축적)'}</b>. "
            f"r* {wf_rstar:.2f}% · π* {wf_pistar:.2f}% 가정.")
    kpi_grid([
        kpi("실제 기준금리 (상단)", num(actual, 2, unit="%"), "DFEDTARU · 일별", spark(df_calc["FedRate"]), 0),
        kpi("Taylor 1993", num(last["Taylor_1993"], 2, unit="%"), delta_chip(gap93) + " 실제 대비",
            spark(df_calc["Taylor_1993"], ORANGE), .06),
        kpi("Taylor Okun", num(last["Taylor_Okun"], 2, unit="%"),
            delta_chip(last["Taylor_Okun"] - actual) + " 실제 대비", spark(df_calc["Taylor_Okun"], VIOLET), .12),
        kpi("Inertial", num(last["Taylor_Inertial"], 2, unit="%"),
            delta_chip(last["Taylor_Inertial"] - actual) + " 실제 대비", spark(df_calc["Taylor_Inertial"], AQUA), .18),
    ], tight=True)

    st.markdown("#### 🏛️ 실제 금리 vs 테일러 준칙")
    cc1, cc2 = st.columns([3, 1])
    model_styles = {"Taylor_1993": (ORANGE, "dash"), "Taylor_Okun": (VIOLET, "dot"),
                    "Taylor_Inertial": (AQUA, "dashdot")}
    sel_models = cc1.multiselect("Taylor Models", list(model_styles), default=list(model_styles),
                                 label_visibility="collapsed")
    show_gap = cc2.toggle("정책 괴리 음영", value=True)

    fig_t = go.Figure()
    fig_t.add_trace(go.Scatter(x=df_calc.index, y=df_calc["FedRate"], name="실제 기준금리",
                               line=dict(color=BLUE, width=3), hovertemplate="%{y:.2f}%"))
    for mname in sel_models:
        color, dash = model_styles[mname]
        fig_t.add_trace(go.Scatter(x=df_calc.index, y=df_calc[mname], name=mname,
                                   line=dict(color=color, dash=dash, width=2), hovertemplate="%{y:.2f}%"))
    if show_gap:
        # tonexty 는 바로 앞 트레이스와 채운다 → FedRate 숨김 복제를 바로 앞에 둔다
        fig_t.add_trace(go.Scatter(x=df_calc.index, y=df_calc["FedRate"], line=dict(width=0),
                                   showlegend=False, hoverinfo="skip"))
        fig_t.add_trace(go.Scatter(x=df_calc.index, y=df_calc["Taylor_1993"], name="정책 괴리",
                                   line=dict(width=0), fill="tonexty",
                                   fillcolor=rgba(RED, .15), hoverinfo="skip"))
    add_time_controls(fig_t)
    style_fig(fig_t, height=480, yaxis_title="금리 (%)")
    show(fig_t, "taylor")

# ---- 탭 3: 연준 유동성 & Sankey -------------------------------------------------
with tab_sankey:
    callout("연준 총자산에서 <b>재무부 계좌(TGA)와 역레포</b>로 묶인 돈을 빼면 시장에 도는 <b>순유동성</b>이 됩니다. "
            "기준일을 옮기면 과거 시점의 흐름을 볼 수 있습니다.")
    kpi_grid([
        kpi("연준 총자산", "$" + num(m["FedAssets"], 2, unit="T"), "WALCL", spark(df_raw["FedAssets"]), 0),
        kpi("재무부 TGA", "$" + num(m["TGA"], 2, unit="T"), "유동성 흡수", spark(df_raw["TGA"], RED), .06),
        kpi("역레포", "$" + num(m["ReverseRepo"], 2, unit="T"), "유동성 흡수", spark(df_raw["ReverseRepo"], ORANGE), .12),
        kpi("순유동성", "$" + num(m["NetLiquidity"], 2, unit="T"),
            chip("확장" if m["NetLiquidity"] >= 6 else "축소", "good" if m["NetLiquidity"] >= 6 else "warning")
            + " 기준 $6T", spark(df_raw["NetLiquidity"], AQUA), .18),
    ], tight=True)

    opts = list(df_raw.index[::7])
    if opts[-1] != df_raw.index[-1]:
        opts.append(df_raw.index[-1])
    ref_date = st.select_slider("📅 기준일", options=opts, value=opts[-1],
                                format_func=lambda d: d.strftime("%Y-%m-%d"))
    if ref_date == df_raw.index[-1]:
        fa, tga, rrp = m["FedAssets"], m["TGA"], m["ReverseRepo"]
    else:
        row = df_raw.loc[ref_date]
        fa, tga, rrp = row["FedAssets"], row["TGA"], row["ReverseRepo"]

    res = max(0.1, fa - tga - rrp)
    eq_val = res * (weights["EQ_TECH"] + weights["EQ_CYCLICAL"]) / 100
    fi_val = res * (weights["FI_LONG"] + weights["FI_CREDIT"] + weights["EQ_DEFENSIVE"]) / 100
    cash_val = res * (weights["FI_SHORT"] + weights["ALT_GOLD"]) / 100

    s1, s2 = st.columns([1.15, 1], gap="large")
    with s1:
        st.markdown(f"#### 🌊 유동성 → 자산 배분 흐름 · {ref_date:%Y-%m-%d}")
        node_colors = [GRAY, RED, ORANGE, AQUA, BLUE, VIOLET, YELLOW]
        fig_s = go.Figure(go.Sankey(
            arrangement="snap",
            node=dict(
                label=["Fed Balance Sheet", "Treasury TGA", "Reverse Repo", "Bank Reserves / Net Liq",
                       "Equities & Tech", "Bonds & Fixed Income", "Cash & Safe Commodities"],
                color=node_colors, pad=18, thickness=16, line=dict(color="rgba(0,0,0,0)", width=0),
                hovertemplate="%{label}<br>%{value:.2f} T<extra></extra>",
            ),
            link=dict(
                source=[0, 0, 0, 3, 3, 3], target=[1, 2, 3, 4, 5, 6],
                value=[tga, rrp, res, eq_val, fi_val, cash_val],
                color=[rgba(c, .28) for c in [RED, ORANGE, AQUA, BLUE, VIOLET, YELLOW]],
                hovertemplate="%{source.label} → %{target.label}<br>%{value:.2f} T<extra></extra>",
            ),
        ))
        style_fig(fig_s, height=440, hovermode="closest", margin=dict(l=8, r=8, t=16, b=8))
        show(fig_s, "sankey")
    with s2:
        st.markdown("#### 📈 유동성 구성 추이 ($T)")
        fig_liq = go.Figure()
        for col, name, color, width in [("FedAssets", "연준 총자산", BLUE, 2),
                                        ("NetLiquidity", "순유동성", AQUA, 3.5),
                                        ("TGA", "TGA", RED, 2), ("ReverseRepo", "역레포", ORANGE, 2)]:
            fig_liq.add_trace(go.Scatter(x=df_raw.index, y=df_raw[col], name=name,
                                         line=dict(color=color, width=width), hovertemplate="$%{y:.2f}T"))
        fig_liq.add_vline(x=ref_date, line_dash="dot", line_color=GRAY)
        add_time_controls(fig_liq, slider=False)
        style_fig(fig_liq, height=440, yaxis_title="$ Trillion",
                  legend=dict(orientation="h", yanchor="top", y=-0.08, x=0, bgcolor="rgba(0,0,0,0)"),
                  margin=dict(l=8, r=8, t=36, b=40))
        show(fig_liq, "liq")

# ---- 탭 4: 3D 수익률 곡선 -------------------------------------------------------
with tab_3d:
    df_y3d = df_raw[YIELD_COLS].resample("W").mean().dropna()
    if df_y3d.empty:
        st.warning("수익률 곡선 데이터가 부족합니다.")
    else:
        latest_curve = df_y3d.iloc[-1].values
        y_min = float(df_y3d.values.min()) - 0.2
        y_max = float(df_y3d.values.max()) + 0.2
        # 주간 라벨은 주의 끝(일요일)이라 마지막 주가 미래 날짜가 될 수 있다 → 실제 마지막 관측일로 자른다
        wk_names = [min(d, df_raw.index[-1]).strftime("%Y-%m-%d") for d in df_y3d.index]
        slope = latest_curve[YIELD_LABELS.index("10Y")] - latest_curve[YIELD_LABELS.index("3M")]
        callout(f"지금 미국채 곡선은 10년−3개월 <b>{slope:+.2f}%p</b>로 "
                f"<b>{'정상 (우상향)' if slope >= 0 else '역전 (경기침체 경고)'}</b> 모양입니다. "
                "▶ 재생으로 지난 2년간 곡선이 어떻게 움직였는지 볼 수 있습니다.")
        c1, c2 = st.columns([1, 1], gap="large")
        with c1:
            st.markdown("#### 📈 수익률 곡선 타임랩스 (주간)")
            fig_c = go.Figure([
                go.Scatter(x=YIELD_LABELS, y=latest_curve, name="선택 주", mode="lines+markers",
                           line=dict(color=BLUE, width=3, shape="spline"),
                           marker=dict(size=9, color=BLUE, line=dict(color="white", width=2)),
                           hovertemplate="%{x}: %{y:.2f}%<extra></extra>"),
                go.Scatter(x=YIELD_LABELS, y=latest_curve, name=f"최신 ({wk_names[-1]})", mode="lines",
                           line=dict(color=GRAY, dash="dot", width=2, shape="spline"), hoverinfo="skip"),
            ])
            fig_c.frames = [go.Frame(name=n, traces=[0],
                                     data=[go.Scatter(x=YIELD_LABELS, y=df_y3d.iloc[i].values)])
                            for i, n in enumerate(wk_names)]
            add_play_controls(fig_c, wk_names, duration=80, prefix="주: ")
            style_fig(fig_c, height=560, hovermode="x", margin=dict(l=8, r=8, t=36, b=150),
                      yaxis=dict(range=[y_min, y_max], title="금리 (%)"), xaxis_title="만기")
            show(fig_c, "curve")
        with c2:
            st.markdown("#### 🧊 3D 수익률 표면")
            fig_3d = go.Figure(go.Surface(
                x=YIELD_LABELS, y=df_y3d.index, z=df_y3d.values,
                colorscale=[[0, "#cde2fb"], [0.5, BLUE], [1, NAVY]],
                contours=dict(z=dict(show=True, usecolormap=True, project=dict(z=True))),
                colorbar=dict(title="%", thickness=12, len=0.6),
            ))
            axis3d = dict(gridcolor=GRID, backgroundcolor="rgba(0,0,0,0)", showbackground=True)
            # 카메라 자동 회전: z축을 중심으로 시작 시점(-1.6,-1.6,1.2)에서 한 바퀴
            r_eye, a0 = float(np.hypot(1.6, 1.6)), np.deg2rad(225)
            rot = [str(i) for i in range(48)]
            fig_3d.frames = [go.Frame(name=n, layout=dict(scene_camera=dict(eye=dict(
                x=r_eye * np.cos(a0 + 2 * np.pi * i / 48), y=r_eye * np.sin(a0 + 2 * np.pi * i / 48), z=1.2))))
                for i, n in enumerate(rot)]
            fig_3d.update_layout(updatemenus=[dict(
                type="buttons", direction="left", showactive=False, x=0, xanchor="left", y=1, yanchor="top",
                pad=dict(t=4, l=4), **_CTRL,
                buttons=[dict(label="⟳ 자동 회전", method="animate",
                              args=[rot * 2, dict(frame=dict(duration=90, redraw=True), transition=dict(duration=0),
                                                  mode="immediate")]),
                         dict(label="⏸ 정지", method="animate",
                              args=[[None], dict(frame=dict(duration=0, redraw=False), mode="immediate")])])])
            style_fig(fig_3d, height=560, hovermode="closest", margin=dict(l=0, r=0, t=10, b=0),
                      scene=dict(xaxis=dict(title="만기", **axis3d), yaxis=dict(title="날짜", **axis3d),
                                 zaxis=dict(title="금리 (%)", **axis3d),
                                 camera=dict(eye=dict(x=-1.6, y=-1.6, z=1.2)),
                                 bgcolor="rgba(0,0,0,0)"))
            show(fig_3d, "surface")

# ---- 탭 5: 상관관계 & Lab --------------------------------------------------------
with tab_corr:
    col_l, col_r = st.columns([1.1, 1.3], gap="large")
    with col_l:
        st.markdown("#### ⚡ 롤링 상관관계 타임랩스")
        win = st.select_slider("상관 계산 기간 (일)", options=[30, 60, 90, 180, 365], value=90)
        corr_cols = ["US10Y", "US2Y", "VIX", "HY_Spread", "NetLiquidity", "CPI_YoY", "SP500", "WTI_Oil"]
        df_cc = df_raw[corr_cols]
        ends = list(range(win - 1, len(df_cc), 7))
        if ends[-1] != len(df_cc) - 1:
            ends.append(len(df_cc) - 1)

        def corr_at(end):
            c = df_cc.iloc[end - win + 1:end + 1].corr().values
            txt = np.where(np.isnan(c), "", np.vectorize(lambda v: f"{v:.2f}")(np.nan_to_num(c)))
            return c, txt

        z0, t0 = corr_at(ends[-1])
        fig_h = go.Figure(go.Heatmap(z=z0, x=corr_cols, y=corr_cols, text=t0, texttemplate="%{text}",
                                     textfont=dict(size=11), zmin=-1, zmax=1, colorscale=DIVERGING,
                                     xgap=2, ygap=2, colorbar=dict(thickness=10, len=0.7),
                                     hovertemplate="%{y} × %{x}: %{z:.2f}<extra></extra>"))
        h_names = [df_cc.index[e].strftime("%Y-%m-%d") for e in ends]
        h_frames = []
        for e, n in zip(ends, h_names):
            z, t = corr_at(e)
            h_frames.append(go.Frame(name=n, traces=[0], data=[go.Heatmap(z=z, text=t)]))
        fig_h.frames = h_frames
        add_play_controls(fig_h, h_names, duration=250, prefix="기간 끝: ")
        # x축 라벨은 위로: 아래는 재생 컨트롤 자리 (기울어진 긴 라벨이 컨트롤과 겹치지 않게)
        style_fig(fig_h, height=600, hovermode="closest", margin=dict(l=8, r=8, t=90, b=110),
                  xaxis=dict(side="top", tickangle=-40), yaxis=dict(autorange="reversed", showgrid=False))
        show(fig_h, "heat")

    with col_r:
        st.markdown("#### 🔬 Macro Lab — 두 지표 비교")
        num_cols = [c for c in df_raw.columns if pd.api.types.is_numeric_dtype(df_raw[c])
                    and df_raw[c].notna().any()]
        lc1, lc2 = st.columns(2)
        ser_a = lc1.selectbox("Series A", num_cols, index=num_cols.index("US10Y"))
        ser_b = lc2.selectbox("Series B", num_cols, index=num_cols.index("NetLiquidity"))
        view = st.segmented_control("보기", ["Stacked", "Z-Score 겹쳐보기", "Scatter (A vs B)"],
                                    default="Stacked", key="lab_view") or "Stacked"

        if view == "Stacked":
            fig_lab = make_subplots(rows=2, cols=1, shared_xaxes=True, vertical_spacing=0.06)
            fig_lab.add_trace(go.Scatter(x=df_raw.index, y=df_raw[ser_a], name=ser_a,
                                         line=dict(color=BLUE, width=2)), row=1, col=1)
            fig_lab.add_trace(go.Scatter(x=df_raw.index, y=df_raw[ser_b], name=ser_b,
                                         line=dict(color=ORANGE, width=2)), row=2, col=1)
            fig_lab.update_yaxes(title_text=ser_a, row=1, col=1)
            fig_lab.update_yaxes(title_text=ser_b, row=2, col=1)
            fig_lab.update_xaxes(showspikes=True, spikemode="across", spikethickness=1,
                                 spikecolor=GRAY, spikedash="dot")
            add_time_controls(fig_lab, slider=False, top_only=True)
            style_fig(fig_lab, height=520)
        elif view == "Z-Score 겹쳐보기":
            fig_lab = go.Figure()
            for s, color in [(ser_a, BLUE), (ser_b, ORANGE)]:
                x = df_raw[s]
                z = (x - x.mean()) / x.std()
                fig_lab.add_trace(go.Scatter(x=df_raw.index, y=z, name=f"{s} (z)",
                                             line=dict(color=color, width=2), hovertemplate="%{y:+.2f}σ"))
            fig_lab.add_hline(y=0, line_dash="dot", line_color=GRAY)
            add_time_controls(fig_lab, slider=False)
            style_fig(fig_lab, height=520, yaxis_title="Z-Score (σ)")
        else:
            d = df_raw[[ser_a, ser_b]].dropna()
            xa, yb = d.iloc[:, 0], d.iloc[:, 1]
            fig_lab = go.Figure(go.Scatter(
                x=xa, y=yb, mode="markers", name="일별",
                marker=dict(size=7, color=np.arange(len(d)), colorscale=BLUE_SCALE, showscale=True,
                            colorbar=dict(title="시간 →", tickvals=[], thickness=10),
                            line=dict(width=0)),
                text=[i.strftime("%Y-%m-%d") for i in d.index],
                hovertemplate="%{text}<br>" + ser_a + ": %{x:.2f}<br>" + ser_b + ": %{y:.2f}<extra></extra>",
            ))
            if len(d) > 2 and xa.std() > 0:
                slope_, intercept = np.polyfit(xa, yb, 1)
                xs = np.linspace(xa.min(), xa.max(), 50)
                fig_lab.add_trace(go.Scatter(x=xs, y=slope_ * xs + intercept, mode="lines", name="추세선",
                                             line=dict(color=RED, dash="dash", width=2)))
            style_fig(fig_lab, height=520, hovermode="closest",
                      title=f"상관계수 {xa.corr(yb):+.2f}", xaxis_title=ser_a, yaxis_title=ser_b)
            fig_lab.update_xaxes(showgrid=True, gridcolor=GRID)
        show(fig_lab, "lab")
        callout("스케일이 다른 두 지표를 이중 Y축에 그리면 상관이 왜곡되어 보이므로, "
                "<b>분리 · 표준화 · 산점도</b>로만 비교합니다.")

# ---- 탭 6: 스트레스 테스트 & VaR --------------------------------------------------
with tab_stress:
    scenarios = {
        "Baseline (Current FRED Market)": (wf_vol, wf_ret),
        "1970s Stagflation Shock": (2.2, -0.06),
        "2008 Lehman Liquidity Crisis": (2.8, -0.12),
        "2020 Covid Fast Shock": (2.0, -0.08),
        "2022 Fed Restrictive Tightening": (1.6, -0.04),
    }
    scen = st.pills("시나리오", list(scenarios), selection_mode="single",
                    default="Baseline (Current FRED Market)", key="scen") or "Baseline (Current FRED Market)"
    vol_m, ret_b = scenarios[scen]
    paths, p5, p50, p95, var_95, var_99, cvar_95, p_mu, p_sig = run_portfolio_monte_carlo(
        weights, wf_nav, wf_horizon, n_sims=1000, vol_mult=vol_m, return_boost=ret_b)

    risk_key = "good" if var_95 < 5 else "warning" if var_95 < 10 else "serious" if var_95 < 20 else "critical"
    kpi_grid([
        kpi("기대수익률 (연)", num(p_mu * 100, 2, sign=True, unit="%"), f"수익률 보정 {ret_b * 100:+.1f}%p", delay=0),
        kpi("변동성 (연)", num(p_sig * 100, 2, unit="%"), f"변동성 배수 ×{vol_m:.1f}", delay=.06),
        kpi(f"95% VaR ({wf_horizon}d)", num(var_95, 2, unit="%"),
            chip({"good": "낮음", "warning": "보통", "serious": "높음", "critical": "매우 높음"}[risk_key], risk_key)
            + f" ${wf_nav * var_95 / 100:,.0f}", delay=.12),
        kpi(f"99% VaR ({wf_horizon}d)", num(var_99, 2, unit="%"), f"${wf_nav * var_99 / 100:,.0f} 손실 한도", delay=.18),
        kpi("95% CVaR", num(cvar_95, 2, unit="%"), "최악 5% 평균 손실", delay=.24),
    ], tight=True)

    col_l, col_r = st.columns([1.6, 1.0], gap="large")
    with col_l:
        st.markdown("#### 💥 몬테카를로 경로 분포")
        q5, q25, q50, q75, q95 = np.percentile(paths, [5, 25, 50, 75, 95], axis=1)
        days_x = np.arange(len(q50))

        def fan_traces(k):
            x = days_x[:k + 1]
            return [
                go.Scatter(x=x, y=q95[:k + 1], line=dict(width=0), showlegend=False, hoverinfo="skip"),
                go.Scatter(x=x, y=q5[:k + 1], fill="tonexty", fillcolor=rgba(BLUE, .12),
                           line=dict(width=0), name="5–95%", hovertemplate="$%{y:,.0f}"),
                go.Scatter(x=x, y=q75[:k + 1], line=dict(width=0), showlegend=False, hoverinfo="skip"),
                go.Scatter(x=x, y=q25[:k + 1], fill="tonexty", fillcolor=rgba(BLUE, .26),
                           line=dict(width=0), name="25–75%", hovertemplate="$%{y:,.0f}"),
                go.Scatter(x=x, y=q50[:k + 1], line=dict(color=BLUE, width=3.5), name="중앙값",
                           hovertemplate="$%{y:,.0f}"),
            ]

        fig_fan = go.Figure(fan_traces(len(days_x) - 1))
        ks = sorted(set(np.linspace(1, len(days_x) - 1, 40).astype(int)))
        fig_fan.frames = [go.Frame(name=str(k), traces=[0, 1, 2, 3, 4], data=fan_traces(k)) for k in ks]
        add_play_controls(fig_fan, [str(k) for k in ks], duration=60, prefix="Day ")
        fig_fan.add_hline(y=wf_nav, line_dash="dot", line_color=GRAY,
                          annotation_text=f"초기 NAV ${wf_nav:,.0f}", annotation_position="bottom right")
        style_fig(fig_fan, height=540, margin=dict(l=8, r=8, t=36, b=150),
                  xaxis=dict(range=[0, len(days_x) - 1], title="거래일"),
                  yaxis=dict(range=[q5.min() * 0.95, q95.max() * 1.05], title="NAV ($)", tickformat="$,.0f"))
        show(fig_fan, "fan")

    with col_r:
        st.markdown("#### 📊 만기 수익률 분포")
        term_ret = (paths[-1] / wf_nav - 1) * 100
        counts, edges = np.histogram(term_ret, bins=40)
        centers = (edges[:-1] + edges[1:]) / 2
        in_tail = centers <= -var_95                     # VaR 이하 = 꼬리 손실 구간은 빨강
        fig_hist = go.Figure(go.Bar(x=centers, y=counts, width=np.diff(edges),
                                    marker_color=[rgba(RED, .8) if t else rgba(BLUE, .75) for t in in_tail],
                                    marker_line=dict(width=1, color="rgba(255,255,255,.6)"), name="만기 수익률",
                                    customdata=np.stack([edges[:-1], edges[1:]], axis=1),
                                    hovertemplate="%{customdata[0]:.1f}% ~ %{customdata[1]:.1f}%: %{y}회<extra></extra>"))
        fig_hist.add_vline(x=-var_95, line_dash="dash", line_color=YELLOW, line_width=2)
        fig_hist.add_vline(x=-cvar_95, line_dash="dash", line_color=RED, line_width=2)
        style_fig(fig_hist, height=500, hovermode="closest", xaxis_title="수익률 (%)", yaxis_title="횟수",
                  showlegend=False, bargap=0)
        show(fig_hist, "hist")
        html('<div class="legend-row">' + swatch(f"95% VaR −{var_95:.1f}%", YELLOW)
             + swatch(f"95% CVaR −{cvar_95:.1f}%", RED) + swatch("VaR 이하 꼬리 손실", rgba(RED, .8)) + "</div>")

    st.markdown("#### 🧭 시나리오 한눈에 비교")
    comp_rows = []
    for sname, (vm, rb) in scenarios.items():
        _, _, _, _, v95, v99, cv95, mu_, sg_ = run_portfolio_monte_carlo(
            weights, wf_nav, wf_horizon, n_sims=1000, vol_mult=vm, return_boost=rb)
        comp_rows.append(dict(시나리오=sname.split(" (")[0], 원이름=sname, VaR95=v95, VaR99=v99, CVaR95=cv95,
                              기대수익률=mu_ * 100, 변동성=sg_ * 100))
    comp = pd.DataFrame(comp_rows)
    sel = comp["원이름"] == scen
    fig_cmp = go.Figure()
    for col, name, color in [("VaR95", "95% VaR", BLUE), ("VaR99", "99% VaR", VIOLET), ("CVaR95", "95% CVaR", RED)]:
        fig_cmp.add_trace(go.Bar(y=comp["시나리오"], x=comp[col], name=name, orientation="h",
                                 marker=dict(color=color, opacity=[1 if s else .45 for s in sel]),
                                 text=[f"{v:.1f}%" for v in comp[col]], textposition="outside",
                                 hovertemplate="%{y}<br>" + name + ": %{x:.2f}%<extra></extra>"))
    fig_cmp.update_layout(barmode="group", bargap=0.25, yaxis=dict(autorange="reversed"))
    fig_cmp.update_xaxes(title=f"{wf_horizon}일 손실 (%)", range=[0, comp[["VaR99", "CVaR95"]].values.max() * 1.18])
    style_fig(fig_cmp, height=380, hovermode="closest")
    show(fig_cmp, "scen_cmp")
    worst = comp.loc[comp["CVaR95"].idxmax()]
    callout(f"같은 목표 비중으로 <b>{worst['시나리오']}</b>를 맞으면 최악 5% 평균 손실이 <b>{worst['CVaR95']:.1f}%</b>"
            f" (${wf_nav * worst['CVaR95'] / 100:,.0f})입니다. 진하게 표시된 막대가 지금 고른 시나리오입니다.")

# ---- 탭 7: 12M 매크로 시계 --------------------------------------------------------
with tab_clock:
    try:
        df_m = df_raw.resample("ME").last().tail(12).copy()
    except (ValueError, KeyError):
        df_m = df_raw.resample("M").last().tail(12).copy()   # 구 pandas 폴백
    if enable_override:
        for c in ("CorePCE_YoY", "GDPNow"):
            df_m.loc[df_m.index[-1], c] = macro_inputs[c]
    df_m["Infl_Gap"] = df_m["CorePCE_YoY"] - 2.0
    df_m["Growth_Gap"] = df_m["GDPNow"] - 2.0
    df_m["Month"] = df_m.index.strftime("%Y-%m")

    html(f'<div class="callout">가로축은 <b>물가가 목표(2%)보다 얼마나 높은지</b>, 세로축은 <b>성장이 2%보다 얼마나 강한지</b>입니다. '
         f'지금은 {chip(q_ko, q_key)} 국면이고, ▶ 재생으로 지난 12개월 궤적을 볼 수 있습니다.</div>')

    fig_clk = go.Figure()
    for x0, x1, y0, y1, key, label, ax, ay in [
        (0, 5, 0, 5, "serious", "과열 · REFLATION", 2.5, 4.5),
        (-3.5, 0, 0, 5, "good", "골디락스 · GOLDILOCKS", -1.75, 4.5),
        (-3.5, 0, -3.5, 0, "warning", "침체 · DEFLATION", -1.75, -3.0),
        (0, 5, -3.5, 0, "critical", "스태그플레이션 · STAGFLATION", 2.5, -3.0),
    ]:
        on = key == q_key
        fig_clk.add_shape(type="rect", x0=x0, x1=x1, y0=y0, y1=y1, line_width=0, layer="below",
                          fillcolor=rgba(STATUS[key], .16 if on else .06))
        fig_clk.add_annotation(x=ax, y=ay, text=f"<b>{label}</b>" if on else label, showarrow=False,
                               font=dict(size=14, color=STATUS[key]), opacity=1 if on else .7)

    n_m = len(df_m)

    def clock_traces(k):
        d = df_m.iloc[:k + 1]
        cur = df_m.iloc[k]
        return [
            go.Scatter(x=d["Infl_Gap"], y=d["Growth_Gap"], mode="lines+markers", name="궤적",
                       line=dict(color=rgba(BLUE, .45), width=2, shape="spline"),
                       marker=dict(size=10, color=list(range(k + 1)), colorscale=BLUE_SCALE, cmin=0, cmax=n_m - 1,
                                   line=dict(width=1, color="rgba(255,255,255,.8)")),
                       text=d["Month"],
                       hovertemplate="%{text}<br>물가 갭 %{x:+.2f}<br>성장 갭 %{y:+.2f}<extra></extra>"),
            go.Scatter(x=[cur["Infl_Gap"]], y=[cur["Growth_Gap"]], mode="markers+text", name="현재",
                       marker=dict(size=20, color=BLUE, line=dict(width=3, color="white")),
                       text=[cur["Month"]], textposition="top center", textfont=dict(size=13),
                       hovertemplate="%{text}<extra></extra>"),
        ]

    for tr in clock_traces(n_m - 1):
        fig_clk.add_trace(tr)
    fig_clk.frames = [go.Frame(name=df_m["Month"].iloc[k], traces=[0, 1], data=clock_traces(k))
                      for k in range(n_m)]
    add_play_controls(fig_clk, list(df_m["Month"]), duration=700, prefix="")
    style_fig(fig_clk, height=660, hovermode="closest", showlegend=False, margin=dict(l=8, r=8, t=16, b=150),
              xaxis=dict(range=[-3.5, 5], title="물가 갭 (근원 PCE − 2%)", zeroline=True,
                         zerolinecolor="rgba(128,128,128,.5)"),
              yaxis=dict(range=[-3.5, 5], title="성장 갭 (GDP YoY − 2%)", zeroline=True,
                         zerolinecolor="rgba(128,128,128,.5)", showgrid=False))
    show(fig_clk, "clock")

# ---- 탭 8: 글로벌 국채 지도 & CIO Memo -------------------------------------------
with tab_globe:
    col_l, col_r = st.columns([1.2, 1.0], gap="large")
    with col_l:
        st.markdown("#### 🌍 주요국 10년 국채 금리")
        geo_df = pd.DataFrame({
            "Country": ["USA", "Germany", "UK", "Japan"],
            "lat": [37.09, 51.17, 55.38, 36.20],
            "lon": [-95.71, 10.45, -3.44, 138.25],
            "Yield": [m["US10Y"], latest.get("DE_10Y", np.nan), latest.get("UK_10Y", np.nan),
                      latest.get("JP_10Y", np.nan)],
        }).dropna(subset=["Yield"])
        geo_df["Size"] = geo_df["Yield"].abs().clip(lower=0.3)     # 0 이하 금리 점이 사라지지 않게
        geo_df["Label"] = geo_df.apply(lambda r: f"{r['Country']} {r['Yield']:.2f}%", axis=1)

        fig_g = px.scatter_geo(geo_df, lat="lat", lon="lon", size="Size", color="Yield",
                               text="Label", hover_name="Country", projection="orthographic",
                               color_continuous_scale=MULTI_SCALE, size_max=38,
                               hover_data={"Yield": ":.2f", "Size": False, "lat": False, "lon": False,
                                           "Label": False})
        # 유럽 두 나라는 서로 가까워 라벨을 좌우로 벌린다
        label_pos = {"USA": "top center", "Germany": "bottom right", "UK": "top left", "Japan": "top center"}
        fig_g.update_traces(textposition=[label_pos[c] for c in geo_df["Country"]], textfont=dict(size=13),
                            marker=dict(line=dict(width=2, color="rgba(255,255,255,.9)")))
        fig_g.update_geos(showland=True, landcolor="rgba(128,128,128,.22)", showocean=True,
                          oceancolor=rgba(BLUE, .07), showcountries=True, countrycolor="rgba(128,128,128,.45)",
                          coastlinecolor="rgba(128,128,128,.45)", showframe=False,
                          bgcolor="rgba(0,0,0,0)", projection_rotation=dict(lon=-20, lat=25))
        lons = [((-20 + 12 * i + 180) % 360) - 180 for i in range(30)]
        fig_g.frames = [go.Frame(name=str(i), layout=dict(geo=dict(projection_rotation=dict(lon=lon, lat=25))))
                        for i, lon in enumerate(lons)]
        add_play_controls(fig_g, [str(i) for i in range(30)], duration=150, prefix="회전 ",
                          labels=[f"{lon}°" if i % 5 == 0 else "" for i, lon in enumerate(lons)], active=0)
        style_fig(fig_g, height=600, hovermode="closest", margin=dict(l=8, r=8, t=16, b=150),
                  coloraxis_colorbar=dict(title="10Y %", thickness=10, len=0.6))
        show(fig_g, "globe")

    with col_r:
        st.markdown("#### 🛡️ 매크로 건강도 레이더")

        def radar_scores(v):
            raw_scores = {
                "Liquidity": 50 + (v["NetLiquidity"] - 6.0) * 10,
                "Volatility Safety": 50 - (v["VIX"] - 15) * 3,
                "Credit Health": 50 - (v["HY_Spread"] - 3.5) * 15,
                "Yield Curve": 50 + v["Spread10Y2Y"] * 30,
                "Inflation Safety": 50 - (v["CPI_YoY"] - 2.5) * 20,
            }
            return {k: float(np.clip(s, 0, 100)) for k, s in raw_scores.items()}

        cmp = st.segmented_control("비교 시점", ["없음", "1M 전", "3M 전", "6M 전", "1Y 전"],
                                   default="없음", key="radar_cmp") or "없음"
        lookback = {"1M 전": 21, "3M 전": 63, "6M 전": 126, "1Y 전": 252}
        fig_r = go.Figure()
        cats = list(radar_scores(m))
        if cmp != "없음":
            past_row = df_raw.iloc[-1 - lookback[cmp]]
            ps = radar_scores(past_row)
            fig_r.add_trace(go.Scatterpolar(r=list(ps.values()) + [list(ps.values())[0]], theta=cats + [cats[0]],
                                            fill="toself", name=f"{cmp} ({past_row.name:%Y-%m-%d})",
                                            line=dict(color=GRAY, dash="dot"), fillcolor=rgba(GRAY, .15)))
        cs = radar_scores(m)
        fig_r.add_trace(go.Scatterpolar(r=list(cs.values()) + [list(cs.values())[0]], theta=cats + [cats[0]],
                                        fill="toself", name="현재", line=dict(color=BLUE, width=3),
                                        marker=dict(size=7), fillcolor=rgba(BLUE, .22)))
        style_fig(fig_r, height=450, hovermode="closest", margin=dict(l=70, r=75, t=40, b=30),
                  polar=dict(bgcolor="rgba(0,0,0,0)",
                             radialaxis=dict(range=[0, 100], angle=90, tickvals=[25, 50, 75, 100],
                                             gridcolor=GRID, linecolor=GRID, tickfont=dict(size=10)),
                             angularaxis=dict(gridcolor=GRID, linecolor=GRID)))
        show(fig_r, "radar")
        html('<div class="legend-row">' + "".join(
            chip(f"{k} {v:.0f}", "good" if v >= 60 else "warning" if v >= 40 else "critical")
            for k, v in cs.items()) + "</div>")

    st.markdown("#### 📝 CIO 메모")
    mc1, mc2 = st.columns([1.0, 2.2], gap="large")
    with mc1:
        hawk = fed_score < 0
        html(kpi("FOMC 문장 감성 점수", num(fed_score, 2, sign=True),
                 chip("Hawkish · 긴축" if hawk else "Dovish · 완화", "serious" if hawk else "good")
                 + f' “{fed_text[:60]}{"…" if len(fed_text) > 60 else ""}”'))
    with mc2:
        callout(
            f"<b>CIO MEMO — {df_raw.index[-1]:%Y-%m-%d}</b><br>"
            f"GDP 갭 {m['OutputGap']:+.2f}%, 근원 PCE {m['CorePCE_YoY']:.2f}%, "
            f"순유동성 ${m['NetLiquidity']:.2f}T 환경에서 3-Tier 네트워크가 제시하는 목표 비중은 "
            f"기술주(EQ_TECH) <b>{weights['EQ_TECH']:.1f}%</b>, 단기채(FI_SHORT) <b>{weights['FI_SHORT']:.1f}%</b>, "
            f"금(ALT_GOLD) <b>{weights['ALT_GOLD']:.1f}%</b>, 장기채(FI_LONG) <b>{weights['FI_LONG']:.1f}%</b> 입니다. "
            f"FOMC 감성 점수 {fed_score:+.2f}가 실질금리 신호에 반영되었습니다."
        )

    x1, x2 = st.columns(2, gap="large")
    with x1.expander("🔧 사용한 데이터와 방법"):
        st.markdown(
            "- **데이터**: FRED API 실데이터 32개 시리즈, 최근 730일 · 1시간 캐시. 국채 1M~30Y, 실질금리 DFII10, VIX, "
            "HY 스프레드, 연준 총자산·TGA·역레포·지준, Sahm, 기준금리 상단 **DFEDTARU**, GDP·잠재 GDP, 실업률, CPI·근원 PCE\n"
            "- **발표 지연 반영**: GDP 90일, CPI 15일, PCE 30일 등 공개일 기준으로 값을 미뤄 미래 정보 누수를 막고, "
            "뒤 값을 앞으로 채우는 bfill은 쓰지 않습니다\n"
            "- **3-Tier 네트워크**: 거시 4개 + 전달 경로 3개 확률(시그모이드) → 자산 7개 점수 → 합이 100%가 되도록 정규화\n"
            "- **테일러 준칙**: 1993(GDP 갭), Okun(실업 갭), Inertial(0.85 × 전일 금리 + 0.15 × 1993)\n"
            "- **몬테카를로**: 기하 브라운 운동 1,000회, 시드 42 고정, 자산 간 상관 0 가정 + 분산 1.25배 보정\n"
            "- **FOMC 감성**: 매파·비둘기 단어를 단어 경계 정규식으로 셈, (비둘기 − 매파) / 합계")
    with x2.expander("⚠️ 한계"):
        st.markdown(
            "- **임계값은 경험칙**입니다. 시그모이드 기준값(GDP 2%, CPI 2.8% 등)과 자산 계수는 추정한 값이 아니라 정한 값입니다\n"
            "- **몬테카를로는 자산 간 상관을 0으로 봅니다.** 위기 때는 상관이 1에 가까워지므로 실제 꼬리 손실은 더 클 수 있습니다\n"
            "- **월·분기 지표는 계단 모양**입니다. 일별 차트 위의 CPI·GDP는 발표 사이에 값이 그대로 유지됩니다\n"
            "- **감성 점수는 단어 사전 방식**이라 부정문·문맥은 읽지 못합니다\n"
            "- **투자 자문이 아닙니다.** 규칙 기반 참고안이며 실제 배분은 리스크 한도와 운용 전략에 맞춰 판단해야 합니다")


# =============================================================================
# 7. WEEKLY UPDATES 보고서 (사이드바 버튼 → 미리보기 창 · PDF/HTML)
# =============================================================================
@st.cache_data(ttl=1800, show_spinner=False)
def _weekly_collect(asof_iso):
    return wd.collect(asof_iso)


def weekly_macro_context(asof):
    """보고서 기준일의 8501 엔진 값 — FRED 실데이터 그대로 (What-If 미적용)."""
    sub = df_raw.loc[:pd.Timestamp(asof)]
    if not len(sub):
        return None
    row = sub.iloc[-1].to_dict()
    _, w_asof = compute_3tier_network_and_weights(row, fed_score)
    regime = QUADRANTS[(row["CorePCE_YoY"] - 2.0 > 0, row["GDPNow"] - 2.0 > 0)][0]
    return {"regime": regime, "core_pce": row["CorePCE_YoY"], "gdp": row["GDPNow"], "weights": w_asof,
            "fed": df_raw["FedRate"], "asset_ko": ASSET_KO, "date": sub.index[-1]}


@st.dialog("📰 Weekly Updates 보고서", width="large")
def weekly_dialog():
    rep = st.session_state.get("weekly_report")
    if not rep:
        st.info("사이드바에서 보고서를 먼저 생성하세요.")
        return
    c1, c2, c3 = st.columns([1, 1, 2.2])
    if rep["pdf_bytes"]:
        c1.download_button("⬇️ PDF 다운로드", rep["pdf_bytes"], file_name=f"{rep['name']}.pdf", mime="application/pdf",
                           type="primary", on_click="ignore", width="stretch", key="rep_dl_pdf")
    else:
        c1.warning(f"PDF 생성 실패: {rep['error']}. HTML을 받아 브라우저에서 인쇄(Ctrl+P → PDF로 저장)하세요.")
    c2.download_button("⬇️ HTML", rep["html"].encode("utf-8"), file_name=f"{rep['name']}.html", mime="text/html",
                       on_click="ignore", width="stretch", key="rep_dl_html")
    saved = (f"저장: 대시보드/macro/reports/{rep['name']}.pdf" if rep["pdf_path"]
             else "⚠️ PDF 파일은 저장되지 않음")
    c3.caption(f"{saved} · 데이터 LIVE {rep['live']}/{rep['total']}"
               f"{' · 일부 SNAPSHOT/N/A' if rep['live'] < rep['total'] else ''} · 수집 {rep['fetched']}")
    if rep["pdf_bytes"] and rep["error"]:
        st.warning(rep["error"])
    st.iframe(rep["html"], height=760)


if make_report:
    with st.sidebar, st.spinner("보고서 데이터 수집 중 · NAVER · ECOS …"):
        rep_data = _weekly_collect(rep_asof.isoformat())
        built = wr.build(rep_data, weekly_macro_context(rep_asof), memo=rep_memo, include_chain=rep_chain)
    live_n = sum(1 for v in rep_data["status"].values() if v["source"] == "LIVE")
    st.session_state["weekly_report"] = {**built, "live": live_n, "total": len(rep_data["status"]),
                                         "fetched": rep_data["fetchedAt"].replace("T", " ")}
    weekly_dialog()
elif reopen_report:
    weekly_dialog()
