"""채권 위기 진단 & 액션 플랜 - 설명용 Streamlit 앱

실행 (대시보드 폴더에서):
    .\\.venv\\Scripts\\streamlit run bond\\explainer_app.py

숫자는 전부 data/30_BOND의 파이프라인 결과에서 읽는다. 최신화하려면 bond/*.py 4단계를 먼저 돌린다.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st
from plotly.subplots import make_subplots

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
import action_plan as ap  # noqa: E402
import crisis_dashboard as cdash  # noqa: E402
from valkyrie.paths import BOND  # noqa: E402

st.set_page_config(page_title="채권 위기 진단 & 액션 플랜", page_icon="📉", layout="wide",
                   initial_sidebar_state="collapsed")

# 색: 전략=categorical 1(blue), 비교군=muted gray, 상태=status palette(항상 라벨 동반), 매수/매도=diverging
BLUE, ORANGE, AQUA, YELLOW, GRAY, RED = "#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#898781", "#e34948"
STATUS = {"good": "#0ca30c", "warning": "#fab219", "serious": "#ec835a", "critical": "#d03b3b"}
STATE_KEY = {"NORMAL": "good", "WARNING": "warning", "HIGH": "serious", "SEVERE": "critical"}
STATE_KO = {"NORMAL": "정상", "WARNING": "경고", "HIGH": "높음", "SEVERE": "심각"}
REGIME_KEY = {"Low-Vol": "good", "Normal": "warning", "High-Vol": "critical"}
REGIME_KO = {"Low-Vol": "평온", "Normal": "보통", "High-Vol": "폭풍"}
VERDICT_KEY = {"안정": "good", "주의": "warning", "경계": "serious", "위기": "critical"}
CURVE_ICON = {"bear_steep": "↗️", "bear_flat": "➡️", "bull_flat": "↘️", "bull_steep": "⤵️", "neutral": "⏺️"}


def rgba(hex_, a):
    h = hex_.lstrip("#")
    return f"rgba({int(h[0:2], 16)},{int(h[2:4], 16)},{int(h[4:6], 16)},{a})"


# ---------------------------------------------------------------- style
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
  padding:28px 32px; border-radius:20px; color:#fff; animation:fadeUp .6s ease both;
  background:linear-gradient(120deg,#0d366b,#1c5cab 45%,#2a78d6 70%,#0d366b); background-size:200% 100%;
  animation:fadeUp .6s ease both, shimmer 14s linear infinite;}
.hero h1 {color:#fff; font-size:2.1rem; margin:4px 0 6px; padding:0;}
.hero p {color:rgba(255,255,255,.85); margin:0; max-width:720px; font-size:1rem;}
.eyebrow {font-size:.78rem; letter-spacing:.14em; text-transform:uppercase; color:rgba(255,255,255,.7);}
.verdict {background:rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.25); border-radius:16px;
  padding:16px 22px; min-width:260px; backdrop-filter:blur(6px);}
.verdict .big {font-size:2.2rem; font-weight:700; line-height:1.1; display:flex; align-items:center; gap:12px;}
.dot {width:16px; height:16px; border-radius:50%; background:var(--c); animation:pulse 1.8s infinite;}
.verdict small {color:rgba(255,255,255,.8);}
.kpi-grid {display:grid; grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); gap:14px; margin:18px 0 6px;}
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
.flow {display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:12px; margin:8px 0 18px;}
.step {position:relative; border-radius:16px; padding:16px; border:1px solid rgba(128,128,128,.22);
  background:rgba(42,120,214,.07); animation:fadeUp .6s ease both; transition:transform .2s;}
.step:hover {transform:translateY(-3px);}
.step .n {font-size:.75rem; letter-spacing:.1em; opacity:.65;}
.step .q {font-weight:600; margin:2px 0 6px;}
.step .a {font-size:1.25rem; font-weight:700;}
.step .w {font-size:.8rem; opacity:.75; margin-top:4px;}
.callout {border-left:4px solid #2a78d6; padding:12px 16px; border-radius:8px; background:rgba(42,120,214,.08);
  animation:fadeUp .6s ease both; margin:6px 0 14px;}
.kpi-grid.tight {grid-template-columns:repeat(3,minmax(0,1fr));}
.changes {display:flex; flex-wrap:wrap; gap:8px 18px; align-items:center; padding:10px 16px; margin:4px 0 14px;
  border-radius:12px; border:1px dashed rgba(128,128,128,.35); font-size:.88rem; animation:fadeUp .6s ease .3s both;}
.changes .ch-t {font-weight:600;}
.changes .ch i {font-style:normal; opacity:.65; margin-right:4px;}
@media (max-width: 760px) {
  .kpi-grid.tight {grid-template-columns:1fr;}
  .hero {padding:20px;} .hero h1 {font-size:1.5rem;} .verdict {min-width:0; width:100%;}
  .kpi-v {font-size:1.6rem;}
}
.legend-row {display:flex; gap:10px; flex-wrap:wrap; font-size:.8rem; margin:-4px 0 8px;}
div[data-baseweb="tab-panel"] > div {animation:fadeUp .45s ease both;}
button[data-baseweb="tab"] p {font-size:1.02rem; font-weight:600;}
[data-testid="stPlotlyChart"] {animation:fadeUp .6s ease both;}
@media (prefers-reduced-motion: reduce) {* {animation:none !important; transition:none !important;}}
</style>""", unsafe_allow_html=True)


def num(v, d=2, sign=False, unit=""):
    s = "−" if v < 0 else ("+" if sign and v > 0 else "")
    a = abs(v)
    i, f = int(a), round((a - int(a)) * 10 ** d)
    if f >= 10 ** d:
        i, f = i + 1, 0
    u = f'<span class="unit">{unit}</span>' if unit else ""
    return f'{s}<span class="count d{d}" style="--i:{i};--f:{f}"></span>{u}'


def spark(series: pd.Series, color=BLUE, n=120):
    v = series.dropna().iloc[-n:].to_numpy()
    if len(v) < 2:
        return ""
    lo, hi = v.min(), v.max()
    pts = " ".join(f"{k / (len(v) - 1) * 200:.1f},{36 - (x - lo) / (hi - lo + 1e-9) * 32:.1f}" for k, x in enumerate(v))
    return (f'<svg class="spark" viewBox="0 0 200 40" preserveAspectRatio="none"><polyline pathLength="1" '
            f'points="{pts}" fill="none" stroke="{color}" stroke-width="2.2" stroke-linecap="round" '
            f'stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>')


def chip(label, key):
    return f'<span class="chip"><i style="--c:{STATUS[key]}"></i>{label}</span>'


def kpi(title, value_html, sub_html, spark_html="", delay=0.0):
    return (f'<div class="kpi" style="animation-delay:{delay}s"><div class="kpi-t">{title}</div>'
            f'<div class="kpi-v">{value_html}</div><div class="kpi-s">{sub_html}</div>{spark_html}</div>')


def html(s):
    st.markdown(s, unsafe_allow_html=True)


def style_fig(fig, height=340, yfmt=None, ytitle=None, legend=True, hover="x unified"):
    fig.update_layout(height=height, margin=dict(l=8, r=8, t=36, b=8), hovermode=hover,
                      paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)", showlegend=legend,
                      legend=dict(orientation="h", yanchor="bottom", y=1.02, x=0, bgcolor="rgba(0,0,0,0)"),
                      hoverlabel=dict(namelength=-1))
    if fig.layout.title.text and legend:   # 제목과 겹치지 않게 범례는 아래로
        fig.update_layout(legend=dict(y=-0.14, yanchor="top"), margin=dict(b=56))
    fig.update_xaxes(showgrid=False)
    fig.update_yaxes(gridcolor="rgba(128,128,128,.18)", zerolinecolor="rgba(128,128,128,.35)")
    if yfmt:
        fig.update_yaxes(tickformat=yfmt)
    if ytitle:
        fig.update_yaxes(title=ytitle)
    return fig


def show(fig, **kw):
    st.plotly_chart(fig, width="stretch", config={"displaylogo": False, "modeBarButtonsToRemove": ["lasso2d", "select2d"]}, **kw)


def shade(fig, periods, color=RED, opacity=0.13, **kw):
    for _, r in periods.iterrows():
        fig.add_vrect(x0=r["start"], x1=r["end"], fillcolor=color, opacity=opacity, line_width=0, layer="below", **kw)


def play_controls(frame_ms=60, prefix=""):
    return dict(
        updatemenus=[dict(type="buttons", direction="left", x=0, y=-0.12, xanchor="left", yanchor="top", showactive=False,
                          pad=dict(r=8, t=4), buttons=[
                              dict(label="▶ 재생", method="animate",
                                   args=[None, dict(frame=dict(duration=frame_ms, redraw=False), fromcurrent=True,
                                                    transition=dict(duration=0))]),
                              dict(label="⏸ 정지", method="animate",
                                   args=[[None], dict(frame=dict(duration=0, redraw=False), mode="immediate")])])],
    )


# ---------------------------------------------------------------- data
DATA_FILES = ["korea_bond_yields.csv", "korea_bond_spreads.csv", "korea_bond_factors.csv",
              "korea_bond_crisis_indicators.csv", "korea_bond_regime_probs.csv", "korea_bond_crisis_episodes.csv",
              "korea_bond_crisis_periods.csv", "korea_bond_credit_episodes.csv"]


def data_stamp() -> float:
    """결과 파일이 바뀌면(외부에서 파이프라인을 돌려도) 캐시가 자동으로 새로 읽히게 하는 키."""
    return max((BOND / f).stat().st_mtime for f in DATA_FILES if (BOND / f).exists())


def overlap_months(a: pd.DataFrame, b: pd.DataFrame) -> list[str]:
    """두 모형의 위기 구간이 겹친 달을 연도별 연속 구간으로 묶는다 (예: ['2022년 4~7월·9~11월'])."""
    months = set()
    for _, x in a.iterrows():
        for _, y in b.iterrows():
            lo, hi = max(x["start"], y["start"]), min(x["end"], y["end"])
            if lo <= hi:
                months.update(pd.period_range(lo, hi, freq="M"))
    out = []
    for yr_ in sorted({m.year for m in months}):
        ms = sorted(m.month for m in months if m.year == yr_)
        runs, start = [], ms[0]
        for p, q in zip(ms, ms[1:] + [None]):
            if q != p + 1:
                runs.append(f"{start}월" if start == p else f"{start}~{p}월")
                start = q
        out.append(f"{yr_}년 " + "·".join(runs))
    return out


