import os
import sys
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# quant-core 폴더 경로를 sys.path에 직접 등록 (하이픈 폴더명 인식 해결)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
QUANT_CORE_DIR = os.path.join(BASE_DIR, "quant-core")
if QUANT_CORE_DIR not in sys.path:
    sys.path.append(QUANT_CORE_DIR)

# macro_engine 직접 불러오기
from macro_engine import compute_yield_shock_pnl, compute_black_litterman

app = FastAPI(title="VALKYRIE Macro Quant Engine API")

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"status": "online", "system": "VALKYRIE Quant Engine"}

@app.get("/api/v1/macro/yield-shock")
def get_yield_shock():
    sample_yields = {
        "DGS1MO": 5.3, "DGS3MO": 5.2, "DGS6MO": 5.1, "DGS1": 4.8,
        "DGS2": 4.2, "DGS3": 4.0, "DGS5": 3.8, "DGS7": 3.9,
        "DGS10": 4.0, "DGS20": 4.3, "DGS30": 4.2,
    }
    return {"status": "success", "data": compute_yield_shock_pnl(sample_yields)}