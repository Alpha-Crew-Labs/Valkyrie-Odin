"""VALKYRIE research ontology: 17 objects, 24 predefined relations.

v4.2 (2026-09-30, docs/DECISIONS.md D-012): betas re-calibrated on data where a daily estimate exists (see EDGE_META basis);
expert priors kept where not (policy expectations). Every relation carries a decision-relevant meaning shown on screen.

v4.1 (2026-09-30, docs/DECISIONS.md D-004): + eq_kospi (KOSPI market risk, fed by the 8512 equity model) with
rat_ust -> eq_kospi (function: global-rate / foreign-flow channel) and eq_kospi -> sig_equity (evidence).

Relations and transmission coefficients (beta) are fixed research assumptions, reviewed by the owners.
Data changes node *values*; it never adds or removes relations at runtime.
Source of truth mirrors 주식/Valkyrie-Odin/prototype/valkyrie-v3/data-core.js (ND / EG).
"""

LANES = [
    {"id": "mac", "label": "MACRO", "owner": "정희강"},
    {"id": "rat", "label": "RATES", "owner": "정훈"},
    {"id": "eq", "label": "EQUITY · KOSPI/KOSDAQ", "owner": "김유찬"},
]

# id: label, sub, owner, domain, unit, layout (x, y) in a 1020x400 viewBox, signal flag
NODES = {
    "mac_gdp":    {"label": "GDP NOWCAST", "sub": "KR 실질 · 최근 4분기 합", "domain": "mac", "unit": "%", "x": 18, "y": 46},
    "mac_uscpi":  {"label": "US CPI", "sub": "전년비 · FRED", "domain": "mac", "unit": "%", "x": 182, "y": 16},
    "mac_krcpi":  {"label": "KR CPI MODEL", "sub": "익월 예측 · AR(1)", "domain": "mac", "unit": "%", "x": 182, "y": 78},
    "mac_fed":    {"label": "FED FUNDS", "sub": "실효금리 · FRED", "domain": "mac", "unit": "%", "x": 346, "y": 16},
    "mac_bok":    {"label": "BOK 기준금리", "sub": "테일러 적정 대비", "domain": "mac", "unit": "%", "x": 510, "y": 50},
    "sig_macro":  {"label": "금리경로 전망", "domain": "mac", "signal": True, "x": 846, "y": 42},
    "rat_ust":    {"label": "UST 10Y", "sub": "미국채 10년", "domain": "rat", "unit": "%", "x": 346, "y": 146},
    "rat_ktb":    {"label": "국고 3Y", "sub": "국고 10Y 병기", "domain": "rat", "unit": "%", "x": 510, "y": 146},
    "rat_curve":  {"label": "3s10s CURVE", "sub": "국고 10Y − 3Y", "domain": "rat", "unit": "bp", "x": 674, "y": 146},
    "rat_credit": {"label": "CREDIT AA- 3Y", "sub": "회사채 − 국고 3Y", "domain": "rat", "unit": "bp", "x": 510, "y": 208},
    "sig_rates":  {"label": "DURATION", "domain": "rat", "signal": True, "x": 846, "y": 150},
    "eq_fin":     {"label": "적자 기업 비중", "sub": "코스닥 IPO 최근 40건", "domain": "eq", "unit": "%", "x": 346, "y": 290},
    "eq_val":     {"label": "코스닥 할인율", "sub": "국고 10Y + ERP", "domain": "eq", "unit": "%", "x": 510, "y": 290},
    "eq_cb":      {"label": "CB 조달 · PUT", "sub": "Put 위험 발행사", "domain": "eq", "unit": "곳", "x": 674, "y": 262},
    "eq_ipo":     {"label": "IPO DEMAND", "sub": "수요예측 경쟁률 중앙값", "domain": "eq", "unit": ":1", "x": 674, "y": 330},
    "eq_kospi":   {"label": "KOSPI", "sub": "지수 · 8512 위험점수", "domain": "eq", "unit": "pt", "x": 182, "y": 336},
    "sig_equity": {"label": "IPO 청약 선별", "domain": "eq", "signal": True, "x": 846, "y": 292},
}

OWNER = {"mac": "정희강", "rat": "정훈", "eq": "김유찬"}
for _n in NODES.values():
    _n["owner"] = OWNER[_n["domain"]]

