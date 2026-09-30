"""주식(KOSPI) 위험 진단 & 비중 조절 규칙 — explainer_app.py가 쓰는 결정론적 계산.

입력은 전부 data/00_RAW (collect.py + collect_naver.py 결과). 같은 입력이면 같은 출력.
  naver/ohlcv_kospi.csv, ohlcv_kpi200.csv   지수 일봉
  naver/liquidity.csv                        고객예탁금 · 신용잔고 · 펀드 잔고 (억원)
  naver/investor_flow_{kospi,kosdaq}.csv     투자자별 순매수 (억원, 최근 200거래일)
  bok_rate.csv                               현금 수익률 (기준금리)

규칙: 매일 종가에 그날까지의 정보로 다음 날 주식 비중을 정한다.
  목표 비중 = 기준 변동성 ÷ 20일 변동성 (0.3~1.2배), ±0.10 밴드 밖일 때만 리밸런싱.

외부 사용처: VALKYRIE v4 valkyrie/tools.py가 load() → build_signals(d, market) → plan_for(s, aum)를 부른다.
  읽는 필드 — 신호: composite, state, w_target / plan: asof, diagnosis{verdict, driver, contrib},
  exposure{current, target, change}, futures{contract, contracts, side}. 이름을 바꾸기 전에 ravens-e1과 맞출 것.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from valkyrie.paths import RAW  # noqa: E402

NAVER = RAW / "naver"
VOL_REF_MIN_OBS = 60        # 기준 변동성(누적 중앙값)을 쓰기 시작하는 최소 관측치
MULT_MIN, MULT_MAX = 0.3, 1.2
REBALANCE_BAND = 0.10
COST_BP = 5.0               # 비중 1.0 회전당 매매비용 (bp)
K200_MULTIPLIER = 250_000   # 코스피200 선물 거래승수 (원/포인트)
WEIGHTS = {"score_vol": .25, "score_dd": .25, "score_trend": .20, "score_lev": .15, "score_liq": .15}
LABEL = {"score_vol": "변동성 급등", "score_dd": "고점 대비 하락", "score_trend": "60일선 이탈",
         "score_lev": "빚투 과열", "score_liq": "예탁금 이탈"}
STATES = [(.30, "NORMAL"), (.45, "WARNING"), (.60, "HIGH"), (9, "SEVERE")]
VERDICT = {"NORMAL": "안정", "WARNING": "주의", "HIGH": "경계", "SEVERE": "위기"}


def _csv(path):
    return pd.read_csv(path, index_col=0, parse_dates=True).sort_index()


def load():
    return {
        "kospi": _csv(NAVER / "ohlcv_kospi.csv"),
        "kosdaq": _csv(NAVER / "ohlcv_kosdaq.csv"),
        "k200": _csv(NAVER / "ohlcv_kpi200.csv"),
        "liq": _csv(NAVER / "liquidity.csv"),
        "flow_kospi": _csv(NAVER / "investor_flow_kospi.csv"),
        "flow_kosdaq": _csv(NAVER / "investor_flow_kosdaq.csv"),
        "bok": _csv(RAW / "bok_rate.csv")["value"],
        "ktb3": _csv(RAW / "ktb3.csv")["value"],
    }


def load_json(name):
    return json.loads((NAVER / f"{name}.json").read_text(encoding="utf-8"))


MARKETS = {"kospi": "코스피", "kosdaq": "코스닥"}
RISK_LEVELS = {"보수": 0.8, "중립": 1.0, "공격": 1.25}   # 목표 위험 = 평소 변동성 × 배수


def build_signals(d, market="kospi", risk=1.0):
    px = d[market]
    s = pd.DataFrame(index=px.index)
    s["close"] = px["close"]
    s["ret"] = s["close"].pct_change()
    s["vol20"] = np.log(s["close"]).diff().rolling(20).std() * np.sqrt(252)
    s["vol_ref"] = s["vol20"].expanding(min_periods=VOL_REF_MIN_OBS).median()
    s["vol_ratio"] = s["vol20"] / s["vol_ref"]
    s["gap60"] = s["close"] / s["close"].rolling(60).mean() - 1
    s["dd120"] = s["close"] / s["close"].rolling(120, min_periods=20).max() - 1
    s["ret60"] = s["close"].pct_change(60)

    # 증시자금은 하루 늦게 공표된다 → 하루 밀어서 그날 알 수 있던 값만 쓴다.
    liq = d["liq"].reindex(s.index.union(d["liq"].index)).ffill().shift(1).reindex(s.index)
    s["deposit"], s["credit"] = liq["customer_deposit"], liq["credit_loan"]
    s["fund_equity"], s["fund_bond"] = liq["fund_equity"], liq["fund_bond"]
    s["lev"] = s["credit"] / s["deposit"]
    s["lev_pct"] = s["lev"].expanding(min_periods=VOL_REF_MIN_OBS).rank(pct=True)
    s["dep_chg20"] = s["deposit"].pct_change(20)

    s["score_vol"] = ((s["vol_ratio"] - 1) / 1.0).clip(0, 1)      # 평소의 2배면 만점
    s["score_dd"] = (-s["dd120"] / 0.15).clip(0, 1)               # 고점 −15%면 만점
    s["score_trend"] = (-s["gap60"] / 0.08).clip(0, 1)            # 60일선 −8%면 만점
    s["score_lev"] = ((s["lev_pct"] - .5) * 2).clip(0, 1)         # 신용/예탁금 비율 상위 절반부터
    s["score_liq"] = (-s["dep_chg20"] / 0.10).clip(0, 1)          # 예탁금 20일 −10%면 만점
    s["composite"] = sum(w * s[k] for k, w in WEIGHTS.items())
    s["state"] = s["composite"].apply(lambda v: next(n for t, n in STATES if v < t) if pd.notna(v) else None)
    s["regime"] = pd.cut(s["vol_ratio"], [-np.inf, .85, 1.25, np.inf], labels=["Low-Vol", "Normal", "High-Vol"])
    s["w_target"] = (risk / s["vol_ratio"]).clip(MULT_MIN, MULT_MAX)
    full = px["close"]
    s["ma200"] = full.rolling(200, min_periods=120).mean().reindex(s.index)

    cash = d["bok"].reindex(s.index.union(d["bok"].index)).ffill().reindex(s.index)
    s["cash_daily"] = cash / 100 / 252
    s["ktb3"] = d["ktb3"].reindex(s.index.union(d["ktb3"].index)).ffill().reindex(s.index)
    s["k200"] = d["k200"]["close"].reindex(s.index)   # 코스닥도 헤지는 유동성 좋은 코스피200 선물로 근사
    return s.iloc[VOL_REF_MIN_OBS:]


def alternatives(sig, risk=1.0):
    """검증에서 비교한 대안 규칙들 — 전부 문헌에 흔한 형태 그대로, 이 기간에 맞춰 튜닝하지 않았다."""
    above = sig["close"] > sig["ma200"]
    return {
        "위험 점수로 방향 베팅": (1.1 - 1.2 * sig["composite"]).clip(MULT_MIN, MULT_MAX),
        "200일선 추세 (Faber)": pd.Series(np.where(above, 1.0, MULT_MIN), index=sig.index),
        "변동성 + 200일선 (위면 100% 이상)": pd.Series(np.where(above, np.maximum(sig["w_target"], 1.0), sig["w_target"]),
                                             index=sig.index),
        "변동성 맞춤 (최종)": sig["w_target"],
    }


def backtest(sig, col="w_target", band=None):
    band = REBALANCE_BAND if band is None else band
    held, h = [], 1.0
    for w in sig[col]:
        if pd.notna(w) and abs(w - h) > band:
            h = float(w)
        held.append(h)
    bt = pd.DataFrame(index=sig.index)
    bt["w_held"] = held
    w_prev = bt["w_held"].shift(1).fillna(1.0)          # 어제 정한 비중으로 오늘 수익
    turn = bt["w_held"].diff().abs().shift(1).fillna(0)
    bt["ret_bm"] = sig["ret"].fillna(0)
    bt["ret_strategy"] = (w_prev * bt["ret_bm"] + (1 - w_prev) * sig["cash_daily"].fillna(0)
                          - turn * COST_BP / 1e4)
    bt["nav_bm"] = (1 + bt["ret_bm"]).cumprod()
    bt["nav_strategy"] = (1 + bt["ret_strategy"]).cumprod()
    return bt


def perf(ret):
    nav = (1 + ret).cumprod()
    ann = nav.iloc[-1] ** (252 / len(ret)) - 1
    vol = ret.std() * np.sqrt(252)
    return {"연수익률": ann, "연변동성": vol, "수익/위험": ann / vol if vol else np.nan,
            "최대낙폭": float((nav / nav.cummax() - 1).min())}


def plan_for(sig, aum_eok, current=1.0, risk=1.0):
    """sig의 마지막 날 기준 진단과 실행안. aum_eok: 운용규모(억원), current: 현재 주식 비중,
    risk: build_signals에 준 위험 배수 (규칙 문구 표시용)."""
    last = sig.iloc[-1]
    target = float(last["w_target"])
    change = target - current
    k200 = float(last["k200"])
    contracts = change * aum_eok * 1e8 / (k200 * K200_MULTIPLIER)
    contrib = {k: WEIGHTS[k] * float(last[k]) for k in WEIGHTS}
    return {
        "asof": sig.index[-1],
        "diagnosis": {"composite": float(last["composite"]), "state": last["state"],
                      "verdict": VERDICT[last["state"]], "regime": str(last["regime"]),
                      "driver": LABEL[max(contrib, key=contrib.get)], "contrib": contrib},
        "exposure": {"current": current, "target": target, "change": change,
                     "vol20": float(last["vol20"]), "vol_ref": float(last["vol_ref"]),
                     "trade_eok": change * aum_eok, "rebalance": abs(change) > REBALANCE_BAND},
        "futures": {"contract": "코스피200 선물", "contracts": contracts, "side": "매도" if contracts < 0 else "매수",
                    "notional_per_contract_eok": k200 * K200_MULTIPLIER / 1e8, "k200": k200},
        "triggers": {
            "비중": f"목표 = 기준 변동성 {last['vol_ref']:.1%} × 위험 배수 {risk:g} ÷ 20일 변동성, "
                   f"{MULT_MIN}~{MULT_MAX}배 사이로 제한",
            "리밸런싱": f"목표와 보유 비중 차이가 ±{REBALANCE_BAND:.2f} 넘을 때만 (매매비용 {COST_BP:.0f}bp/회전)",
            "위험 점수": "변동성 25% · 고점 대비 하락 25% · 60일선 이탈 20% · 빚투 과열 15% · 예탁금 이탈 15%",
            "판정": "0.30 미만 안정 · 0.45 미만 주의 · 0.60 미만 경계 · 그 이상 위기",
            "헤지": f"현물을 팔지 않고 코스피200 선물(승수 {K200_MULTIPLIER:,}원)로 비중 차이만큼 조정",
        },
    }


if __name__ == "__main__":
    s = build_signals(load())
    p = plan_for(s, 1000)
    print(s[["close", "vol20", "vol_ratio", "dd120", "gap60", "lev_pct", "dep_chg20", "composite", "state", "w_target"]].tail(5))
    print(p["diagnosis"], p["exposure"], p["futures"], sep="\n")
    bt = backtest(s)
    print("bm", perf(bt["ret_bm"]), "\nst", perf(bt["ret_strategy"]))
    print(s["state"].value_counts())