@st.cache_data(show_spinner="파이프라인 결과 불러오는 중...")
def load_all(stamp: float):
    rd = lambda n: pd.read_csv(BOND / n, index_col=0, parse_dates=True)  # noqa: E731
    sig = ap.build_signals(ap.load())
    bt = ap.backtest(sig)

    old = sig.copy()   # 처음 시도했다가 버린 규칙: 위기 점수로 방향 베팅
    old["dur_mult"] = (1.15 - 0.9 * old["composite"] - 0.2 * old["P_High-Vol"]
                       - 0.05 * old["t60"].clip(-2, 2)).clip(0.3, 1.2)
    old["D_target"] = old["dur_mult"] * old["D_BM"]
    band, ap.REBALANCE_BAND = ap.REBALANCE_BAND, 0.30
    bt_old = ap.backtest(old)
    ap.REBALANCE_BAND = band

    fwd_dir = sig["y_Y10Y"].shift(-20) - sig["y_Y10Y"]
    fwd_vol = sig["dY_bp"].rolling(20).std().shift(-20)
    cols = {"composite": "Composite 위기점수", "P_High-Vol": "Kim 폭풍 확률", "t60": "60일 추세", "sigma20_bp": "20일 변동성"}
    corr = pd.DataFrame({"금리 방향": [sig[c].corr(fwd_dir) for c in cols],
                         "변동성": [sig[c].corr(fwd_vol) for c in cols]}, index=list(cols.values()))

    flat = sig.copy()   # 커브 뷰를 끄고 듀레이션만 맞췄다면 -> 커브 권고의 성과 기여
    flat["curve_view"] = "neutral"
    curve_contrib = ap.perf(bt["ret_strategy"])["연수익률"] - ap.perf(ap.backtest(flat)["ret_strategy"])["연수익률"]

    eps = pd.read_csv(BOND / "korea_bond_crisis_episodes.csv", parse_dates=["start", "end"])
    kim = pd.read_csv(BOND / "korea_bond_crisis_periods.csv", parse_dates=["start", "end"])
    cep_path = BOND / "korea_bond_credit_episodes.csv"
    ceps = (pd.read_csv(cep_path, parse_dates=["start", "end"]) if cep_path.exists()
            else pd.DataFrame(columns=["start", "end", "days", "max_stress", "max_aa_spread_bp", "max_cp_cd_bp"]))
    s22 = sig["sigma20_bp"][sig.index.year == 2022].dropna()

    # 크레딧: 규칙 백테스트, 강건성(문턱 x 계수 6개 조합), 신호별 예측력
    cb = ap.credit_backtest(sig)
    grid = []
    for th in (0, 5, 10):
        for k in (0.05, 0.10):
            w = pd.Series(np.where(sig["cs_chg20_bp"] > th, ap.CREDIT_CUT,
                                   ap.CREDIT_BM + k * sig["cs_z"].fillna(0).clip(-1, 2)), index=sig.index)
            sm = ap.credit_summary(ap.credit_backtest(sig.assign(w_credit=w)))
            grid.append({"확대 문턱": f"{th}bp", "밸류 계수": f"{k:.2f}", "초과(연 %p)": sm["excess_ann"] * 100,
                         "최대낙폭": sm["rule_mdd"], **{y: v * 100 for y, v in sm["crisis_years"].items()},
                         "채택": "✅" if (th, k) == (ap.CREDIT_WIDEN_BP, ap.CREDIT_VALUE_K) else ""})
    fwd_cs20 = sig["cs_bp"].shift(-20) - sig["cs_bp"]
    fwd_rx60 = cb["rx"][::-1].rolling(60).sum()[::-1].shift(-1)
    ccols = {"cs_z": "AA- 스프레드 수준", "cs_chg20_bp": "AA- 20일 확대", "st_z": "CP−CD 수준", "composite": "금리 위기점수"}
    ccorr = pd.DataFrame({"향후 20일 스프레드 확대": [sig[c].corr(fwd_cs20) for c in ccols],
                          "향후 60일 크레딧 초과수익": [sig[c].corr(fwd_rx60) for c in ccols]}, index=list(ccols.values()))
    w20 = sig.loc["2020-03-01":"2020-06-30"]
    miss2020 = (float(w20["composite"].max()), float(w20["credit_stress"].max())) if len(w20) else None

    return {"sig": sig, "bt": bt, "bt_old": bt_old, "corr": corr, "curve_contrib": curve_contrib,
            "y": rd("korea_bond_yields.csv"), "rp": rd("korea_bond_regime_probs.csv"), "eps": eps, "kim": kim,
            "both_months": overlap_months(eps, kim), "sigma_2022_peak": float(s22.max()) if len(s22) else None,
            "ceps": ceps, "cb": cb, "csum": ap.credit_summary(cb), "cgrid": pd.DataFrame(grid), "ccorr": ccorr,
            "miss2020": miss2020}


def perf_row(ret):
    p = ap.perf(ret)
    return {k: p[k] for k in ("연수익률", "연변동성", "수익/위험", "최대낙폭")}


D = load_all(data_stamp())
sig, bt = D["sig"], D["bt"]
asof = sig.index[-1]

PIPELINE = ["collect_korea_bonds.py", "kim_filter_korea_bond_real.py", "crisis_dashboard.py", "action_plan.py"]


def run_pipeline(status) -> bool:
    env = {**os.environ, "PYTHONIOENCODING": "utf-8"}
    for k, s in enumerate(PIPELINE, 1):
        status.update(label=f"{k}/{len(PIPELINE)} · {s} 실행 중...")
        t0 = time.time()
        p = subprocess.run([sys.executable, str(HERE / s)], cwd=HERE.parent, capture_output=True, text=True,
                           encoding="utf-8", errors="replace", env=env)
        if p.returncode != 0:
            status.error(f"{s} 실패 — 기존 데이터를 그대로 씁니다.\n\n```\n{(p.stderr or p.stdout)[-1500:]}\n```")
            return False
        status.write(f"✅ {s} ({time.time() - t0:.0f}초)")
    return True


with st.sidebar:
    st.header("⚙️ 설정")
    aum = st.number_input("운용규모 (억 원)", min_value=10, max_value=100000, value=1000, step=100,
                          help="매매 금액과 선물 계약 수가 이 규모 기준으로 계산됩니다.")
    with st.expander("📦 현재 보유 비중", expanded=False):
        st.caption("실제 보유 비중을 넣으면 그 기준으로 매매 금액을 계산합니다. 합계가 100%가 아니면 비율로 맞춥니다.")
        raw = {i: st.number_input(f"{ap.LABEL[i]} (%)", 0, 100, int(ap.BENCHMARK[i] * 100), 5, key=f"hold_{i}")
               for i in ap.INSTRUMENTS}
        tot = sum(raw.values())
        holdings = {i: v / tot for i, v in raw.items()} if tot else dict(ap.BENCHMARK)
        if tot and tot != 100:
            st.warning(f"합계 {tot}% → 100%로 환산했습니다.")
        credit_now = st.number_input("회사채 AA- 비중 (운용규모 대비 %)", 0, 100, int(ap.CREDIT_BM * 100), 5,
                                     key="hold_credit",
                                     help="국고채와 별도로, 같은 만기 국고와 교체해 들고 있는 회사채 비중입니다.") / 100
    st.divider()
    st.caption(f"데이터 기준일 **{asof:%Y-%m-%d}** · 출처 한국은행 ECOS 817Y002")
    if st.button("🔄 최신 데이터로 새로고침", width="stretch",
                 help="ECOS 수집 → Kim Filter → 위기 점수 → 액션 플랜 4단계를 다시 돌립니다 (1~3분)."):
        with st.status("파이프라인 실행 중...", expanded=True) as stt:
            ok = run_pipeline(stt)
            stt.update(label="완료" if ok else "실패", state="complete" if ok else "error")
        if ok:
            st.cache_data.clear()
            st.rerun()

plan = ap.plan_for(sig, float(aum), holdings, credit_now)
dg, du, cv, fh, cr = plan["diagnosis"], plan["duration"], plan["curve"], plan["futures_hedge"], plan["credit"]
csum = D["csum"]
p_bm, p_st, p_old = perf_row(bt["ret_bm"]), perf_row(bt["ret_strategy"]), perf_row(D["bt_old"]["ret_strategy"])
ret_gap = p_st["연수익률"] - p_bm["연수익률"]
yr = bt[["ret_bm", "ret_strategy"]].groupby(bt.index.year).apply(lambda g: (1 + g).prod() - 1)
yr["초과"] = yr["ret_strategy"] - yr["ret_bm"]
last = sig.iloc[-1]

# ---------------------------------------------------------------- hero
vk = VERDICT_KEY[dg["verdict"]]
html(f'<div class="hero"><div><div class="eyebrow">Korea Bond Risk Monitor · {asof:%Y.%m.%d} 종가</div>'
     f'<h1>채권 위기 진단 &amp; 액션 플랜</h1>'
     f'<p>국고채 시장의 <b>금리 위험</b>(모형 2개)과 <b>신용 위험</b>(크레딧 스프레드)을 매일 진단하고, 그 결과를 '
     f'<b>"무엇을 얼마나 사고팔지"</b>로 바꿔 드립니다.</p></div>'
     f'<div class="verdict"><small>오늘의 종합 판정</small><div class="big"><span class="dot" style="--c:{STATUS[vk]}">'
     f'</span>{dg["verdict"]}</div><small>금리 {dg["rate_verdict"]} · 신용 {dg["credit_verdict"]}'
     f'{" · " + dg["driver"] + " 주도" if dg["driver"] != "없음" else ""}</small><br>'
     f'<small>{dg["monitoring"]}</small></div></div>')

age = (pd.Timestamp.today().normalize() - asof).days
if age > 4:
    st.warning(f"데이터가 {age}일 전({asof:%Y-%m-%d}) 기준입니다. 왼쪽 사이드바의 **🔄 최신 데이터로 새로고침**을 눌러 주세요.")

GLOSSARY = [
    ("종합 판정 vs 위기 점수 구간", "위기 점수 구간(정상·경고·높음·심각)은 모형 하나의 결과, 종합 판정(안정·주의·경계·위기)은 "
                             "금리(모형 A + Kim Filter)와 신용(모형 C) 중 더 나쁜 쪽을 따른 최종 판단입니다."),
    ("크레딧 스프레드", "회사채 금리 − 같은 만기 국고채 금리. 기업이 국가보다 더 내는 이자로, 신용 위험의 '값'입니다. "
                  "넓어지면 시장이 기업 부도를 더 걱정한다는 뜻."),
    ("CP / CD", "CP = 기업어음(기업의 단기 차입), CD = 양도성예금증서(은행의 단기 차입). CP−CD 금리 차이가 벌어지면 "
                "단기 자금시장이 경색된 신호 (2022년 레고랜드 때 159bp)."),
    ("신용 스트레스", "AA- 스프레드와 CP−CD 스프레드의 수준·확대 속도를 0~1로 합친 점수 (모형 C). 0.4 이상이면 신용 위기 구간."),
    ("bp (베이시스 포인트)", "0.01%p. 금리가 3.00% → 3.25%로 오르면 25bp 상승."),
    ("듀레이션", "금리가 1%p 오를 때 채권값이 몇 % 빠지는지. 듀레이션 5년이면 약 −5%. 길수록 금리에 민감."),
    ("DV01", "금리가 1bp 움직일 때 평가손익이 얼마나 변하는지(원). 위험의 '크기'를 돈으로 표현."),
    ("벤치마크", "비교 기준 포트폴리오. 여기서는 국고 3년 50% + 10년 50%를 계속 들고 있는 전략."),
    ("변동성", "금리가 하루에 평균 몇 bp씩 출렁이는지 (최근 20거래일 표준편차)."),
    ("베어 / 불", "베어 = 금리 상승(채권값 하락), 불 = 금리 하락(채권값 상승)."),
    ("스티프닝 / 플래트닝", "장단기 금리 차이(10년−3년)가 벌어지면 스티프닝, 좁혀지면 플래트닝."),
    ("국채선물", "국고채를 미래 가격에 사고파는 계약. 1계약 = 액면 1억 원. 팔면 보유 채권의 금리 위험이 상쇄됨."),
    ("바벨 / 불릿", "바벨 = 초단기와 장기에 나눠 담기, 불릿 = 중간 만기에 집중."),
    ("Kim Filter", "숨은 시장 상태(평온/보통/폭풍)를 매일 확률로 추정하는 통계 모형 (Kim, 1994)."),
]
gcol, _ = st.columns([1, 5])
with gcol.popover("📖 용어 풀이", width="stretch"):
    for term, desc in GLOSSARY:
        st.markdown(f"**{term}** — {desc}")

