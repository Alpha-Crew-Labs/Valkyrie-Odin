"""Lv2-4 similar-regime search: standardized state vector + cosine similarity over the daily history."""
import math
import time

from . import ontology as O

FEATURES = [
    ("cpi_surprise", "CPI 서프라이즈", "%p"),
    ("taylor_gap", "기준금리−테일러 갭", "%p"),
    ("curve_bp", "3s10s", "bp"),
    ("credit_bp", "크레딧 AA-", "bp"),
    ("kosdaq_val", "코스닥 밸류(250일 대비)", "%"),
    ("ipo_log", "IPO 기관경쟁률(log)", ""),
]
MIN_GAP = 40      # exclude the most recent 40 business days before the query
SEPARATION = 20   # results at least 20 business days apart
FWD = 20


def _raw(r):
    return {
        "cpi_surprise": r["cpi_surprise"] or 0.0, "taylor_gap": r["bok"] - r["taylor"],
        "curve_bp": r["curve_bp"], "credit_bp": r["credit_bp"], "kosdaq_val": r["kosdaq_val"],
        "ipo_log": math.log(r["ipo_demand"]) if r["ipo_demand"] else 0.0,
    }


class Similar:
    def __init__(self, engine):
        self.e = engine
        self.vecs = [_raw(r) for r in engine.daily]
        self.mu, self.sd = {}, {}
        for k, _, _ in FEATURES:
            xs = [v[k] for v in self.vecs]
            m = sum(xs) / len(xs)
            self.mu[k] = m
            self.sd[k] = math.sqrt(sum((x - m) ** 2 for x in xs) / len(xs)) or 1.0

    def z(self, v):
        return [(v[k] - self.mu[k]) / self.sd[k] for k, _, _ in FEATURES]

    def query_vector(self, st):
        """Current (possibly shocked) state as a raw feature dict."""
        r = self.e.row(st["date"])
        v = _raw(r)
        n = st["nodes"]
        v["curve_bp"] = n["rat_curve"]["value"]
        v["credit_bp"] = n["rat_credit"]["value"]
        v["taylor_gap"] = n["mac_bok"]["value"] - r["taylor"]
        v["kosdaq_val"] = r["kosdaq_val"] - O.D_KOSDAQ * n["eq_val"]["delta_bp"] / 100
        v["ipo_log"] = math.log(max(1.0, n["eq_ipo"]["value"]))
        return v

    def search(self, st, logs=None, k=3):
        t0 = time.perf_counter()
        qv = self.query_vector(st)
        q = self.z(qv)
        qi = self.e.idx[st["date"]]
        qn = math.sqrt(sum(x * x for x in q)) or 1.0
        scored = []
        for i, v in enumerate(self.vecs):
            if i > qi - MIN_GAP or i + FWD >= len(self.vecs):
                continue
            c = self.z(v)
            cn = math.sqrt(sum(x * x for x in c)) or 1.0
            scored.append((sum(a * b for a, b in zip(q, c)) / (qn * cn), i))
        scored.sort(reverse=True)
        picks = []
        for s, i in scored:
            if all(abs(i - j) >= SEPARATION for _, j in picks):
                picks.append((s, i))
            if len(picks) == k:
                break
        out = []
        for s, i in picks:
            a, b = self.e.daily[i], self.e.daily[i + FWD]
            near = [l for l in (logs or []) if abs(self.e.idx.get(self.e.resolve(l["date"]), -999) - i) <= 11]
            out.append({
                "date": a["date"], "similarity": round(s, 3),
                "vector": {k2: round(self.vecs[i][k2], 3) for k2, _, _ in FEATURES},
                "after20": {
                    "ktb3_bp": round((b["ktb3"] - a["ktb3"]) * 100, 1),
                    "ktb10_bp": round((b["ktb10"] - a["ktb10"]) * 100, 1),
                    "kosdaq_pct": round((b["kosdaq"] / a["kosdaq"] - 1) * 100, 2),
                    "end": b["date"],
                },
                "decisions": [{"date": l["date"], "decision": l["decision"], "source": l["source"]} for l in near[:2]],
            })
        return {
            "query": {"date": st["date"], "shock": st["shock_label"], "vector": {k2: round(qv[k2], 3) for k2, _, _ in FEATURES}},
            "features": [{"key": k2, "label": l, "unit": u} for k2, l, u in FEATURES],
            "results": out, "elapsed_ms": round((time.perf_counter() - t0) * 1000, 1),
            "method": "z-score 표준화 6차원 벡터 · 코사인 유사도 · 최근 40영업일 제외 · 결과 간 20영업일 이격",
        }
