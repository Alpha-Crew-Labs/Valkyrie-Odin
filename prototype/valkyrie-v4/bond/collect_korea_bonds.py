"""[1단계] 한국 채권시장 데이터 수집기 (스펙: 채권/KIM_FILTER_BOND_RISK_SYSTEM_REBUILD_v3.md §1)

ECOS API(우선) -> pykrx(폴백) -> FDR(폴백) -> Nelson-Siegel 합성데이터(최종 폴백)
Output: data/30_BOND/korea_bond_yields.csv, korea_bond_factors.csv, korea_bond_spreads.csv
"""
from __future__ import annotations

import os
import sys
import time
import warnings
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd
import requests
import urllib3

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from valkyrie.paths import BOND, load_env  # noqa: E402

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
warnings.filterwarnings("ignore")
try:  # Windows cp949 콘솔에서 인코딩 불가 문자가 있어도 죽지 않게
    sys.stdout.reconfigure(errors="replace")
except Exception:
    pass

ECOS_API_KEY = (os.environ.get("ECOS_API_KEY") or load_env().get("ECOS_API_KEY", "")).strip()
ECOS_BASE_URL = "https://ecos.bok.or.kr/api"
START_DATE = "20170101"
END_DATE = datetime.today().strftime("%Y%m%d")   # 실행일 기준 자동
OUT_DIR = BOND

STAT_MARKET_RATE = "817Y002"   # 시장금리(일별)
ECOS_BOND_CODES = {
    "CALL_O/N": "010101000",   # 콜금리(1일, 전체거래)
    "MSB91": "010400000",      # 통안증권(91일)
    "Y1Y": "010190000",
    "Y2Y": "010195000",
    "Y3Y": "010200000",        # 벤치마크
    "Y5Y": "010200001",
    "Y10Y": "010210000",       # 벤치마크
    "Y20Y": "010220000",
    "Y30Y": "010230000",
}
ECOS_FACTOR_CODES = {
    "CORP_AA": "010300000",     # 회사채(3년, AA-)
    "CORP_AA_MP": "010310000",  # 회사채(3년, AA-, 민평)
    "CD91": "010502000",
    "CP91": "010503000",
    "MSB2Y": "010400002",
}
# FDR이 없을 때 KOSPI/USDKRW를 ECOS에서 가져오는 대체 코드 (스펙 외 보강)
ECOS_AUX_CODES = {
    "KOSPI": ("802Y001", "0001000"),   # KOSPI지수
    "USDKRW": ("731Y001", "0000001"),  # 원/미국달러(매매기준율)
}


def fetch_ecos_series(stat_code: str, item_code: str,
                      start: str = START_DATE, end: str = END_DATE,
                      cycle: str = "D") -> pd.Series:
    """ECOS 단일 항목 시계열 페치 (페이징 자동)."""
    rows_all = []
    page_size = 1000
    start_idx = 1
    while True:
        url = (f"{ECOS_BASE_URL}/StatisticSearch/{ECOS_API_KEY}/json/kr/"
               f"{start_idx}/{start_idx + page_size - 1}/"
               f"{stat_code}/{cycle}/{start}/{end}/{item_code}")
        r = requests.get(url, timeout=30, verify=False)   # SSL 검증 비활성화 (사내망 호환)
        r.raise_for_status()
        data = r.json()
        if "StatisticSearch" not in data:
            err = data.get("RESULT", {}).get("MESSAGE", "알 수 없는 오류")
            raise RuntimeError(f"ECOS API 응답 오류: {err}")
        rows = data["StatisticSearch"].get("row", [])
        if not rows:
            break
        rows_all.extend(rows)
        total = int(data["StatisticSearch"].get("list_total_count", 0))
        if start_idx + page_size - 1 >= total:
            break
        start_idx += page_size
        time.sleep(0.1)
    df = pd.DataFrame(rows_all)
    df["date"] = pd.to_datetime(df["TIME"], format="%Y%m%d")
    df["value"] = pd.to_numeric(df["DATA_VALUE"], errors="coerce")
    return df.set_index("date")["value"].sort_index()


