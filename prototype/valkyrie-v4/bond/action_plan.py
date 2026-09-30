"""[4단계] 채권 포트폴리오 액션 플랜 - 위기 진단을 매매 권고로 번역한다.

입력: 2단계 Kim Filter regime 확률 + 3단계 Composite 지표 + 금리/스프레드 (data/30_BOND)
출력 (규칙 기반, 매일 재계산):
  1. 목표 듀레이션   : 벤치마크(국고 3Y/10Y 50:50) 대비 배수 = 기준 변동성 / 현재 20일 변동성 (변동성 타깃팅)
     - 검증 결과 위기 지표(Composite, P_High-Vol, 추세)는 향후 20일 금리 "방향"을 예측하지 못했다
       (상관 -0.06 ~ +0.03). 그래서 "위기 점수가 높으면 줄인다"는 규칙은 벤치마크보다 성과가 나빴다.
     - 반면 향후 변동성은 잘 예측한다 (sigma20 0.72, Composite 0.62). 따라서 방향 베팅 대신
       포트폴리오 금리위험(DV01 x 변동성)을 일정하게 유지하도록 듀레이션을 조절한다.
  2. 커브 포지션     : 최근 20일 커브 움직임(bear/bull x steep/flat)에 따라 어느 만기를 팔고 살지
  3. 현물 재배분안   : MSB91 / 국고 3Y / 10Y / 30Y 목표 비중과 매매 금액
  4. 선물 헤지안     : 현물을 건드리지 않고 국채선물로 같은 듀레이션을 맞추는 계약 수 (동적 헤지)
  5. 크레딧 포지션   : 회사채 AA- 3년 비중(벤치마크 20%, 범위 10~40%). 같은 만기 국고와 교체하므로 듀레이션 중립.
     - 스프레드가 20일간 +5bp 넘게 확대 중이면 10%로 축소 (떨어지는 칼날은 잡지 않음)
     - 확대가 멈추면 20% + 10%p x 스프레드 누적 z(-1~+2) (넓을수록 더 담아 캐리·회복을 취함)
     - 검증: 넓은 스프레드는 이후 60일 초과수익을 예측(상관 +0.21), 20일 확대는 단기 추가 확대를 예측(+0.47).
       문턱(0/5/10bp)·계수(0.05/0.10) 6개 조합 모두 2020·2022·2023 위기 해에 고정 20%보다 나았다.
     - 단기 자금: 신용 스트레스가 정상이고 CP 가산금리가 과거 중앙값 이상일 때만 CP 일부 활용 제안
  6. 트리거          : 어느 수준에서 추가 축소 / 복원할지
  7. 백테스트        : 같은 규칙을 2017년부터 매일 적용했을 때 벤치마크 대비 성과

Output: data/30_BOND/korea_bond_action_plan.json, korea_bond_action_history.csv,
        korea_bond_action_backtest.csv, korea_bond_credit_backtest.csv, korea_bond_action_plan.png

주의: 매매 권고는 규칙 기반 참고안이며 투자 자문이 아니다. 듀레이션 규칙은 그날까지의 데이터만
쓰지만(누적 중앙값), 규칙 형태 자체는 이 표본의 백테스트를 보고 골랐다 (방향 신호 규칙 대비 우위).
"""
from __future__ import annotations

import argparse
import json
import sys
import warnings
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd
import matplotlib

matplotlib.use("Agg")
import matplotlib.dates as mdates  # noqa: E402
import matplotlib.pyplot as plt  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from valkyrie.paths import BOND  # noqa: E402
from crisis_dashboard import compute_credit, overall_view, set_korean_font  # noqa: E402

warnings.filterwarnings("ignore")
try:
    sys.stdout.reconfigure(errors="replace")
except Exception:
    pass

INSTRUMENTS = ["MSB91", "Y3Y", "Y10Y", "Y30Y"]
MATURITY = {"MSB91": 0.25, "Y3Y": 3, "Y10Y": 10, "Y30Y": 30}
LABEL = {"MSB91": "통안 91일", "Y3Y": "국고 3년", "Y10Y": "국고 10년", "Y30Y": "국고 30년"}
BENCHMARK = {"MSB91": 0.0, "Y3Y": 0.5, "Y10Y": 0.5, "Y30Y": 0.0}   # 현재 보유 = 벤치마크로 가정

# 목표 듀레이션 배수 = 기준 변동성 / sigma20. 기준 = 그날까지의 sigma20 누적 중앙값 (look-ahead 없음)
VOL_REF_MIN_OBS = 120
MULT_MIN, MULT_MAX = 0.30, 1.20
REBALANCE_BAND = 0.50          # 보유 듀레이션과 목표 차이가 이 이상(년)일 때만 리밸런싱
CURVE_WIN = 20                 # 커브 움직임 판정 창(거래일)
CURVE_LEVEL_BP, CURVE_SLOPE_BP = 10, 5
COST_BP = 0.5                  # 매매 시 수익률 기준 비용(bp) -> 가격 비용 = D x 0.5bp
CONTRACT_NOTIONAL_EOK = 1.0    # 국채선물 1계약 = 액면 1억 원

