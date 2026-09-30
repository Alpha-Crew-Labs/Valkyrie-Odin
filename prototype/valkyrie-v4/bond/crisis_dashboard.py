"""[3단계] Crisis Dashboard for Korean Bond Market
(스펙: 채권/KIM_FILTER_BOND_RISK_SYSTEM_REBUILD_v3.md §3-4)

4가지 위기 지표 통합 (국고채 10년 기준):
  1. sigma-Spike : 변동성 점프 (20일 롤링 표준편차의 z-score)
  2. mu-Drift    : 평균 표류 (60일 평균 변화의 t-stat, 금리상승 방향만)
  3. Cum-60d     : 60일 누적 변화 bp (금리상승 방향만)
  4. TR-DD       : Total Return Drawdown, 1년 롤링 고점 대비 (duration 8.5)

각 지표는 0~1 점수로 변환 후 0.2/0.2/0.2/0.4 가중합한다. 원본 정규화 코드는 스펙에 없어서
(스펙 §9 #3) 아래 SCORE_CAP으로 재구성했다. 스펙의 2026-05-06 로그값을 넣으면 0.350 (원본 0.357).

Kim Filter 결과(korea_bond_regime_probs.csv)가 있으면 §4.2 액션 매트릭스로 종합 판정도 출력한다.

모형 C · 신용 스트레스 (스펙 외 확장): 회사채 AA- 3년 − 국고 3년 스프레드와 CP91 − CD91 스프레드의
수준(그날까지의 누적 z)과 20일 확대폭을 0~1로 바꿔 0.3/0.3/0.2/0.2로 합친다. 금리 점수만으로는 2020년
코로나 신용경색(금리 점수 최고 0.27)을 놓쳤지만 신용 스트레스는 1.0을 기록했다. 종합 판정은 금리(A+B)와
신용(C) 중 더 나쁜 쪽을 따른다.
"""
from __future__ import annotations

import sys
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
import matplotlib

matplotlib.use("Agg")
import matplotlib.dates as mdates  # noqa: E402
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib import font_manager  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from valkyrie.paths import BOND  # noqa: E402

warnings.filterwarnings("ignore")
try:
    sys.stdout.reconfigure(errors="replace")
except Exception:
    pass

DATA_DIR = BOND
YIELDS_CSV = "korea_bond_yields.csv"
FACTORS_CSV = "korea_bond_factors.csv"
SPREADS_CSV = "korea_bond_spreads.csv"
REGIME_CSV = "korea_bond_regime_probs.csv"

OUT_PNG = "korea_bond_crisis_dashboard.png"
OUT_CSV1 = "korea_bond_crisis_indicators.csv"
OUT_CSV2 = "korea_bond_crisis_episodes.csv"
OUT_CSV3 = "korea_bond_credit_episodes.csv"

DURATION = 8.5            # 10년물 근사 modified duration
WIN_SIGMA, WIN_MU, WIN_CUM, WIN_DD = 20, 60, 60, 252
WEIGHTS = {"sigma_spike": 0.20, "mu_drift": 0.20, "cum60d": 0.20, "tr_dd": 0.40}
SCORE_CAP = {"sigma_spike": 3.0,    # z = +3 이면 만점
             "mu_drift": 3.0,       # t = +3 이면 만점
             "cum60d": 100.0,       # +100bp 이면 만점
             "tr_dd": 0.20}         # -20% 이면 만점
EPISODE_THRESHOLD, EPISODE_MIN_DAYS = 0.40, 3
STATE_BANDS = [(0.30, "NORMAL"), (0.50, "WARNING"), (0.65, "HIGH"), (np.inf, "SEVERE")]

ACTION_MATRIX = {   # (Kim regime 그룹, composite state) -> (종합 판정, 액션) - 스펙 §4.2 제안안
    "안정": "정기 모니터링 유지",
    "주의": "포지션 듀레이션 점검, 주간 모니터링 전환",
    "경계": "헤지 비중 확대 검토, 일일 모니터링",
    "위기": "즉시 리스크위원회 소집, 손절 기준 점검",
}