def collect_via_ecos(codes: dict[str, str], title: str) -> pd.DataFrame | None:
    if not ECOS_API_KEY:
        return None
    print(f"\n[ECOS] {title} 수집 ({STAT_MARKET_RATE}, {START_DATE}~{END_DATE})")
    series, failed = {}, []
    for label, item in codes.items():
        try:
            s = fetch_ecos_series(STAT_MARKET_RATE, item)
            series[label] = s
            print(f"  OK   {label:11s} {len(s):5d}건  최근 {s.index[-1]:%Y-%m-%d} = {s.iloc[-1]:.3f}")
        except Exception as exc:
            failed.append(label)
            print(f"  FAIL {label:11s} {exc}")
        time.sleep(0.15)
    if failed:
        print(f"  실패 항목: {failed}")
    return pd.DataFrame(series) if series else None


def collect_via_pykrx() -> pd.DataFrame | None:
    """pykrx 장외 국고채 금리 (Y1Y/Y3Y/Y5Y/Y10Y 4종만, 간이 폴백)."""
    try:
        from pykrx import bond
    except ImportError:
        print("  pykrx 미설치 - 건너뜀")
        return None
    print("\n[pykrx] 국고채 금리 수집 (간이 폴백)")
    name_map = {"국고채 1년": "Y1Y", "국고채 3년": "Y3Y", "국고채 5년": "Y5Y", "국고채 10년": "Y10Y"}
    out = {}
    try:
        for d in pd.bdate_range(START_DATE, END_DATE):
            df = bond.get_otc_treasury_yields(d.strftime("%Y%m%d"))
            if df is None or df.empty:
                continue
            for k, v in name_map.items():
                if k in df.index:
                    out.setdefault(v, {})[d] = float(df.loc[k].iloc[0])
            time.sleep(0.05)
    except Exception as exc:
        print(f"  pykrx 실패: {exc}")
    return pd.DataFrame(out) if out else None


def collect_via_fdr() -> pd.DataFrame | None:
    """FinanceDataReader 채권 ETF 가격 근사 (실제 yield 아님)."""
    try:
        import FinanceDataReader as fdr
    except ImportError:
        print("  FinanceDataReader 미설치 - 건너뜀")
        return None
    print("\n[FDR] 채권 ETF 가격 근사 - 주의: 실제 금리가 아니라 ETF 가격입니다")
    try:
        return pd.DataFrame({
            "Y3Y_ETF": fdr.DataReader("114260", START_DATE, END_DATE)["Close"],
            "Y10Y_ETF": fdr.DataReader("148070", START_DATE, END_DATE)["Close"],
        })
    except Exception as exc:
        print(f"  FDR 실패: {exc}")
        return None


def collect_synthetic() -> tuple[pd.DataFrame, pd.DataFrame]:
    """Nelson-Siegel 3-factor 합성 데이터 (검증용)."""
    print("\n[합성] Nelson-Siegel 합성 데이터 생성 (seed=42) - 실데이터가 아닙니다")
    rng = np.random.default_rng(42)
    idx = pd.bdate_range(START_DATE, END_DATE)
    n = len(idx)
    lam = 0.7
    mats = np.array([0.083, 0.25, 1, 2, 3, 5, 10, 20, 30])
    x = lam * mats
    load1 = (1 - np.exp(-x)) / x
    load2 = load1 - np.exp(-x)
    L = 2.5 + np.cumsum(rng.normal(0, 0.03, n))
    S = -1.0 + np.cumsum(rng.normal(0, 0.02, n))
    C = 0.5 + np.cumsum(rng.normal(0, 0.02, n))
    ylds = L[:, None] + S[:, None] * load1 + C[:, None] * load2 + rng.normal(0, 0.04, (n, len(mats)))
    yields = pd.DataFrame(np.clip(ylds, 0.1, 8.0), index=idx, columns=list(ECOS_BOND_CODES))
    y3 = yields["Y3Y"].to_numpy()
    factors = pd.DataFrame({
        "CORP_AA": y3 + 0.7 + np.cumsum(rng.normal(0, 0.005, n)),
        "CORP_AA_MP": y3 + 0.72 + np.cumsum(rng.normal(0, 0.005, n)),
        "CD91": yields["MSB91"].to_numpy() + 0.1,
        "CP91": yields["MSB91"].to_numpy() + 0.4 + np.cumsum(rng.normal(0, 0.005, n)),
        "MSB2Y": yields["Y2Y"].to_numpy() - 0.05,
    }, index=idx)
    return yields, factors