# 크레딧 슬리브: 회사채 AA- 3년을 같은 만기 국고와 교체 (금리 위험은 그대로, 신용 위험만 조절)
CREDIT_BM = 0.20               # 벤치마크 크레딧 비중 (운용규모 대비)
CREDIT_CUT = 0.10              # 스프레드 확대 중일 때 비중
CREDIT_WIDEN_BP = 5            # 20일 확대폭이 이보다 크면 '확대 중' (노이즈 밴드)
CREDIT_VALUE_K = 0.10          # 스프레드 누적 z 1당 +10%p, z는 -1~+2로 제한 -> 10~40%
CREDIT_COST_BP = 2.0           # 회사채 매매비용 (수익률 bp) -> 가격 비용 = D x 2bp
CREDIT_BAND = 0.02             # 목표와 보유 차이가 2%p 미만이면 매매하지 않음 (과매매 방지)

CURVE_VIEWS = {
    "bear_steep": ("베어 스티프닝", "장기금리가 더 빠르게 오름",
                   "장기채(10Y/30Y) 매도 -> 단기채(통안/3Y) 매수", ["MSB91", "Y3Y", "Y10Y"], "10년"),
    "bear_flat": ("베어 플래트닝", "단기금리가 더 빠르게 오름 (긴축 기대)",
                  "중단기물(3Y) 축소 -> 초단기+10Y 바벨", ["MSB91", "Y10Y", "Y30Y"], "3년"),
    "bull_flat": ("불 플래트닝", "장기금리가 더 빠르게 내림",
                  "장기채(10Y/30Y) 매수로 듀레이션 확대", ["Y3Y", "Y10Y", "Y30Y"], "10년"),
    "bull_steep": ("불 스티프닝", "단기금리가 더 빠르게 내림 (완화 기대)",
                   "중단기물(3Y) 매수 - 불릿", ["MSB91", "Y3Y", "Y10Y"], "3년"),
    "neutral": ("중립", "뚜렷한 커브 방향성 없음",
                "3Y/10Y 사이에서 듀레이션만 조정", ["MSB91", "Y3Y", "Y10Y", "Y30Y"], "10년"),
}


def par_duration(y_pct, years):
    """반기 이표 par bond의 modified duration (년). 91일물은 할인채로 본다."""
    y = np.asarray(y_pct, dtype=float) / 100
    if years < 1:
        return np.full_like(y, years / (1 + y * years))
    return (1 - (1 + y / 2) ** (-2 * years)) / np.where(y > 0, y, 1e-6)


def load():
    rd = lambda n: pd.read_csv(BOND / n, index_col=0, parse_dates=True)  # noqa: E731
    y = rd("korea_bond_yields.csv")
    s = rd("korea_bond_spreads.csv")
    ind = rd("korea_bond_crisis_indicators.csv")
    rp = rd("korea_bond_regime_probs.csv")
    f = rd("korea_bond_factors.csv")
    if "credit_stress" not in ind:          # 3단계를 신용 모형 이전 버전으로 돌렸어도 동작하게
        ind = ind.join(compute_credit(s).reindex(ind.index))
    df = ind.join(rp[["P_Low-Vol", "P_Normal", "P_High-Vol"]], how="left")
    df = df.join(y[INSTRUMENTS].add_prefix("y_"), how="left").join(s, how="left")
    df = df.join(f[["CORP_AA", "CP91", "CD91"]], how="left")
    df["P_High-Vol"] = df["P_High-Vol"].fillna(0.0)
    return df.dropna(subset=[f"y_{i}" for i in INSTRUMENTS])