# 모형 C · 신용 스트레스
CREDIT_WEIGHTS = {"aa_level": 0.30, "aa_widen": 0.30, "st_level": 0.20, "st_widen": 0.20}
CREDIT_CAP = {"aa_level": 3.0,      # AA- 스프레드 누적 z = +3 이면 만점
              "aa_widen": 20.0,     # AA- 스프레드 20일 +20bp 확대면 만점
              "st_level": 3.0,      # CP-CD 누적 z = +3 이면 만점
              "st_widen": 30.0}     # CP-CD 20일 +30bp 확대면 만점
CREDIT_Z_MIN_OBS = 250              # z 계산에 필요한 최소 관측 (그 전에는 0)
VERDICT_ORDER = ["안정", "주의", "경계", "위기"]
CREDIT_VERDICT = {"NORMAL": "안정", "WARNING": "주의", "HIGH": "경계", "SEVERE": "위기"}
CREDIT_ACTION = {
    "안정": "정기 모니터링 유지",
    "주의": "회사채·CP 신규 매수 속도 조절, 스프레드 주간 점검",
    "경계": "크레딧 비중 축소 검토, 발행시장·CP 차환 일일 모니터링",
    "위기": "크레딧 익스포저 즉시 점검, 국고·통안 중심으로 유동성 확보",
}


def set_korean_font():
    names = {f.name for f in font_manager.fontManager.ttflist}
    for cand in ("Malgun Gothic", "AppleGothic", "NanumGothic"):
        if cand in names:
            plt.rcParams["font.family"] = cand
            break
    plt.rcParams["axes.unicode_minus"] = False


def classify_state(c: float) -> str:
    for upper, label in STATE_BANDS:
        if c < upper:
            return label
    return STATE_BANDS[-1][1]


def compute_indicators(y10: pd.Series) -> pd.DataFrame:
    dy = y10.diff() * 100                                              # bp/day
    sigma20 = dy.rolling(WIN_SIGMA).std()
    sigma_z = (sigma20 - sigma20.mean()) / sigma20.std()
    mu60 = dy.rolling(WIN_MU).mean()
    t60 = mu60 / (dy.rolling(WIN_MU).std() / np.sqrt(WIN_MU))
    cum60 = (y10 - y10.shift(WIN_CUM)) * 100
    tr = (1 - DURATION * dy.fillna(0) / 10000).cumprod()               # 가격수익 기반 TR 지수
    tr_dd = tr / tr.rolling(WIN_DD, min_periods=1).max() - 1

    ind = pd.DataFrame({
        "Y10Y": y10, "dY_bp": dy, "sigma20_bp": sigma20, "sigma_z": sigma_z,
        "mu60_bp": mu60, "t60": t60, "cum60_bp": cum60, "tr_index": tr, "tr_dd": tr_dd,
    })
    ind["score_sigma_spike"] = (sigma_z / SCORE_CAP["sigma_spike"]).clip(0, 1)
    ind["score_mu_drift"] = (t60 / SCORE_CAP["mu_drift"]).clip(0, 1)          # 양수만
    ind["score_cum60d"] = (cum60 / SCORE_CAP["cum60d"]).clip(0, 1)            # 양수만
    ind["score_tr_dd"] = (-tr_dd / SCORE_CAP["tr_dd"]).clip(0, 1)
    ind["composite"] = sum(w * ind[f"score_{k}"] for k, w in WEIGHTS.items())
    ind = ind.iloc[max(WIN_MU, WIN_CUM):]                                     # 워밍업 제거
    ind["state"] = ind["composite"].map(classify_state)
    return ind


def detect_episodes(ind: pd.DataFrame) -> pd.DataFrame:
    above = ind["composite"] >= EPISODE_THRESHOLD
    run_id = (above != above.shift()).cumsum()
    rows = []
    for _, g in ind[above].groupby(run_id[above]):
        if len(g) >= EPISODE_MIN_DAYS:
            rows.append({"start": g.index[0].date(), "end": g.index[-1].date(), "days": len(g),
                         "max_composite": round(g["composite"].max(), 3),
                         "max_drawdown": round(g["tr_dd"].min(), 4)})
    return pd.DataFrame(rows, columns=["start", "end", "days", "max_composite", "max_drawdown"])


def expanding_z(x: pd.Series, min_obs: int = CREDIT_Z_MIN_OBS) -> pd.Series:
    """그날까지의 데이터만 쓰는 z-score (look-ahead 없음). 관측이 부족한 초기에는 0."""
    return ((x - x.expanding(min_obs).mean()) / x.expanding(min_obs).std()).fillna(0.0)


