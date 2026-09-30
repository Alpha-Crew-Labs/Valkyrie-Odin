"""[2단계] Markov-Switching Dynamic Factor Model (MS-DFM) for Korean Yield Curve
(스펙: 채권/KIM_FILTER_BOND_RISK_SYSTEM_REBUILD_v3.md §2)

  - Kim (1994) Filter + Kim smoother + EM
  - 3 Regimes (Low-Vol / Normal / High-Vol): regime이 잠재요인 충격의 분산(Q)을 바꾼다
  - 3 Latent Factors (Level / Slope / Curvature): PCA 초기화
  - 5 Exogenous Factors (신용스프레드 3 / FX / KOSPI): 전일값(t-1)을 관측식에 투입

  dy_t = Lam f_t + B x_{t-1} + e_t,     e_t ~ N(0, R)          (dy: bp/day)
  f_t  = Phi f_{t-1} + eta_t,            eta_t ~ N(0, Q[S_t])
  S_t  ~ Markov(P)

M-step은 붕괴(collapsed)된 평활 모멘트를 쓰는 근사 EM이다 (Kim 필터 자체가 근사이므로 표준 관행).

Input  : data/30_BOND/korea_bond_yields.csv, korea_bond_factors.csv, korea_bond_spreads.csv
Output : data/30_BOND/korea_bond_dashboard_real.png
         korea_bond_regime_probs.csv, korea_bond_latent_factors.csv, korea_bond_crisis_periods.csv
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
from matplotlib.patches import Patch  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from valkyrie.paths import BOND  # noqa: E402

warnings.filterwarnings("ignore")
try:
    sys.stdout.reconfigure(errors="replace")
except Exception:
    pass
np.random.seed(42)

HERE = BOND
N_REGIMES = 3
N_FACTORS = 3
EM_ITERS = 25
TOL = 1e-4
REGIME_NAMES = ["Low-Vol", "Normal", "High-Vol"]
FACTOR_NAMES = ["Level", "Slope", "Curvature"]
SIGMA_SCALE = np.array([0.25, 1.00, 6.00])     # regime별 Sigma_eta 초기 배율
MAX_NAN_SHARE = 0.20                            # 결측이 이보다 많은 만기는 드롭 (예: Y2Y)
LOG2PI = np.log(2 * np.pi)


def set_korean_font():
    names = {f.name for f in font_manager.fontManager.ttflist}
    for cand in ("Malgun Gothic", "AppleGothic", "NanumGothic"):
        if cand in names:
            plt.rcParams["font.family"] = cand
            break
    plt.rcParams["axes.unicode_minus"] = False


def load_data():
    y = pd.read_csv(HERE / "korea_bond_yields.csv", index_col=0, parse_dates=True)
    f = pd.read_csv(HERE / "korea_bond_factors.csv", index_col=0, parse_dates=True)
    s = pd.read_csv(HERE / "korea_bond_spreads.csv", index_col=0, parse_dates=True)
    return y, f, s


def prepare(y: pd.DataFrame, f: pd.DataFrame, s: pd.DataFrame):
    nan_share = y.isna().mean()
    dropped = nan_share[nan_share > MAX_NAN_SHARE]
    for c, share in dropped.items():
        print(f"  드롭: {c} (결측 {int(y[c].isna().sum())}건, {share:.0%}) - 전체 표본 분석을 위해 제외")
    y = y.drop(columns=dropped.index).dropna()
    dy = (y.diff() * 100).dropna()                       # %p -> bp/day

    ex = pd.DataFrame(index=f.index)
    if "CORP_AA_SPREAD" in s:
        ex["dCORP_AA_SPREAD"] = s["CORP_AA_SPREAD"].diff() * 100
    if "ST_CREDIT_SPREAD" in s:
        ex["dST_CREDIT_SPREAD"] = s["ST_CREDIT_SPREAD"].diff() * 100
    if "CORP_AA_MP" in f and "Y3Y" in y:
        ex["dCORP_AA_MP_SPREAD"] = (f["CORP_AA_MP"] - y["Y3Y"].reindex(f.index)).diff() * 100
    if "USDKRW" in f:
        ex["rUSDKRW"] = np.log(f["USDKRW"]).diff() * 100
    if "KOSPI" in f:
        ex["rKOSPI"] = np.log(f["KOSPI"]).diff() * 100
    ex = ex.reindex(dy.index)
    ex = (ex - ex.mean()) / ex.std()
    ex = ex.shift(1).fillna(0.0)                          # 전일 외생변수 (동시점 누수 방지)
    return dy, ex


# ---------------------------------------------------------------- Kim filter / smoother
def kim_filter(Y, X, p):
    Lam, B, R, Phi, Q, P = p["Lam"], p["B"], p["R"], p["Phi"], p["Q"], p["P"]
    T, N = Y.shape
    M, k = Q.shape
    logP = np.log(P)
    Rm = np.diag(R)
    PhiM = np.diag(Phi)

    pr = stationary(P)
    a = np.zeros((M, k))
    Pc = np.array([np.diag(Q[j] / (1 - Phi ** 2)) for j in range(M)])

    out = {
        "pr_filt": np.zeros((T, M)), "pr_pred": np.zeros((T, M)),
        "a_filt": np.zeros((T, M, k)), "P_filt": np.zeros((T, M, k, k)),
        "a_pred": np.zeros((T, M, M, k)), "P_pred": np.zeros((T, M, M, k, k)),
    }
    loglik = 0.0
    for t in range(T):
        # 예측: 이전 regime i -> 현재 regime j
        a_pred = np.broadcast_to((a * Phi)[:, None, :], (M, M, k))
        P_base = PhiM @ Pc @ PhiM                                          # M,k,k
        P_pred = P_base[:, None, :, :] + np.einsum("jk,kl->jkl", Q, np.eye(k))[None, :, :, :]
        v = Y[t] - (a_pred @ Lam.T) - (B @ X[t])                           # M,M,N
        F = Lam @ P_pred @ Lam.T + Rm                                       # M,M,N,N
        Finv = np.linalg.inv(F)
        _, logdet = np.linalg.slogdet(F)
        quad = np.einsum("ijn,ijnm,ijm->ij", v, Finv, v)
        ll = -0.5 * (N * LOG2PI + logdet + quad)

        # 갱신: regime 확률 (log-sum-exp)
        log_joint = logP + np.log(pr + 1e-300)[:, None] + ll
        c = log_joint.max()
        lse = c + np.log(np.exp(log_joint - c).sum())
        loglik += lse
        w = np.exp(log_joint - lse)                                         # M,M
        pr_new = w.sum(axis=0) + 1e-300

        # 갱신: 상태 (Kalman), 이후 Kim collapsing 9 -> 3
        K = P_pred @ Lam.T @ Finv                                           # M,M,k,N
        a_upd = a_pred + np.einsum("ijkn,ijn->ijk", K, v)
        P_upd = P_pred - K @ Lam @ P_pred
        a_new = np.einsum("ij,ijk->jk", w, a_upd) / pr_new[:, None]
        d = a_new[None, :, :] - a_upd
        P_new = (np.einsum("ij,ijkl->jkl", w, P_upd)
                 + np.einsum("ij,ijk,ijl->jkl", w, d, d)) / pr_new[:, None, None]

        out["pr_pred"][t] = P.T @ pr
        out["a_pred"][t], out["P_pred"][t] = a_pred, P_pred
        pr, a, Pc = pr_new / pr_new.sum(), a_new, P_new
        out["pr_filt"][t], out["a_filt"][t], out["P_filt"][t] = pr, a, Pc
    out["loglik"] = loglik
    return out


def kim_smoother(flt, p):
    P, Phi = p["P"], p["Phi"]
    pr_f, pr_p = flt["pr_filt"], flt["pr_pred"]
    a_f, P_f, a_p, P_p = flt["a_filt"], flt["P_filt"], flt["a_pred"], flt["P_pred"]
    T, M, k = a_f.shape
    PhiM = np.diag(Phi)

    pr_s = np.zeros((T, M))
    a_s = np.zeros((T, M, k))
    P_s = np.zeros((T, M, k, k))
    joint_sum = np.zeros((M, M))
    J = np.zeros((T, k, k))
    pr_s[-1], a_s[-1], P_s[-1] = pr_f[-1], a_f[-1], P_f[-1]
    for t in range(T - 2, -1, -1):
        joint = pr_f[t][:, None] * P * (pr_s[t + 1] / (pr_p[t + 1] + 1e-300))[None, :]
        joint /= joint.sum()
        joint_sum += joint
        pr_s[t] = joint.sum(axis=1) + 1e-300
        Ptil = (P_f[t] @ PhiM)[:, None, :, :] @ np.linalg.inv(P_p[t + 1])  # j,k -> k,k
        a_jk = a_f[t][:, None, :] + np.einsum("jkab,jkb->jka", Ptil, a_s[t + 1][None, :, :] - a_p[t + 1])
        P_jk = P_f[t][:, None] + Ptil @ (P_s[t + 1][None, :] - P_p[t + 1]) @ np.swapaxes(Ptil, -1, -2)
        a_s[t] = np.einsum("jk,jka->ja", joint, a_jk) / pr_s[t][:, None]
        d = a_s[t][:, None, :] - a_jk
        P_s[t] = (np.einsum("jk,jkab->jab", joint, P_jk)
                  + np.einsum("jk,jka,jkb->jab", joint, d, d)) / pr_s[t][:, None, None]
        J[t] = np.einsum("jk,jkab->ab", joint, Ptil)

    f = np.einsum("tj,tja->ta", pr_s, a_s)
    d = a_s - f[:, None, :]
    Pf = np.einsum("tj,tjab->tab", pr_s, P_s) + np.einsum("tj,tja,tjb->tab", pr_s, d, d)
    C = np.zeros_like(Pf)                                     # Cov(f_t, f_{t-1} | T)
    C[1:] = Pf[1:] @ np.swapaxes(J[:-1], -1, -2)
    return {"pr_smooth": pr_s, "f": f, "Pf": Pf, "C": C, "joint_sum": joint_sum}


def stationary(P):
    vals, vecs = np.linalg.eig(P.T)
    v = np.real(vecs[:, np.argmin(np.abs(vals - 1))])
    return v / v.sum()


# ---------------------------------------------------------------- EM
def init_params(Y, X):
    T, N = Y.shape
    Yc = Y - Y.mean(axis=0)
    vals, vecs = np.linalg.eigh(np.cov(Yc.T))
    order = np.argsort(vals)[::-1][:N_FACTORS]
    vals, vecs = vals[order], vecs[:, order]
    f0 = Yc @ vecs / np.sqrt(vals)
    Lam = vecs * np.sqrt(vals)
    resid = Y - f0 @ Lam.T
    B = np.linalg.lstsq(X, resid, rcond=None)[0].T
    R = np.maximum((resid - X @ B.T).var(axis=0), 0.01 * Y.var(axis=0))
    Phi = np.array([np.corrcoef(f0[1:, i], f0[:-1, i])[0, 1] for i in range(N_FACTORS)])
    base = np.array([(f0[1:, i] - Phi[i] * f0[:-1, i]).var() for i in range(N_FACTORS)])
    Q = SIGMA_SCALE[:, None] * base[None, :]
    P = np.full((N_REGIMES, N_REGIMES), 0.025) + np.eye(N_REGIMES) * (0.95 - 0.025)
    P /= P.sum(axis=1, keepdims=True)
    return {"Lam": Lam, "B": B, "R": R, "Phi": np.clip(Phi, -0.9, 0.9), "Q": Q, "P": P}


def m_step(Y, X, sm, p):
    f, Pf, C, prs = sm["f"], sm["Pf"], sm["C"], sm["pr_smooth"]
    T, N = Y.shape
    k = f.shape[1]

    # 관측식: Y = [Lam B] [f; x] + e
    Z = np.hstack([f, X])
    EZZ = Z.T @ Z
    EZZ[:k, :k] += Pf.sum(axis=0)
    coef = (Y.T @ Z) @ np.linalg.inv(EZZ)
    Lam, B = coef[:, :k], coef[:, k:]
    resid = Y - Z @ coef.T
    R = (resid ** 2).sum(axis=0) + np.einsum("nk,kl,nl->n", Lam, Pf.sum(axis=0), Lam)
    R = np.maximum(R / T, 0.01 * Y.var(axis=0))

    # 상태식: 대각 Phi, regime별 대각 Q
    Pd, Cd = np.diagonal(Pf, axis1=1, axis2=2), np.diagonal(C, axis1=1, axis2=2)
    Eff1 = (f[1:] * f[:-1] + Cd[1:]).sum(axis=0)
    Ef1f1 = (f[:-1] ** 2 + Pd[:-1]).sum(axis=0)
    Phi = np.clip(Eff1 / Ef1f1, -0.99, 0.99)
    e2 = (f[1:] - Phi * f[:-1]) ** 2 + Pd[1:] - 2 * Phi * Cd[1:] + Phi ** 2 * Pd[:-1]
    w = prs[1:]
    Q = np.maximum((w.T @ e2) / w.sum(axis=0)[:, None], 1e-6)

    # 전이확률
    P = sm["joint_sum"] / sm["joint_sum"].sum(axis=1, keepdims=True)
    P = np.clip(P, 1e-6, None)
    P /= P.sum(axis=1, keepdims=True)

    # 척도 식별: regime 가중평균 Q = 1 이 되도록 요인 척도 정규화
    pi = prs.mean(axis=0)
    dsc = 1 / np.sqrt(pi @ Q)
    return {"Lam": Lam / dsc, "B": B, "R": R, "Phi": Phi, "Q": Q * dsc ** 2, "P": P}


def run_em(Y, X, iters=EM_ITERS, tol=TOL, early_stop=True):
    p = init_params(Y, X)
    print(f"\n  {'iter':>4} | {'log-lik':>14} | {'change':>10}")
    print("  " + "-" * 36)
    prev = -np.inf
    for it in range(1, iters + 1):
        flt = kim_filter(Y, X, p)
        sm = kim_smoother(flt, p)
        ll = flt["loglik"]
        print(f"  {it:4d} | {ll:14.2f} | {ll - prev:10.4f}")
        if early_stop and abs(ll - prev) < tol:
            print(f"  수렴 (|change| < {tol}) - 조기 종료")
            break
        prev = ll
        p = m_step(Y, X, sm, p)
    flt = kim_filter(Y, X, p)
    sm = kim_smoother(flt, p)
    return p, flt, sm


def order_regimes(p, flt, sm):
    """regime을 Q 크기 순(Low-Vol < Normal < High-Vol)으로 재정렬."""
    o = np.argsort(p["Q"].mean(axis=1))
    p = {**p, "Q": p["Q"][o], "P": p["P"][np.ix_(o, o)]}
    flt = {**flt, "pr_filt": flt["pr_filt"][:, o]}
    sm = {**sm, "pr_smooth": sm["pr_smooth"][:, o]}
    return p, flt, sm


def orient_factors(p, sm, cols):
    """부호 규약: Level=평균 로딩 +, Slope=장기-단기 로딩 +, Curvature=중기 로딩 +."""
    Lam = p["Lam"].copy()
    f = sm["f"].copy()
    mid = len(cols) // 2
    rules = [Lam[:, 0].mean(), Lam[-1, 1] - Lam[0, 1], Lam[mid, 2] - 0.5 * (Lam[0, 2] + Lam[-1, 2])]
    for i, r in enumerate(rules):
        if r < 0:
            Lam[:, i] *= -1
            f[:, i] *= -1
    return {**p, "Lam": Lam}, {**sm, "f": f}


def detect_crisis(prob: pd.Series, threshold: float = 0.6, min_days: int = 3) -> pd.DataFrame:
    """High-Vol 확률 > threshold 가 min_days 거래일 이상 연속된 구간."""
    above = prob > threshold
    run_id = (above != above.shift()).cumsum()
    rows = []
    for _, g in prob[above].groupby(run_id[above]):
        if len(g) >= min_days:
            rows.append({"start": g.index[0].date(), "end": g.index[-1].date(), "days": len(g),
                         "max_prob": round(g.max(), 6), "mean_prob": round(g.mean(), 6)})
    return pd.DataFrame(rows, columns=["start", "end", "days", "max_prob", "mean_prob"])


# ---------------------------------------------------------------- 출력
def plot_dashboard(y, probs, factors, crises, path):
    set_korean_font()
    fig, axes = plt.subplots(4, 1, figsize=(14, 13), sharex=True,
                             gridspec_kw={"height_ratios": [1.2, 1, 1, 0.8]})
    colors = ["#4C9F70", "#E0A030", "#C8453B"]

    def shade(ax):
        for _, r in crises.iterrows():
            ax.axvspan(pd.Timestamp(r["start"]), pd.Timestamp(r["end"]), color="#C8453B", alpha=0.15, lw=0)

    ax = axes[0]
    for c, col in [("Y3Y", "#3B6EA8"), ("Y10Y", "#1F2D3D")]:
        if c in y:
            ax.plot(y.index, y[c], color=col, lw=1.1, label=f"국고채 {c[1:-1]}년")
    shade(ax)
    ax.set_ylabel("금리 (%)")
    ax.set_title("한국 국고채 금리와 Kim Filter 위기 구간 (음영)", loc="left", fontsize=12)
    ax.legend(loc="upper left", frameon=False)

    ax = axes[1]
    ax.stackplot(probs.index, probs.T.values, colors=colors, alpha=0.85)
    ax.set_ylim(0, 1)
    ax.set_ylabel("사후확률 (filtered)")
    ax.set_title("3-Regime 확률", loc="left", fontsize=12)
    ax.legend(handles=[Patch(color=c, label=n) for c, n in zip(colors, REGIME_NAMES)],
              loc="upper left", ncol=3, frameon=False)

    ax = axes[2]
    for c, col in zip(FACTOR_NAMES, ["#1F2D3D", "#3B6EA8", "#8E6BB8"]):
        ax.plot(factors.index, factors[f"{c}_cum"], lw=1, color=col, label=c)
    shade(ax)
    ax.set_ylabel("누적 요인")
    ax.set_title("잠재요인 (Level / Slope / Curvature, 누적)", loc="left", fontsize=12)
    ax.legend(loc="upper left", ncol=3, frameon=False)

    ax = axes[3]
    ax.fill_between(probs.index, probs.iloc[:, 2], color="#C8453B", alpha=0.6, lw=0)
    ax.axhline(0.6, color="#555", ls="--", lw=0.8)
    ax.set_ylim(0, 1)
    ax.set_ylabel("P(High-Vol)")
    ax.set_title("High-Vol 확률과 위기 임계값 0.6", loc="left", fontsize=12)
    ax.xaxis.set_major_locator(mdates.YearLocator())
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%Y"))
    for a in axes:
        a.grid(alpha=0.25)
        a.spines[["top", "right"]].set_visible(False)
    fig.tight_layout()
    fig.savefig(path, dpi=130)
    plt.close(fig)


def main(threshold: float = 0.6, min_days: int = 3):
    print("=" * 64)
    print(" MS-DFM (Kim 1994 Filter + EM) - 한국 국고채")
    print("=" * 64)
    y, f, s = load_data()
    dy, ex = prepare(y, f, s)
    print(f"  분석 표본: dy={dy.shape}, exog={ex.shape}, "
          f"{dy.index[0]:%Y-%m-%d} ~ {dy.index[-1]:%Y-%m-%d}")
    print(f"  관측 만기: {list(dy.columns)}")
    print(f"  외생변수: {list(ex.columns)}")

    Y = dy.to_numpy() - dy.to_numpy().mean(axis=0)
    X = ex.to_numpy()
    p, flt, sm = run_em(Y, X)
    p, flt, sm = order_regimes(p, flt, sm)
    p, sm = orient_factors(p, sm, list(dy.columns))

    idx = dy.index
    probs = pd.DataFrame(flt["pr_filt"], index=idx, columns=[f"P_{n}" for n in REGIME_NAMES])
    smooth = pd.DataFrame(sm["pr_smooth"], index=idx, columns=[f"S_{n}" for n in REGIME_NAMES])
    regime = pd.Series(np.array(REGIME_NAMES)[sm["pr_smooth"].argmax(axis=1)], index=idx, name="regime")
    factors = pd.DataFrame(sm["f"], index=idx, columns=FACTOR_NAMES)
    for c in FACTOR_NAMES:
        factors[f"{c}_cum"] = factors[c].cumsum()

    print("\n  Regime 통계 (평활확률 argmax 기준)")
    print(f"  {'Regime':9s} | {'일수':>6} | {'비중':>6} | {'요인분산(Q 평균)':>14}")
    for j, n in enumerate(REGIME_NAMES):
        days = int((regime == n).sum())
        print(f"  {n:9s} | {days:6d} | {days / len(regime):6.1%} | {p['Q'][j].mean():14.3f}")
    ratio = p["Q"][2].mean() / p["Q"][0].mean()
    print(f"  High-Vol / Low-Vol 분산비: {ratio:.1f}배")
    print("  전이확률 P (행=오늘, 열=내일):")
    for j, n in enumerate(REGIME_NAMES):
        print(f"    {n:9s} " + "  ".join(f"{v:.3f}" for v in p["P"][j]))

    crises = detect_crisis(probs["P_High-Vol"], threshold=threshold, min_days=min_days)
    print(f"\n  위기 구간 탐지: P(High-Vol) > {threshold}, 최소 {min_days}거래일 -> {len(crises)}건")
    if len(crises):
        print(crises.to_string(index=False))

    last = probs.iloc[-1]
    print(f"\n  현재 상태 ({idx[-1]:%Y-%m-%d}): " + ", ".join(f"{k[2:]} {v:.3f}" for k, v in last.items())
          + f"  -> {REGIME_NAMES[int(last.to_numpy().argmax())]}")

    out = pd.concat([probs, smooth, regime], axis=1)
    out.index.name = "date"
    out.to_csv(HERE / "korea_bond_regime_probs.csv", encoding="utf-8-sig")
    factors.index.name = "date"
    factors.to_csv(HERE / "korea_bond_latent_factors.csv", encoding="utf-8-sig")
    crises.to_csv(HERE / "korea_bond_crisis_periods.csv", index=False, encoding="utf-8-sig")
    plot_dashboard(y.loc[idx[0]:], probs, factors, crises, HERE / "korea_bond_dashboard_real.png")
    print("\n  저장: korea_bond_regime_probs.csv, korea_bond_latent_factors.csv,")
    print("        korea_bond_crisis_periods.csv, korea_bond_dashboard_real.png")
    print("\n다음 단계: python bond/crisis_dashboard.py")


if __name__ == "__main__":
    main()