# (from, to, beta, sign, kind)
#   kind "linear":   Δto += sign * beta * Δfrom   (both in bp)
#   kind "function": to is recomputed by a named model that uses from (shown on screen)
#   kind "evidence": from is an input to the signal rule of `to`
EDGES = [
    ("mac_gdp", "mac_krcpi", 0.30, +1, "linear"),
    ("mac_gdp", "mac_bok", 0.30, +1, "linear"),
    ("mac_uscpi", "mac_fed", 0.71, +1, "linear"),
    ("mac_krcpi", "mac_bok", 0.58, +1, "linear"),
    ("mac_fed", "mac_bok", 0.40, +1, "linear"),
    ("mac_fed", "sig_macro", 0.55, +1, "evidence"),
    ("mac_bok", "sig_macro", 0.68, +1, "evidence"),
    ("mac_fed", "rat_ust", 0.45, +1, "linear"),
    ("mac_bok", "rat_ktb", 0.35, +1, "linear"),
    ("rat_ust", "rat_ktb", 0.35, +1, "linear"),
    ("rat_ktb", "rat_curve", 0.10, -1, "linear"),       # bear flattening: stress-period estimate (2022-23)
    ("rat_ktb", "rat_credit", 0.20, +1, "linear"),      # stress-period 60-day pass-through (2022-23)
    ("rat_curve", "sig_rates", 0.66, +1, "evidence"),
    ("rat_credit", "sig_rates", 0.40, +1, "evidence"),
    ("rat_ktb", "eq_val", 0.90, +1, "linear"),          # 할인율 = 국고10Y + ERP; 10Y moves 0.90-0.93 with 3Y (= 1 + curve β)
    ("rat_credit", "eq_cb", 0.61, +1, "function"),      # cross-asset funding bridge
    ("eq_fin", "eq_cb", 0.49, +1, "function"),
    ("eq_fin", "eq_val", 0.28, +1, "linear"),
    ("eq_val", "eq_ipo", 0.44, -1, "function"),
    ("eq_val", "sig_equity", 0.38, +1, "evidence"),
    ("eq_cb", "sig_equity", 0.52, +1, "evidence"),
    ("eq_ipo", "sig_equity", 0.57, +1, "evidence"),
    ("rat_ust", "eq_kospi", 0.30, -1, "function"),     # global rates -> foreign flow / discount rate (−3.3% per 100bp in 2024-26)
    ("eq_kospi", "sig_equity", 0.35, +1, "evidence"),  # market-wide risk informs the IPO call
]
BRIDGE = ("rat_credit", "eq_cb")   # highlighted cross-asset path