def compute_credit(spreads: pd.DataFrame) -> pd.DataFrame:
    """모형 C · 신용 스트레스. 넓어질 때만 위험으로 센다 (좁아지는 건 위험이 아님)."""
    cs = spreads["CORP_AA_SPREAD"] * 100          # 회사채 AA- 3년 - 국고 3년 (bp)
    st = spreads["ST_CREDIT_SPREAD"] * 100        # CP91 - CD91 (bp)
    cr = pd.DataFrame({"cs_bp": cs, "cs_z": expanding_z(cs), "cs_chg20_bp": cs.diff(20),
                       "st_bp": st, "st_z": expanding_z(st), "st_chg20_bp": st.diff(20)})
    cr["score_aa_level"] = (cr["cs_z"] / CREDIT_CAP["aa_level"]).clip(0, 1)
    cr["score_aa_widen"] = (cr["cs_chg20_bp"] / CREDIT_CAP["aa_widen"]).clip(0, 1)
    cr["score_st_level"] = (cr["st_z"] / CREDIT_CAP["st_level"]).clip(0, 1)
    cr["score_st_widen"] = (cr["st_chg20_bp"] / CREDIT_CAP["st_widen"]).clip(0, 1)
    cr["credit_stress"] = sum(w * cr[f"score_{k}"].fillna(0) for k, w in CREDIT_WEIGHTS.items())
    cr["credit_state"] = cr["credit_stress"].map(classify_state)
    return cr


def detect_runs(score: pd.Series, extra: pd.DataFrame, threshold: float = EPISODE_THRESHOLD,
                min_days: int = EPISODE_MIN_DAYS) -> list[tuple[pd.Series, pd.DataFrame]]:
    above = score >= threshold
    run_id = (above != above.shift()).cumsum()
    return [(g, extra.loc[g.index]) for _, g in score[above].groupby(run_id[above]) if len(g) >= min_days]


def detect_credit_episodes(cr: pd.DataFrame) -> pd.DataFrame:
    rows = [{"start": g.index[0].date(), "end": g.index[-1].date(), "days": len(g),
             "max_stress": round(g.max(), 3), "max_aa_spread_bp": round(x["cs_bp"].max(), 1),
             "max_cp_cd_bp": round(x["st_bp"].max(), 1)}
            for g, x in detect_runs(cr["credit_stress"], cr)]
    return pd.DataFrame(rows, columns=["start", "end", "days", "max_stress", "max_aa_spread_bp", "max_cp_cd_bp"])


def combined_view(state: str, composite: float, regime: str | None) -> tuple[str, str]:
    """§4.2 액션 매트릭스(금리 위험). Kim regime이 없으면 composite 단독 판정."""
    if composite >= 0.65 and regime in (None, "High-Vol"):
        verdict = "위기"
    elif state in ("HIGH", "SEVERE"):
        verdict = "경계"
    elif state == "WARNING" or regime == "High-Vol":
        verdict = "주의"
    else:
        verdict = "안정"
    return verdict, ACTION_MATRIX[verdict]


def overall_view(state: str, composite: float, regime: str | None, credit_state: str | None) -> dict:
    """종합 판정 = 금리(A+B)와 신용(C) 중 더 나쁜 쪽. driver는 어느 쪽이 판정을 끌어올렸는지."""
    rate_v, rate_act = combined_view(state, composite, regime)
    credit_v = CREDIT_VERDICT.get(credit_state, "안정") if credit_state else "안정"
    r, c = VERDICT_ORDER.index(rate_v), VERDICT_ORDER.index(credit_v)
    verdict = VERDICT_ORDER[max(r, c)]
    if max(r, c) == 0:
        driver, action = "없음", ACTION_MATRIX["안정"]
    elif r > c:
        driver, action = "금리", rate_act
    elif c > r:
        driver, action = "신용", CREDIT_ACTION[credit_v]
    else:
        driver, action = "금리+신용", f"{rate_act} · {CREDIT_ACTION[credit_v]}"
    return {"verdict": verdict, "monitoring": action, "driver": driver,
            "rate_verdict": rate_v, "credit_verdict": credit_v}


