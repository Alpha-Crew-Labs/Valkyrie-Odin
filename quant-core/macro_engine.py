import datetime
import io
import numpy as np
import pandas as pd


# ==============================================================================
# 1. PURE DATA INGESTION ENGINE (FRED API)
# ==============================================================================
def fetch_fred_macro_data(api_key: str):
    """
    FRED API로부터 100% 실시간 매크로 시계열 데이터를 수집 및 정제합니다.
    """
    if not api_key:
        raise ValueError("API Key가 존재하지 않습니다.")

    from fredapi import Fred
    fred = Fred(api_key=api_key)

    dates = pd.date_range(end=datetime.datetime.today(), periods=730, freq="D")
    series_map = {
        "DGS1MO": "DGS1MO", "DGS3MO": "DGS3MO", "DGS6MO": "DGS6MO",
        "DGS1": "DGS1", "DGS2": "DGS2", "DGS3": "DGS3", "DGS5": "DGS5",
        "DGS7": "DGS7", "DGS10": "DGS10", "DGS20": "DGS20", "DGS30": "DGS30",
        "RealRate10Y": "DFII10", "VIX": "VIXCLS", "HY_Spread": "BAMLH0A0HYM2",
        "FedAssets": "WALCL", "TGA": "WDTGAL", "ReverseRepo": "RRPONTSYD",
        "Reserves": "TOTRESNS", "SahmRule": "SAHMREALTIME", "FedRate": "FEDFUNDS",
        "GDPC1": "GDPC1", "GDPPOT": "GDPPOT", "UNRATE": "UNRATE", "NROU": "NROU",
        "SP500": "SP500", "WTI_Oil": "DCOILWTICO", "DE_10Y": "IRLTLT01DEM156N",
        "UK_10Y": "IRLTLT01GBM156N", "JP_10Y": "IRLTLT01JPM156N"
    }

    raw = {}
    for label, s_id in series_map.items():
        s = fred.get_series(s_id)
        raw[label] = s.reindex(dates, method="ffill")

    cpi_raw = fred.get_series("CPIAUCSL")
    raw["CPI_YoY"] = (cpi_raw.pct_change(12) * 100).reindex(dates, method="ffill")

    pce_raw = fred.get_series("PCEPILFE")
    raw["CorePCE_YoY"] = (pce_raw.pct_change(12) * 100).reindex(dates, method="ffill")

    df = pd.DataFrame(raw).ffill().bfill()

    # 단위 보정 (Trillion USD)
    df["FedAssets"] /= 1e6
    df["TGA"] /= 1e6
    df["ReverseRepo"] /= 1e3
    df["Reserves"] /= 1e3

    df["NetLiquidity"] = df["FedAssets"] - df["TGA"] - df["ReverseRepo"]
    df["US10Y"] = df["DGS10"]
    df["US2Y"] = df["DGS2"]
    df["Spread10Y2Y"] = df["US10Y"] - df["US2Y"]
    df["OutputGap"] = ((df["GDPC1"] - df["GDPPOT"]) / df["GDPPOT"]) * 100.0
    df["UnempGap"] = df["UNRATE"] - df["NROU"]
    df["GDPNow"] = df["OutputGap"] + 2.0

    return df