with st.sidebar:
    st.divider()
    st.markdown("**⬇️ 내려받기**")
    orders = pd.DataFrame([{"종목": ap.LABEL[i], "듀레이션(년)": round(v["duration"], 2), "현재 비중": round(v["current"], 4),
                            "목표 비중": round(v["target"], 4), "매매(억원)": round(v["trade_eok"], 1),
                            "구분": "매수" if v["trade_eok"] > 0.5 else "매도" if v["trade_eok"] < -0.5 else "유지"}
                           for i, v in plan["cash_rebalance"].items()])
    orders.loc[len(orders)] = {"종목": "회사채 AA- 3년 (국고 3년과 교체)", "듀레이션(년)": round(cr["duration"], 2),
                               "현재 비중": round(cr["current_weight"], 4), "목표 비중": round(cr["target_weight"], 4),
                               "매매(억원)": round(cr["trade_eok"], 1),
                               "구분": "매수" if cr["trade_eok"] > 0.5 else "매도" if cr["trade_eok"] < -0.5 else "유지"}
    st.download_button("주문서 (CSV)", orders.to_csv(index=False).encode("utf-8-sig"),
                       f"bond_orders_{asof:%Y%m%d}.csv", "text/csv", width="stretch")
    st.download_button("액션 플랜 전체 (JSON)", json.dumps(plan, ensure_ascii=False, indent=2, default=float).encode("utf-8"),
                       f"bond_action_plan_{asof:%Y%m%d}.json", "application/json", width="stretch")
    st.download_button("일별 신호 (CSV)", sig[["y_Y10Y", "composite", "state", "P_High-Vol", "sigma20_bp", "D_target",
                                              "curve_view", "cs_bp", "st_bp", "credit_stress", "credit_state",
                                              "w_credit"]].to_csv().encode("utf-8-sig"),
                       f"bond_signals_{asof:%Y%m%d}.csv", "text/csv", width="stretch")

tabs = st.tabs(["📊 한눈에 보기", "🔬 진단 원리", "🎯 액션 플랜", "⏳ 타임머신", "🏆 성과 검증", "⚠️ 한계"])

# ================================================================ 📊 한눈에
with tabs[0]:
    html('<div class="kpi-grid">'
         + kpi("위기 점수 (0~1)", num(dg["composite"], 2),
               chip(STATE_KO[dg["state"]], STATE_KEY[dg["state"]]) + " 기준 0.40", spark(sig["composite"]), 0)
         + kpi("국고 10년 금리", num(dg["y10"], 2, unit="%"),
               f'60일 {num(last["cum60_bp"], 0, sign=True)}bp', spark(sig["y_Y10Y"]), .08)
         + kpi("10년 일간 변동성", num(du["sigma20_bp"], 1, unit="bp"),
               f'평소 {du["sigma_ref_bp"]:.1f}bp의 {du["sigma20_bp"] / du["sigma_ref_bp"]:.1f}배', spark(sig["sigma20_bp"]), .16)
         + kpi("권장 듀레이션", num(du["target"], 1, unit="년"),
               f'보유 {du["current"]:.1f}년 → {num(du["change"], 1, sign=True)}년', spark(sig["D_target"]), .24)
         + kpi("신용 스트레스 (0~1)", num(cr["stress"], 2),
               chip(STATE_KO[cr["state"]], STATE_KEY[cr["state"]]) + f' AA- {cr["spread_bp"]:.0f}bp · CP−CD {cr["cp_cd_bp"]:.0f}bp',
               spark(sig["credit_stress"], ORANGE), .32)
         + '</div>')

    wk = ap.plan_for(sig.iloc[:-5], float(aum), holdings, credit_now)

    def arrow(a, b, fmt, worse_up=True):
        if abs(b - a) < 1e-9:
            return f"{fmt.format(b)} (변화 없음)"
        up = b > a
        key = ("critical" if up == worse_up else "good")
        return f'{fmt.format(a)} → <b>{fmt.format(b)}</b> <span style="color:{STATUS[key]}">{"▲" if up else "▼"}</span>'
    changes = [
        ("판정", f'{wk["diagnosis"]["verdict"]} → <b>{dg["verdict"]}</b>' if wk["diagnosis"]["verdict"] != dg["verdict"]
         else f'{dg["verdict"]} 유지'),
        ("위기 점수", arrow(wk["diagnosis"]["composite"], dg["composite"], "{:.2f}")),
        ("10년 금리", arrow(wk["diagnosis"]["y10"], dg["y10"], "{:.2f}%")),
        ("권장 듀레이션", arrow(wk["duration"]["target"], du["target"], "{:.1f}년", worse_up=False)),
        ("커브", f'{wk["curve"]["name"]} → <b>{cv["name"]}</b>' if wk["curve"]["view"] != cv["view"] else f'{cv["name"]} 유지'),
        ("신용 스트레스", arrow(wk["credit"]["stress"], cr["stress"], "{:.2f}")),
        ("AA- 스프레드", arrow(wk["credit"]["spread_bp"], cr["spread_bp"], "{:.0f}bp")),
    ]
    html(f'<div class="changes"><span class="ch-t">🗓️ 지난주({wk["asof"]}) 대비</span>'
         + "".join(f'<span class="ch"><i>{k}</i> {v}</span>' for k, v in changes) + '</div>')

    g1, g2, g3 = st.columns([1, 1, 1.25], gap="medium")
    with g1:
        ref20 = float(sig["composite"].iloc[-21])
        fig = go.Figure(go.Indicator(
            mode="gauge+number+delta", value=dg["composite"], number=dict(valueformat=".2f", font=dict(size=44)),
            delta=dict(reference=ref20, valueformat="+.2f", increasing=dict(color=STATUS["critical"]),
                       decreasing=dict(color=STATUS["good"])),
            title=dict(text="위기 점수 (20일 전 대비)", font=dict(size=14)),
            gauge=dict(axis=dict(range=[0, 1], tickvals=[0, .3, .5, .65, 1]), bar=dict(color=BLUE, thickness=0.28),
                       steps=[dict(range=r, color=rgba(STATUS[k], .28)) for r, k in
                              [((0, .3), "good"), ((.3, .5), "warning"), ((.5, .65), "serious"), ((.65, 1), "critical")]],
                       threshold=dict(line=dict(color="#555", width=3), thickness=0.8, value=0.4))))
        show(style_fig(fig, 270, legend=False))
        html(f'<div class="legend-row">{chip("정상 &lt;0.30", "good")}{chip("경고", "warning")}'
             f'{chip("높음 ≥0.50", "serious")}{chip("심각 ≥0.65", "critical")}</div>')
    with g2:
        probs = {n: float(last.get(f"P_{n}", 0)) for n in ["Low-Vol", "Normal", "High-Vol"]}
        fig = go.Figure(go.Pie(labels=[REGIME_KO[n] for n in probs], values=list(probs.values()), hole=.68, sort=False,
                               direction="clockwise", marker=dict(colors=[STATUS[REGIME_KEY[n]] for n in probs],
                                                                  line=dict(color="rgba(0,0,0,0)", width=2)),
                               textinfo="none", hovertemplate="%{label}: %{value:.0%}<extra></extra>"))
        top = max(probs, key=probs.get)
        fig.add_annotation(text=f"<b>{REGIME_KO[top]}</b><br><span style='font-size:13px'>{probs[top]:.0%}</span>",
                           showarrow=False, font=dict(size=26))
        fig.update_layout(title=dict(text="시장 상태 확률 (Kim Filter)", font=dict(size=14)))
        show(style_fig(fig, 270, legend=False, hover="closest"))
        html('<div class="legend-row">' + "".join(chip(f"{REGIME_KO[n]} {probs[n]:.0%}", REGIME_KEY[n]) for n in probs)
             + '</div>')
    with g3:
        shock = st.slider("💥 금리가 이만큼 오르면? (bp)", -100, 200, 50, 10, key="shock",
                          help="국고채 금리가 한꺼번에 이만큼 움직일 때의 평가손익 (1차 근사: −듀레이션 × 금리변화)")
        loss_now = -du["current"] * shock / 10000 * aum
        loss_new = -du["target"] * shock / 10000 * aum
        fig = go.Figure(go.Bar(y=["현재 포트폴리오", "권고 포트폴리오"], x=[loss_now, loss_new], orientation="h",
                               marker_color=[GRAY, BLUE], text=[f"{loss_now:+,.1f}억", f"{loss_new:+,.1f}억"],
                               textposition="auto", hovertemplate="%{y}: %{x:+,.1f}억<extra></extra>"))
        m = max(abs(loss_now), abs(loss_new), 1) * 1.25
        fig.update_xaxes(range=[-m if shock > 0 else -m * .1, m * .1 if shock > 0 else m], title="평가손익 (억 원)")
        fig.update_layout(yaxis=dict(autorange="reversed"))
        show(style_fig(fig, 190, legend=False, hover="closest"))
        saved = abs(loss_now) - abs(loss_new)
        if shock > 0:
            html(f'<div class="callout">금리 <b>+{shock}bp</b> 급등 시 손실이 <b>{saved:,.1f}억 원 줄어듭니다</b> '
                 f'(운용규모 {aum:,.0f}억 기준).</div>')
        elif shock < 0:
            html(f'<div class="callout">반대로 금리가 {shock}bp 내리면 이익도 <b>{saved:,.1f}억 원 적습니다</b>. '
                 '위험을 줄이는 대가입니다.</div>')

    st.markdown("#### 🧭 리스크 맵 — 금리 위험 × 신용 위험")
    TH = cdash.EPISODE_THRESHOLD
    QUADS = {"안정": ("good", "두 위험 모두 낮습니다. 벤치마크 수준을 유지하고 정기 점검만 합니다."),
             "금리 위험": ("warning", "금리 변동성·손실 위험이 크고 신용은 안정적입니다. <b>듀레이션 관리가 핵심</b>이고, "
                                    "크레딧은 규칙대로 유지합니다."),
             "신용 위험": ("serious", "금리보다 신용 시장이 문제입니다 (예: 2020년 코로나). <b>회사채·CP 익스포저를 점검</b>하고 "
                                    "단기 자금은 통안채로 돌립니다."),
             "복합 위기": ("critical", "금리와 신용이 동시에 흔들립니다 (예: 2022년 레고랜드). <b>듀레이션 축소와 크레딧 방어를 "
                                     "함께</b> 합니다.")}

    def quadrant(x, y):
        return ("복합 위기" if y >= TH else "금리 위험") if x >= TH else ("신용 위험" if y >= TH else "안정")

    hist = sig[["composite", "credit_stress"]].dropna()
    rm1, rm2 = st.columns([1.55, 1], gap="large")
    with rm1:
        fig = go.Figure()
        for (x0, x1, y0, y1), lab in zip([(0, TH, 0, TH), (TH, 1, 0, TH), (0, TH, TH, 1), (TH, 1, TH, 1)], QUADS):
            fig.add_shape(type="rect", x0=x0, x1=x1, y0=y0, y1=y1, line_width=0, layer="below",
                          fillcolor=rgba(STATUS[QUADS[lab][0]], .10))
            fig.add_annotation(x=x0 + .015 if x0 == 0 else x1 - .015, y=y1 - .02, text=f"<b>{lab}</b>", showarrow=False,
                               xanchor="left" if x0 == 0 else "right", yanchor="top", font=dict(size=13), opacity=.8)
        fig.add_trace(go.Scatter(x=hist["composite"], y=hist["credit_stress"], mode="markers", name="과거 모든 날",
                                 marker=dict(size=4, color=rgba(GRAY, .22)), customdata=hist.index.strftime("%Y-%m-%d"),
                                 hovertemplate="%{customdata}<br>금리 %{x:.2f} · 신용 %{y:.2f}<extra></extra>"))
        refs = []
        for lab, (a, b, key) in {"코로나 신용경색": ("2020-03-01", "2020-06-30", "credit_stress"),
                                 "레고랜드 사태": ("2022-10-01", "2022-12-31", "both"),
                                 "고금리 정점": ("2023-09-01", "2023-11-30", "composite")}.items():
            w_ = hist.loc[a:b]
            if len(w_):
                d_ = (w_["composite"] + w_["credit_stress"]).idxmax() if key == "both" else w_[key].idxmax()
                refs.append((lab, d_, hist.loc[d_, "composite"], hist.loc[d_, "credit_stress"]))
        fig.add_trace(go.Scatter(x=[r_[2] for r_ in refs], y=[r_[3] for r_ in refs], mode="markers+text", name="과거 위기",
                                 marker=dict(size=13, color="rgba(0,0,0,0)", line=dict(color=RED, width=2.5)),
                                 text=[f"{r_[0]}<br>{r_[1]:%Y-%m}" for r_ in refs], textposition="middle left",
                                 textfont=dict(size=11), hovertemplate="%{text}<extra></extra>"))
        trail = hist.iloc[-60:]
        fig.add_trace(go.Scatter(x=trail["composite"], y=trail["credit_stress"], mode="lines+markers", name="최근 60일",
                                 line=dict(color=rgba(BLUE, .35), width=1.5),
                                 marker=dict(size=7, color=[rgba(BLUE, a_) for a_ in np.linspace(.12, .85, len(trail))]),
                                 customdata=trail.index.strftime("%Y-%m-%d"),
                                 hovertemplate="%{customdata}<br>금리 %{x:.2f} · 신용 %{y:.2f}<extra></extra>"))
        fig.add_trace(go.Scatter(x=[dg["composite"]], y=[cr["stress"]], mode="markers+text", name="오늘",
                                 marker=dict(size=19, color=BLUE, line=dict(color="white", width=3)), text=["오늘"],
                                 textposition="top center", hoverinfo="skip"))
        fig.update_xaxes(range=[0, 1.02], title="금리 위험 (위기 점수) →", zeroline=False)
        fig.update_yaxes(range=[0, 1.04], title="신용 위험 (신용 스트레스) →", zeroline=False)
        show(style_fig(fig, 440, hover="closest"))
    with rm2:
        q = quadrant(dg["composite"], cr["stress"])
        share = (hist.apply(lambda r_: quadrant(r_["composite"], r_["credit_stress"]), axis=1) == q).mean()
        html(kpi("오늘의 위치", f'<span style="display:inline-flex;align-items:center;gap:10px">'
                 f'<span class="dot" style="--c:{STATUS[QUADS[q][0]]}"></span>{q}</span>',
                 f'금리 {dg["composite"]:.2f} · 신용 {cr["stress"]:.2f} · 2017년 이후 {share:.0%}의 날이 이 칸'))
        html(f'<div class="callout" style="margin-top:12px">{QUADS[q][1]}</div>')
        if D["miss2020"]:
            c20, s20 = D["miss2020"]
            html(f'<div class="callout" style="border-left-color:{ORANGE};background:{rgba(ORANGE, .08)}">'
                 f'💡 <b>왜 신용을 따로 보나?</b> 2020년 3~6월 코로나 때 금리 위기점수는 최고 <b>{c20:.2f}</b>(정상)에 '
                 f'그쳤지만 신용 스트레스는 <b>{s20:.2f}</b>까지 올랐습니다. 금리만 봤다면 놓쳤을 위기입니다.</div>')

    st.markdown("#### 🚦 10년 위기 신호등")
    states = sig["state"].map({"NORMAL": 0, "WARNING": 1, "HIGH": 2, "SEVERE": 3})
    cstates = sig["credit_state"].map({"NORMAL": 0, "WARNING": 1, "HIGH": 2, "SEVERE": 3})
    fig = make_subplots(rows=3, cols=1, shared_xaxes=True, row_heights=[.7, .15, .15], vertical_spacing=.03)
    fig.add_trace(go.Scatter(x=sig.index, y=sig["y_Y10Y"], name="국고 10년", line=dict(color=BLUE, width=2),
                             hovertemplate="%{y:.3f}%"), 1, 1)
    cs = [[0, STATUS["good"]], [1 / 6, STATUS["good"]], [1 / 6, STATUS["warning"]], [.5, STATUS["warning"]],
          [.5, STATUS["serious"]], [5 / 6, STATUS["serious"]], [5 / 6, STATUS["critical"]], [1, STATUS["critical"]]]
    fig.add_trace(go.Heatmap(x=sig.index, y=["금리"], z=[states.to_numpy()], zmin=0, zmax=3, colorscale=cs,
                             showscale=False, customdata=[sig["composite"].to_numpy()], name="금리 신호",
                             text=[sig["state"].map(STATE_KO).to_numpy()],
                             hovertemplate="%{x|%Y-%m-%d} · 금리 %{text} (%{customdata:.2f})<extra></extra>"), 2, 1)
    fig.add_trace(go.Heatmap(x=sig.index, y=["신용"], z=[cstates.to_numpy()], zmin=0, zmax=3, colorscale=cs,
                             showscale=False, customdata=[sig["credit_stress"].to_numpy()], name="신용 신호",
                             text=[sig["credit_state"].map(STATE_KO).to_numpy()],
                             hovertemplate="%{x|%Y-%m-%d} · 신용 %{text} (%{customdata:.2f})<extra></extra>"), 3, 1)
    fig.update_xaxes(rangeselector=dict(buttons=[dict(count=1, label="1년", step="year", stepmode="backward"),
                                                 dict(count=3, label="3년", step="year", stepmode="backward"),
                                                 dict(step="all", label="전체")], x=0, y=1.08), row=1, col=1)
    fig.update_yaxes(title="금리 (%)", row=1, col=1)
    show(style_fig(fig, 440, legend=False))
    html(f'<div class="legend-row">{chip("정상", "good")}{chip("경고", "warning")}{chip("높음", "serious")}'
         f'{chip("심각", "critical")}<span style="opacity:.7">· 버튼으로 기간 전환, 드래그로 확대</span></div>')