# What each relation means for a decision, and where its β comes from (D-012, 2026-09-30).
#   data: OLS of h-day changes (bp) 2024-01~2026-09 (10_MODEL/daily) or 2017~2026 (30_BOND, 2022-23 stress window)
#   expert: team prior — no usable daily estimate (policy expectations, monthly/quarterly series)
EDGE_META = {
    ("mac_gdp", "mac_krcpi"): {"meaning": "성장이 강하면 물가 예측이 올라간다 (수요 압력)", "basis": "60일 변화 회귀 0.23 (R² 0.25) · 0.30 설정"},
    ("mac_gdp", "mac_bok"): {"meaning": "성장 갭이 커지면 한은 적정금리(테일러) 상승", "basis": "전문가 설정 · 테일러 갭 계수 0.5의 절반"},
    ("mac_uscpi", "mac_fed"): {"meaning": "US 물가 서프라이즈는 연준 경로(시장 기대)를 올린다", "basis": "전문가 설정 · 정책 기대경로 (일별 추정 불가)"},
    ("mac_krcpi", "mac_bok"): {"meaning": "KR 물가 예측이 오르면 한은 인상 압력", "basis": "전문가 설정 · 반응함수 (일별 추정 불가)"},
    ("mac_fed", "mac_bok"): {"meaning": "연준 금리는 한은 결정에 60일 시차로 전이 (환율·자본흐름)", "basis": "60일 변화 회귀 0.37 (R² 0.26) · 0.40 설정"},
    ("mac_fed", "sig_macro"): {"meaning": "연준 경로는 KR 금리경로 판단의 입력", "basis": "판단 규칙 가중"},
    ("mac_bok", "sig_macro"): {"meaning": "기준금리 vs 테일러 적정 갭이 금리경로 판단의 핵심", "basis": "판단 규칙 가중"},
    ("mac_fed", "rat_ust"): {"meaning": "연준 결정 → 미국채 10년: 통상 0.2~0.5 전이 (기간프리미엄이 상쇄)", "basis": "전문가 설정 · 계단형 정책금리라 일별 추정 불가 (2024~26 회귀는 −0.29, R² 0.04)"},
    ("mac_bok", "rat_ktb"): {"meaning": "한은 결정 → 국고 3년: 단기물이 정책금리를 따라감", "basis": "20~60일 변화 회귀 0.23~0.49 · 0.35 설정"},
    ("rat_ust", "rat_ktb"): {"meaning": "미국 금리 1bp 상승 시 국고 3년 약 0.35bp 상승 (글로벌 금리 동조)", "basis": "5~20일 변화 회귀 0.33 (R² 0.18~0.22, 2024~26)"},
    ("rat_ktb", "rat_curve"): {"meaning": "단기금리가 오르면 커브는 소폭 평탄화 (10년이 덜 오름)", "basis": "2022~23 스트레스 회귀 −0.10~−0.15 (R² 0.15~0.22) · 평시 ≈0 · −0.10 설정"},
    ("rat_ktb", "rat_credit"): {"meaning": "금리 급등 국면에서 회사채 스프레드가 따라 벌어진다 (차환 부담)", "basis": "2022~23 스트레스 60일 회귀 +0.23 (R² 0.11) · 평시 −0.09 · 스트레스 전이 0.20 설정"},
    ("rat_curve", "sig_rates"): {"meaning": "커브 기울기 변화가 듀레이션 판단에 반영", "basis": "판단 규칙 가중"},
    ("rat_credit", "sig_rates"): {"meaning": "크레딧 스프레드가 듀레이션·신용 판단에 반영", "basis": "판단 규칙 가중"},
    ("rat_ktb", "eq_val"): {"meaning": "국고 3년이 오르면 국고 10년(할인율 기준)이 0.90배 동행 → 코스닥 요구수익률 상승", "basis": "국고3Y→10Y 회귀 0.93 (R² 0.79~0.94) · 커브 β와 정합(1−0.10)"},
    ("rat_credit", "eq_cb"): {"meaning": "AA- 스프레드 45→75bp 구간에서 코스닥 CB 차환 접근성이 닫힘 → Put 위험·유출 재계산", "basis": "CB 모델 (score_cb) · 접근성 함수"},
    ("eq_fin", "eq_cb"): {"meaning": "적자 IPO 비중이 높을수록 차환 접근성이 더 빨리 닫힘", "basis": "CB 모델 · 손실 코호트 계수 0.49"},
    ("eq_fin", "eq_val"): {"meaning": "적자 기업 비중이 높으면 코스닥 요구수익률(할인율) 프리미엄", "basis": "전문가 설정 · 데이터 추정 불가 (R² 0.03)"},
    ("eq_val", "eq_ipo"): {"meaning": "할인율 25bp 상승 시 IPO 경쟁률 exp(−0.44)≈ −36% (이론)", "basis": "전문가 설정 (이론) · 2024~26 표본은 유의한 관계 없음 (R² 0.04)"},
    ("eq_val", "sig_equity"): {"meaning": "할인율 20일 변화가 IPO 판단의 위험 요소", "basis": "판단 규칙 가중"},
    ("eq_cb", "sig_equity"): {"meaning": "CB 차환 유출 압력이 IPO 판단의 위험 요소", "basis": "판단 규칙 가중"},
    ("eq_ipo", "sig_equity"): {"meaning": "수요예측 경쟁률(1년 하위 20%)이 IPO 판단의 위험 요소", "basis": "판단 규칙 가중"},
    ("rat_ust", "eq_kospi"): {"meaning": "미국 금리 100bp 상승 시 코스피 약 −3.6% (외국인 수급·할인율)", "basis": "5일 변화 회귀 −3.3%/100bp (R² 0.01, 2024~26) · D 12년 × β 0.30"},
    ("eq_kospi", "sig_equity"): {"meaning": "코스피 위험점수(8512)가 IPO 판단의 5번째 위험 요소", "basis": "판단 규칙 가중"},
}

assert len(NODES) == 17 and len(EDGES) == 24

# Model constants (displayed in the inspector)
ERP_KOSDAQ = 6.0          # % equity risk premium over KTB 10Y
D_KTB3, D_KTB10 = 2.8, 8.0  # modified duration (years)
D_KOSDAQ = 22.0           # implied equity duration of KOSDAQ growth names
D_KOSPI = 12.0            # large-cap equity duration used for the UST -> KOSPI channel
IPO_SCALE_BP = 25.0       # IPO demand: ratio' = ratio * exp(-beta * Δval / 25bp)
PUT_HORIZON_M = 12
REFI_OPEN_BP, REFI_CLOSED_BP = 45.0, 75.0   # AA- spread band where refinancing access closes


def ontology():
    return {
        "lanes": LANES,
        "nodes": NODES,
        "edges": [{"from": a, "to": b, "beta": w, "sign": s, "kind": k, **EDGE_META.get((a, b), {})} for a, b, w, s, k in EDGES],
        "bridge": list(BRIDGE),
        "constants": {"ERP_KOSDAQ": ERP_KOSDAQ, "D_KTB3": D_KTB3, "D_KTB10": D_KTB10, "D_KOSDAQ": D_KOSDAQ, "D_KOSPI": D_KOSPI,
                      "IPO_SCALE_BP": IPO_SCALE_BP, "REFI_OPEN_BP": REFI_OPEN_BP, "REFI_CLOSED_BP": REFI_CLOSED_BP},
        "note": "관계와 전이계수는 팀이 사전 정의한 리서치 온톨로지입니다. 데이터로 바뀌는 것은 노드 값뿐입니다.",
    }