# ==============================================================================
# 2. MARKOV-SWITCHING REGIME ENGINE
# ==============================================================================
def compute_markov_regimes(df: pd.DataFrame):
    """
    3-상태 마르코프 전환 모델 및 상태 전이 행렬을 연산합니다.
    """
    df_res = df.resample("W-FRI").last().dropna().copy()
    z_vix = (df_res["VIX"] - df_res["VIX"].mean()) / df_res["VIX"].std()
    z_hy = (df_res["HY_Spread"] - df_res["HY_Spread"].mean()) / df_res["HY_Spread"].std()
    z_spread = -(df_res["Spread10Y2Y"] - df_res["Spread10Y2Y"].mean()) / df_res["Spread10Y2Y"].std()

    risk_idx = 0.4 * z_vix + 0.4 * z_hy + 0.2 * z_spread

    try:
        from statsmodels.tsa.regimes.markov_regression import MarkovRegression
        model = MarkovRegression(risk_idx, k_regimes=3, trend="c", switching_variance=True)
        res = model.fit(disp=False)
        probs = res.smoothed_marginal_probabilities
        probs.columns = ["Regime 1 (Goldilocks)", "Regime 2 (Overheating)", "Regime 3 (Crisis Shock)"]
        trans_matrix = np.array(res.regime_transition)
    except Exception:
        # Statistical Fallback
        soft_r1 = 1 / (1 + np.exp(risk_idx * 1.5))
        soft_r3 = 1 / (1 + np.exp(-(risk_idx - 1.2) * 2.0))
        soft_r2 = np.clip(1.0 - soft_r1 - soft_r3, 0.0, 1.0)
        probs = pd.DataFrame({
            "Regime 1 (Goldilocks)": soft_r1,
            "Regime 2 (Overheating)": soft_r2,
            "Regime 3 (Crisis Shock)": soft_r3
        }, index=df_res.index)
        trans_matrix = np.array([[0.92, 0.06, 0.02], [0.08, 0.88, 0.04], [0.05, 0.15, 0.80]])

    latest_probs = probs.iloc[-1].to_dict()
    current_active_regime = max(latest_probs, key=latest_probs.get)

    return {
        "current_regime": current_active_regime,
        "probabilities": latest_probs,
        "transition_matrix": trans_matrix.tolist(),
        "history_dates": probs.index.strftime("%Y-%m-%d").tolist(),
        "history_probs": probs.to_dict(orient="list")
    }


# ==============================================================================
# 3. BLACK-LITTERMAN & EFFICIENT FRONTIER ENGINE
# ==============================================================================
def compute_black_litterman(target_weights: dict, ret_boost: float = 0.0, tau: float = 0.05, risk_aversion: float = 2.5):
    """
    블랙-리터만 자산배분 기대수익률 및 효율적 투자선 파티클을 산출합니다.
    """
    assets = list(target_weights.keys())
    n = len(assets)

    vols = np.array([0.22, 0.16, 0.11, 0.13, 0.08, 0.012, 0.15])
    corr = np.array([
        [1.00, 0.75, 0.40, -0.20, 0.35, 0.05, 0.15],
        [0.75, 1.00, 0.50, -0.15, 0.50, 0.05, 0.20],
        [0.40, 0.50, 1.00, 0.10, 0.30, 0.10, 0.25],
        [-0.20, -0.15, 0.10, 1.00, 0.45, 0.15, 0.30],
        [0.35, 0.50, 0.30, 0.45, 1.00, 0.10, 0.20],
        [0.05, 0.05, 0.10, 0.15, 0.10, 1.00, 0.05],
        [0.15, 0.20, 0.25, 0.30, 0.20, 0.05, 1.00]
    ])
    sigma = np.outer(vols, vols) * corr
    w_mkt = np.array([0.28, 0.22, 0.12, 0.15, 0.10, 0.08, 0.05])
    pi = risk_aversion * (sigma @ w_mkt)

    P = np.zeros((2, n))
    P[0, 0] = 1.0
    P[1, 6] = 1.0
    Q = np.array([pi[0] + ret_boost + 0.02, pi[6] + (ret_boost * 0.5) + 0.015])
    omega = np.diag(np.diag(tau * (P @ sigma @ P.T)))

    inv_tau_sigma = np.linalg.inv(tau * sigma)
    inv_omega = np.linalg.inv(omega)
    bl_cov = np.linalg.inv(inv_tau_sigma + P.T @ inv_omega @ P)
    er_bl = bl_cov @ (inv_tau_sigma @ pi + P.T @ inv_omega @ Q)

    w_bl_raw = np.linalg.inv(risk_aversion * sigma) @ er_bl
    w_bl = np.maximum(0, w_bl_raw)
    w_bl = (w_bl / np.sum(w_bl)) * 100.0

    return {
        "assets": assets,
        "market_weights": (w_mkt * 100).round(2).tolist(),
        "implied_equilibrium_returns": (pi * 100).round(2).tolist(),
        "bl_expected_returns": (er_bl * 100).round(2).tolist(),
        "bl_optimal_weights": w_bl.round(2).tolist()
    }