# ================================================================ 🔬 진단 원리
with tabs[1]:
    dy_abs = sig["dY_bp"].abs()
    reg = D["rp"]["regime"].reindex(sig.index)
    storm_ratio = dy_abs[reg == "High-Vol"].mean() / dy_abs[reg == "Low-Vol"].mean()
    html('<div class="callout"><b>금리 위험</b>은 원리가 다른 두 모형(A·B)이, <b>신용 위험</b>은 크레딧 스프레드 모형(C)이 '
         '독립적으로 판단합니다. 한 모형이 놓쳐도 다른 모형이 잡도록 하기 위해서이고, 종합 판정은 금리와 신용 중 더 나쁜 쪽을 '
         '따릅니다.</div>')
    a, b = st.columns(2, gap="large")
    with a:
        st.markdown("### 🩺 모형 A · 위기 점수")
        st.markdown("건강검진처럼 **4가지 수치를 합산**합니다. 금리가 *오를 때*(채권값 하락)만 위험으로 셉니다.")
        comp = pd.DataFrame({
            "지표": ["변동성 급등", "추세", "60일 누적 상승", "보유자 손실"],
            "설명": ["평소보다 얼마나 출렁이나", "꾸준히 오르는 흐름인가", "두 달 새 얼마나 올랐나", "1년 고점 대비 잃은 돈"],
            "기여": [.2 * last["score_sigma_spike"], .2 * last["score_mu_drift"], .2 * last["score_cum60d"],
                     .4 * last["score_tr_dd"]],
            "만점": [.2, .2, .2, .4],
            "원값": [f"하루 {last['sigma20_bp']:.1f}bp", f"t = {last['t60']:+.2f}", f"{last['cum60_bp']:+.0f}bp",
                     f"{last['tr_dd']:.1%}"]})
        fig = go.Figure()
        fig.add_trace(go.Bar(y=comp["지표"], x=comp["만점"], orientation="h", marker_color="rgba(128,128,128,.18)",
                             name="만점 (가중치)", hoverinfo="skip"))
        fig.add_trace(go.Bar(y=comp["지표"], x=comp["기여"], orientation="h", marker_color=BLUE, name="오늘 기여",
                             text=[f"{v:.3f}" for v in comp["기여"]], textposition="outside",
                             customdata=np.stack([comp["원값"], comp["설명"]], axis=1),
                             hovertemplate="%{y}: %{x:.3f}<br>%{customdata[1]}<br>원값 %{customdata[0]}<extra></extra>"))
        fig.update_layout(barmode="overlay", yaxis=dict(autorange="reversed"),
                          title=dict(text=f"오늘 합계 {last['composite']:.3f}", font=dict(size=14)))
        fig.update_xaxes(range=[0, .47])
        show(style_fig(fig, 280, hover="closest"))
    with b:
        st.markdown("### 🌦️ 모형 B · Kim Filter")
        st.markdown("날씨 예보처럼 지금 시장이 **평온 / 보통 / 폭풍** 중 어디인지 **확률**로 추정합니다. "
                    "9개 만기 금리를 3개 숨은 요인(수준·기울기·곡률)으로 요약하고, 매일 확률을 갱신합니다 (Kim 1994).")
        rp = D["rp"]
        fig = go.Figure()
        for n in ["Low-Vol", "Normal", "High-Vol"]:
            fig.add_trace(go.Scatter(x=rp.index, y=rp[f"S_{n}"].rolling(20, min_periods=1).mean(), name=REGIME_KO[n], stackgroup="one",
                                     line=dict(width=0), fillcolor=rgba(STATUS[REGIME_KEY[n]], .85),
                                     hovertemplate="%{y:.0%}"))
        fig.update_layout(title=dict(text=f"폭풍인 날의 금리 변동폭 = 평온한 날의 {storm_ratio:.1f}배 (20일 평균)",
                                     font=dict(size=14)))
        show(style_fig(fig, 280, yfmt=".0%").update_yaxes(range=[0, 1]))

    st.markdown("#### 위기 점수는 무엇으로 이루어져 왔나")
    fig = go.Figure()
    for col, name, color, w in [("score_tr_dd", "보유자 손실", BLUE, .4), ("score_sigma_spike", "변동성 급등", ORANGE, .2),
                                ("score_mu_drift", "추세", AQUA, .2), ("score_cum60d", "60일 누적 상승", YELLOW, .2)]:
        fig.add_trace(go.Scatter(x=sig.index, y=w * sig[col], name=name, stackgroup="c", line=dict(width=.5, color=color),
                                 fillcolor=rgba(color, .75), hovertemplate="%{y:.3f}"))
    fig.add_hline(y=.4, line_dash="dash", line_color=GRAY, annotation_text="위기 구간 기준 0.4", annotation_position="top left")
    show(style_fig(fig, 320).update_yaxes(range=[0, 1]))

    st.markdown("### 💳 모형 C · 신용 스트레스 (크레딧 스프레드)")
    c_l, c_r = st.columns([1, 1.35], gap="large")
    with c_l:
        st.markdown(
            "회사가 돈을 빌릴 때 국가보다 **얼마나 더 비싸게** 빌리는지(크레딧 스프레드)를 봅니다. 벌어질수록 시장이 기업 "
            "부도와 자금난을 걱정한다는 뜻입니다. 넓어질 때만 위험으로 셉니다.\n\n"
            "| 지표 | 쉽게 말하면 | 가중치 |\n|---|---|---|\n"
            "| AA- 스프레드 수준 | 우량 회사채가 국고보다 평소 대비 얼마나 비싼가 | 30% |\n"
            "| AA- 스프레드 확대 | 최근 20일간 얼마나 빨리 벌어졌나 | 30% |\n"
            "| CP−CD 수준 | 기업 단기자금이 은행 단기자금보다 얼마나 비싼가 | 20% |\n"
            "| CP−CD 확대 | 단기 자금시장이 얼마나 빨리 경색되나 | 20% |")
        comps = pd.DataFrame({
            "지표": ["AA- 수준", "AA- 확대", "CP−CD 수준", "CP−CD 확대"],
            "기여": [.3 * last["score_aa_level"], .3 * last["score_aa_widen"], .2 * last["score_st_level"],
                     .2 * last["score_st_widen"]],
            "만점": [.3, .3, .2, .2],
            "원값": [f"{last['cs_bp']:.0f}bp (누적 z {last['cs_z']:+.2f})", f"20일 {last['cs_chg20_bp']:+.0f}bp",
                     f"{last['st_bp']:.0f}bp (누적 z {last['st_z']:+.2f})", f"20일 {last['st_chg20_bp']:+.0f}bp"]})
        fig = go.Figure()
        fig.add_trace(go.Bar(y=comps["지표"], x=comps["만점"], orientation="h", marker_color="rgba(128,128,128,.18)",
                             name="만점 (가중치)", hoverinfo="skip"))
        fig.add_trace(go.Bar(y=comps["지표"], x=comps["기여"], orientation="h", marker_color=ORANGE, name="오늘 기여",
                             text=[f"{v:.3f}" for v in comps["기여"]], textposition="outside", customdata=comps["원값"],
                             hovertemplate="%{y}: %{x:.3f}<br>원값 %{customdata}<extra></extra>"))
        fig.update_layout(barmode="overlay", yaxis=dict(autorange="reversed"),
                          title=dict(text=f"오늘 합계 {last['credit_stress']:.3f} ({STATE_KO[last['credit_state']]})",
                                     font=dict(size=14)))
        fig.update_xaxes(range=[0, .36])
        show(style_fig(fig, 250, hover="closest"))
    with c_r:
        fig = go.Figure()
        fig.add_trace(go.Scatter(x=sig.index, y=sig["cs_bp"], name="회사채 AA- − 국고 3년", line=dict(color=ORANGE, width=2),
                                 hovertemplate="%{y:.0f}bp"))
        fig.add_trace(go.Scatter(x=sig.index, y=sig["st_bp"], name="CP − CD (91일)", line=dict(color=AQUA, width=1.6),
                                 hovertemplate="%{y:.0f}bp"))
        shade(fig, D["ceps"])
        for _, r_ in D["ceps"].iterrows():
            lab = "코로나" if r_["start"].year == 2020 else "레고랜드" if r_["start"].year == 2022 else f"{r_['start']:%Y-%m}"
            fig.add_annotation(x=r_["start"] + (r_["end"] - r_["start"]) / 2, y=float(r_["max_aa_spread_bp"]),
                               text=f"{lab}<br>{r_['max_aa_spread_bp']:.0f}bp", showarrow=True, arrowhead=0, ay=-28,
                               font=dict(size=11))
        fig.update_layout(title=dict(text="크레딧 스프레드 (bp) · 빨간 음영 = 신용 위기 구간", font=dict(size=14)))
        show(style_fig(fig, 380, ytitle="bp"))

    fig = go.Figure()
    fig.add_trace(go.Scatter(x=sig.index, y=sig["composite"], name="금리 위기점수 (모형 A)", line=dict(color=BLUE, width=1.8),
                             hovertemplate="%{y:.2f}"))
    fig.add_trace(go.Scatter(x=sig.index, y=sig["credit_stress"], name="신용 스트레스 (모형 C)",
                             line=dict(color=ORANGE, width=1.8), fill="tozeroy", fillcolor=rgba(ORANGE, .12),
                             hovertemplate="%{y:.2f}"))
    fig.add_hline(y=cdash.EPISODE_THRESHOLD, line_dash="dash", line_color=GRAY, annotation_text="위기 구간 기준 0.4",
                  annotation_position="top left")
    if D["miss2020"]:
        c20, s20 = D["miss2020"]
        fig.add_annotation(x=pd.Timestamp("2020-04-15"), y=s20, text=f"2020 코로나: 금리 {c20:.2f} vs 신용 {s20:.2f}",
                           showarrow=True, arrowhead=2, ax=70, ay=-10, font=dict(size=12))
    fig.update_layout(title=dict(text="금리 점수와 신용 스트레스는 서로 다른 위기를 잡습니다", font=dict(size=14)))
    show(style_fig(fig, 320).update_yaxes(range=[0, 1.08]))

    st.markdown("#### 세 모형이 잡아낸 위기, 한 줄로 비교")
    tl = pd.concat([D["eps"].assign(모형="A · 금리 위기점수", 강도=D["eps"]["max_composite"]),
                    D["kim"].assign(모형="B · Kim Filter", 강도=D["kim"]["max_prob"]),
                    D["ceps"].assign(모형="C · 신용 스트레스", 강도=D["ceps"]["max_stress"])])
    tl["end"] = tl["end"] + pd.Timedelta(days=1)
    fig = px.timeline(tl, x_start="start", x_end="end", y="모형", color="모형",
                      color_discrete_map={"A · 금리 위기점수": BLUE, "B · Kim Filter": AQUA, "C · 신용 스트레스": ORANGE},
                      category_orders={"모형": ["A · 금리 위기점수", "B · Kim Filter", "C · 신용 스트레스"]},
                      hover_data={"days": True, "강도": ":.2f", "모형": False})
    fig.update_traces(marker_line_width=0)
    show(style_fig(fig, 240, hover="closest").update_layout(showlegend=False).update_yaxes(title=None))
    both = D["both_months"]
    both_txt = (f"<b>{'·'.join(both)}</b>은 금리 모형 둘(A·B)이 모두 위기로 판정했습니다." if both
                else "금리 모형 둘이 동시에 위기로 판정한 달은 없습니다.")
    html('<div class="callout">모형 A는 <b>손실이 쌓인 기간</b>을 길게, 모형 B는 <b>충격이 터진 순간</b>을 짧게 잡습니다. '
         f'{both_txt} 모형 C는 <b>신용 시장이 막힌 시기</b>(2020년 코로나, 2022년 레고랜드)를 따로 잡습니다.</div>')
    with st.expander("📋 위기 구간 목록 보기"):
        c1, c2, c3 = st.columns(3)
        e = D["eps"].assign(start=D["eps"]["start"].dt.date, end=D["eps"]["end"].dt.date)
        e.columns = ["시작", "끝", "거래일", "최고 점수", "최대 손실"]
        c1.dataframe(e.style.format({"최고 점수": "{:.2f}", "최대 손실": "{:.1%}"}), hide_index=True, width="stretch")
        k = D["kim"].assign(start=D["kim"]["start"].dt.date, end=D["kim"]["end"].dt.date)[["start", "end", "days", "max_prob"]]
        k.columns = ["시작", "끝", "거래일", "최고 폭풍 확률"]
        c2.dataframe(k.style.format({"최고 폭풍 확률": "{:.0%}"}), hide_index=True, width="stretch")
        ce = D["ceps"].assign(start=D["ceps"]["start"].dt.date, end=D["ceps"]["end"].dt.date)
        ce.columns = ["시작", "끝", "거래일", "최고 스트레스", "AA- 최대(bp)", "CP−CD 최대(bp)"]
        c3.dataframe(ce.style.format({"최고 스트레스": "{:.2f}", "AA- 최대(bp)": "{:.0f}", "CP−CD 최대(bp)": "{:.0f}"}),
                     hide_index=True, width="stretch")