def plot_dashboard(ind: pd.DataFrame, eps: pd.DataFrame, path: Path, ceps: pd.DataFrame | None = None):
    set_korean_font()
    fig, axes = plt.subplots(6, 1, figsize=(14, 18), sharex=True,
                             gridspec_kw={"height_ratios": [1.1, 0.8, 0.8, 0.8, 1.1, 1.1]})

    def shade(ax):
        for _, r in eps.iterrows():
            ax.axvspan(pd.Timestamp(r["start"]), pd.Timestamp(r["end"]), color="#C8453B", alpha=0.15, lw=0)

    panels = [
        ("Y10Y", "금리 (%)", "국고채 10년 금리와 Composite 위기 episode (음영)", "#1F2D3D"),
        ("sigma20_bp", "bp/day", "sigma-Spike: 20일 변동성 (가중 0.20)", "#3B6EA8"),
        ("t60", "t-stat", "mu-Drift: 60일 추세 t-stat, 양수만 위기 (가중 0.20)", "#8E6BB8"),
        ("tr_dd", "drawdown", "TR-DD: 1년 고점 대비 Total Return 낙폭 (가중 0.40)", "#C8453B"),
    ]
    for ax, (col, ylabel, title, color) in zip(axes[:4], panels):
        ax.plot(ind.index, ind[col], color=color, lw=1)
        shade(ax)
        ax.set_ylabel(ylabel)
        ax.set_title(title, loc="left", fontsize=12)
    ax2 = axes[2].twinx()
    ax2.plot(ind.index, ind["cum60_bp"], color="#E0A030", lw=0.9, alpha=0.8)
    ax2.set_ylabel("Cum-60d (bp)", color="#B07A10")
    axes[2].axhline(0, color="#888", lw=0.6)
    axes[3].yaxis.set_major_formatter(plt.FuncFormatter(lambda v, _: f"{v:.0%}"))

    ax = axes[4]
    ax.plot(ind.index, ind["composite"], color="#1F2D3D", lw=1.1)
    for (lo, hi), c in zip([(0, 0.30), (0.30, 0.50), (0.50, 0.65), (0.65, 1.0)],
                           ["#4C9F70", "#E0A030", "#D9713A", "#C8453B"]):
        ax.axhspan(lo, hi, color=c, alpha=0.10, lw=0)
    ax.axhline(EPISODE_THRESHOLD, color="#555", ls="--", lw=0.8)
    ax.set_ylim(0, 1)
    ax.set_ylabel("composite")
    ax.set_title("Composite (NORMAL <0.30 / WARNING <0.50 / HIGH <0.65 / SEVERE), episode 기준 0.40",
                 loc="left", fontsize=12)

    ax = axes[5]
    if "credit_stress" in ind:
        for (lo, hi), c in zip([(0, 0.30), (0.30, 0.50), (0.50, 0.65), (0.65, 1.0)],
                               ["#4C9F70", "#E0A030", "#D9713A", "#C8453B"]):
            ax.axhspan(lo, hi, color=c, alpha=0.10, lw=0)
        for _, r in (ceps if ceps is not None else pd.DataFrame()).iterrows():
            ax.axvspan(pd.Timestamp(r["start"]), pd.Timestamp(r["end"]), color="#7A4FB0", alpha=0.15, lw=0)
        ax.plot(ind.index, ind["credit_stress"], color="#7A4FB0", lw=1.1, label="신용 스트레스")
        ax.plot(ind.index, ind["composite"], color="#1F2D3D", lw=0.8, alpha=0.45, label="금리 위기점수(참고)")
        ax.axhline(EPISODE_THRESHOLD, color="#555", ls="--", lw=0.8)
        ax.set_ylim(0, 1)
        ax.legend(loc="upper left", frameon=False, ncol=2)
    ax.set_ylabel("credit stress")
    ax.set_title("모형 C · 신용 스트레스 (회사채 AA- 스프레드 + CP-CD 스프레드), 보라 음영 = 신용 위기 구간",
                 loc="left", fontsize=12)
    ax.xaxis.set_major_locator(mdates.YearLocator())
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%Y"))
    for a in axes:
        a.grid(alpha=0.25)
        a.spines[["top", "right"]].set_visible(False)
    fig.tight_layout()
    fig.savefig(path, dpi=130)
    plt.close(fig)


