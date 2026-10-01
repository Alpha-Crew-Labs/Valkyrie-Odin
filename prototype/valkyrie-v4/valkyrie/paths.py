"""Shared paths and secret loading. Secrets never leave .env files (or the CI job's environment)."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent          # 대시보드/
RAVENS = ROOT.parent                                  # Ravens/
DATA = ROOT / "data"
RAW = DATA / "00_RAW"
MODEL = DATA / "10_MODEL"
SNAPSHOT = DATA / "20_SNAPSHOT"
BOND = DATA / "30_BOND"         # bond risk pipeline (bond/*.py) inputs + outputs
STATE = DATA / "state"          # runtime writes: user decisions, approvals
WEB = ROOT / "web"

# 대시보드/.env first, then the data-source folders (read-only references).
ENV_FILES = [ROOT / ".env", RAVENS / "채권" / ".env", RAVENS / "매크로" / ".env", RAVENS / "주식" / ".env"]


def load_env():
    env = {}
    for f in ENV_FILES:
        if not f.exists():
            continue
        for line in f.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env.setdefault(k.strip(), v.strip().strip("'\""))
    # GitHub Actions passes repository secrets as environment variables (no .env file is written).
    for k in ("ECOS_API_KEY", "FRED_API_KEY", "ANTHROPIC_API_KEY"):
        if os.environ.get(k):
            env.setdefault(k, os.environ[k])
    return env