def build_signals(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    for i in INSTRUMENTS:
        out[f"D_{i}"] = par_duration(out[f"y_{i}"], MATURITY[i])
    out["D_BM"] = sum(w * out[f"D_{i}"] for i, w in BENCHMARK.items())

    out["sigma_ref_bp"] = out["sigma20_bp"].expanding(VOL_REF_MIN_OBS).median()
    out["dur_mult"] = (out["sigma_ref_bp"] / out["sigma20_bp"]).fillna(1.0).clip(MULT_MIN, MULT_MAX)
    out["D_target"] = out["dur_mult"] * out["D_BM"]

    # 커브: 20일 레벨(10Y) 변화와 기울기(10Y-3Y) 변화
    out["dY10_20bp"] = out["y_Y10Y"].diff(CURVE_WIN) * 100
    out["dTERM_20bp"] = out["TERM_SPREAD"].diff(CURVE_WIN) * 100

    def curve_view(r):
        lvl, slp = r["dY10_20bp"], r["dTERM_20bp"]
        if pd.isna(lvl) or (abs(lvl) < CURVE_LEVEL_BP and abs(slp) < CURVE_SLOPE_BP):
            return "neutral"
        if lvl >= 0:
            return "bear_steep" if slp >= 0 else "bear_flat"
        return "bull_flat" if slp < 0 else "bull_steep"
    out["curve_view"] = out.apply(curve_view, axis=1)

    # 신용: 회사채 스프레드 60일 변화, 1년 백분위 (참고 지표)
    out["cs_chg60bp"] = out["CORP_AA_SPREAD"].diff(60) * 100
    out["cs_pct1y"] = out["CORP_AA_SPREAD"].rolling(252, min_periods=60).rank(pct=True)
    out["st_pct1y"] = out["ST_CREDIT_SPREAD"].rolling(252, min_periods=60).rank(pct=True)

    # 크레딧 슬리브 목표 비중 (cs_z는 누적 z라 look-ahead 없음)
    out["D_CORP_AA"] = par_duration(out["CORP_AA"].ffill(), 3)
    out["w_credit"] = credit_target(out)
    # 단기 자금: CP91 - 통안 91일 가산금리와 그날까지의 백분위
    out["cp_pickup_bp"] = (out["CP91"] - out["y_MSB91"]) * 100
    out["cp_pickup_pct"] = out["cp_pickup_bp"].expanding(60).rank(pct=True)
    return out


def credit_target(df: pd.DataFrame) -> pd.Series:
    widening = df["cs_chg20_bp"] > CREDIT_WIDEN_BP
    value = CREDIT_BM + CREDIT_VALUE_K * df["cs_z"].fillna(0).clip(-1, 2)
    return pd.Series(np.where(widening, CREDIT_CUT, value), index=df.index)


def credit_view(r) -> tuple[str, str, str]:
    w, z, chg = float(r["w_credit"]), float(r["cs_z"]), float(r["cs_chg20_bp"])
    if chg > CREDIT_WIDEN_BP:
        return ("underweight", f"회사채 AA- 비중 {CREDIT_CUT:.0%}로 축소 -> 같은 만기 국고로 교체",
                f"스프레드가 20일간 {chg:+.0f}bp 확대 중입니다. 확대가 멈출 때까지 떨어지는 칼날은 잡지 않습니다.")
    if w > CREDIT_BM + 0.02:
        return ("overweight", f"회사채 AA- 비중 {w:.0%}로 확대",
                f"스프레드가 과거보다 넓고(누적 z {z:+.1f}) 확대가 멈췄습니다. 넓은 스프레드는 이후 초과수익으로 이어지는 경향이 있습니다.")
    if w < CREDIT_BM - 0.02:
        return ("underweight", f"회사채 AA- 비중 {w:.0%}로 축소",
                f"스프레드가 과거보다 좁아(누적 z {z:+.1f}) 신용 위험에 대한 보상이 작습니다.")
    return ("neutral", f"회사채 AA- 비중 {w:.0%} 유지 (중립)",
            f"스프레드 수준(누적 z {z:+.1f})과 20일 변화({chg:+.0f}bp) 모두 특이 신호가 없습니다.")


def short_term_view(r) -> str:
    """단기 자금(통안 91일 매수분)을 CP로 일부 돌릴지. 부도·유동성 위험은 모형에 없으므로 보수적으로."""
    pick, pct, state = float(r["cp_pickup_bp"]), float(r["cp_pickup_pct"]), r["credit_state"]
    if state != "NORMAL":
        return f"신용 스트레스 {state} -> 단기 자금은 통안채로만 운용 (CP·전단채 신규 매수 보류)"
    if pct >= 0.5:
        return (f"CP(A1) 가산금리 +{pick:.0f}bp (과거 {pct:.0%} 백분위) -> 단기 자금 일부(최대 30%) CP 활용 검토, "
                "발행사 신용은 개별 확인")
    return f"CP 가산금리 +{pick:.0f}bp로 과거 {pct:.0%} 백분위(낮음) -> 신용 위험을 질 보상이 작아 통안채 유지"


def target_weights(D_target: float, dur: dict, view: str) -> dict:
    """커브 뷰가 정한 사다리에서 목표 듀레이션을 감싸는 인접 두 만기로 채운다."""
    ladder = CURVE_VIEWS[view][3]
    ds = [dur[i] for i in ladder]
    w = dict.fromkeys(INSTRUMENTS, 0.0)
    if D_target <= ds[0]:
        w[ladder[0]] = 1.0
        return w
    if D_target >= ds[-1]:
        w[ladder[-1]] = 1.0
        return w
    for a, b, da, db in zip(ladder, ladder[1:], ds, ds[1:]):
        if da <= D_target <= db:
            w[b] = (D_target - da) / (db - da)
            w[a] = 1 - w[b]
            return w
    return w


def backtest(sig: pd.DataFrame) -> pd.DataFrame:
    """전일 종가 신호로 당일 보유. 수익 = 캐리 - D x 금리변화 - 매매비용."""
    y = sig[[f"y_{i}" for i in INSTRUMENTS]].to_numpy() / 100
    D = sig[[f"D_{i}" for i in INSTRUMENTS]].to_numpy()
    ret_i = np.zeros_like(y)
    ret_i[1:] = y[:-1] / 252 - D[:-1] * (y[1:] - y[:-1])

    bm_w = np.array([BENCHMARK[i] for i in INSTRUMENTS])
    held = bm_w.copy()
    rows = []
    for t in range(len(sig)):
        r = sig.iloc[t]
        ret_bm = ret_i[t] @ bm_w
        ret_st = ret_i[t] @ held
        # 오늘 종가 신호로 내일 보유 결정
        dur = {i: r[f"D_{i}"] for i in INSTRUMENTS}
        cost = 0.0
        if abs(held @ D[t] - r["D_target"]) >= REBALANCE_BAND:
            new = np.array([target_weights(r["D_target"], dur, r["curve_view"])[i] for i in INSTRUMENTS])
            cost = np.abs(new - held) @ D[t] * COST_BP / 10000
            held = new
        rows.append({"date": sig.index[t], "ret_bm": ret_bm, "ret_strategy": ret_st - cost,
                     "D_held": held @ D[t], "D_BM": r["D_BM"], "cost": cost,
                     **{f"w_{i}": held[k] for k, i in enumerate(INSTRUMENTS)}})
    bt = pd.DataFrame(rows).set_index("date")
    bt["nav_bm"] = (1 + bt["ret_bm"]).cumprod()
    bt["nav_strategy"] = (1 + bt["ret_strategy"]).cumprod()
    return bt


def verdict_history(sig: pd.DataFrame) -> pd.DataFrame:
    """날짜별 종합 판정. plan_for와 같은 overall_view를 써서, 과거 날짜를 읽는 쪽(VALKYRIE v4 등)이
    로직을 따로 재구성하지 않아도 되게 한다. Kim 확률은 전체 표본 추정이라 point-in-time은 아니다."""
    regime = sig[["P_Low-Vol", "P_Normal", "P_High-Vol"]].fillna(0.0).idxmax(axis=1).str[2:]
    rows = [overall_view(s, c, g, cs) for s, c, g, cs in
            zip(sig["state"], sig["composite"], regime, sig["credit_state"])]
    out = pd.DataFrame(rows, index=sig.index)[["verdict", "driver", "rate_verdict", "credit_verdict"]]
    out.insert(0, "regime", regime)
    return out


def credit_backtest(sig: pd.DataFrame) -> pd.DataFrame:
    """크레딧 슬리브: 회사채 AA- 3년 - 국고 3년 초과수익(캐리 - 스프레드 듀레이션 x 스프레드 변화)에
    비중을 곱한 포트폴리오 기여. 고정 20% 대비. 부도 손실은 반영하지 않는다 (AA- 등급 역사적 부도 거의 없음)."""
    cs = sig["CORP_AA_SPREAD"] * 100
    ds = sig["D_CORP_AA"]
    rx = ((cs.shift(1) / 1e4 / 252) - ds.shift(1) * (cs.diff() / 1e4)).fillna(0.0)
    tgt = sig["w_credit"].to_numpy()
    w = np.empty(len(tgt))
    h = CREDIT_BM
    for t in range(len(tgt)):     # 오늘 보유 = 어제 종가 신호로 정한 비중, 밴드 밖일 때만 교체
        w[t] = h
        if abs(tgt[t] - h) >= CREDIT_BAND:
            h = tgt[t]
    held = pd.Series(w, index=sig.index)
    cost = held.diff().abs().fillna(0.0) * ds * CREDIT_COST_BP / 1e4
    cb = pd.DataFrame({"rx": rx, "w_rule": held, "cost": cost})
    cb["ret_static"] = CREDIT_BM * rx
    cb["ret_rule"] = held * rx - cost
    cb["excess"] = cb["ret_rule"] - cb["ret_static"]
    cb["nav_static"] = (1 + cb["ret_static"]).cumprod()
    cb["nav_rule"] = (1 + cb["ret_rule"]).cumprod()
    return cb


def credit_summary(cb: pd.DataFrame) -> dict:
    mdd = lambda nav: float((nav / nav.cummax() - 1).min())  # noqa: E731
    yr = cb["excess"].groupby(cb.index.year).sum()
    return {"static_ann": float(cb["ret_static"].mean() * 252), "rule_ann": float(cb["ret_rule"].mean() * 252),
            "excess_ann": float(cb["excess"].mean() * 252),
            "static_mdd": mdd(cb["nav_static"]), "rule_mdd": mdd(cb["nav_rule"]),
            "avg_weight": float(cb["w_rule"].mean()),
            "turnover": float(cb["w_rule"].diff().abs().sum() / (len(cb) / 252)),
            "crisis_years": {str(y): float(yr.get(y, 0.0)) for y in (2020, 2022, 2023)},
            "credit_premium_ann": float(cb["rx"].mean() * 252)}


def perf(ret: pd.Series) -> dict:
    nav = (1 + ret).cumprod()
    yrs = len(ret) / 252
    ann = nav.iloc[-1] ** (1 / yrs) - 1
    vol = ret.std() * np.sqrt(252)
    return {"연수익률": ann, "연변동성": vol, "수익/위험": ann / vol if vol else np.nan,
            "최대낙폭": (nav / nav.cummax() - 1).min()}


def plan_for(sig: pd.DataFrame, aum_eok: float, current: dict | None = None,
             current_credit: float | None = None) -> dict:
    """current: 국고 보유 비중 {종목: 비중}. 없으면 벤치마크(3Y/10Y 50:50)를 보유 중이라고 본다.
    current_credit: 회사채 AA- 보유 비중(운용규모 대비). 없으면 벤치마크 20%."""
    cur = {i: float((current or BENCHMARK).get(i, 0.0)) for i in INSTRUMENTS}
    cc = CREDIT_BM if current_credit is None else float(current_credit)
    r = sig.iloc[-1]
    regime = max(["Low-Vol", "Normal", "High-Vol"], key=lambda n: r[f"P_{n}"])
    ov = overall_view(r["state"], r["composite"], regime, r["credit_state"])
    verdict, monitoring = ov["verdict"], ov["monitoring"]
    dur = {i: float(r[f"D_{i}"]) for i in INSTRUMENTS}
    D_cur = sum(cur[i] * dur[i] for i in INSTRUMENTS)
    D_tgt = float(r["D_target"])
    view = r["curve_view"]
    vname, vdesc, vtrade, _, fut = CURVE_VIEWS[view]
    w_tgt = target_weights(D_tgt, dur, view)
    trades = {i: (w_tgt[i] - cur[i]) * aum_eok for i in INSTRUMENTS}

    dD = D_tgt - D_cur
    if dD > 0:   # 듀레이션 확대: 불 플래트닝이면 10년, 아니면 3년 선물
        fut = "10년" if view in ("bull_flat", "neutral") else "3년"
    D_fut = dur["Y10Y"] if fut == "10년" else dur["Y3Y"]
    contracts = dD * aum_eok / (D_fut * CONTRACT_NOTIONAL_EOK)
    cview, ctext, creason = credit_view(r)
    wc = float(r["w_credit"])

    ref = float(r["sigma_ref_bp"])
    s1 = max(ref * 1.5, float(r["sigma20_bp"]) * 1.25)
    s2 = max(ref * 2.0, s1 * 1.25)

    def d_at(sigma):
        return float(np.clip(ref / sigma, MULT_MIN, MULT_MAX) * r["D_BM"])

    s22 = sig["sigma20_bp"][sig.index.year == 2022] if "sigma20_bp" in sig else pd.Series(dtype=float)
    peak_txt = f" (2022년 고점은 {s22.max():.1f}bp/일)" if s22.notna().any() else ""   # 2022년 이전 시점이면 생략

    return {
        "asof": f"{sig.index[-1]:%Y-%m-%d}", "aum_eok": aum_eok,
        "diagnosis": {"verdict": verdict, "monitoring": monitoring, "regime": regime,
                      "p_high_vol": float(r["P_High-Vol"]), "composite": float(r["composite"]),
                      "state": r["state"], "y10": float(r["y_Y10Y"]), "t60": float(r["t60"]),
                      "tr_dd": float(r["tr_dd"]),
                      "driver": ov["driver"], "rate_verdict": ov["rate_verdict"],
                      "credit_verdict": ov["credit_verdict"],
                      "credit_stress": float(r["credit_stress"]), "credit_state": r["credit_state"]},
        "duration": {"benchmark": float(r["D_BM"]), "current": D_cur, "target": D_tgt, "mult": float(r["dur_mult"]), "change": dD,
                     "sigma20_bp": float(r["sigma20_bp"]), "sigma_ref_bp": ref},
        "curve": {"view": view, "name": vname, "reason": vdesc, "trade": vtrade,
                  "d_y10_20bp": float(r["dY10_20bp"]), "d_term_20bp": float(r["dTERM_20bp"])},
        "cash_rebalance": {i: {"current": cur[i], "target": w_tgt[i], "trade_eok": trades[i],
                               "duration": dur[i]} for i in INSTRUMENTS},
        "futures_hedge": {"contract": f"{fut} 국채선물", "contracts": contracts,
                          "side": "매도" if contracts < 0 else "매수",
                          "dv01_per_contract_won": D_fut * CONTRACT_NOTIONAL_EOK * 1e8 * 1e-4,
                          "portfolio_dv01_change_won": dD * aum_eok * 1e8 * 1e-4},
        "credit": {"view": cview, "action": ctext, "reason": creason,
                   "corp_aa_spread": float(r["CORP_AA_SPREAD"]),
                   "cs_chg60bp": float(r["cs_chg60bp"]), "st_credit_pct1y": float(r["st_pct1y"]),
                   "stress": float(r["credit_stress"]), "state": r["credit_state"],
                   "components": {k: float(r[f"score_{k}"]) for k in ("aa_level", "aa_widen", "st_level", "st_widen")},
                   "spread_bp": float(r["cs_bp"]), "spread_z": float(r["cs_z"]), "chg20_bp": float(r["cs_chg20_bp"]),
                   "cp_cd_bp": float(r["st_bp"]), "cp_cd_z": float(r["st_z"]), "cp_cd_chg20_bp": float(r["st_chg20_bp"]),
                   "benchmark_weight": CREDIT_BM, "current_weight": cc, "target_weight": wc,
                   "trade_eok": (wc - cc) * aum_eok if abs(wc - cc) >= CREDIT_BAND else 0.0,
                   "duration": float(r["D_CORP_AA"]),
                   "cp_pickup_bp": float(r["cp_pickup_bp"]), "cp_pickup_pct": float(r["cp_pickup_pct"]),
                   "short_term": short_term_view(r)},
        "triggers": {
            "추가 축소": f"10Y 20일 변동성 {s1:.1f}bp/일 도달 시 목표 {d_at(s1):.2f}년, "
                     f"{s2:.1f}bp/일 시 {d_at(s2):.2f}년{peak_txt}",
            "복원": f"변동성이 기준 {ref:.1f}bp/일로 내려오면 벤치마크 {d_at(ref):.2f}년 복원, "
                  f"{ref / MULT_MAX:.1f}bp/일 이하면 최대 {d_at(ref / MULT_MAX):.2f}년까지 확대",
            "리밸런싱 규칙": f"보유 듀레이션과 목표 차이가 {REBALANCE_BAND}년 이상일 때만 매매 (과매매 방지)",
            "크레딧": f"AA- 스프레드가 20일간 +{CREDIT_WIDEN_BP}bp 넘게 확대되면 크레딧 {CREDIT_CUT:.0%}로 축소, "
                   f"확대가 멈추면 스프레드 누적 z +1에 {CREDIT_BM + CREDIT_VALUE_K:.0%}, +2에 "
                   f"{CREDIT_BM + 2 * CREDIT_VALUE_K:.0%}까지 확대. 신용 스트레스 0.4 이상이면 종합 판정 상향",
            "위기 진단의 역할": "Composite·Kim regime은 모니터링 강도에, 신용 스트레스는 모니터링과 단기 자금 판단에 쓰고, "
                          "듀레이션 방향 베팅에는 쓰지 않음 (백테스트에서 방향 예측력 없음 확인)",
        },
    }


def print_plan(p: dict, perf_tbl: pd.DataFrame, yr: pd.DataFrame):
    d, du, c, f, cr = p["diagnosis"], p["duration"], p["curve"], p["futures_hedge"], p["credit"]
    print("=" * 68)
    print(f" 채권 포트폴리오 액션 플랜  ({p['asof']} 종가 기준, 운용규모 {p['aum_eok']:,.0f}억 원)")
    print("=" * 68)
    print(f"\n[진단] {d['verdict']} (주도: {d['driver']})  |  금리 {d['rate_verdict']}: Kim {d['regime']} "
          f"(P_High-Vol {d['p_high_vol']:.2f}), Composite {d['composite']:.3f} {d['state']}"
          f"  |  신용 {d['credit_verdict']}: 스트레스 {d['credit_stress']:.3f} {d['credit_state']}")
    print(f"       국고10Y {d['y10']:.3f}%, 60일 추세 t={d['t60']:+.2f}, 1년 고점 대비 손실 {d['tr_dd']:.1%}")

    print(f"\n[1] 목표 듀레이션: {du['current']:.2f}년 -> {du['target']:.2f}년  "
          f"(벤치마크의 {du['mult']:.0%}, {du['change']:+.2f}년)")
    print(f"    근거: 10Y 20일 변동성 {du['sigma20_bp']:.2f}bp/일 vs 기준 {du['sigma_ref_bp']:.2f}bp/일 "
          f"-> 금리위험을 평시 수준으로 맞추려면 듀레이션 {du['mult']:.0%}")
    act = "줄이세요" if du["change"] < -0.1 else "늘리세요" if du["change"] > 0.1 else "유지하세요"
    print(f"    => 듀레이션을 {abs(du['change']):.2f}년 {act}.")

    print(f"\n[2] 커브 포지션: {c['name']} (20일간 10Y {c['d_y10_20bp']:+.0f}bp, "
          f"10Y-3Y {c['d_term_20bp']:+.0f}bp - {c['reason']})")
    print(f"    => {c['trade']}")

    print("\n[3-A] 현물 재배분안")
    print(f"    {'종목':10s} {'듀레이션':>7} {'현재':>7} {'목표':>7} {'매매(억)':>10}")
    for i, v in p["cash_rebalance"].items():
        tag = "매수" if v["trade_eok"] > 0.5 else "매도" if v["trade_eok"] < -0.5 else ""
        print(f"    {LABEL[i]:10s} {v['duration']:7.2f} {v['current']:7.0%} {v['target']:7.0%} "
              f"{v['trade_eok']:+10,.0f} {tag}")

    print(f"\n[3-B] 선물 헤지안 (현물 유지, 동적 헤지): {f['contract']} {abs(f['contracts']):,.0f}계약 {f['side']}")
    print(f"    계약당 DV01 약 {f['dv01_per_contract_won']:,.0f}원/bp, "
          f"포트폴리오 DV01 변화 {f['portfolio_dv01_change_won'] / 1e6:+,.1f}백만원/bp")
    print("    현물 매매 비용·세금을 피하고 캐리는 유지. 신호가 풀리면 선물만 환매해 원복.")

    print(f"\n[4] 크레딧: {cr['action']}  (현재 {cr['current_weight']:.0%} -> 목표 {cr['target_weight']:.0%}, "
          f"{cr['trade_eok']:+,.0f}억, 국고 3년과 교체하면 듀레이션 영향 없음)")
    print(f"    근거: {cr['reason']}")
    print(f"    AA- 스프레드 {cr['spread_bp']:.0f}bp (누적 z {cr['spread_z']:+.2f}, 20일 {cr['chg20_bp']:+.0f}bp), "
          f"CP-CD {cr['cp_cd_bp']:.0f}bp (20일 {cr['cp_cd_chg20_bp']:+.0f}bp) -> 신용 스트레스 {cr['stress']:.2f} {cr['state']}")
    print(f"    단기 자금: {cr['short_term']}")

    print("\n[5] 트리거")
    for k, v in p["triggers"].items():
        print(f"    {k}: {v}")

    print("\n[6] 백테스트 (같은 규칙을 매일 적용, 전일 신호로 당일 보유, 비용 반영)")
    print(f"    {'':10s} {'연수익률':>8} {'연변동성':>8} {'수익/위험':>8} {'최대낙폭':>8} {'리밸런싱/년':>10}")
    for name, row in perf_tbl.iterrows():
        print(f"    {name:10s} {row['연수익률']:8.2%} {row['연변동성']:8.2%} {row['수익/위험']:8.2f} "
              f"{row['최대낙폭']:8.1%} {row['연간 리밸런싱']:10.0f}")
    print("\n    연도별 수익률")
    print(yr.to_string(float_format=lambda x: f"{x:+.2%}"))
    cs = p.get("credit_backtest")
    if cs:
        cy = cs["crisis_years"]
        print(f"\n    크레딧 슬리브 (포트 대비 기여, 고정 {CREDIT_BM:.0%} vs 규칙): "
              f"연 {cs['static_ann']:+.3%} vs {cs['rule_ann']:+.3%} (초과 {cs['excess_ann'] * 100:+.3f}%p), "
              f"최대낙폭 {cs['static_mdd']:.2%} vs {cs['rule_mdd']:.2%}, 평균비중 {cs['avg_weight']:.0%}")
        print(f"    위기 해 초과: 2020 {cy['2020'] * 100:+.2f}%p · 2022 {cy['2022'] * 100:+.2f}%p · "
              f"2023 {cy['2023'] * 100:+.2f}%p  (크레딧 프리미엄 자체는 100% 기준 연 {cs['credit_premium_ann']:.2%})")
    print("\n  * 규칙 기반 참고안이며 투자 자문이 아닙니다. 듀레이션 규칙은 그날까지의 데이터만 쓰지만, "
          "커브 경계값 등은 이 표본을 보고 정했으므로 실제 성과는 더 나쁠 수 있습니다. "
          "크레딧 백테스트는 부도 손실을 반영하지 않습니다.")


def plot(sig: pd.DataFrame, bt: pd.DataFrame, path: Path, cb: pd.DataFrame | None = None):
    set_korean_font()
    fig, axes = plt.subplots(5, 1, figsize=(14, 16), sharex=True,
                             gridspec_kw={"height_ratios": [1, 1, 1, 0.7, 0.8]})
    ax = axes[0]
    ax.plot(bt.index, bt["D_BM"], color="#888", lw=1, ls="--", label="벤치마크 듀레이션")
    ax.plot(sig.index, sig["D_target"], color="#3B6EA8", lw=0.8, alpha=0.6, label="목표 듀레이션(일별 신호)")
    ax.step(bt.index, bt["D_held"], color="#1F2D3D", lw=1.2, where="post", label="보유 듀레이션(리밸런싱 후)")
    ax.set_ylabel("년")
    ax.set_title("동적 듀레이션: 금리 변동성이 커지면 줄이고, 잦아들면 복원", loc="left", fontsize=12)
    ax.legend(loc="upper left", frameon=False, ncol=3)

    ax = axes[1]
    cols = ["#9DB8D9", "#3B6EA8", "#1F2D3D", "#8E6BB8"]
    ax.stackplot(bt.index, bt[[f"w_{i}" for i in INSTRUMENTS]].T.values, colors=cols, alpha=0.9,
                 labels=[LABEL[i] for i in INSTRUMENTS], step="post")
    ax.set_ylim(0, 1)
    ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda v, _: f"{v:.0%}"))
    ax.set_title("만기별 보유 비중 (커브 뷰 반영)", loc="left", fontsize=12)
    ax.legend(loc="upper left", frameon=False, ncol=4)

    ax = axes[2]
    ax.plot(bt.index, bt["nav_bm"], color="#888", lw=1.1, label="벤치마크 (3Y/10Y 50:50 고정)")
    ax.plot(bt.index, bt["nav_strategy"], color="#C8453B", lw=1.3, label="액션 플랜 전략")
    ax.set_title("누적 성과 (캐리 + 가격 - 비용)", loc="left", fontsize=12)
    ax.legend(loc="upper left", frameon=False)

    ax = axes[3]
    ax.plot(sig.index, sig["composite"], color="#1F2D3D", lw=1)
    ax.fill_between(sig.index, sig["P_High-Vol"], color="#C8453B", alpha=0.35, lw=0, label="P(High-Vol)")
    ax.axhline(0.4, color="#555", ls="--", lw=0.8)
    ax.set_ylim(0, 1)
    ax.set_title("입력 신호: Composite(선) / Kim High-Vol 확률(면)", loc="left", fontsize=12)

    ax = axes[4]
    if cb is not None:
        ax.fill_between(sig.index, sig["credit_stress"], color="#7A4FB0", alpha=0.25, lw=0, label="신용 스트레스")
        ax.step(cb.index, cb["w_rule"], color="#7A4FB0", lw=1.3, where="post", label="크레딧 비중(규칙)")
        ax.axhline(CREDIT_BM, color="#888", ls="--", lw=0.9, label=f"벤치마크 {CREDIT_BM:.0%}")
        ax.set_ylim(0, 1)
        ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda v, _: f"{v:.0%}"))
        ax.legend(loc="upper left", frameon=False, ncol=3)
    ax.set_title("크레딧: 스프레드가 넓어지는 동안은 줄이고, 멈추면 넓은 스프레드를 담는다", loc="left", fontsize=12)
    ax.xaxis.set_major_locator(mdates.YearLocator())
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%Y"))
    for a in axes:
        a.grid(alpha=0.25)
        a.spines[["top", "right"]].set_visible(False)
    fig.tight_layout()
    fig.savefig(path, dpi=130)
    plt.close(fig)


