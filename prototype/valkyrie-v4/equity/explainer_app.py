"""주식 시장 진단 & 액션 플랜 - 설명용 Streamlit 앱 (채권판 bond/explainer_app.py의 주식 버전)

실행 (대시보드 폴더에서):
    .\\.venv\\Scripts\\streamlit run equity\\explainer_app.py --server.port 8512

숫자는 전부 data/00_RAW의 수집 결과에서 읽는다. 앱이 떠 있는 동안 pipeline/collect_naver.py를
10분마다 백그라운드에서 자동 실행하고, 새 수집본이 생기면 열린 화면도 30초 안에 알아서 다시 그린다.
(ECOS/FRED 쪽 bok_rate·ktb3·ust10은 pipeline/collect.py 담당 — 하루 한 번이면 충분)
"""
from __future__ import annotations

import sys
from datetime import date, datetime
from html import escape
from pathlib import Path

import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st
from plotly.subplots import make_subplots

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import equity_plan as ep  # noqa: E402

st.set_page_config(page_title="주식 시장 진단 & 액션 플랜", page_icon="📈", layout="wide",
                   initial_sidebar_state="collapsed")

# 색: 전략=blue, 비교군=gray, 상태=status palette(항상 라벨 동반), 가격 등락=한국식(상승 빨강 · 하락 파랑)
BLUE, ORANGE, AQUA, YELLOW, GRAY, RED = "#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#898781", "#e34948"
UP, DOWN, FLAT = "#e34948", "#2a78d6", "#898781"
STATUS = {"good": "#0ca30c", "warning": "#fab219", "serious": "#ec835a", "critical": "#d03b3b"}
STATE_KEY = {"NORMAL": "good", "WARNING": "warning", "HIGH": "serious", "SEVERE": "critical"}
STATE_KO = {"NORMAL": "안정", "WARNING": "주의", "HIGH": "경계", "SEVERE": "위기"}
REGIME_KEY = {"Low-Vol": "good", "Normal": "warning", "High-Vol": "critical"}
REGIME_KO = {"Low-Vol": "잔잔", "Normal": "보통", "High-Vol": "출렁"}
VERDICT_KEY = {"안정": "good", "주의": "warning", "경계": "serious", "위기": "critical"}
INVESTOR_KO = {"individual": "개인", "foreign": "외국인", "institution": "기관", "pension": "연기금",
               "fin_invest": "금융투자", "trust": "투신", "other_corp": "기타법인"}
INVESTOR_COLOR = {"individual": YELLOW, "foreign": BLUE, "institution": ORANGE, "pension": AQUA}


def rgba(hex_, a):
    h = hex_.lstrip("#")
    return f"rgba({int(h[0:2], 16)},{int(h[2:4], 16)},{int(h[4:6], 16)},{a})"