def collect_macro_aux() -> pd.DataFrame | None:
    """KOSPI / USDKRW. FDR 우선, 없으면 ECOS 대체 코드."""
    print("\n[보조] KOSPI / USDKRW 수집")
    try:
        import FinanceDataReader as fdr
        aux = pd.DataFrame({
            "KOSPI": fdr.DataReader("KS11", START_DATE, END_DATE)["Close"],
            "USDKRW": fdr.DataReader("USD/KRW", START_DATE, END_DATE)["Close"],
        })
        print(f"  FDR OK {aux.shape}")
        return aux
    except Exception as exc:
        print(f"  FDR 사용 불가 ({type(exc).__name__}) - ECOS 대체 코드 시도")
    if not ECOS_API_KEY:
        return None
    out = {}
    for label, (stat, item) in ECOS_AUX_CODES.items():
        try:
            out[label] = fetch_ecos_series(stat, item)
            print(f"  ECOS OK {label:7s} {len(out[label])}건")
        except Exception as exc:
            print(f"  ECOS FAIL {label}: {exc}")
    return pd.DataFrame(out) if out else None


def compute_spreads(yields: pd.DataFrame, factors: pd.DataFrame) -> pd.DataFrame:
    spreads = pd.DataFrame(index=factors.index)
    if "CORP_AA" in factors.columns and "Y3Y" in yields.columns:
        spreads["CORP_AA_SPREAD"] = factors["CORP_AA"] - yields["Y3Y"]        # 신용 프리미엄(장기)
    if "CP91" in factors.columns and "CD91" in factors.columns:
        spreads["ST_CREDIT_SPREAD"] = factors["CP91"] - factors["CD91"]       # 단기 신용 경색
    if "Y10Y" in yields.columns and "Y3Y" in yields.columns:
        spreads["TERM_SPREAD"] = yields["Y10Y"] - yields["Y3Y"]               # 기간 프리미엄
    if "Y1Y" in yields.columns and "MSB91" in yields.columns:
        spreads["ST_SLOPE"] = yields["Y1Y"] - yields["MSB91"]                 # 초단기 커브 기울기
    return spreads


def main():
    print("=" * 64)
    print(" 한국 채권시장 데이터 수집 (collect_korea_bonds)")
    print("=" * 64)
    if not ECOS_API_KEY:
        print("ECOS_API_KEY 미설정 - 대시보드/.env 또는 채권/.env에 ECOS_API_KEY=... 를 넣으세요.")
        print("pykrx -> FDR -> 합성데이터 순으로 폴백합니다.")

    source = "ECOS"
    yields_df = collect_via_ecos(ECOS_BOND_CODES, "Yield Curve 9종")
    if yields_df is None or yields_df.shape[1] < 5:
        source = "pykrx"
        yields_df = collect_via_pykrx()
        if yields_df is None:
            source = "FDR"
            yields_df = collect_via_fdr()
    factors_df = collect_via_ecos(ECOS_FACTOR_CODES, "신용/거시 팩터 5종")

    if yields_df is None or factors_df is None:
        source = "SYNTHETIC"
        yields_df, factors_df = collect_synthetic()

    aux = collect_macro_aux()
    if aux is not None:
        factors_df = factors_df.join(aux, how="outer")

    common = yields_df.index.intersection(factors_df.index)
    yields_df = yields_df.loc[common].sort_index().ffill().dropna(how="all")
    factors_df = factors_df.loc[common].sort_index().ffill().dropna(how="all")
    spreads_df = compute_spreads(yields_df, factors_df)

    print(f"\n[스프레드] 데이터 소스: {source}")
    for c in spreads_df.columns:
        print(f"  {c:17s} mean={spreads_df[c].mean():.2f}%p  std={spreads_df[c].std():.2f}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, df in [("korea_bond_yields.csv", yields_df),
                     ("korea_bond_factors.csv", factors_df),
                     ("korea_bond_spreads.csv", spreads_df)]:
        df.index.name = "date"
        df.to_csv(OUT_DIR / name, encoding="utf-8-sig")
        print(f"  저장 {name:26s} shape={df.shape}  {df.index[0]:%Y-%m-%d} ~ {df.index[-1]:%Y-%m-%d}")
    print("\n다음 단계: python bond/kim_filter_korea_bond_real.py")
    return source


if __name__ == "__main__":
    main()