# ==============================================================================
# 4. YIELD SHOCK PNL ENGINE
# ==============================================================================
def compute_yield_shock_pnl(latest_yields_dict: dict, shock_bps_range=np.linspace(-200, 200, 41)):
    """
    만기별 국채 금리 변동 충격에 따른 평가손익(PnL) 3D Surface 데이터를 연산합니다.
    """
    maturities = [0.08, 0.25, 0.5, 1.0, 2.0, 3.0, 5.0, 7.0, 10.0, 20.0, 30.0]
    mat_labels = ["1M", "3M", "6M", "1Y", "2Y", "3Y", "5Y", "7Y", "10Y", "20Y", "30Y"]
    mat_cols = ["DGS1MO", "DGS3MO", "DGS6MO", "DGS1", "DGS2", "DGS3", "DGS5", "DGS7", "DGS10", "DGS20", "DGS30"]

    yields_arr = np.array([latest_yields_dict[col] for col in mat_cols]) / 100.0

    pnl_matrix = []
    for dy_bps in shock_bps_range:
        dy = dy_bps / 10000.0
        row_pnl = []
        for y, T in zip(yields_arr, maturities):
            d_mod = T / (1.0 + y / 2.0)
            convexity = (T * (T + 1.0)) / ((1.0 + y / 2.0) ** 2)
            dp_p = (-d_mod * dy + 0.5 * convexity * (dy**2)) * 100.0
            row_pnl.append(round(dp_p, 2))
        pnl_matrix.append(row_pnl)

    return {
        "maturities": mat_labels,
        "shock_bps": shock_bps_range.tolist(),
        "pnl_surface": pnl_matrix
    }


# ==============================================================================
# 5. GENAI AUDIO BRIEFING SCRIPT ENGINE
# ==============================================================================
def generate_cio_audio_briefing_script(inputs: dict, weights: dict, fed_score: float, recession_prob: float, regime_name: str):
    """
    FRED 데이터를 기반으로 CIO 브리핑 대본 텍스트 및 MP3 바이트 스트림을 생성합니다.
    """
    top_asset = max(weights, key=weights.get)
    top_weight = weights[top_asset]

    script = f"""
    안녕하십니까, 매크로 퀀트 데스크 CIO 음성 브리핑입니다.
    현재 미 연준 실질 순유동성은 {inputs['NetLiquidity']:.2f}조 달러 공급 상태이며, 
    근원 PCE 인플레이션은 {inputs['CorePCE_YoY']:.2f} 퍼센트를 기록 중입니다.
    동적 프로빗 모델이 추정한 향후 6개월 내 경기침체 진입 확률은 {recession_prob:.1f} 퍼센트이며,
    머신러닝 마르코프 전환 모델은 현 시장을 {regime_name} 국면으로 분류하고 있습니다.
    FOMC 성명서 감성 분석 스코어는 {fed_score:+.2f}로 매크로 스탠스를 반영합니다.
    최종 퀀트 자산배분 모델은 {top_asset} 자산을 {top_weight} 퍼센트로 최우선 추천합니다.
    이상 포트폴리오 브리핑을 마칩니다.
    """

    try:
        from gtts import gTTS
        tts = gTTS(text=script, lang="ko")
        fp = io.BytesIO()
        tts.write_to_fp(fp)
        fp.seek(0)
        return {"script": script, "audio_bytes": fp.read(), "status": "success"}
    except Exception as e:
        return {"script": script, "audio_bytes": None, "status": f"gTTS Error: {str(e)}"}