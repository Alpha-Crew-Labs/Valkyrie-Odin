"""Held positions the PM has recorded (data/state/book.json), so owner-model trades are sized against what is actually
held instead of the models' default assumptions (8512: 100% equity today, 8511: duration = benchmark). D-013.

Nothing recorded -> the defaults apply and every plan line says so ("보유 100% 가정" / "보유 = BM 가정"), so a hedge that
is already on is not re-recommended every day without the reader knowing why.
"""
import json
import time
from .paths import STATE

PATH = STATE / "book.json"
LIMITS = {"equity": ("weight", 0.0, 1.5), "rates": ("duration", 0.0, 20.0)}


def load():
    try:
        return json.loads(PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def equity_weight(book=None):
    return ((book if book is not None else load()).get("equity") or {}).get("weight")


def duration(book=None):
    return ((book if book is not None else load()).get("rates") or {}).get("duration")


def record(payload):
    """payload: {"equity": {"weight": 0.55, "note": ...}, "rates": {"duration": 3.4}} -> merged and stamped.
    An empty value clears that entry (back to the model default)."""
    book = load()
    now = time.strftime("%Y-%m-%dT%H:%M:%S")
    for k, (key, lo, hi) in LIMITS.items():
        v = payload.get(k)
        if not isinstance(v, dict):
            continue
        if v.get(key) in (None, ""):
            book.pop(k, None)
            continue
        x = float(v[key])
        if not lo <= x <= hi:
            raise ValueError(f"{k}.{key} out of range {lo}..{hi}")
        book[k] = {key: x, "asof": (v.get("asof") or now[:10])[:10], "recorded_at": now, "note": str(v.get("note") or "")[:120]}
    STATE.mkdir(parents=True, exist_ok=True)
    PATH.write_text(json.dumps(book, ensure_ascii=False, indent=1), encoding="utf-8")
    return book