# ================================================================ 🎯 액션 플랜
with tabs[2]:
    big = max(plan["cash_rebalance"].items(), key=lambda kv: abs(kv[1]["trade_eok"]))
    top_trade = f"{ap.LABEL[big[0]]} {abs(big[1]['trade_eok']):,.0f}억 {'매수' if big[1]['trade_eok'] > 0 else '매도'}"
    c_trade_txt = ("매매 없음" if abs(cr["trade_eok"]) < 0.5
                   else f"회사채 {abs(cr['trade_eok']):,.0f}억 {'매수' if cr['trade_eok'] > 0 else '매도'}")
    html('<div class="flow">'
         f'<div class="step"><div class="n">STEP 1 · 진단</div><div class="q">지금 위험한가?</div>'
         f'<div class="a">{dg["verdict"]}</div><div class="w">위기 점수 {dg["composite"]:.2f} · {REGIME_KO[dg["regime"]]}</div></div>'
         f'<div class="step" style="animation-delay:.08s"><div class="n">STEP 2 · 크기</div><div class="q">얼마나 줄이나?</div>'
         f'<div class="a">{du["current"]:.1f} → {du["target"]:.1f}년</div><div class="w">변동성 {du["sigma20_bp"] / du["sigma_ref_bp"]:.1f}배 → 위험 {du["mult"]:.0%}로</div></div>'
         f'<div class="step" style="animation-delay:.16s"><div class="n">STEP 3 · 위치</div><div class="q">어느 만기에서?</div>'
         f'<div class="a">{CURVE_ICON[cv["view"]]} {cv["name"]}</div><div class="w">{cv["trade"]}</div></div>'
         f'<div class="step" style="animation-delay:.24s"><div class="n">STEP 4 · 실행</div><div class="q">어떻게 주문하나?</div>'
         f'<div class="a">{top_trade}</div><div class="w">또는 {fh["contract"]} {abs(fh["contracts"]):,.0f}계약 {fh["side"]}</div></div>'
         f'<div class="step" style="animation-delay:.32s;background:{rgba(ORANGE, .08)}"><div class="n">STEP 5 · 크레딧</div>'
         f'<div class="q">회사채는 얼마나?</div><div class="a">AA- {cr["current_weight"]:.0%} → {cr["target_weight"]:.0%}</div>'
         f'<div class="w">신용 스트레스 {cr["stress"]:.2f} ({STATE_KO[cr["state"]]}) · {c_trade_txt}</div></div>'
         '</div>')

    l, r = st.columns([1.1, 1], gap="large")
    with l:
        st.markdown("#### 📐 커브 나침반 — 최근 60일 궤적")
        trail = sig[["dY10_20bp", "dTERM_20bp"]].dropna().iloc[-60:]
        lim_x = max(30, trail["dY10_20bp"].abs().max() * 1.2)
        lim_y = max(15, trail["dTERM_20bp"].abs().max() * 1.2)
        fig = go.Figure()
        for (x0, x1, y0, y1, lab, k, sx, sy) in [
                (0, lim_x, 0, lim_y, "베어 스티프닝 · 장기채 매도→단기채 매수", "bear_steep", 1, 1),
                (0, lim_x, -lim_y, 0, "베어 플래트닝 · 3Y 축소→바벨", "bear_flat", 1, -1),
                (-lim_x, 0, -lim_y, 0, "불 플래트닝 · 장기채 매수", "bull_flat", -1, -1),
                (-lim_x, 0, 0, lim_y, "불 스티프닝 · 3Y 매수", "bull_steep", -1, 1)]:
            on = k == cv["view"]
            fig.add_shape(type="rect", x0=x0, x1=x1, y0=y0, y1=y1, line_width=0, layer="below",
                          fillcolor=rgba(BLUE, .16 if on else .04))
            fig.add_annotation(x=sx * lim_x * .98, y=sy * lim_y * .95, text=("<b>" + lab + "</b>") if on else lab,
                               showarrow=False, xanchor="right" if sx > 0 else "left",
                               yanchor="top" if sy > 0 else "bottom", font=dict(size=12), opacity=1 if on else .6)
        fig.add_trace(go.Scatter(x=trail["dY10_20bp"], y=trail["dTERM_20bp"], mode="lines+markers", name="궤적",
                                 line=dict(color=rgba(BLUE, .45), width=2),
                                 marker=dict(size=7, color=[rgba(BLUE, a_) for a_ in np.linspace(.15, .9, len(trail))]),
                                 customdata=trail.index.strftime("%Y-%m-%d"),
                                 hovertemplate="%{customdata}<br>10Y %{x:+.0f}bp · 기울기 %{y:+.0f}bp<extra></extra>"))
        fig.add_trace(go.Scatter(x=[trail["dY10_20bp"].iloc[-1]], y=[trail["dTERM_20bp"].iloc[-1]], mode="markers+text",
                                 marker=dict(size=18, color=BLUE, line=dict(color="white", width=3)), text=["오늘"],
                                 textposition="top center", name="오늘", hoverinfo="skip"))
        frames = [go.Frame(data=[go.Scatter(x=trail["dY10_20bp"].iloc[:k], y=trail["dTERM_20bp"].iloc[:k]),
                                 go.Scatter(x=[trail["dY10_20bp"].iloc[k - 1]], y=[trail["dTERM_20bp"].iloc[k - 1]])],
                          name=str(k)) for k in range(2, len(trail) + 1)]
        fig.frames = frames
        fig.update_layout(**play_controls(90))
        fig.update_xaxes(range=[-lim_x, lim_x], title="20일간 10년 금리 변화 (bp) →  오르면 베어", zeroline=True)
        fig.update_yaxes(range=[-lim_y, lim_y], title="20일간 10Y−3Y 변화 (bp)", zeroline=True)
        show(style_fig(fig, 470, legend=False, hover="closest").update_layout(margin=dict(b=80)))
    with r:
        st.markdown("#### 🔁 매매 주문서")
        tr = pd.DataFrame([{"종목": ap.LABEL[i], "매매": v["trade_eok"], "목표": v["target"], "현재": v["current"]}
                           for i, v in plan["cash_rebalance"].items()])
        fig = go.Figure(go.Bar(y=tr["종목"], x=tr["매매"], orientation="h",
                               marker_color=[BLUE if v > 0 else RED for v in tr["매매"]],
                               text=[("매수 " if v > 0.5 else "매도 " if v < -0.5 else "") + f"{abs(v):,.0f}억" for v in tr["매매"]],
                               textposition="auto", customdata=np.stack([tr["현재"], tr["목표"]], axis=1),
                               hovertemplate="%{y}<br>비중 %{customdata[0]:.0%} → %{customdata[1]:.0%}<br>%{x:+,.0f}억<extra></extra>"))
        fig.add_vline(x=0, line_color="rgba(128,128,128,.6)")
        fig.update_layout(yaxis=dict(autorange="reversed"), title=dict(text="A. 현물 재배분 (억 원)", font=dict(size=14)))
        show(style_fig(fig, 250, legend=False, hover="closest"))
        html(kpi(f"B. 선물 헤지 — {fh['contract']}", num(abs(fh["contracts"]), 0, unit=f"계약 {fh['side']}"),
                 f"계약당 1bp ≈ {fh['dv01_per_contract_won']:,.0f}원 · 보유 채권은 그대로, 캐리 유지"))

    st.markdown("#### 💳 크레딧 포지션 — 회사채 AA- 3년")
    st.caption("같은 만기(3년) 국고채와 교체하므로 금리 위험(듀레이션)은 그대로이고, 신용 위험과 가산금리만 바뀝니다.")
    k1, k2, k3 = st.columns([1.25, 1, 1], gap="large")
    with k1:
        fig = go.Figure()
        fig.add_vrect(x0=ap.CREDIT_CUT, x1=ap.CREDIT_BM + 2 * ap.CREDIT_VALUE_K, fillcolor=rgba(ORANGE, .07), line_width=0,
                      layer="below", annotation_text="규칙 범위 10~40%", annotation_position="top left",
                      annotation_font_size=11)
        fig.add_trace(go.Bar(y=["현재", "목표"], x=[cr["current_weight"], cr["target_weight"]], orientation="h",
                             marker_color=[GRAY, ORANGE], text=[f"{cr['current_weight']:.0%}", f"{cr['target_weight']:.0%}"],
                             textposition="outside", hovertemplate="%{y}: %{x:.1%}<extra></extra>"))
        fig.add_vline(x=ap.CREDIT_BM, line_dash="dash", line_color=GRAY, annotation_text="벤치마크 20%",
                      annotation_position="bottom right", annotation_font_size=11)
        fig.update_xaxes(range=[0, .47], tickformat=".0%")
        fig.update_layout(yaxis=dict(autorange="reversed"), bargap=.45,
                          title=dict(text="크레딧 비중 (운용규모 대비)", font=dict(size=14)))
        show(style_fig(fig, 230, legend=False, hover="closest"))
        html(f'<div class="callout"><b>{cr["action"]}</b> · {c_trade_txt}<br>'
             f'<span style="opacity:.85">{cr["reason"]}</span></div>')
    with k2:
        carry_eok = cr["spread_bp"] / 1e4 * cr["target_weight"] * aum
        html(kpi("AA- 스프레드 (국고 3년 대비)", num(cr["spread_bp"], 0, unit="bp"),
                 f'누적 z {cr["spread_z"]:+.2f} · 20일 {cr["chg20_bp"]:+.0f}bp (축소 기준 +{ap.CREDIT_WIDEN_BP}bp 초과)'))
        html(kpi("크레딧 가산 이자 (목표 비중 기준)", num(carry_eok, 2, unit="억/년"),
                 f'{cr["spread_bp"]:.0f}bp × {cr["target_weight"] * aum:,.0f}억 · 부도 위험의 대가', delay=.06))
    with k3:
        html(kpi("단기 자금: CP 가산금리 (vs 통안 91일)", num(cr["cp_pickup_bp"], 0, unit="bp"),
                 f'과거 {cr["cp_pickup_pct"]:.0%} 백분위 · CP−CD {cr["cp_cd_bp"]:.0f}bp'))
        html(f'<div class="callout" style="margin-top:10px">💵 {cr["short_term"]}</div>')

    hist_w = D["cb"]["w_rule"].loc[sig.index[-1] - pd.DateOffset(years=6):]
    fig = go.Figure()
    fig.add_trace(go.Scatter(x=hist_w.index, y=hist_w, name="규칙 보유 비중", line=dict(color=ORANGE, width=2, shape="hv"),
                             hovertemplate="%{y:.0%}"))
    fig.add_hline(y=ap.CREDIT_BM, line_dash="dot", line_color=GRAY, annotation_text="벤치마크 20%")
    shade(fig, D["ceps"][D["ceps"]["end"] >= hist_w.index[0]] if len(D["ceps"]) else D["ceps"])
    fig.update_layout(title=dict(text="크레딧 비중 추이 (최근 6년) · 빨간 음영 = 신용 위기: 확대 중엔 10%, 멈춘 뒤 최대 40%",
                                 font=dict(size=14)))
    show(style_fig(fig, 260, yfmt=".0%", legend=False).update_yaxes(range=[0, .45]))

    st.markdown("#### 🎚️ 트리거 시뮬레이터 — 변동성이 바뀌면 듀레이션은?")
    ref = du["sigma_ref_bp"]
    vol = st.slider("국고 10년 일간 변동성 (bp/일)", 1.5, 14.0, float(round(du["sigma20_bp"], 2)), 0.01,
                    format="%.2f", key="volsim")
    xs = np.linspace(1.5, 14, 200)
    ys = np.clip(ref / xs, ap.MULT_MIN, ap.MULT_MAX) * du["benchmark"]
    tgt = float(np.clip(ref / vol, ap.MULT_MIN, ap.MULT_MAX) * du["benchmark"])
    s1, s2 = st.columns([3, 1])
    with s1:
        fig = go.Figure()
        fig.add_trace(go.Scatter(x=xs, y=ys, name="목표 듀레이션", line=dict(color=BLUE, width=3),
                                 hovertemplate="변동성 %{x:.1f}bp → %{y:.2f}년<extra></extra>"))
        fig.add_hline(y=du["benchmark"], line_dash="dot", line_color=GRAY, annotation_text="벤치마크")
        marks = [(ref, "평소"), (float(du["sigma20_bp"]), "오늘")]
        if D["sigma_2022_peak"]:
            marks.append((D["sigma_2022_peak"], "2022 고점"))
        for xv, lab in marks:
            fig.add_vline(x=xv, line_dash="dash", line_color="rgba(128,128,128,.5)", annotation_text=lab,
                          annotation_position="top")
        fig.add_trace(go.Scatter(x=[vol], y=[tgt], mode="markers", marker=dict(size=18, color=BLUE, line=dict(color="white", width=3)),
                                 name="선택", hoverinfo="skip"))
        fig.update_xaxes(title="변동성 (bp/일)")
        fig.update_yaxes(title="년", range=[0, du["benchmark"] * 1.35])
        show(style_fig(fig, 300, legend=False, hover="closest"))
    with s2:
        dd_ = tgt - du["current"]
        html(kpi("이 변동성이면", num(tgt, 2, unit="년"), f"보유 대비 {dd_:+.2f}년"))
        c_ = dd_ * aum / (fh["dv01_per_contract_won"] / 1e4)
        html(kpi("선물로 맞추면", num(abs(c_), 0, unit="계약"), "매도" if c_ < 0 else "매수", delay=.08))
    with st.expander("📜 규칙 원문"):
        for k_, v_ in plan["triggers"].items():
            st.markdown(f"- **{k_}** — {v_}")