def tone(v):
    return FLAT if v is None or abs(v) < 1e-9 else (UP if v > 0 else DOWN)


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
  padding:28px 32px; border-radius:20px; color:#fff;
  background:linear-gradient(120deg,#3a0d18,#8e1f2f 45%,#c83a3a 70%,#3a0d18); background-size:200% 100%;
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
.chip {display:inline-flex; align-items:center; gap:5px; padding:1px 9px; border-radius:99px; font-size:.78rem;
  border:1px solid rgba(128,128,128,.3);}
.chip i {width:8px; height:8px; border-radius:50%; background:var(--c); display:inline-block;}
.spark {width:100%; height:38px; margin-top:6px;}
.spark polyline {stroke-dasharray:1; stroke-dashoffset:1; animation:draw 1.8s ease forwards;}
.flow {display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:12px; margin:8px 0 18px;}
.step {position:relative; border-radius:16px; padding:16px; border:1px solid rgba(128,128,128,.22);
  background:rgba(200,58,58,.07); animation:fadeUp .6s ease both; transition:transform .2s;}
.step:hover {transform:translateY(-3px);}
.step .n {font-size:.75rem; letter-spacing:.1em; opacity:.65;}
.step .q {font-weight:600; margin:2px 0 6px;}
.step .a {font-size:1.25rem; font-weight:700;}
.step .w {font-size:.8rem; opacity:.75; margin-top:4px;}
.callout {border-left:4px solid #c83a3a; padding:12px 16px; border-radius:8px; background:rgba(200,58,58,.08);
  animation:fadeUp .6s ease both; margin:6px 0 14px;}
.kpi-grid.tight {grid-template-columns:repeat(3,minmax(0,1fr));}
.legend-row {display:flex; gap:10px; flex-wrap:wrap; font-size:.8rem; margin:-4px 0 8px;}
/* 글로벌 마켓 보드 (팝업) */
.tiles {display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:10px; margin:4px 0 12px;}
.tile {border:1px solid rgba(128,128,128,.22); border-radius:12px; padding:10px 12px 4px; background:rgba(128,128,128,.05);
  animation:fadeUp .45s ease both;}
.tile .l {font-size:.78rem; opacity:.7;} .tile .p {font-size:1.25rem; font-weight:700; font-variant-numeric:tabular-nums;}
.tile .c {font-size:.82rem; font-weight:600; font-variant-numeric:tabular-nums;}
.tile .spark {height:30px; margin-top:2px;}
.secs {display:flex; flex-wrap:wrap; gap:6px; margin:2px 0 12px;}
.sec {padding:4px 10px; border-radius:8px; font-size:.8rem; font-weight:600; font-variant-numeric:tabular-nums;}
.grid {display:grid; grid-template-columns:repeat(auto-fill,minmax(112px,1fr)); gap:6px; margin-bottom:10px;}
.cell {border-radius:8px; padding:6px 8px 2px; border:1px solid rgba(128,128,128,.18);}
.cell b {font-size:.82rem;} .cell div {font-size:.78rem; font-variant-numeric:tabular-nums;}
.cell .spark {height:22px; margin-top:0;}
.feed {font-size:.86rem; line-height:1.35;} .feed div {padding:5px 0; border-bottom:1px solid rgba(128,128,128,.15);}
.feed .t {opacity:.6; font-variant-numeric:tabular-nums; margin-right:6px;}
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


def spark(values, color=BLUE, n=120, cls="spark"):
    v = pd.Series(values, dtype=float).dropna().to_numpy()[-n:]
    if len(v) < 2:
        return ""
    lo, hi = v.min(), v.max()
    pts = " ".join(f"{k / (len(v) - 1) * 200:.1f},{36 - (x - lo) / (hi - lo + 1e-9) * 32:.1f}" for k, x in enumerate(v))
    return (f'<svg class="{cls}" viewBox="0 0 200 40" preserveAspectRatio="none"><polyline pathLength="1" '
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
    if fig.layout.title.text and legend:
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


def play_controls(frame_ms=60):
    return dict(
        updatemenus=[dict(type="buttons", direction="left", x=0, y=-0.12, xanchor="left", yanchor="top", showactive=False,
                          pad=dict(r=8, t=4), buttons=[
                              dict(label="▶ 재생", method="animate",
                                   args=[None, dict(frame=dict(duration=frame_ms, redraw=False), fromcurrent=True,
                                                    transition=dict(duration=0))]),
                              dict(label="⏸ 정지", method="animate",
                                   args=[[None], dict(frame=dict(duration=0, redraw=False), mode="immediate")])])],
    )


def fmt_price(v):
    if v is None:
        return "—"
    return f"{v:,.0f}" if abs(v) >= 10000 else f"{v:,.2f}"


def pct(v):
    return "—" if v is None else f"{v:+.2f}%"


def hhmm(stamp):
    s = str(stamp or "")
    return f"{s[8:10]}:{s[10:12]}" if len(s) >= 12 and s[:8].isdigit() else s[11:16]


# ---------------------------------------------------------------- auto refresh
# 앱이 떠 있는 동안 백그라운드에서 collect_naver.py를 10분마다 돌린다. 매니페스트는 수집의 맨 마지막에
# 쓰이므로, 매니페스트 시각이 바뀌면 모든 파일이 새로 쓰인 뒤다 → 그때 캐시를 갈아끼우고 화면을 다시 그린다.
REFRESH_MIN = 10
MANIFEST = ep.NAVER / "_manifest.json"
COLLECTOR = HERE.parent / "pipeline" / "collect_naver.py"


def manifest_mtime():
    try:
        return MANIFEST.stat().st_mtime
    except OSError:
        return 0.0


@st.cache_resource
def collector():
    import subprocess
    import threading
    import time

    state = {"running": False, "last_ok": None, "last_error": None, "next": None}

    def loop():
        while True:
            due = manifest_mtime() + REFRESH_MIN * 60
            if time.time() >= due:
                state["running"] = True
                try:
                    r = subprocess.run([sys.executable, str(COLLECTOR)], cwd=HERE.parent, capture_output=True,
                                       timeout=600, env={**__import__("os").environ, "PYTHONIOENCODING": "utf-8"})
                    tail = r.stdout.decode("utf-8", "replace").strip().splitlines()[-1:] or [""]
                    state["last_ok" if r.returncode == 0 else "last_error"] = (time.time(), tail[0])
                except Exception as exc:  # 네트워크 장애 등: 이전 파일을 그대로 쓰고 다음 주기에 재시도
                    state["last_error"] = (time.time(), str(exc))
                finally:
                    state["running"] = False
                due = max(manifest_mtime(), time.time() - 1) + REFRESH_MIN * 60
            state["next"] = due
            time.sleep(20)

    threading.Thread(target=loop, daemon=True, name="naver-collector").start()
    return state


COLLECT = collector()


# ---------------------------------------------------------------- data
# stamp = 매니페스트 mtime → 새 수집본이면 캐시 키가 바뀐다 (인자 이름에 밑줄을 붙이면 해시에서 빠지니 금지)
@st.cache_data(show_spinner="수집 데이터 불러오는 중...", max_entries=2)
def load_data(stamp):
    js = {n: ep.load_json(n) for n in ["market_board", "us_sectors", "us_watchlist", "news", "world_news", "briefing",
                                        "calendar", "sectors", "large_caps", "policy_rates", "ipo_pipeline", "_manifest"]}
    ust10 = pd.read_csv(ep.RAW / "ust10.csv", index_col=0, parse_dates=True)["value"]
    return {"raw": ep.load(), "js": js, "ust10": ust10}


def perf_row(ret):
    p = ep.perf(ret)
    return {k: p[k] for k in ("연수익률", "연변동성", "수익/위험", "최대낙폭")}


@st.cache_data(show_spinner="진단 계산 중...", max_entries=12)
def load_model(stamp, market, risk):
    raw = load_data(stamp)["raw"]
    sig = ep.build_signals(raw, market, risk)
    bt = ep.backtest(sig)
    alts = {}
    for name, w in ep.alternatives(sig).items():
        b = ep.backtest(sig.assign(w_alt=w), "w_alt")
        alts[name] = {**perf_row(b["ret_strategy"]), "평균 비중": b["w_held"].mean(),
                      "지수보다 나은 해": int(((b["ret_strategy"] - b["ret_bm"]).groupby(b.index.year)
                                          .sum() > 0).sum())}
    fwd_ret = sig["close"].shift(-20) / sig["close"] - 1
    fwd_vol = sig["ret"].rolling(20).std().shift(-20)
    cols = {"composite": "종합 위험점수", "vol_ratio": "변동성 배율", "gap60": "60일선 괴리", "lev_pct": "빚투 비율 순위"}
    corr = pd.DataFrame({"향후 20일 수익률": [sig[c].corr(fwd_ret) for c in cols],
                         "향후 20일 변동성": [sig[c].corr(fwd_vol) for c in cols]}, index=list(cols.values()))
    return {"sig": sig, "bt": bt, "alts": alts, "corr": corr}


# 시장·위험 성향 선택: 위젯은 아래(히어로 밑)에 그리지만 값은 계산 전에 필요 → session_state에서 먼저 읽는다
MK = st.session_state.get("mkt") or "코스피"
RISK = st.session_state.get("risk") or "중립"
MARKET = {v: k for k, v in ep.MARKETS.items()}[MK]

STAMP = manifest_mtime()
DD = load_data(STAMP)
D = {**DD, **load_model(STAMP, MARKET, ep.RISK_LEVELS[RISK])}
sig, bt, J = D["sig"], D["bt"], D["js"]
asof = sig.index[-1]
collected = datetime.fromisoformat(J["_manifest"]["collectedAt"]).astimezone()


@st.fragment(run_every=30)
def refresh_watch():
    """30초마다 새 수집본이 있는지 보고, 있으면 페이지 전체를 새 데이터로 다시 그린다."""
    if manifest_mtime() != STAMP:
        st.rerun(scope="app")
    if COLLECT["running"]:
        st.caption("🔄 네이버 데이터 수집 중… (끝나면 화면이 자동으로 바뀝니다)")
    elif COLLECT["next"]:
        st.caption(f"🔄 자동 갱신 {REFRESH_MIN}분 간격 · 다음 수집 {datetime.fromtimestamp(COLLECT['next']):%H:%M}")
    if COLLECT["last_error"]:
        t, msg = COLLECT["last_error"]
        st.caption(f"⚠️ {datetime.fromtimestamp(t):%H:%M} 수집 실패 — 이전 데이터 유지 ({msg[:60]})")


with st.sidebar:
    st.header("⚙️ 설정")
    aum = st.number_input("주식 운용규모 (억 원)", min_value=10, max_value=100000, value=1000, step=100,
                          help="매매 금액과 선물 계약 수가 이 규모 기준으로 계산됩니다.")
    st.caption(f"데이터 기준일 **{asof:%Y-%m-%d}** · 수집 {collected:%m-%d %H:%M}")
    st.caption("출처: 네이버페이 증권(지수·수급·증시자금·시세), 한국은행 ECOS(기준금리·국고채)")

plan = ep.plan_for(sig, float(aum), risk=ep.RISK_LEVELS[RISK])
dg, ex, fu = plan["diagnosis"], plan["exposure"], plan["futures"]
p_bm, p_st = perf_row(bt["ret_bm"]), perf_row(bt["ret_strategy"])
yr = bt[["ret_bm", "ret_strategy"]].groupby(bt.index.year).apply(lambda g: (1 + g).prod() - 1)
yr["초과"] = yr["ret_strategy"] - yr["ret_bm"]
last = sig.iloc[-1]
flow = D["raw"][f"flow_{MARKET}"]
smart20 = float(flow[["foreign", "institution"]].iloc[-20:].sum().sum())

# 판정이 바뀌면 알림 (자동 갱신으로 새 데이터가 들어왔을 때 놓치지 않게)
_vkey = f"verdict_{MARKET}_{RISK}"
if st.session_state.get(_vkey) not in (None, dg["verdict"]):
    st.toast(f"{MK} 판정 변경: {st.session_state[_vkey]} → {dg['verdict']} (위험 점수 {dg['composite']:.2f})", icon="🚨")
st.session_state[_vkey] = dg["verdict"]


def one_liner():
    """오늘을 한 문장으로 — 숫자에서 규칙적으로 만든다 (생성형 요약 아님)."""
    parts = []
    vr = last["vol_ratio"]
    parts.append(f"변동성이 평소의 {vr:.1f}배" + ("로 출렁이고" if vr >= 1.25 else "로 잔잔하고" if vr < .85 else "로 보통이고"))
    if last["dd120"] <= -.05:
        parts.append(f"고점 대비 {last['dd120']:.0%} 내려와 있으며")
    fs = flow["foreign"].iloc[-20:].sum() / 1e4
    parts.append(f"외국인은 20일간 {fs:+.1f}조 {'순매수' if fs > 0 else '순매도'}")
    act = (f"주식 비중을 {ex['target']:.0%}로 {'줄이는' if ex['change'] < 0 else '늘리는'} 것을 권고합니다"
           if ex["rebalance"] else f"비중은 {ex['target']:.0%} 근처로 유지(밴드 ±{ep.REBALANCE_BAND:.0%}p 안)합니다")
    return f"{MK}: " + " ".join(parts) + f". → {act}."


# ---------------------------------------------------------------- 🌐 global board (popup)
def tile(item):
    c = tone(item.get("changeRate"))
    sp = [p for _, p in item.get("spark") or []] or [p for _, p in item.get("daily") or []][-60:]
    if not sp and item["code"] == "US10YT=RR":   # 네이버는 채권 차트를 안 줌 → FRED 일별 60일
        sp = D["ust10"].iloc[-60:].tolist()
    return (f'<div class="tile"><div class="l">{escape(item["label"])}</div><div class="p">{fmt_price(item.get("price"))}</div>'
            f'<div class="c" style="color:{c}">{pct(item.get("changeRate"))}</div>{spark(sp, c)}</div>')


def cell(item):
    c = tone(item.get("changeRate"))
    return (f'<div class="cell" style="background:{rgba(c, .08)}"><b>{escape(item["symbol"])}</b>'
            f'<div>{fmt_price(item.get("price"))}</div><div style="color:{c};font-weight:600">{pct(item.get("changeRate"))}</div>'
            f'{spark([p for _, p in item.get("spark") or []], c, cls="spark")}</div>')


@st.dialog("🌐 글로벌 마켓 보드", width="large")
def market_board():
    mb = J["market_board"]
    st.caption(f"스냅샷 {mb['asOf'][5:16].replace('T', ' ')} 수집 · 실시간 아님 · 상승 빨강 / 하락 파랑 · "
               "미국 시세는 직전 정규장 기준")
    html('<div class="tiles">' + "".join(tile(i) for i in mb["items"]) + '</div>')
    html("**미국 섹터** <span style='opacity:.6;font-size:.8rem'>SPDR 섹터 ETF 등락률</span>")
    html('<div class="secs">' + "".join(
        f'<span class="sec" style="background:{rgba(tone(s["changeRate"]), .16)};color:{tone(s["changeRate"])}">'
        f'{escape(s["label"])} {pct(s["changeRate"])}</span>' for s in J["us_sectors"]["items"]) + '</div>')
    html("**ETF · 빅테크**")
    html('<div class="grid">' + "".join(cell(i) for i in J["us_watchlist"]["items"]) + '</div>')
    a, b, c = st.columns([1, 1.25, 1], gap="medium")
    with a:
        st.markdown("##### 📌 중요 정리")
        kind = {"RATE_UP_TOP": "급등 1위", "RATE_DOWN_TOP": "급락 1위", "TRADING_AMOUNT_TOP": "거래대금 1위",
                "TRADING_VOLUME_TOP": "거래량 1위", "POPULAR_TOP": "인기 1위", "END_HIT_TOP": "조회 1위",
                "DISCUSSION_HIT_TOP": "토론 1위", "OPEN_TALK_JOIN_TOP": "오픈톡 1위"}
        html('<div class="feed">' + "".join(
            f'<div><span class="t">{kind.get(x["type"], x["type"])}</span><b>{escape(x["name"] or "")}</b> '
            f'<span style="color:{tone(x["changeRate"])};font-weight:600">{pct(x["changeRate"])}</span></div>'
            for x in J["briefing"]["items"]) + '</div>')
    with b:
        st.markdown("##### 📰 주요 뉴스")
        which = st.segmented_control("뉴스", ["국내", "해외"], default="국내", key="news_src",
                                     label_visibility="collapsed")
        items = (J["news"] if which != "해외" else J["world_news"])["items"][:8]
        html('<div class="feed">' + "".join(
            f'<div><span class="t">{hhmm(n["publishedAt"])}</span>'
            + (f'<a href="{n["url"]}" target="_blank">{escape(n["title"] or "")}</a>' if n.get("url") else escape(n["title"] or ""))
            + f' <span style="opacity:.55;font-size:.75rem">{escape(n.get("press") or "")}</span></div>' for n in items) + '</div>')
    with c:
        st.markdown("##### 🗓️ 주요 일정")
        today = date.today().isoformat()
        ev = [e for e in J["calendar"]["items"] if e["category"] == "economicIndicators" and e["date"] >= today][:9]
        flag = {"KOR": "<b>KR</b>", "USA": "<b>US</b>", "CHN": "<b>CN</b>", "JPN": "<b>JP</b>", "EUR": "<b>EU</b>"}
        html('<div class="feed">' + "".join(
            f'<div><span class="t">{e["date"][5:]} {escape((e["subtitle"] or "")[:5])}</span>{flag.get(e["nation"], "")} '
            f'{escape(e["title"])} <span style="opacity:.6;font-size:.75rem">이전 {escape(str(e["info"].get("이전") or e["info"].get("발표") or "—"))}</span></div>'
            for e in ev) + '</div>')


# ---------------------------------------------------------------- hero
vk = VERDICT_KEY[dg["verdict"]]
k_chg = float(D["raw"][MARKET]["close"].pct_change().iloc[-1] * 100)
mstat = next((i.get("marketStatus") for i in J["market_board"]["items"] if i["code"] == MARKET.upper()), None)
session = "장중 · 잠정값" if mstat == "OPEN" else "장 마감 · 종가" if mstat else "스냅샷"
html(f'<div class="hero"><div><div class="eyebrow">Korea Equity Risk Monitor · {MK} · {asof:%Y.%m.%d} {session}</div>'
     f'<h1>주식 시장 진단 &amp; 액션 플랜</h1>'
     f'<p>{MK}의 위험 신호를 <b>가격·변동성·빚투·증시자금</b>으로 매일 진단하고, 그 결과를 '
     f'<b>"주식 비중을 얼마로, 선물 몇 계약으로"</b>로 바꿔 드립니다.</p></div>'
     f'<div class="verdict"><small>오늘의 종합 판정 · 위험 성향 {RISK}</small><div class="big"><span class="dot" style="--c:{STATUS[vk]}">'
     f'</span>{dg["verdict"]}</div><small>위험 점수 {dg["composite"]:.2f} · 주된 원인: {dg["driver"]}</small></div></div>')

b1, b2, b3, b4 = st.columns([1.1, .9, 1.1, 2.4], vertical_alignment="center")
with b1:
    if st.button("🌐 글로벌 마켓 보드 열기", key="board", type="primary", width="stretch"):
        market_board()
with b2:
    st.segmented_control("진단 시장", list(ep.MARKETS.values()), default="코스피", key="mkt",
                         label_visibility="collapsed", help="어느 시장을 진단할지 (증시자금은 두 시장 공통)")
with b3:
    st.segmented_control("위험 성향", list(ep.RISK_LEVELS), default="중립", key="risk", label_visibility="collapsed",
                         help="목표 위험 = 평소 변동성 × 보수 0.8 / 중립 1.0 / 공격 1.25")
with b4:
    html(f'<div style="font-size:.9rem;opacity:.8">{MK} <b>{last["close"]:,.2f}</b> '
         f'<span style="color:{tone(k_chg)};font-weight:600">{k_chg:+.2f}%</span> · 데이터 수집 {collected:%H:%M}</div>')
    refresh_watch()
html(f'<div class="callout" style="margin-top:4px">📝 {escape(one_liner())}</div>')

tabs = st.tabs(["📊 한눈에 보기", "🔬 진단 원리", "🎯 액션 플랜", "💧 수급·자금", "🏭 업종·종목",
                "⏳ 타임머신", "🏆 성과 검증", "⚠️ 한계"])

# ================================================================ 📊 한눈에
with tabs[0]:
    html('<div class="kpi-grid">'
         + kpi("위험 점수 (0~1)", num(dg["composite"], 2),
               chip(STATE_KO[dg["state"]], STATE_KEY[dg["state"]]) + " 기준 0.45", spark(sig["composite"]), 0)
         + kpi(MK, num(last["close"], 0),
               f'60일 {num(last["ret60"] * 100, 1, sign=True)}% · 고점 대비 {last["dd120"]:.1%}', spark(sig["close"], UP), .08)
         + kpi("20일 변동성 (연율)", num(ex["vol20"] * 100, 1, unit="%"),
               f'평소 {ex["vol_ref"]:.1%}의 {last["vol_ratio"]:.1f}배', spark(sig["vol20"], ORANGE), .16)
         + kpi("권장 주식 비중", num(ex["target"] * 100, 0, unit="%"),
               f'현재 100% → {num(ex["change"] * 100, 0, sign=True)}%p', spark(sig["w_target"]), .24)
         + '</div>')

    g1, g2, g3 = st.columns([1, 1, 1.25], gap="medium")
    with g1:
        ref20 = float(sig["composite"].iloc[-21])
        fig = go.Figure(go.Indicator(
            mode="gauge+number+delta", value=dg["composite"], number=dict(valueformat=".2f", font=dict(size=44)),
            delta=dict(reference=ref20, valueformat="+.2f", increasing=dict(color=STATUS["critical"]),
                       decreasing=dict(color=STATUS["good"])),
            title=dict(text="위험 점수 (20일 전 대비)", font=dict(size=14)),
            gauge=dict(axis=dict(range=[0, 1], tickvals=[0, .3, .45, .6, 1]), bar=dict(color=BLUE, thickness=0.28),
                       steps=[dict(range=r, color=rgba(STATUS[k], .28)) for r, k in
                              [((0, .3), "good"), ((.3, .45), "warning"), ((.45, .6), "serious"), ((.6, 1), "critical")]],
                       threshold=dict(line=dict(color="#555", width=3), thickness=0.8, value=0.45))))
        show(style_fig(fig, 270, legend=False))
        html(f'<div class="legend-row">{chip("안정 &lt;0.30", "good")}{chip("주의", "warning")}'
             f'{chip("경계 ≥0.45", "serious")}{chip("위기 ≥0.60", "critical")}</div>')
    with g2:
        f20 = flow.iloc[-20:][["individual", "foreign", "institution"]].sum() / 1e4
        fig = go.Figure(go.Bar(x=[INVESTOR_KO[k] for k in f20.index], y=f20.values,
                               marker_color=[tone(v) for v in f20.values],
                               text=[f"{v:+.1f}조" for v in f20.values], textposition="outside",
                               hovertemplate="%{x}: %{y:+.2f}조 원<extra></extra>"))
        fig.update_layout(title=dict(text=f"{MK} 최근 20거래일 순매수 (조 원)", font=dict(size=14)))
        m = max(abs(f20).max() * 1.35, 1)
        show(style_fig(fig, 270, legend=False, hover="closest").update_yaxes(range=[-m, m]))
        html(f'<div class="legend-row">외국인+기관 합계 <b style="color:{tone(smart20)}">{smart20 / 1e4:+.1f}조</b>'
             '<span style="opacity:.7">· 순매수 빨강 / 순매도 파랑</span></div>')
    with g3:
        shock = st.slider(f"💥 {MK}가 이만큼 빠지면? (%)", -30, 20, -10, 1, key="shock",
                          help="주식 평가손익 1차 근사: 비중 × 지수 변화율 × 운용규모")
        loss_now = 1.0 * shock / 100 * aum
        loss_new = ex["target"] * shock / 100 * aum
        fig = go.Figure(go.Bar(y=["현재 (100%)", f"권고 ({ex['target']:.0%})"], x=[loss_now, loss_new], orientation="h",
                               marker_color=[GRAY, BLUE], text=[f"{loss_now:+,.1f}억", f"{loss_new:+,.1f}억"],
                               textposition="auto", hovertemplate="%{y}: %{x:+,.1f}억<extra></extra>"))
        m = max(abs(loss_now), abs(loss_new), 1) * 1.25
        fig.update_xaxes(range=[-m if shock < 0 else -m * .1, m * .1 if shock < 0 else m], title="평가손익 (억 원)")
        fig.update_layout(yaxis=dict(autorange="reversed"))
        show(style_fig(fig, 190, legend=False, hover="closest"))
        saved = abs(loss_now) - abs(loss_new)
        if shock < 0:
            html(f'<div class="callout">{MK} <b>{shock}%</b> 급락 시 손실이 <b>{saved:,.1f}억 원 줄어듭니다</b> '
                 f'(운용규모 {aum:,.0f}억 기준).</div>')
        elif shock > 0:
            html(f'<div class="callout">반대로 {MK}가 {shock}% 오르면 이익도 <b>{saved:,.1f}억 원 적습니다</b>. '
                 '위험을 줄이는 대가입니다.</div>')

    st.markdown(f"#### 🚦 {MK} 위험 신호등")
    states = sig["state"].map({"NORMAL": 0, "WARNING": 1, "HIGH": 2, "SEVERE": 3})
    fig = make_subplots(rows=2, cols=1, shared_xaxes=True, row_heights=[.8, .2], vertical_spacing=.04)
    fig.add_trace(go.Scatter(x=sig.index, y=sig["close"], name=MK, line=dict(color=BLUE, width=2),
                             hovertemplate="%{y:,.2f}"), 1, 1)
    cs = [[0, STATUS["good"]], [1 / 6, STATUS["good"]], [1 / 6, STATUS["warning"]], [.5, STATUS["warning"]],
          [.5, STATUS["serious"]], [5 / 6, STATUS["serious"]], [5 / 6, STATUS["critical"]], [1, STATUS["critical"]]]
    fig.add_trace(go.Heatmap(x=sig.index, y=["신호"], z=[states.to_numpy()], zmin=0, zmax=3, colorscale=cs,
                             showscale=False, customdata=[sig["composite"].to_numpy()], name="신호등",
                             text=[sig["state"].map(STATE_KO).to_numpy()],
                             hovertemplate="%{x|%Y-%m-%d} · %{text} (%{customdata:.2f})<extra></extra>"), 2, 1)
    fig.update_xaxes(rangeselector=dict(buttons=[dict(count=6, label="6개월", step="month", stepmode="backward"),
                                                 dict(count=1, label="1년", step="year", stepmode="backward"),
                                                 dict(step="all", label="전체")], x=0, y=1.08), row=1, col=1)
    fig.update_yaxes(title="지수", row=1, col=1)
    fig.update_yaxes(showticklabels=False, row=2, col=1)
    show(style_fig(fig, 400, legend=False))
    html(f'<div class="legend-row">{chip("안정", "good")}{chip("주의", "warning")}{chip("경계", "serious")}'
         f'{chip("위기", "critical")}<span style="opacity:.7">· 버튼으로 기간 전환, 드래그로 확대</span></div>')

# ================================================================ 🔬 진단 원리
with tabs[1]:
    html('<div class="callout">건강검진처럼 <b>서로 다른 5가지 수치</b>를 합산합니다. 가격만 보지 않고 '
         '<b>빚투(신용잔고)와 대기자금(고객예탁금)</b>까지 보는 이유는, 가격이 꺾이기 전에 돈의 흐름이 먼저 바뀌는 경우가 많기 때문입니다.</div>')
    a, b = st.columns(2, gap="large")
    with a:
        st.markdown("### 🩺 오늘의 위험 점수 분해")
        raw_txt = {"score_vol": f"20일 {last['vol20']:.1%} (평소의 {last['vol_ratio']:.1f}배)",
                   "score_dd": f"120일 고점 대비 {last['dd120']:.1%}", "score_trend": f"60일선 대비 {last['gap60']:+.1%}",
                   "score_lev": f"신용/예탁금 {last['lev']:.1%} (역대 {last['lev_pct']:.0%} 위치)",
                   "score_liq": f"예탁금 20일 {last['dep_chg20']:+.1%}"}
        desc = {"score_vol": "평소보다 얼마나 출렁이나", "score_dd": "최근 고점에서 얼마나 내려왔나",
                "score_trend": "추세선 아래로 내려갔나", "score_lev": "빚내서 산 돈이 대기자금에 비해 많은가",
                "score_liq": "대기자금이 빠져나가고 있나"}
        keys = list(ep.WEIGHTS)
        fig = go.Figure()
        fig.add_trace(go.Bar(y=[ep.LABEL[k] for k in keys], x=[ep.WEIGHTS[k] for k in keys], orientation="h",
                             marker_color="rgba(128,128,128,.18)", name="만점 (가중치)", hoverinfo="skip"))
        fig.add_trace(go.Bar(y=[ep.LABEL[k] for k in keys], x=[dg["contrib"][k] for k in keys], orientation="h",
                             marker_color=BLUE, name="오늘 기여", text=[f"{dg['contrib'][k]:.3f}" for k in keys],
                             textposition="outside", customdata=np.stack([[raw_txt[k] for k in keys], [desc[k] for k in keys]], axis=1),
                             hovertemplate="%{y}: %{x:.3f}<br>%{customdata[1]}<br>원값 %{customdata[0]}<extra></extra>"))
        fig.update_layout(barmode="overlay", yaxis=dict(autorange="reversed"),
                          title=dict(text=f"오늘 합계 {dg['composite']:.3f}", font=dict(size=14)))
        fig.update_xaxes(range=[0, .31])
        show(style_fig(fig, 300, hover="closest"))
        html('<div class="feed">' + "".join(f'<div><b>{ep.LABEL[k]}</b> — {raw_txt[k]}</div>' for k in keys) + '</div>')
    with b:
        st.markdown("### 🌊 변동성 국면")
        st.markdown("20일 변동성을 **그날까지의 평소 변동성(누적 중앙값)** 과 비교해 **잔잔 / 보통 / 출렁** 으로 나눕니다. "
                    "이 배율이 곧 비중 조절의 기준이 됩니다.")
        abs_ret = sig["ret"].abs()
        storm = abs_ret[sig["regime"] == "High-Vol"].mean() / abs_ret[sig["regime"] == "Low-Vol"].mean()
        fig = go.Figure()
        fig.add_trace(go.Scatter(x=sig.index, y=sig["vol20"], name="20일 변동성", line=dict(color=ORANGE, width=2),
                                 hovertemplate="%{y:.1%}"))
        fig.add_trace(go.Scatter(x=sig.index, y=sig["vol_ref"], name="평소 (누적 중앙값)",
                                 line=dict(color=GRAY, width=2, dash="dot"), hovertemplate="%{y:.1%}"))
        for reg_, k in [("High-Vol", "critical"), ("Low-Vol", "good")]:
            on = (sig["regime"] == reg_).astype(int)
            chg = on.diff().fillna(on.iloc[0])
            for s0, e0 in zip(sig.index[chg == 1], list(sig.index[chg == -1]) + [sig.index[-1]]):
                fig.add_vrect(x0=s0, x1=e0, fillcolor=STATUS[k], opacity=.10, line_width=0, layer="below")
        fig.update_layout(title=dict(text=f"출렁인 날의 하루 변동폭 = 잔잔한 날의 {storm:.1f}배", font=dict(size=14)))
        show(style_fig(fig, 300, yfmt=".0%"))
        html(f'<div class="legend-row">{chip("잔잔 구간", "good")}{chip("출렁 구간", "critical")}</div>')

    st.markdown("#### 위험 점수는 무엇으로 이루어져 왔나")
    fig = go.Figure()
    for k, color in zip(ep.WEIGHTS, [ORANGE, RED, YELLOW, BLUE, AQUA]):
        fig.add_trace(go.Scatter(x=sig.index, y=ep.WEIGHTS[k] * sig[k], name=ep.LABEL[k], stackgroup="c",
                                 line=dict(width=.5, color=color), fillcolor=rgba(color, .75), hovertemplate="%{y:.3f}"))
    fig.add_hline(y=.45, line_dash="dash", line_color=GRAY, annotation_text="경계 기준 0.45", annotation_position="top left")
    show(style_fig(fig, 320).update_yaxes(range=[0, 1]))

# ================================================================ 🎯 액션 플랜
with tabs[2]:
    sectors = pd.DataFrame(J["sectors"]["items"])
    lead = sectors.sort_values("changeRate", ascending=False).iloc[0]
    html('<div class="flow">'
         f'<div class="step"><div class="n">STEP 1 · 진단</div><div class="q">지금 위험한가?</div>'
         f'<div class="a">{dg["verdict"]}</div><div class="w">위험 점수 {dg["composite"]:.2f} · 변동성 {REGIME_KO[dg["regime"]]}</div></div>'
         f'<div class="step" style="animation-delay:.08s"><div class="n">STEP 2 · 크기</div><div class="q">얼마나 줄이나?</div>'
         f'<div class="a">100% → {ex["target"]:.0%}</div><div class="w">변동성 {last["vol_ratio"]:.1f}배 → 위험을 평소 수준으로</div></div>'
         f'<div class="step" style="animation-delay:.16s"><div class="n">STEP 3 · 흐름</div><div class="q">돈은 어디로?</div>'
         f'<div class="a">외국인+기관 {smart20 / 1e4:+.1f}조</div><div class="w">20일 누적 · 오늘 강한 업종 {escape(lead["name"])} {lead["changeRate"]:+.1f}%</div></div>'
         f'<div class="step" style="animation-delay:.24s"><div class="n">STEP 4 · 실행</div><div class="q">어떻게 주문하나?</div>'
         f'<div class="a">현물 {abs(ex["trade_eok"]):,.0f}억 {"매도" if ex["trade_eok"] < 0 else "매수"}</div>'
         f'<div class="w">또는 {fu["contract"]} {abs(fu["contracts"]):,.0f}계약 {fu["side"]}</div></div>'
         '</div>')

    l, r = st.columns([1.1, 1], gap="large")
    with l:
        st.markdown("#### 🧭 위험 나침반 — 최근 60일 궤적")
        trail = sig[["gap60", "vol_ratio"]].dropna().iloc[-60:]
        lim_x = max(.08, trail["gap60"].abs().max() * 1.2)
        lo_y, hi_y = min(.5, trail["vol_ratio"].min() * .9), max(2.0, trail["vol_ratio"].max() * 1.1)
        fig = go.Figure()
        for (x0, x1, y0, y1, lab, sx, sy) in [
                (0, lim_x, 1, hi_y, "상승 과열 · 출렁 — 비중 축소, 추격 금지", 1, 1),
                (-lim_x, 0, 1, hi_y, "하락 충격 · 출렁 — 비중 축소, 선물 헤지", -1, 1),
                (-lim_x, 0, lo_y, 1, "조용한 조정 — 분할 매수 후보", -1, -1),
                (0, lim_x, lo_y, 1, "잔잔한 상승 — 비중 확대", 1, -1)]:
            on = (np.sign(last["gap60"]) == sx) and ((last["vol_ratio"] >= 1) == (sy > 0))
            fig.add_shape(type="rect", x0=x0, x1=x1, y0=y0, y1=y1, line_width=0, layer="below",
                          fillcolor=rgba(BLUE, .16 if on else .04))
            fig.add_annotation(x=sx * lim_x * .98, y=hi_y * .97 if sy > 0 else lo_y * 1.03, text=("<b>" + lab + "</b>") if on else lab,
                               showarrow=False, xanchor="right" if sx > 0 else "left",
                               yanchor="top" if sy > 0 else "bottom", font=dict(size=12), opacity=1 if on else .6)
        fig.add_trace(go.Scatter(x=trail["gap60"], y=trail["vol_ratio"], mode="lines+markers", name="궤적",
                                 line=dict(color=rgba(BLUE, .45), width=2),
                                 marker=dict(size=7, color=np.linspace(.15, 1, len(trail)),
                                             colorscale=[[0, "#cde2fb"], [1, "#104281"]]),
                                 customdata=trail.index.strftime("%Y-%m-%d"),
                                 hovertemplate="%{customdata}<br>60일선 %{x:+.1%} · 변동성 %{y:.2f}배<extra></extra>"))
        fig.add_trace(go.Scatter(x=[trail["gap60"].iloc[-1]], y=[trail["vol_ratio"].iloc[-1]], mode="markers+text",
                                 marker=dict(size=18, color=BLUE, line=dict(color="white", width=3)), text=["오늘"],
                                 textposition="top center", name="오늘", hoverinfo="skip"))
        fig.frames = [go.Frame(data=[go.Scatter(x=trail["gap60"].iloc[:k], y=trail["vol_ratio"].iloc[:k]),
                                     go.Scatter(x=[trail["gap60"].iloc[k - 1]], y=[trail["vol_ratio"].iloc[k - 1]])],
                               name=str(k)) for k in range(2, len(trail) + 1)]
        fig.update_layout(**play_controls(90))
        fig.update_xaxes(range=[-lim_x, lim_x], title="60일 이동평균 대비 괴리 →  위면 상승 추세", tickformat="+.0%", zeroline=True)
        fig.update_yaxes(range=[lo_y, hi_y], title="변동성 배율 (평소=1)")
        fig.add_hline(y=1, line_color="rgba(128,128,128,.5)")
        show(style_fig(fig, 470, legend=False, hover="closest").update_layout(margin=dict(b=80)))
    with r:
        st.markdown("#### 🔁 주문서")
        fig = go.Figure(go.Bar(y=[f"주식 ({MK})", "현금 (기준금리)"], x=[ex["trade_eok"], -ex["trade_eok"]], orientation="h",
                               marker_color=[DOWN if ex["trade_eok"] < 0 else UP, UP if ex["trade_eok"] < 0 else DOWN],
                               text=[("매도 " if ex["trade_eok"] < 0 else "매수 ") + f"{abs(ex['trade_eok']):,.0f}억",
                                     ("증가 " if ex["trade_eok"] < 0 else "감소 ") + f"{abs(ex['trade_eok']):,.0f}억"],
                               textposition="auto", hovertemplate="%{y}: %{x:+,.0f}억<extra></extra>"))
        fig.add_vline(x=0, line_color="rgba(128,128,128,.6)")
        fig.update_layout(yaxis=dict(autorange="reversed"), title=dict(text="A. 현물 재배분 (억 원)", font=dict(size=14)))
        show(style_fig(fig, 220, legend=False, hover="closest"))
        html(kpi(f"B. 선물 헤지 — {fu['contract']}", num(abs(fu["contracts"]), 0, unit=f"계약 {fu['side']}"),
                 f"코스피200 {fu['k200']:,.2f} × 250,000원 = 계약당 {fu['notional_per_contract_eok']:.2f}억 · 보유 주식은 그대로"
                 + (" · ⚠️ 코스닥 노출을 코스피200 선물로 근사 (베타 차이만큼 헤지 오차)" if MARKET == "kosdaq" else "")))
        html(f'<div class="callout">💰 대기 현금은 기준금리 <b>{sig["cash_daily"].iloc[-1] * 252 * 100:.2f}%</b> 로 운용한다고 가정합니다 '
             f'(국고 3년 {last["ktb3"]:.2f}%).</div>')

    st.markdown("#### 🎚️ 트리거 시뮬레이터 — 변동성이 바뀌면 비중은?")
    ref = ex["vol_ref"] * 100
    vol = st.slider(f"{MK} 20일 변동성 (연율 %)", 8.0, 60.0, float(round(ex["vol20"] * 100, 1)), 0.1, format="%.1f", key="volsim")
    xs = np.linspace(8, 60, 200)
    rk = ep.RISK_LEVELS[RISK]
    ys = np.clip(ref * rk / xs, ep.MULT_MIN, ep.MULT_MAX)
    tgt = float(np.clip(ref * rk / vol, ep.MULT_MIN, ep.MULT_MAX))
    s1, s2 = st.columns([3, 1])
    with s1:
        fig = go.Figure()
        fig.add_trace(go.Scatter(x=xs, y=ys, name="목표 비중", line=dict(color=BLUE, width=3),
                                 hovertemplate="변동성 %{x:.1f}% → %{y:.0%}<extra></extra>"))
        fig.add_hline(y=1, line_dash="dot", line_color=GRAY, annotation_text="벤치마크 100%")
        vmax = float(sig["vol20"].max() * 100)
        for xv, lab in [(ref, "평소"), (ex["vol20"] * 100, "오늘"), (vmax, "기간 최고")]:
            fig.add_vline(x=xv, line_dash="dash", line_color="rgba(128,128,128,.5)", annotation_text=lab,
                          annotation_position="top")
        fig.add_trace(go.Scatter(x=[vol], y=[tgt], mode="markers", marker=dict(size=18, color=BLUE, line=dict(color="white", width=3)),
                                 name="선택", hoverinfo="skip"))
        fig.update_xaxes(title="변동성 (연율 %)")
        fig.update_yaxes(title="주식 비중", tickformat=".0%", range=[0, 1.35])
        show(style_fig(fig, 300, legend=False, hover="closest"))
    with s2:
        html(kpi("이 변동성이면", num(tgt * 100, 0, unit="%"), f"벤치마크 대비 {(tgt - 1) * 100:+.0f}%p"))
        c_ = (tgt - 1) * aum * 1e8 / (fu["k200"] * ep.K200_MULTIPLIER)
        html(kpi("선물로 맞추면", num(abs(c_), 0, unit="계약"), "매도" if c_ < 0 else "매수", delay=.08))
    with st.expander("📜 규칙 원문"):
        for k_, v_ in plan["triggers"].items():
            st.markdown(f"- **{k_}** — {v_}")

# ================================================================ 💧 수급·자금
with tabs[3]:
    mkt = st.segmented_control("시장", ["코스피", "코스닥"], default=MK, key=f"flow_mkt_{MK}")
    fl = D["raw"]["flow_kosdaq" if mkt == "코스닥" else "flow_kospi"]
    px_m = D["raw"]["kosdaq" if mkt == "코스닥" else "kospi"]["close"].reindex(fl.index)
    tot = fl[["individual", "foreign", "institution", "pension"]].sum() / 1e4
    html('<div class="kpi-grid">' + "".join(
        kpi(f"{INVESTOR_KO[k]} 누적 ({len(fl)}일)", num(float(v), 1, sign=True, unit="조"),
            f'최근 20일 {fl[k].iloc[-20:].sum() / 1e4:+.1f}조', spark(fl[k].cumsum(), tone(float(v))), i * .06)
        for i, (k, v) in enumerate(tot.items())) + '</div>')
    fig = make_subplots(specs=[[{"secondary_y": True}]])
    for k in ["individual", "foreign", "institution", "pension"]:
        fig.add_trace(go.Scatter(x=fl.index, y=fl[k].cumsum() / 1e4, name=INVESTOR_KO[k],
                                 line=dict(color=INVESTOR_COLOR[k], width=2.4 if k == "foreign" else 1.8),
                                 hovertemplate="%{y:+.1f}조"), secondary_y=False)
    fig.add_trace(go.Scatter(x=px_m.index, y=px_m, name=mkt, line=dict(color=GRAY, width=1.5, dash="dot"),
                             hovertemplate="%{y:,.2f}"), secondary_y=True)
    fig.update_yaxes(title="누적 순매수 (조 원)", secondary_y=False)
    fig.update_yaxes(title=mkt, showgrid=False, secondary_y=True)
    fig.update_layout(title=dict(text=f"{mkt} 투자자별 누적 순매수 — 네이버 제공 최근 {len(fl)}거래일", font=dict(size=14)))
    show(style_fig(fig, 380))
    corr_f = fl["foreign"].corr(px_m.pct_change() * 100)
    html(f'<div class="callout">하루 외국인 순매수와 {mkt} 등락률의 상관계수는 <b>{corr_f:+.2f}</b>입니다. '
         '외국인이 사는 날 지수가 오르는 경향이 있지만 인과가 아니라 동행이라서 <b>예측 지표로는 쓰지 않습니다</b> '
         '(위험 점수에서 빠진 이유).</div>')

    st.markdown("#### 🏦 증시 대기자금과 빚투")
    liq = D["raw"]["liq"].rolling(5, min_periods=1).median()   # 하루짜리 집계 튐 제거 (표시용)
    c1, c2 = st.columns(2, gap="large")
    with c1:
        fig = make_subplots(specs=[[{"secondary_y": True}]])
        fig.add_trace(go.Scatter(x=liq.index, y=liq["customer_deposit"] / 1e4, name="고객예탁금", line=dict(color=BLUE, width=2),
                                 fill="tozeroy", fillcolor=rgba(BLUE, .08), hovertemplate="%{y:,.1f}조"), secondary_y=False)
        fig.add_trace(go.Scatter(x=liq.index, y=liq["credit_loan"] / 1e4, name="신용잔고", line=dict(color=ORANGE, width=2),
                                 hovertemplate="%{y:,.1f}조"), secondary_y=False)
        fig.add_trace(go.Scatter(x=liq.index, y=liq["credit_loan"] / liq["customer_deposit"], name="신용/예탁금",
                                 line=dict(color=GRAY, width=1.5, dash="dot"), hovertemplate="%{y:.1%}"), secondary_y=True)
        fig.update_yaxes(title="조 원", secondary_y=False)
        fig.update_yaxes(tickformat=".0%", showgrid=False, secondary_y=True)
        fig.update_layout(title=dict(text=f"예탁금 {liq['customer_deposit'].iloc[-1] / 1e4:,.1f}조 · 신용 {liq['credit_loan'].iloc[-1] / 1e4:,.1f}조",
                                     font=dict(size=14)))
        show(style_fig(fig, 340))
    with c2:
        base = liq.iloc[0]
        fig = make_subplots(specs=[[{"secondary_y": True}]])
        for k, name, color in [("fund_equity", "주식형 펀드", RED), ("fund_bond", "채권형 펀드", BLUE), ("fund_mixed", "혼합형", GRAY)]:
            fig.add_trace(go.Scatter(x=liq.index, y=liq[k] / base[k] * 100, name=name, line=dict(color=color, width=2),
                                     hovertemplate="%{y:.0f}"), secondary_y=False)
        k3 = D["raw"]["ktb3"].loc[liq.index[0]:]
        fig.add_trace(go.Scatter(x=k3.index, y=k3, name="국고 3년 (%)", line=dict(color=YELLOW, width=1.5, dash="dot"),
                                 hovertemplate="%{y:.2f}%"), secondary_y=True)
        fig.update_yaxes(title=f"{liq.index[0]:%Y-%m} = 100", secondary_y=False)
        fig.update_yaxes(title="금리 %", showgrid=False, secondary_y=True)
        fig.update_layout(title=dict(text="주식형 vs 채권형 펀드 잔고와 금리 — 금리→주식 자금 이동", font=dict(size=14)))
        show(style_fig(fig, 340))
    eq_g, bd_g = liq["fund_equity"].iloc[-1] / base["fund_equity"] - 1, liq["fund_bond"].iloc[-1] / base["fund_bond"] - 1
    html(f'<div class="callout">{liq.index[0]:%Y년 %m월} 이후 주식형 펀드 잔고 <b>{eq_g:+.0%}</b>, 채권형 <b>{bd_g:+.0%}</b>. '
         'VALKYRIE 체인의 <b>RATES → EQUITY</b> 연결을 돈의 흐름으로 확인하는 패널입니다.</div>')

    st.markdown("#### 🌍 주요국 기준금리")
    pr = pd.DataFrame(J["policy_rates"]["items"]).sort_values("rate")
    hl = pr["name"].isin(["한국은행", "미국연방준비은행"])
    fig = go.Figure(go.Bar(y=pr["name"], x=pr["rate"], orientation="h",
                           marker_color=[BLUE if h else "rgba(128,128,128,.45)" for h in hl],
                           text=[f"{v:.2f}%" for v in pr["rate"]], textposition="outside",
                           customdata=pr["decidedAt"].str[:10],
                           hovertemplate="%{y}: %{x:.2f}%<br>최근 결정 %{customdata}<extra></extra>"))
    fig.update_xaxes(title="기준금리 (%)", range=[0, pr["rate"].max() * 1.12])
    show(style_fig(fig, 460, legend=False, hover="closest"))

# ================================================================ 🏭 업종·종목
with tabs[4]:
    st.markdown(f"#### 🗺️ 업종 지도 — 크기 = 시가총액, 색 = 오늘 등락률 <span style='font-size:.8rem;opacity:.6'>"
                f"({J['sectors']['asOf'][8:10]}:{J['sectors']['asOf'][10:12]} 기준)</span>", unsafe_allow_html=True)
    sec = pd.DataFrame(J["sectors"]["items"]).dropna(subset=["marketCap"])
    sec["상승비율"] = sec["rise"] / sec["total"]
    m = max(sec["changeRate"].abs().quantile(.95), 1)
    fig = px.treemap(sec, path=[px.Constant("전체 업종"), "name"], values="marketCap", color="changeRate",
                     color_continuous_scale=[[0, DOWN], [.5, "#f0efec"], [1, UP]], range_color=[-m, m],
                     custom_data=["changeRate", "change3d", "상승비율"])
    fig.update_traces(texttemplate="<b>%{label}</b><br>%{customdata[0]:+.2f}%", marker_line_width=1,
                      hovertemplate="<b>%{label}</b><br>오늘 %{customdata[0]:+.2f}% · 3일 %{customdata[1]:+.2f}%"
                                    "<br>상승 종목 비율 %{customdata[2]:.0%}<extra></extra>")
    fig.update_layout(coloraxis_colorbar=dict(title="%", thickness=10))
    show(style_fig(fig, 480, legend=False, hover="closest").update_layout(margin=dict(t=10)))
    breadth = sec["rise"].sum() / (sec["rise"].sum() + sec["fall"].sum())
    top3 = sec.nlargest(3, "changeRate")["name"].tolist()
    bot3 = sec.nsmallest(3, "changeRate")["name"].tolist()
    html(f'<div class="callout">전체 업종 상승 종목 비율 <b>{breadth:.0%}</b> · 강한 업종 <b>{", ".join(top3)}</b> · '
         f'약한 업종 <b>{", ".join(bot3)}</b>. 장중 수집값이라 종가와 다를 수 있습니다.</div>')

    st.markdown("#### 💎 시가총액 상위 50 — 싼가(PBR) vs 잘 버나(ROE)")
    lc = pd.DataFrame(J["large_caps"]["items"]).dropna(subset=["pbr", "roe"])
    lc["시총(조)"] = lc["marketCap"] / 1e12
    fig = px.scatter(lc, x="pbr", y="roe", size="시총(조)", color="changeRate", text="name", size_max=46,
                     color_continuous_scale=[[0, DOWN], [.5, "#d9d8d4"], [1, UP]], range_color=[-5, 5], log_x=True,
                     custom_data=["name", "per", "foreignRatio", "시총(조)", "changeRate"])
    fig.update_traces(textposition="top center", textfont_size=10, marker=dict(line=dict(width=1, color="white")),
                      hovertemplate="<b>%{customdata[0]}</b><br>PBR %{x:.2f} · ROE %{y:.1f}% · PER %{customdata[1]:.1f}"
                                    "<br>외국인 %{customdata[2]:.1f}% · 시총 %{customdata[3]:,.0f}조 · 오늘 %{customdata[4]:+.2f}%<extra></extra>")
    fig.update_xaxes(title="PBR (배, 로그) → 비쌈", tickvals=[.3, .5, 1, 2, 3, 5, 10, 20, 40], ticktext=[
        ".3", ".5", "1", "2", "3", "5", "10", "20", "40"])
    fig.update_yaxes(title="ROE (%) → 잘 범")
    fig.update_layout(coloraxis_colorbar=dict(title="오늘 %", thickness=10))
    show(style_fig(fig, 520, legend=False, hover="closest"))
    with st.expander("📋 시가총액 상위 50 표"):
        t = lc[["name", "market", "price", "changeRate", "시총(조)", "per", "pbr", "roe", "dividendYield", "foreignRatio",
                "high52w", "low52w"]].copy()
        t.columns = ["종목", "시장", "현재가", "등락%", "시총(조)", "PER", "PBR", "ROE%", "배당%", "외국인%", "52주 고", "52주 저"]
        st.dataframe(t.style.format({"현재가": "{:,.0f}", "등락%": "{:+.2f}", "시총(조)": "{:,.1f}", "PER": "{:.1f}",
                                     "PBR": "{:.2f}", "ROE%": "{:.1f}", "배당%": "{:.2f}", "외국인%": "{:.1f}",
                                     "52주 고": "{:,.0f}", "52주 저": "{:,.0f}"}, na_rep="—"),
                     hide_index=True, width="stretch")

    st.markdown("#### 🆕 IPO 파이프라인 (실제 일정)")
    ipo = J["ipo_pipeline"]
    stage = {"examinationList": "심사", "demandForecastingList": "수요예측", "forecastingCompleteList": "수요예측 완료",
             "subscriptionList": "청약", "subscriptionCompleteList": "청약 완료", "listingList": "상장 예정"}
    rows = [{"단계": stage.get(k, k), "회사": x["compName"], "시장": x.get("marketType"), "업종": (x.get("compUpjong") or "")[:18],
             "희망 공모가": f'{int(x["hopePubStart"]):,}~{int(x["hopePubEnd"]):,}' if x.get("hopePubStart") and x.get("hopePubEnd") else "—",
             "확정가": f'{int(x["fixPubPrice"]):,}' if x.get("fixPubPrice") else "—",
             "경쟁률": f'{float(x["fnlCmptRatio"]):,.0f}:1' if x.get("fnlCmptRatio") else "—",
             "수요예측": x.get("dfStartDate") or "—", "청약": x.get("poStartDate") or "—", "상장": x.get("lcalDate") or "—",
             "주관사": x.get("orgNm")} for k, v in ipo.items() if isinstance(v, list) for x in v]
    ipo_df = pd.DataFrame(rows)
    order = list(stage.values())[::-1]
    ipo_df["_o"] = ipo_df["단계"].map({s: i for i, s in enumerate(order)})
    st.dataframe(ipo_df.sort_values(["_o", "청약"]).drop(columns="_o"), hide_index=True, width="stretch")

    res = ep.RAW / "research"   # ravens-e1의 pipeline/collect_research.py 결과 (38커뮤니케이션)
    if (res / "ipo_demand.csv").exists() and (res / "ipo_listings.csv").exists():
        st.markdown("#### 🔍 수요예측 경쟁률이 높으면 상장 후에도 좋을까? (실제 결과)")
        dm = pd.read_csv(res / "ipo_demand.csv")
        ls = pd.read_csv(res / "ipo_listings.csv")
        ij = ls.merge(dm, on="name", how="inner").dropna(subset=["demand_ratio", "open_vs_offer_pct", "return_vs_offer_pct"])
        ij = ij[ij["demand_ratio"] > 0]
        if len(ij) >= 20:
            ij["구간"] = pd.cut(ij["demand_ratio"], [0, 300, 700, 1000, np.inf], labels=["300:1 미만", "300~700", "700~1000", "1000:1 이상"])
            grp = ij.groupby("구간", observed=True).agg(건수=("name", "size"), 시초가=("open_vs_offer_pct", "median"),
                                                     현재=("return_vs_offer_pct", "median"),
                                                     공모가_위=("return_vs_offer_pct", lambda v: (v > 0).mean()))
            q1, q2 = st.columns([1.3, 1], gap="large")
            with q1:
                fig = go.Figure()
                for col, name, color in [("open_vs_offer_pct", "상장일 시초가", ORANGE), ("return_vs_offer_pct", "현재 주가", BLUE)]:
                    fig.add_trace(go.Scatter(x=ij["demand_ratio"], y=ij[col], mode="markers", name=name,
                                             marker=dict(color=rgba(color, .6), size=8, line=dict(width=0)),
                                             customdata=np.stack([ij["name"], ij["listing_date"]], axis=1),
                                             hovertemplate="%{customdata[0]} (%{customdata[1]})<br>경쟁률 %{x:,.0f}:1 · "
                                                           "공모가 대비 %{y:+.0f}%<extra>" + name + "</extra>"))
                fig.add_hline(y=0, line_color="rgba(128,128,128,.6)")
                fig.update_xaxes(type="log", title="기관 수요예측 경쟁률 (:1, 로그)", tickvals=[10, 30, 100, 300, 1000, 3000],
                                 ticktext=["10", "30", "100", "300", "1,000", "3,000"])
                fig.update_yaxes(title="공모가 대비 (%)")
                fig.update_layout(title=dict(text=f"{len(ij)}개 상장 종목 · 경쟁률과 시초가 상관 "
                                                  f"{np.log(ij['demand_ratio']).corr(ij['open_vs_offer_pct']):+.2f}, 현재 수익률과 "
                                                  f"{np.log(ij['demand_ratio']).corr(ij['return_vs_offer_pct']):+.2f}",
                                             font=dict(size=14)))
                show(style_fig(fig, 380, hover="closest"))
            with q2:
                st.dataframe(grp.style.format({"시초가": "{:+.0f}%", "현재": "{:+.0f}%", "공모가_위": "{:.0%}"}),
                             width="stretch", column_config={"공모가_위": "지금도 공모가 위"})
                hi, lo = grp.iloc[-1], grp.iloc[0]
                html(f'<div class="callout">경쟁률 1000:1 이상은 시초가 중앙값 <b>{hi["시초가"]:+.0f}%</b>, 300:1 미만은 '
                     f'<b>{lo["시초가"]:+.0f}%</b>. 하지만 지금 주가 기준으로는 <b>{hi["현재"]:+.0f}% vs {lo["현재"]:+.0f}%</b> — '
                     '경쟁률은 <b>상장 첫날</b>을 잘 설명하지만, 그 뒤까지 보장하지는 않습니다.</div>')
            st.caption("출처: 38커뮤니케이션 (pipeline/collect_research.py) · 이름으로 두 표를 연결 · 현재 주가는 수집 시점 기준")

# ================================================================ ⏳ 타임머신
with tabs[5]:
    html('<div class="callout">과거 날짜를 고르면 <b>그날 시스템이 뭐라고 권고했을지</b>, 그리고 <b>그 뒤 60일 동안 실제로 '
         '어떻게 됐는지</b>를 보여줍니다. 그날까지의 데이터로만 계산합니다.</div>')
    presets = {"2024.8 블랙먼데이": date(2024, 8, 5), "2024.12 계엄 충격": date(2024, 12, 4),
               "위험점수 최고일": sig["composite"].idxmax().date(), "변동성 최고일": sig["vol20"].idxmax().date(),
               "오늘": asof.date()}
    presets = {k: v for k, v in presets.items() if sig.index[0].date() <= v <= asof.date()}
    if "tm" not in st.session_state:
        st.session_state.tm = presets.get("2024.8 블랙먼데이", sig.index[len(sig) // 2].date())
    pick = st.pills("바로가기", list(presets), selection_mode="single", key="tm_pill", label_visibility="collapsed")
    if pick and st.session_state.get("tm_last_pick") != pick:
        st.session_state.tm = presets[pick]
        st.session_state.tm_last_pick = pick
    when = st.slider("날짜", min_value=sig.index[0].date(), max_value=asof.date(), key="tm", format="YYYY-MM-DD")
    d = sig.index[sig.index.searchsorted(pd.Timestamp(when), side="right") - 1]
    past = ep.plan_for(sig.loc[:d], float(aum), risk=ep.RISK_LEVELS[RISK])
    pdg, pex = past["diagnosis"], past["exposure"]
    fwd = bt.loc[d:].iloc[1:61]
    c_now = sig.loc[d, "close"]
    c_after = sig["close"].loc[d:].iloc[min(60, len(sig.loc[d:]) - 1)]
    t1, t2 = st.columns([1.2, 1], gap="large")
    with t1:
        pk = VERDICT_KEY[pdg["verdict"]]
        html('<div class="kpi-grid tight">'
             + kpi(f"{d:%Y-%m-%d} 판정", f'<span style="display:inline-flex;align-items:center;gap:10px">'
                   f'<span class="dot" style="--c:{STATUS[pk]}"></span>{pdg["verdict"]}</span>',
                   f'위험 점수 {pdg["composite"]:.2f} · 원인 {pdg["driver"]}')
             + kpi("권고 주식 비중", num(pex["target"] * 100, 0, unit="%"), f'변동성 {pex["vol20"]:.1%}', delay=.06)
             + kpi("보유 비중 (밴드 반영)", num(bt.loc[d, "w_held"] * 100, 0, unit="%"), "실제 백테스트 보유", delay=.12)
             + '</div>')
        if len(fwd) >= 20:
            r_bm, r_st = (1 + fwd["ret_bm"]).prod() - 1, (1 + fwd["ret_strategy"]).prod() - 1
            html('<div class="kpi-grid tight">'
                 + kpi(f"이후 {len(fwd)}일 {MK}", num((c_after / c_now - 1) * 100, 1, sign=True, unit="%"),
                       f"{c_now:,.0f} → {c_after:,.0f}")
                 + kpi("벤치마크 수익", num(r_bm * 100, 2, sign=True, unit="%"), f"{MK} 100% 보유", delay=.06)
                 + kpi("권고를 따랐다면", num(r_st * 100, 2, sign=True, unit="%"), f"차이 {(r_st - r_bm) * 100:+.2f}%p", delay=.12)
                 + '</div>')
            if r_st - r_bm < -0.005 and c_after > c_now:
                st.caption("⚠️ 이후 지수가 크게 오른 구간입니다. 변동성이 가라앉을 때까지 비중을 낮게 들고 있어 "
                           "반등을 덜 누렸습니다. 이 규칙의 알려진 약점입니다 (⚠️ 한계 탭 참고).")
            elif r_st - r_bm > 0.005:
                st.caption("✅ 권고를 따랐다면 하락 손실을 줄였을 구간입니다.")
        else:
            st.info("이 날짜 이후 아직 20거래일이 지나지 않아 결과를 볼 수 없습니다.")
    with t2:
        win = sig.loc[d - pd.Timedelta(days=200): d + pd.Timedelta(days=120)]
        fig = make_subplots(rows=2, cols=1, shared_xaxes=True, row_heights=[.55, .45], vertical_spacing=.08,
                            subplot_titles=(MK, "주식 비중"))
        fig.add_trace(go.Scatter(x=win.index, y=win["close"], line=dict(color=BLUE, width=2), name=MK,
                                 hovertemplate="%{y:,.2f}"), 1, 1)
        bw = bt.loc[win.index[0]:win.index[-1]]
        fig.add_trace(go.Scatter(x=bw.index, y=[1] * len(bw), line=dict(color=GRAY, width=2, dash="dot"), name="벤치마크",
                                 hovertemplate="%{y:.0%}"), 2, 1)
        fig.add_trace(go.Scatter(x=bw.index, y=bw["w_held"], line=dict(color=BLUE, width=2, shape="hv"), name="권고 보유",
                                 hovertemplate="%{y:.0%}"), 2, 1)
        fig.update_yaxes(tickformat=".0%", row=2, col=1)
        fig.add_vline(x=d, line_color=RED, line_width=2)
        fig.add_vrect(x0=d, x1=win.index[-1], fillcolor=rgba(BLUE, .06), line_width=0, layer="below")
        show(style_fig(fig, 420).update_layout(legend=dict(y=-0.12, yanchor="top")))

# ================================================================ 🏆 성과 검증
with tabs[6]:
    html('<div class="kpi-grid">'
         + kpi("연수익률", num(p_st["연수익률"] * 100, 1, unit="%"), f'벤치마크 {p_bm["연수익률"]:.1%}')
         + kpi("변동성", num(p_st["연변동성"] * 100, 1, unit="%"),
               chip(f'{p_st["연변동성"] / p_bm["연변동성"] - 1:+.0%}', "good") + f' 벤치마크 {p_bm["연변동성"]:.1%}', delay=.08)
         + kpi("최대 손실폭", num(p_st["최대낙폭"] * 100, 1, unit="%"),
               chip(f'{(p_st["최대낙폭"] - p_bm["최대낙폭"]) * 100:+.1f}%p', "good") + f' 벤치마크 {p_bm["최대낙폭"]:.1%}', delay=.16)
         + kpi("위험 1단위당 수익", num(p_st["수익/위험"], 2), f'벤치마크 {p_bm["수익/위험"]:.2f}', delay=.24)
         + '</div>')
    html(f'<div class="callout"><b>핵심: 수익을 일부 내주고 위험을 크게 줄였습니다.</b> 변동성 {1 - p_st["연변동성"] / p_bm["연변동성"]:.0%} 감소, '
         f'최대 손실폭 {p_bm["최대낙폭"]:.0%} → {p_st["최대낙폭"]:.0%}. 대신 연수익률은 {(p_st["연수익률"] - p_bm["연수익률"]) * 100:+.1f}%p 낮습니다. '
         f'{bt.index[0]:%Y년 %m월}부터 매일 그날 정보로만 다음 날 비중을 정하고 매매비용까지 뺀 결과입니다.</div>')

    st.markdown("#### ▶ 누적 성과 재생")
    nb, ns = bt["nav_bm"], bt["nav_strategy"]
    idx = list(range(5, len(bt), 6)) + [len(bt)]
    fig = go.Figure([go.Scatter(x=bt.index, y=nb, name=f"벤치마크 ({MK} 100%)", line=dict(color=GRAY, width=2.5)),
                     go.Scatter(x=bt.index, y=ns, name="액션 플랜", line=dict(color=BLUE, width=3))])
    fig.frames = [go.Frame(data=[go.Scatter(x=bt.index[:k], y=nb.iloc[:k]), go.Scatter(x=bt.index[:k], y=ns.iloc[:k])],
                           name=str(k), layout=go.Layout(title_text=f"{bt.index[k - 1]:%Y-%m} · 격차 "
                                                                    f"{(ns.iloc[k - 1] - nb.iloc[k - 1]) * 100:+.1f}%p"))
                  for k in idx]
    fig.update_layout(title=dict(text=f"전체 기간 격차 {(ns.iloc[-1] - nb.iloc[-1]) * 100:+.1f}%p — ▶ 재생으로 다시 보기",
                                 font=dict(size=14)), **play_controls(35))
    fig.update_layout(legend=dict(x=1, xanchor="right"))
    fig.update_xaxes(range=[bt.index[0], bt.index[-1]])
    fig.update_yaxes(range=[min(nb.min(), ns.min()) * .97, max(nb.max(), ns.max()) * 1.03], title=f"{bt.index[0]:%Y-%m} = 1")
    show(style_fig(fig, 420, hover="x unified").update_layout(margin=dict(b=80)))

    c1, c2 = st.columns(2, gap="large")
    with c1:
        st.markdown("#### 고점 대비 손실폭")
        fig = go.Figure()
        for col, name, color in [("nav_bm", "벤치마크", GRAY), ("nav_strategy", "액션 플랜", BLUE)]:
            ddn = bt[col] / bt[col].cummax() - 1
            fig.add_trace(go.Scatter(x=bt.index, y=ddn, name=name, line=dict(color=color, width=2), fill="tozeroy",
                                     fillcolor=rgba(color, .12), hovertemplate="%{y:.1%}"))
        show(style_fig(fig, 300, yfmt=".0%"))
    with c2:
        st.markdown("#### 연도별 초과수익")
        fig = go.Figure(go.Bar(x=yr.index.astype(str), y=yr["초과"], marker_color=[BLUE if v >= 0 else RED for v in yr["초과"]],
                               text=[f"{v * 100:+.1f}" for v in yr["초과"]], textposition="outside",
                               customdata=np.stack([yr["ret_strategy"], yr["ret_bm"]], axis=1),
                               hovertemplate="%{x}: %{y:+.2%}<br>전략 %{customdata[0]:+.1%} · 지수 %{customdata[1]:+.1%}<extra></extra>"))
        show(style_fig(fig, 300, yfmt="+.0%", legend=False, hover="closest"))
        st.caption(f"{bt.index[0].year}년은 {bt.index[0]:%m월}부터, {bt.index[-1].year}년은 {bt.index[-1]:%m월}까지만 포함합니다.")

    c3, c4 = st.columns(2, gap="large")
    with c3:
        st.markdown("#### 왜 이 규칙인가 — 무엇이 무엇을 예측하나")
        cm = D["corr"]
        fig = go.Figure(go.Heatmap(z=cm.to_numpy(), x=list(cm.columns), y=cm.index, zmin=-.8, zmax=.8,
                                   colorscale=[[0, RED], [.5, "#f0efec"], [1, BLUE]], showscale=False,
                                   text=[[f"{v:+.2f}" for v in row] for row in cm.to_numpy()], texttemplate="%{text}",
                                   textfont=dict(size=15), hovertemplate="%{y} → %{x}: %{z:+.2f}<extra></extra>"))
        fig.update_yaxes(autorange="reversed")
        show(style_fig(fig, 300, legend=False, hover="closest"))
        dir_max = cm["향후 20일 수익률"].abs().max()
        vol_c = cm.loc["변동성 배율", "향후 20일 변동성"]
        st.caption(f"방향 예측력은 약하고(최대 |{dir_max:.2f}|), 변동성 배율은 향후 변동성과 {vol_c:+.2f} → "
                   "방향 베팅 대신 변동성에 맞춰 위험을 조절합니다.")
    with c4:
        st.markdown("#### 다른 규칙들과 비교 — 검증으로 걸러냈습니다")
        alts = pd.DataFrame(D["alts"]).T
        rules = pd.concat([pd.DataFrame([{**p_bm, "평균 비중": 1.0, "지수보다 나은 해": np.nan}], index=[f"{MK} 100%"]), alts])
        best = rules["수익/위험"].idxmax()
        fig = go.Figure(go.Bar(y=rules.index, x=rules["수익/위험"], orientation="h",
                               marker_color=[GRAY] + [BLUE if n == best else ORANGE for n in rules.index[1:]],
                               text=[f"{v:.2f}" for v in rules["수익/위험"]], textposition="outside",
                               customdata=np.stack([rules["연수익률"], rules["연변동성"], rules["최대낙폭"], rules["평균 비중"]], axis=1),
                               hovertemplate="%{y}<br>수익/위험 %{x:.2f}<br>연수익 %{customdata[0]:.1%} · 변동성 %{customdata[1]:.1%}"
                                             "<br>최대 손실 %{customdata[2]:.1%} · 평균 비중 %{customdata[3]:.0%}<extra></extra>"))
        fig.update_layout(yaxis=dict(autorange="reversed"), title=dict(text="위험 1단위당 수익 (클수록 좋음)", font=dict(size=14)))
        fig.update_xaxes(range=[0, rules["수익/위험"].max() * 1.25])
        show(style_fig(fig, 260, legend=False, hover="closest"))
        st.dataframe(rules.style.format({"연수익률": "{:.1%}", "연변동성": "{:.1%}", "수익/위험": "{:.2f}", "최대낙폭": "{:.1%}",
                                         "평균 비중": "{:.0%}", "지수보다 나은 해": "{:.0f}"}, na_rep="—"), width="stretch")
        st.caption("대안은 전부 흔히 쓰는 형태 그대로 두고 이 기간에 맞춰 튜닝하지 않았습니다. 위험 점수로 방향을 맞히려는 규칙과 "
                   "추세 추종은 늦게 팔고 늦게 사서 위험 대비 성과가 더 나빴습니다 → 점수는 '설명', 비중은 '변동성'으로 역할을 나눴습니다.")

# ================================================================ ⚠️ 한계
with tabs[7]:
    items = [
        ("📈", "급반등장에서는 뒤처집니다", "충격 직후 지수가 빠르게 회복하면 변동성이 가라앉을 때까지 비중이 낮아 상승을 덜 누립니다. "
                                   "<b>수익을 키우는 도구가 아니라 손실을 관리하는 도구</b>입니다."),
        ("⏱️", "검증 기간이 짧습니다", f"네이버 제공 데이터로 {bt.index[0]:%Y-%m}부터 약 {len(bt) / 252:.1f}년만 검증했습니다. "
                                "강세장 비중이 큰 기간이라 벤치마크 수익률이 높게 나옵니다."),
        ("🧩", "수급은 점수에서 뺐습니다", "투자자별 순매수는 네이버가 최근 200거래일만 제공해 백테스트가 불가능하고, 지수와 동행할 뿐 "
                                  "선행하지 않습니다. 화면에는 참고 정보로만 보여줍니다."),
        ("🕘", "장중 수집값이 섞일 수 있습니다", "수집 시점이 장중이면 마지막 날 지수·업종·시총은 종가가 아닙니다. 시연 전 장 마감 후 "
                                     "다시 수집하세요."),
        ("⚖️", "투자 자문이 아닙니다", "규칙 기반 참고안입니다. 배당·선물 베이시스·세금은 반영하지 않았고, 실제 매매는 리스크 한도와 "
                               "운용 전략에 맞춰 판단해야 합니다."),
    ]
    html('<div class="flow">' + "".join(
        f'<div class="step" style="animation-delay:{k * .06}s;background:rgba(128,128,128,.06)"><div class="a">{ic}</div>'
        f'<div class="q">{t}</div><div class="w" style="font-size:.88rem;opacity:.85">{b}</div></div>'
        for k, (ic, t, b) in enumerate(items)) + '</div>')
    with st.expander("🔧 사용한 데이터와 방법"):
        st.markdown(
            "- **데이터**: 네이버페이 증권 — 코스피·코스닥·코스피200 일봉, 증시자금동향(고객예탁금·신용잔고·펀드), "
            "투자자별 매매동향, 업종·시총 상위·IPO·뉴스·경제 캘린더 / 한국은행 ECOS — 기준금리, 국고채 3년\n"
            "- **위험 점수**: 5지표 가중합 — 변동성 배율(20일÷누적 중앙값) 25%, 120일 고점 대비 낙폭 25%, 60일선 괴리 20%, "
            "신용잔고/예탁금 비율의 누적 순위 15%, 예탁금 20일 변화 15% (증시자금은 하루 늦게 반영)\n"
            f"- **액션 플랜**: 목표 비중 = 누적 중앙 변동성 ÷ 20일 변동성, {ep.MULT_MIN}~{ep.MULT_MAX}배, ±{ep.REBALANCE_BAND} 밴드 리밸런싱\n"
            f"- **백테스트**: 비중 × 진단 시장(코스피/코스닥) 가격지수 수익률 + (1 − 비중) × 기준금리 − 매매비용({ep.COST_BP:.0f}bp × 회전), 가격지수(배당 제외)")
    with st.expander("🗂️ 원자료 — 최근 30일 신호"):
        st.dataframe(sig[["close", "composite", "state", "vol20", "vol_ratio", "dd120", "gap60", "lev", "dep_chg20", "w_target"]]
                     .tail(30).iloc[::-1], width="stretch")