def main():
    print("=" * 64)
    print(" Crisis Composite Dashboard - 한국 국고채 10년")
    print("=" * 64)
    y = pd.read_csv(DATA_DIR / YIELDS_CSV, index_col=0, parse_dates=True)
    ind = compute_indicators(y["Y10Y"].dropna())
    eps = detect_episodes(ind)
    s = pd.read_csv(DATA_DIR / SPREADS_CSV, index_col=0, parse_dates=True)
    cr = compute_credit(s).reindex(ind.index)
    ind = ind.join(cr)
    ceps = detect_credit_episodes(ind)

    print(f"  기간: {ind.index[0]:%Y-%m-%d} ~ {ind.index[-1]:%Y-%m-%d} ({len(ind)}일)")
    print(f"\n  위기 episode: composite >= {EPISODE_THRESHOLD}, 최소 {EPISODE_MIN_DAYS}일 -> {len(eps)}건")
    if len(eps):
        print(eps.to_string(index=False))

    last = ind.iloc[-1]
    print(f"\n  CURRENT STATE ({ind.index[-1]:%Y-%m-%d})")
    print(f"    Y10Y        : {last['Y10Y']:.3f}%")
    print(f"    sigma20     : {last['sigma20_bp']:.2f} bp/day  (z={last['sigma_z']:+.2f})")
    print(f"    mu60/t-stat : {last['mu60_bp']:+.2f} bp/day (t={last['t60']:+.2f})")
    print(f"    Cum-60d     : {last['cum60_bp']:+.1f} bp")
    print(f"    TR_DD (1Y)  : {last['tr_dd']:.2%}")
    print(f"    Composite   : {last['composite']:.3f}  ({last['state']})")

    regime = None
    rp = DATA_DIR / REGIME_CSV
    if rp.exists():
        r = pd.read_csv(rp, index_col=0, parse_dates=True)
        pcols = [c for c in r.columns if c.startswith("P_")]
        regime = r[pcols].iloc[-1].idxmax()[2:]
        print(f"\n  Kim Filter regime ({r.index[-1]:%Y-%m-%d}): {regime}  "
              f"(P_High-Vol={r['P_High-Vol'].iloc[-1]:.3f})")
    print(f"\n  모형 C · 신용 스트레스 ({ind.index[-1]:%Y-%m-%d})")
    print(f"    AA- 스프레드 : {last['cs_bp']:.1f}bp (누적 z {last['cs_z']:+.2f}, 20일 {last['cs_chg20_bp']:+.1f}bp)")
    print(f"    CP-CD 스프레드: {last['st_bp']:.1f}bp (누적 z {last['st_z']:+.2f}, 20일 {last['st_chg20_bp']:+.1f}bp)")
    print(f"    신용 스트레스 : {last['credit_stress']:.3f}  ({last['credit_state']})")
    print(f"\n  신용 위기 구간: 신용 스트레스 >= {EPISODE_THRESHOLD}, 최소 {EPISODE_MIN_DAYS}일 -> {len(ceps)}건")
    if len(ceps):
        print(ceps.to_string(index=False))

    ov = overall_view(last["state"], last["composite"], regime, last["credit_state"])
    print(f"\n  금리 판정 {ov['rate_verdict']} · 신용 판정 {ov['credit_verdict']}")
    print(f"  종합 판정: {ov['verdict']} (주도: {ov['driver']}) -> {ov['monitoring']}")
    print("  (액션 매트릭스는 스펙 §4.2의 신규 설계 제안안이며 원본 코드 로직이 아님)")

    ind.index.name = "date"
    ind.to_csv(DATA_DIR / OUT_CSV1, encoding="utf-8-sig")
    eps.to_csv(DATA_DIR / OUT_CSV2, index=False, encoding="utf-8-sig")
    ceps.to_csv(DATA_DIR / OUT_CSV3, index=False, encoding="utf-8-sig")
    plot_dashboard(ind, eps, DATA_DIR / OUT_PNG, ceps)
    print(f"\n  저장: {OUT_CSV1}, {OUT_CSV2}, {OUT_CSV3}, {OUT_PNG}")


if __name__ == "__main__":
    main()