# ================================================================ ⏳ 타임머신
with tabs[3]:
    html('<div class="callout">과거 날짜를 고르면 <b>그날 시스템이 뭐라고 권고했을지</b>, 그리고 <b>그 뒤 60일 동안 실제로 '
         '어떻게 됐는지</b>를 보여줍니다. 그날까지의 데이터로만 계산합니다.</div>')
    presets = {"코로나 충격": date(2020, 3, 19), "긴축 본격화": date(2022, 6, 15), "레고랜드 사태": date(2022, 10, 21),
               "고금리 정점": date(2023, 10, 31), "오늘": asof.date()}
    if "tm" not in st.session_state:
        st.session_state.tm = date(2022, 10, 21)
    pick = st.pills("바로가기", list(presets), selection_mode="single", key="tm_pill", label_visibility="collapsed")
    if pick and st.session_state.get("tm_last_pick") != pick:
        st.session_state.tm = presets[pick]
        st.session_state.tm_last_pick = pick
    first = sig.index[ap.VOL_REF_MIN_OBS].date()
    when = st.slider("날짜", min_value=first, max_value=asof.date(), key="tm", format="YYYY-MM-DD")
    d = sig.index[sig.index.searchsorted(pd.Timestamp(when), side="right") - 1]
    past = ap.plan_for(sig.loc[:d], float(aum), holdings, credit_now)
    pdg, pdu, pcv, pcr = past["diagnosis"], past["duration"], past["curve"], past["credit"]
    fwd = bt.loc[d:].iloc[1:61]
    y_now, y_after = sig.loc[d, "y_Y10Y"], sig["y_Y10Y"].loc[d:].iloc[min(60, len(sig.loc[d:]) - 1)]
    t1, t2 = st.columns([1.2, 1], gap="large")
    with t1:
        pk = VERDICT_KEY[pdg["verdict"]]
        html('<div class="kpi-grid tight">'
             + kpi(f"{d:%Y-%m-%d} 판정", f'<span style="display:inline-flex;align-items:center;gap:10px">'
                   f'<span class="dot" style="--c:{STATUS[pk]}"></span>{pdg["verdict"]}</span>',
                   f'금리 {pdg["rate_verdict"]} · 신용 {pdg["credit_verdict"]}'
                   + (f' · {pdg["driver"]} 주도' if pdg["driver"] != "없음" else ""))
             + kpi("권고 듀레이션", num(pdu["target"], 1, unit="년"), f'벤치마크 {pdu["benchmark"]:.1f}년', delay=.06)
             + kpi("커브 권고", f'<span style="font-size:1.25rem">{CURVE_ICON[pcv["view"]]} {pcv["name"]}</span>',
                   pcv["trade"], delay=.12)
             + '</div>')
        fwd_c = D["cb"].loc[d:].iloc[1:61]
        c_eff = float(fwd_c["excess"].sum()) if len(fwd_c) >= 20 else None
        html('<div class="kpi-grid tight">'
             + kpi("신용 스트레스", num(pcr["stress"], 2),
                   chip(STATE_KO[pcr["state"]], STATE_KEY[pcr["state"]]) + f' AA- {pcr["spread_bp"]:.0f}bp · CP−CD {pcr["cp_cd_bp"]:.0f}bp')
             + kpi("크레딧 권고", num(pcr["target_weight"] * 100, 0, unit="%"),
                   f'AA- 20일 {pcr["chg20_bp"]:+.0f}bp · 누적 z {pcr["spread_z"]:+.1f}', delay=.06)
             + kpi("이후 60일 크레딧 규칙 효과",
                   num(c_eff * 1e4, 1, sign=True, unit="bp") if c_eff is not None else "—",
                   (f"고정 20% 대비, 운용규모 {aum:,.0f}억이면 {c_eff * aum:+.2f}억" if c_eff is not None
                    else "20거래일 미경과"), delay=.12)
             + '</div>')
        if len(fwd) >= 20:
            r_bm, r_st = (1 + fwd["ret_bm"]).prod() - 1, (1 + fwd["ret_strategy"]).prod() - 1
            html('<div class="kpi-grid tight">'
                 + kpi(f"이후 {len(fwd)}일 10년 금리", num((y_after - y_now) * 100, 0, sign=True, unit="bp"),
                       f"{y_now:.2f}% → {y_after:.2f}%")
                 + kpi("벤치마크 수익", num(r_bm * 100, 2, sign=True, unit="%"), "3Y/10Y 50:50 고정", delay=.06)
                 + kpi("권고를 따랐다면", num(r_st * 100, 2, sign=True, unit="%"),
                       f"차이 {(r_st - r_bm) * 100:+.2f}%p", delay=.12)
                 + '</div>')
            if r_st - r_bm < -0.005 and y_after < y_now:
                st.caption("⚠️ 이후 금리가 크게 내린 구간입니다. 변동성이 가라앉을 때까지 듀레이션을 짧게 들고 있어 "
                           "반등을 덜 누렸습니다. 이 전략의 알려진 약점입니다 (⚠️ 한계 탭 참고).")
            elif r_st - r_bm > 0.005:
                st.caption("✅ 권고를 따랐다면 금리 변동에 따른 손실을 줄였을 구간입니다.")
        else:
            st.info("이 날짜 이후 아직 20거래일이 지나지 않아 결과를 볼 수 없습니다.")
    with t2:
        win = sig.loc[d - pd.Timedelta(days=200): d + pd.Timedelta(days=120)]
        fig = make_subplots(rows=2, cols=1, shared_xaxes=True, row_heights=[.55, .45], vertical_spacing=.08,
                            subplot_titles=("국고 10년 금리 (%)", "듀레이션 (년)"))
        fig.add_trace(go.Scatter(x=win.index, y=win["y_Y10Y"], line=dict(color=BLUE, width=2), name="국고 10년",
                                 hovertemplate="%{y:.3f}%"), 1, 1)
        bw = bt.loc[win.index[0]:win.index[-1]]
        fig.add_trace(go.Scatter(x=bw.index, y=bw["D_BM"], line=dict(color=GRAY, width=2, dash="dot"), name="벤치마크",
                                 hovertemplate="%{y:.2f}년"), 2, 1)
        fig.add_trace(go.Scatter(x=bw.index, y=bw["D_held"], line=dict(color=BLUE, width=2, shape="hv"), name="권고 보유",
                                 hovertemplate="%{y:.2f}년"), 2, 1)
        fig.add_vline(x=d, line_color=RED, line_width=2)
        fig.add_vrect(x0=d, x1=win.index[-1], fillcolor=rgba(BLUE, .06), line_width=0, layer="below")
        show(style_fig(fig, 420).update_layout(legend=dict(y=-0.12, yanchor="top")))