def main(aum_eok: float = 1000.0):
    sig = build_signals(load())
    bt = backtest(sig)
    perf_tbl = pd.DataFrame({"벤치마크": perf(bt["ret_bm"]), "액션 플랜": perf(bt["ret_strategy"])}).T
    perf_tbl["연간 리밸런싱"] = [0.0, (bt["cost"] > 0).sum() / (len(bt) / 252)]
    yr = bt[["ret_bm", "ret_strategy"]].groupby(bt.index.year).apply(lambda g: (1 + g).prod() - 1)
    yr.columns = ["벤치마크", "액션 플랜"]
    yr["초과"] = yr["액션 플랜"] - yr["벤치마크"]

    cb = credit_backtest(sig)

    p = plan_for(sig, aum_eok)
    p["backtest"] = {k: {m: float(v) for m, v in row.items()} for k, row in perf_tbl.iterrows()}
    p["credit_backtest"] = credit_summary(cb)
    p["generated_at"] = datetime.now().isoformat(timespec="seconds")
    print_plan(p, perf_tbl, yr)

    (BOND / "korea_bond_action_plan.json").write_text(json.dumps(p, ensure_ascii=False, indent=2), encoding="utf-8")
    keep = ["composite", "state", "P_High-Vol", "t60", "sigma20_bp", "sigma_ref_bp", "D_BM", "dur_mult",
            "D_target", "curve_view",
            "dY10_20bp", "dTERM_20bp", "cs_chg60bp", "cs_pct1y", "st_pct1y",
            "credit_stress", "credit_state", "cs_bp", "cs_z", "cs_chg20_bp", "w_credit", "cp_pickup_bp"]
    sig[keep].join(verdict_history(sig)).to_csv(BOND / "korea_bond_action_history.csv", encoding="utf-8-sig")
    bt.to_csv(BOND / "korea_bond_action_backtest.csv", encoding="utf-8-sig")
    cb.to_csv(BOND / "korea_bond_credit_backtest.csv", encoding="utf-8-sig")
    plot(sig, bt, BOND / "korea_bond_action_plan.png", cb)
    print("\n  저장: korea_bond_action_plan.json, korea_bond_action_history.csv,")
    print("        korea_bond_action_backtest.csv, korea_bond_credit_backtest.csv, korea_bond_action_plan.png")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="채권 액션 플랜")
    ap.add_argument("--aum", type=float, default=1000.0, help="운용규모(억 원), 기본 1000")
    main(ap.parse_args().aum)