# ================================================================ 🏆 성과 검증
with tabs[4]:
    html('<div class="kpi-grid">'
         + kpi("연수익률", num(p_st["연수익률"] * 100, 2, unit="%"),
               f'벤치마크 {p_bm["연수익률"]:.2%} · ' + ("거의 동일" if abs(ret_gap) < 0.001 else f"{ret_gap * 100:+.2f}%p"))
         + kpi("변동성", num(p_st["연변동성"] * 100, 2, unit="%"),
               chip(f'{p_st["연변동성"] / p_bm["연변동성"] - 1:+.0%}', "good") + f' 벤치마크 {p_bm["연변동성"]:.2%}', delay=.08)
         + kpi("최대 손실폭", num(p_st["최대낙폭"] * 100, 1, unit="%"),
               chip(f'{(p_st["최대낙폭"] - p_bm["최대낙폭"]) * 100:+.1f}%p', "good") + f' 벤치마크 {p_bm["최대낙폭"]:.1%}', delay=.16)
         + kpi("2022년 금리 급등기", num(yr.loc[2022, "초과"] * 100, 1, sign=True, unit="%p"),
               f'{yr.loc[2022, "ret_strategy"]:+.1%} vs 벤치마크 {yr.loc[2022, "ret_bm"]:+.1%}', delay=.24)
         + '</div>')
    ret_txt = "수익은 거의 그대로 두고" if abs(ret_gap) < 0.001 else f"수익은 연 {ret_gap * 100:+.2f}%p 차이로"
    html(f'<div class="callout"><b>핵심: {ret_txt} 위험을 약 {1 - p_st["연변동성"] / p_bm["연변동성"]:.0%} 줄였습니다.</b> '
         f'위험 1단위당 수익 {p_bm["수익/위험"]:.2f} → {p_st["수익/위험"]:.2f}. 2017년부터 매일, 그날 정보로만 다음 날 포지션을 정하고 '
         '매매비용까지 뺀 결과입니다.</div>')

    st.markdown("#### ▶ 2022년 위기 재생")
    rs = bt.loc["2021-10-01":"2023-06-30"]
    nb, ns = rs["nav_bm"] / rs["nav_bm"].iloc[0], rs["nav_strategy"] / rs["nav_strategy"].iloc[0]
    idx = list(range(5, len(rs), 4)) + [len(rs)]
    fig = go.Figure([go.Scatter(x=rs.index, y=nb, name="벤치마크", line=dict(color=GRAY, width=2.5)),
                     go.Scatter(x=rs.index, y=ns, name="액션 플랜", line=dict(color=BLUE, width=3))])
    fig.frames = [go.Frame(data=[go.Scatter(x=rs.index[:k], y=nb.iloc[:k]), go.Scatter(x=rs.index[:k], y=ns.iloc[:k])],
                           name=str(k), layout=go.Layout(title_text=f"{rs.index[k - 1]:%Y-%m} · 격차 "
                                                                    f"{(ns.iloc[k - 1] - nb.iloc[k - 1]) * 100:+.1f}%p"))
                  for k in idx]
    fig.update_layout(title=dict(text=f"전체 기간 격차 {(ns.iloc[-1] - nb.iloc[-1]) * 100:+.1f}%p · 최저점 격차 "
                                      f"{(ns.min() - nb.min()) * 100:+.1f}%p — ▶ 재생으로 다시 보기", font=dict(size=14)),
                      **play_controls(45))
    fig.update_layout(legend=dict(x=1, xanchor="right"))
    fig.update_xaxes(range=[rs.index[0], rs.index[-1]])
    fig.update_yaxes(range=[min(nb.min(), ns.min()) * .99, max(nb.max(), ns.max()) * 1.01], title="2021-10 = 1")
    show(style_fig(fig, 420, hover="x unified").update_layout(margin=dict(b=80)))

    c1, c2 = st.columns(2, gap="large")
    with c1:
        st.markdown("#### 누적 성과")
        fig = go.Figure([go.Scatter(x=bt.index, y=bt["nav_bm"], name="벤치마크", line=dict(color=GRAY, width=2), hovertemplate="%{y:.3f}"),
                         go.Scatter(x=bt.index, y=bt["nav_strategy"], name="액션 플랜", line=dict(color=BLUE, width=2), hovertemplate="%{y:.3f}")])
        show(style_fig(fig, 300, ytitle="1원 투자 시"))
    with c2:
        st.markdown("#### 고점 대비 손실폭")
        fig = go.Figure()
        for col, name, color in [("nav_bm", "벤치마크", GRAY), ("nav_strategy", "액션 플랜", BLUE)]:
            ddn = bt[col] / bt[col].cummax() - 1
            fig.add_trace(go.Scatter(x=bt.index, y=ddn, name=name, line=dict(color=color, width=2), fill="tozeroy",
                                     fillcolor=rgba(color, .12), hovertemplate="%{y:.1%}"))
        show(style_fig(fig, 300, yfmt=".0%"))

    c3, c4 = st.columns(2, gap="large")
    with c3:
        st.markdown("#### 연도별 초과수익")
        fig = go.Figure(go.Bar(x=yr.index.astype(str), y=yr["초과"], marker_color=[BLUE if v >= 0 else RED for v in yr["초과"]],
                               text=[f"{v * 100:+.1f}" for v in yr["초과"]], textposition="outside",
                               hovertemplate="%{x}: %{y:+.2%}<extra></extra>"))
        show(style_fig(fig, 300, yfmt="+.0%", legend=False, hover="closest"))
    with c4:
        st.markdown("#### 왜 이 규칙인가 — 무엇이 무엇을 예측하나")
        cm = D["corr"]
        fig = go.Figure(go.Heatmap(z=cm.to_numpy(), x=["향후 금리 방향", "향후 변동성"], y=cm.index, zmin=-.8, zmax=.8,
                                   colorscale=[[0, RED], [.5, "#f0efec"], [1, BLUE]], showscale=False,
                                   text=[[f"{v:+.2f}" for v in row] for row in cm.to_numpy()], texttemplate="%{text}",
                                   textfont=dict(size=15), hovertemplate="%{y} → %{x}: %{z:+.2f}<extra></extra>"))
        fig.update_yaxes(autorange="reversed")
        show(style_fig(fig, 300, legend=False, hover="closest"))
        dir_max = D["corr"]["금리 방향"].abs().max()
        vol_rng = D["corr"]["변동성"].loc[["Composite 위기점수", "20일 변동성"]]
        st.caption(f"방향은 거의 예측 못 하고(±{dir_max:.2f} 이내), 변동성은 잘 예측합니다({vol_rng.min():.2f}~{vol_rng.max():.2f}) "
                   "→ 방향 베팅 대신 변동성에 맞춰 위험 조절.")

    st.markdown("#### 처음 규칙은 틀렸고, 검증으로 걸러냈습니다")
    rules = pd.DataFrame([p_bm, p_old, p_st], index=["벤치마크", "처음 규칙: 위기 점수로 방향 베팅", "최종 규칙: 변동성 맞춤"])
    fig = make_subplots(rows=1, cols=3, subplot_titles=("연수익률 ↑", "연변동성 ↓", "최대 손실폭 ↓"), horizontal_spacing=.08)
    colors = [GRAY, ORANGE, BLUE]
    for j, col in enumerate(["연수익률", "연변동성", "최대낙폭"]):
        vals = rules[col].abs() if col == "최대낙폭" else rules[col]
        fig.add_trace(go.Bar(x=["벤치마크", "처음", "최종"], y=vals, marker_color=colors, showlegend=False,
                             text=[f"{v:.1%}" if col == "최대낙폭" else f"{v:.2%}" for v in vals], textposition="outside",
                             hovertemplate="%{x}: %{y:.2%}<extra></extra>"), 1, j + 1)
        fig.update_yaxes(range=[0, vals.max() * 1.3], tickformat=".1%", nticks=5, row=1, col=j + 1)
    show(style_fig(fig, 290, legend=False, hover="closest"))
    st.caption("처음 규칙(주황)은 위기 점수가 정점일 때 이미 늦어서, 비싸게 팔고 늦게 사는 문제가 있었습니다.")

    st.markdown("### 💳 크레딧 비중 규칙 검증")
    cy = csum["crisis_years"]
    html('<div class="kpi-grid">'
         + kpi("크레딧 프리미엄 (회사채 100% 기준)", num(csum["credit_premium_ann"] * 100, 2, unit="%/년"),
               "AA- 3년 − 국고 3년, 듀레이션 중립 초과수익")
         + kpi("규칙 초과 기여 (포트 대비)", num(csum["excess_ann"] * 1e4, 1, sign=True, unit="bp/년"),
               f'고정 20% {csum["static_ann"]:.2%} → 규칙 {csum["rule_ann"]:.2%} · 1,000억이면 연 {csum["excess_ann"] * 1000:+.2f}억',
               delay=.08)
         + kpi("크레딧 슬리브 최대 손실폭", num(csum["rule_mdd"] * 100, 2, unit="%"),
               chip(f'{(csum["rule_mdd"] - csum["static_mdd"]) * 100:+.2f}%p', "good") + f' 고정 {csum["static_mdd"]:.2%}',
               delay=.16)
         + kpi("위기 해 초과 (%p)", f'<span style="font-size:1.35rem">{cy["2020"] * 100:+.2f} · {cy["2022"] * 100:+.2f} · '
               f'{cy["2023"] * 100:+.2f}</span>', "2020 코로나 · 2022 레고랜드 · 2023 회복", delay=.24)
         + '</div>')
    html(f'<div class="callout"><b>핵심: 스프레드가 넓어지는 동안은 줄이고(10%), 확대가 멈추면 넓은 스프레드를 담습니다(최대 40%).</b> '
         f'위기 때 손실을 덜 보고, 회복기에 캐리와 스프레드 축소를 더 취합니다. 평균 비중은 {csum["avg_weight"]:.0%}로 '
         '벤치마크와 비슷해서 크레딧 위험을 더 지지 않고 얻은 결과입니다. 절대 크기는 작습니다 — 크레딧은 수익원이라기보다 '
         '<b>위기 방어 장치</b>입니다.</div>')
    cc1, cc2 = st.columns([1.3, 1], gap="large")
    with cc1:
        cbd = D["cb"]
        fig = go.Figure()
        fig.add_trace(go.Scatter(x=cbd.index, y=cbd["excess"].cumsum() * 1e4, name="규칙 − 고정 20% 누적 (bp)",
                                 line=dict(color=ORANGE, width=2), fill="tozeroy", fillcolor=rgba(ORANGE, .12),
                                 hovertemplate="%{y:+.1f}bp"))
        shade(fig, D["ceps"])
        fig.update_layout(title=dict(text="크레딧 규칙의 누적 초과 기여 (운용규모 대비 bp) · 빨간 음영 = 신용 위기",
                                     font=dict(size=14)))
        show(style_fig(fig, 320, ytitle="bp", legend=False))
        pre = D["cb"]["excess"].loc[:"2019"].sum() * 1e4
        st.caption(f"평시에는 확대 판정이 자주 바뀌어 조금씩 손해를 봅니다(2017~2019 누적 {pre:+.0f}bp). "
                   "대신 위기(2020·2022)와 회복기(2021·2023)에 크게 만회합니다. 보험료를 내고 위기 때 보상받는 구조입니다.")
    with cc2:
        cm = D["ccorr"]
        fig = go.Figure(go.Heatmap(z=cm.to_numpy(), x=list(cm.columns), y=cm.index, zmin=-.6, zmax=.6,
                                   colorscale=[[0, RED], [.5, "#f0efec"], [1, BLUE]], showscale=False,
                                   text=[[f"{v:+.2f}" for v in row] for row in cm.to_numpy()], texttemplate="%{text}",
                                   textfont=dict(size=14), hovertemplate="%{y} → %{x}: %{z:+.2f}<extra></extra>"))
        fig.update_yaxes(autorange="reversed")
        fig.update_layout(title=dict(text="크레딧 신호의 예측력 (상관)", font=dict(size=14)))
        show(style_fig(fig, 320, legend=False, hover="closest"))
        st.caption("넓은 스프레드 → 이후 초과수익(밸류), 20일 확대 → 단기 추가 확대(모멘텀). 두 성질을 합친 것이 규칙입니다.")
    st.markdown("**강건성 점검 — 기준값을 바꿔도 결론이 같은가** (확대 문턱 × 밸류 계수 6개 조합)")
    g = D["cgrid"]
    st.dataframe(g.style.format({"초과(연 %p)": "{:+.3f}", "최대낙폭": "{:.2%}", "2020": "{:+.2f}", "2022": "{:+.2f}",
                                 "2023": "{:+.2f}"}), hide_index=True, width="stretch")
    n_all = int(((g[["2020", "2022", "2023"]] > 0).all(axis=1)).sum())
    st.caption(f"{len(g)}개 조합 중 {n_all}개가 세 위기 해 모두 고정 20%보다 나았고, 최대낙폭은 모두 고정({csum['static_mdd']:.2%})보다 "
               "작거나 같았습니다. 채택안(✅)은 가장 좋은 조합이 아니라 중간값(문턱 5bp, 계수 0.10)입니다.")

# ================================================================ ⚠️ 한계
with tabs[5]:
    items = [
        ("📉", "반등장에서는 뒤처집니다", f"2023년처럼 위기 직후 금리가 급락하면 변동성이 가라앉을 때까지 듀레이션이 짧아 상승을 덜 누립니다 "
                                  f"(2023년 {yr.loc[2023, '초과'] * 100:+.1f}%p). <b>수익을 키우는 도구가 아니라 손실을 관리하는 도구</b>입니다."),
        ("🧪", "백테스트는 미래를 보장하지 않습니다", "듀레이션 규칙은 그날까지의 데이터만 쓰지만, 규칙 형태 자체는 이 기간을 보고 골랐습니다. "
                                        "실전 성과는 더 나쁠 수 있습니다."),
        ("🧩", "단순화한 부분이 있습니다", "포트폴리오를 국고 4개 만기로만 표현했고 선물 듀레이션은 근사값입니다. 커브 권고의 백테스트 성과 기여는 "
                                  + (f"거의 없었습니다 (연 {D['curve_contrib'] * 100:+.2f}%p)." if abs(D["curve_contrib"]) < 0.001
                                     else f"연 {D['curve_contrib'] * 100:+.2f}%p입니다.")),
        ("🔭", "Kim Filter는 전체 기간으로 추정", "과거 차트의 확률은 당시 실시간으로 봤을 때보다 깔끔하게 보일 수 있습니다."),
        ("💳", "크레딧 분석의 한계", "부도 손실을 반영하지 않았고(AA- 등급은 역사적으로 부도가 드묾), 회사채를 AA- 3년 한 종목으로 "
                                  "대표했습니다. 큰 신용 위기는 표본에 두 번(2020·2022)뿐이고, 회사채는 국고채보다 유동성이 낮아 "
                                  "실제 매매비용이 더 클 수 있습니다. CP 활용 제안은 백테스트 근거가 아닌 보수적 판단 규칙입니다."),
        ("⚖️", "투자 자문이 아닙니다", "규칙 기반 참고안입니다. 실제 매매는 리스크 한도와 운용 전략에 맞춰 판단해야 합니다."),
    ]
    html('<div class="flow">' + "".join(
        f'<div class="step" style="animation-delay:{k * .06}s;background:rgba(128,128,128,.06)"><div class="a">{ic}</div>'
        f'<div class="q">{t}</div><div class="w" style="font-size:.88rem;opacity:.85">{b}</div></div>'
        for k, (ic, t, b) in enumerate(items)) + '</div>')
    with st.expander("🔧 사용한 데이터와 방법"):
        st.markdown(
            "- **데이터**: 한국은행 ECOS 817Y002 — 콜금리, 통안 91일, 국고 1·2·3·5·10·20·30년, 회사채 AA-, CD·CP 91일 "
            "(2017-01 ~ 현재), KOSPI·원/달러 (FinanceDataReader)\n"
            "- **모형 A**: 국고 10년 기준 4지표 가중합 (변동성 z, 60일 t-통계량, 60일 누적, 듀레이션 8.5 기반 1년 손실폭)\n"
            "- **모형 B**: 3상태 × 3요인 Markov-Switching 동적요인모형, Kim(1994) 필터 + EM 25회\n"
            "- **모형 C**: 신용 스트레스 = 0.3×AA- 스프레드 누적 z/3 + 0.3×AA- 20일 확대/20bp + 0.2×CP−CD 누적 z/3 "
            "+ 0.2×CP−CD 20일 확대/30bp (각 0~1). 0.4 이상 3일 = 신용 위기 구간\n"
            "- **액션 플랜**: 목표 듀레이션 = 벤치마크 × (누적 중앙 변동성 ÷ 20일 변동성), 0.3~1.2배, 0.5년 밴드 리밸런싱\n"
            "- **크레딧**: AA- 20일 확대 > +5bp이면 10%, 아니면 20% + 10%p × 누적 z(−1~+2) → 10~40%, 2%p 밴드, "
            "매매비용 2bp × 스프레드 듀레이션\n"
            "- **백테스트**: 이자수익 + 가격변화(−듀레이션 × 금리변화) − 매매비용(0.5bp × 듀레이션)")
    with st.expander("🗂️ 원자료 — 최근 30일 신호"):
        st.dataframe(sig[["y_Y10Y", "composite", "state", "P_High-Vol", "sigma20_bp", "D_target", "curve_view"]]
                     .tail(30).iloc[::-1], width="stretch")
