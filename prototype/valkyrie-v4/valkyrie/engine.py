"""Deterministic VALKYRIE engine: state(date, shocks) -> nodes, formulas, signals, impact table, CB scores.

No network access, no randomness. Every number on screen comes from here with its formula.
"""
import bisect
import csv
import json
import math
from datetime import date as Date

from . import ontology as O
from . import risk as RK
from .paths import MODEL, RAW

SNAPSHOT_DATES = ["2026-05-04", "2026-06-15", "2026-07-27", "2026-08-17", "2026-09-30"]

# Preset what-if scenarios (all in bp except credit_level which is an absolute AA- spread)
PRESETS = {
    "base": {"label": "기준 (충격 없음)", "shock": {}},
    "ust50": {"label": "UST +50bp", "shock": {"ust": 50}},
    "cpi30": {"label": "US CPI +30bp 서프라이즈", "shock": {"uscpi": 30}},
    "credit52": {"label": "크레딧 52bp", "shock": {"credit_level": 52}},
    "credit68": {"label": "크레딧 68bp", "shock": {"credit_level": 68}},
    "bok-25": {"label": "BOK −25bp 인하", "shock": {"bok": -25}},
}
SHOCK_KEYS = {"ust": "rat_ust", "uscpi": "mac_uscpi", "gdp": "mac_gdp", "bok": "mac_bok", "credit": "rat_credit"}
SHOCK_LABEL = {"ust": "UST", "uscpi": "US CPI", "gdp": "GDP", "bok": "BOK", "credit": "크레딧", "credit_level": "크레딧"}


def _num(v):
    if v in ("", None):
        return None
    try:
        return float(v)
    except ValueError:
        return v


def _load_csv(path):
    with open(path, encoding="utf-8") as f:
        return [{k: _num(v) for k, v in r.items()} for r in csv.DictReader(f)]


def clamp(x, lo, hi):
    return max(lo, min(hi, x))


VERDICT_KR = {"NORMAL": "안정", "WARNING": "주의", "HIGH": "경계", "SEVERE": "위기"}


def equity_state(c):
    """8512 bands: <.30 NORMAL, <.45 WARNING, <.60 HIGH, else SEVERE."""
    if c is None:
        return None
    return "NORMAL" if c < 0.30 else "WARNING" if c < 0.45 else "HIGH" if c < 0.60 else "SEVERE"


def sgn(x, digits=1):
    return f"{'+' if x >= 0 else '−'}{abs(x):.{digits}f}"


class Engine:
    def __init__(self):
        self.reload()

    def reload(self):
        self.daily = _load_csv(MODEL / "daily.csv")
        for r in self.daily:
            r["date"] = str(r["date"])
            for k in ("kr_cpi_month", "us_cpi_month"):
                r[k] = str(r[k]) if r[k] is not None else None
        self.dates = [r["date"] for r in self.daily]
        self.idx = {d: i for i, d in enumerate(self.dates)}
        self.cb = _load_csv(MODEL / "cb.csv")
        self.ipo = _load_csv(MODEL / "ipo.csv")
        for r in self.ipo:
            r["listing_date"] = str(r["listing_date"])
        self.manifest = json.loads((RAW / "_manifest.json").read_text(encoding="utf-8"))
        self.model_meta = json.loads((MODEL / "_meta.json").read_text(encoding="utf-8"))
        self.real = self.model_meta.get("equity_sample") == "REAL"
        self._focus_cache = {}

    # ---------------------------------------------------------------- helpers
    def resolve(self, d):
        """Latest business day <= d (clamped to the data range)."""
        if not d:
            return self.dates[-1]
        i = bisect.bisect_right(self.dates, d) - 1
        return self.dates[clamp(i, 0, len(self.dates) - 1)]

    def row(self, d):
        return self.daily[self.idx[self.resolve(d)]]

    def lag(self, d, n, key):
        i = self.idx[self.resolve(d)]
        return self.daily[max(0, i - n)][key]

    def policy_cycle(self, d, window=250):
        """Direction of the latest BOK move within `window` business days: (HIKING|EASING|HOLD, date, bp)."""
        i = self.idx[self.resolve(d)]
        for j in range(i, max(0, i - window), -1):
            prev, cur = self.daily[j - 1]["bok"], self.daily[j]["bok"]
            if prev is not None and cur is not None and cur != prev:
                bp = (cur - prev) * 100
                return ("HIKING" if bp > 0 else "EASING"), self.daily[j]["date"], bp
        return "HOLD", None, 0.0

    # ---------------------------------------------------------------- risk thermometer
    def _risks(self, r, nodes, shock, ktb10_after):
        """Per-object risk (valkyrie/risk.py) on the current (possibly shocked) values + lane/overall temperature."""
        i = self.idx[r["date"]]
        after = {"mac_gdp": nodes["mac_gdp"]["value"], "mac_uscpi": nodes["mac_uscpi"]["value"],
                 "mac_krcpi": nodes["mac_krcpi"]["value"], "mac_fed": nodes["mac_fed"]["value"],
                 "mac_bok": r["taylor"] - nodes["mac_bok"]["value"], "rat_ust": nodes["rat_ust"]["value"],
                 "rat_ktb": nodes["rat_ktb"]["value"], "rat_curve": nodes["rat_curve"]["value"],
                 "rat_credit": nodes["rat_credit"]["value"], "eq_fin": nodes["eq_fin"]["value"],
                 "eq_val": ktb10_after, "eq_ipo": nodes["eq_ipo"]["value"],
                 "eq_kospi": nodes["eq_kospi"]["market_risk"]["value"]}
        scores = {}
        for nid, (col, bad, why) in RK.KEYS.items():
            if not shock:
                sc = r.get(f"risk_{nid}")
            elif bad == "abs":
                sc = RK.kospi_abs(after[nid])
            else:
                sc = RK.pct_risk([x.get(col) for x in self.daily[max(0, i - RK.WINDOW):i]], after[nid], bad)
            scores[nid] = sc
            nodes[nid]["risk"] = {"score": sc, "level": RK.level(sc), "why": why,
                                  "basis": "8512 위험점수 척도 (÷0.8)" if bad == "abs" else f"직전 {RK.WINDOW}영업일 분포 대비 백분위"}
        cbs = clamp((nodes["eq_cb"].get("outflow_share") or 0) / 60, 0, 1)
        nodes["eq_cb"]["risk"] = {"score": cbs, "level": RK.level(cbs), "why": "CB 차환 유출 압력 (60% = 최대)",
                                  "basis": "차환 유출 압력 ÷ 60%"}
        t = RK.temps(scores)
        for sid, lane in (("sig_macro", "mac"), ("sig_rates", "rat"), ("sig_equity", "eq")):
            sc = None if t[lane] is None else t[lane] / 100
            nodes[sid]["risk"] = {"score": sc, "level": RK.level(sc), "why": f"{RK.LANE_LABEL[lane]} 영역 온도", "basis": "영역 노드 위험 평균"}
        ranked = sorted(((nid, s) for nid, s in {**scores, "eq_cb": cbs}.items() if s is not None), key=lambda x: -x[1])
        hist = self.daily[max(0, i - 119):i + 1]
        return {
            "temps": t, "base": RK.temps({nid: r.get(f"risk_{nid}") for nid in RK.KEYS}), "label": RK.temp_label(t["all"]),
            "lanes": {k: {"temp": t[k], "label": RK.temp_label(t[k]), "name": RK.LANE_LABEL[k]} for k in ("mac", "rat", "eq")},
            "top": [{"id": nid, "label": O.NODES[nid]["label"], "score": s, "level": RK.level(s)} for nid, s in ranked[:5]],
            "history": {"dates": [x["date"] for x in hist], **{k: [x.get(f"temp_{k}") for x in hist] for k in ("all", "mac", "rat", "eq")}},
            "method": ("노드 수준 = 직전 250영업일 분포 내 현재 위치(불리한 방향 백분위) · 영역 = 노드 평균 · 전체 = 3개 영역 평균 "
                       "(0 낮음 ↔ 100 높음) · 현재·과거 수준이며 전망이 아님 — 대응은 판단 신호·담당 모델·액션 플랜"),
            "note": "LEVEL, NOT FORECAST",
        }

    # ---------------------------------------------------------------- equity calibration helpers
    @staticmethod
    def cb_outflow(cbs):
        """Amount-weighted refinancing outflow: Σ put-risk balance × (1 − refi access) ÷ Σ balance."""
        bal = sum(c["balance_eok"] for c in cbs) or 1.0
        out = sum(c["outflow"] for c in cbs)
        return {"outflow": out, "balance": bal, "share": 100 * out / bal}

    def ipo_floor(self, d, q=0.2, window=250):
        """20th percentile of the IPO-demand median over the previous `window` business days (PIT)."""
        i = self.idx[self.resolve(d)]
        vals = sorted(x["ipo_demand"] for x in self.daily[max(0, i - window):i] if x.get("ipo_demand"))
        if len(vals) < 40:
            return None
        return vals[int(q * (len(vals) - 1))]

    # ---------------------------------------------------------------- CB model
    def _focus(self, pool, d, r):
        """Focus issuer for the credit bridge: the REAL issuer whose score falls most when the AA- spread moves
        52bp -> 68bp on date d (ties: larger CB). DEMO data keeps its scripted row 0."""
        if not self.real:
            return 0
        if d not in self._focus_cache:
            best, key = 0, None
            for i, c in enumerate(pool):
                lo = self.score_cb(c, d, 52.0, r["credit_bp"], 0.0, r["loss_share"])
                hi = self.score_cb(c, d, 68.0, r["credit_bp"], 0.0, r["loss_share"])
                k = (lo["score"] - hi["score"], hi["put_risk"], c["balance_eok"])
                if key is None or k > key:
                    best, key = i, k
            self._focus_cache[d] = best
        return self._focus_cache[d]

    @staticmethod
    def _items_real(c, dilution, outflow):
        """5 checks on REAL disclosed/financial data. Missing data shows '—' and does not pass."""
        def item(key, v, fmt, rule, ok):
            return {"key": key, "value": v, "fmt": "—" if v is None else fmt, "rule": rule,
                    "pass": bool(v is not None and ok)}
        rev = c.get("revenue_eok")
        burden = (100 * outflow / rev) if rev and rev > 0 else (None if not outflow else 999.0)
        if not outflow:
            burden = 0.0
        return [
            item("ΔOPM", c.get("d_opm"), f"{sgn(c.get('d_opm') or 0)}%p", f"≥ 0%p (영업이익률 FY{int(c['fin_fy']) if c.get('fin_fy') else '—'})",
                 (c.get("d_opm") or 0) >= 0),
            item("부채비율", c.get("debt_ratio"), f"{c.get('debt_ratio') or 0:.0f}%", "≤ 150%", (c.get("debt_ratio") or 0) <= 150),
            item("당좌비율", c.get("quick_ratio"), f"{c.get('quick_ratio') or 0:.0f}%", "≥ 100%", (c.get("quick_ratio") or 0) >= 100),
            item("희석", dilution, f"{dilution:.1f}%", "≤ 15% (리픽싱 반영)", dilution <= 15),
            item("Put 부담", burden, f"{burden or 0:.0f}% 매출", "유출 ≤ 연매출 30% (Put 유출 반영)", (burden or 0) <= 30),
        ]

    def score_cb(self, c, d, spread_bp, base_spread_bp, d_val_bp, loss_share):
        """Re-score one CB issuer at credit spread `spread_bp` (5 items, 1 point each)."""
        ds = spread_bp - base_spread_bp
        # Equity price under stress: discount-rate duration + credit beta (%/bp)
        price = c["price"] * math.exp(-c["eq_duration"] * d_val_bp / 10000 - c["credit_beta"] * ds / 100)
        conv_eff = max(c["refix_floor"], min(c["conv_price"], price))      # refixing (down only, floored)
        refixed = conv_eff < c["conv_price"]
        new_shares = c["balance_eok"] * 1e8 / conv_eff / 1e6
        dilution = 100 * new_shares / (c["shares_m"] + new_shares)
        months_to_put = (Date.fromisoformat(str(c["put_date"])) - Date.fromisoformat(d)).days / 30.4
        put_risk = 0 <= months_to_put <= O.PUT_HORIZON_M and price < conv_eff * 1.05
        # Refinancing access closes as AA- spread moves from 45bp to 75bp; loss-heavy cohorts close faster
        access = clamp(1 - (spread_bp - O.REFI_OPEN_BP) / (O.REFI_CLOSED_BP - O.REFI_OPEN_BP), 0, 1)
        access *= clamp(1 - 0.49 * max(0, loss_share - 50) / 100, 0, 1)
        outflow = c["balance_eok"] * (1 - access) if put_risk else 0.0
        if c.get("flag") == "REAL":
            items = self._items_real(c, dilution, outflow)
        else:
            runway = max(0.0, c["cash_eok"] - outflow) / c["burn_eok_m"]
            items = [
                {"key": "ΔGPM", "value": c["d_gpm"], "fmt": f"{sgn(c['d_gpm'])}%p", "rule": "≥ 0%p", "pass": c["d_gpm"] >= 0},
                {"key": "발생액", "value": c["accruals"], "fmt": f"{c['accruals']:.1f}%", "rule": "≤ 8% (자산 대비)", "pass": c["accruals"] <= 8},
                {"key": "자산회전율", "value": c["asset_turnover"], "fmt": f"{c['asset_turnover']:.2f}x", "rule": "≥ 0.60x", "pass": c["asset_turnover"] >= 0.6},
                {"key": "희석", "value": dilution, "fmt": f"{dilution:.1f}%", "rule": "≤ 15% (리픽싱 반영)", "pass": dilution <= 15},
                {"key": "런웨이", "value": runway, "fmt": f"{runway:.1f}개월", "rule": "≥ 18개월 (Put 유출 반영)", "pass": runway >= 18},
            ]
        return {
            "name": c["name"], "sector": c["sector"], "flag": c["flag"],
            "score": sum(i["pass"] for i in items), "items": items,
            "price": price, "price_base": c["price"], "conv_price": c["conv_price"], "conv_eff": conv_eff,
            "refix_floor": c["refix_floor"], "refixed": refixed, "put_date": str(c["put_date"]),
            "months_to_put": months_to_put, "put_risk": put_risk, "refi_access": access, "outflow": outflow,
            "balance_eok": c["balance_eok"], "cash_eok": c.get("cash_eok"), "code": c.get("code"),
            "revenue_eok": c.get("revenue_eok"), "refix_clause": c.get("refix_clause", 1), "issue_date": str(c.get("issue_date")),
            "formula": (f"P′ = {c['price']:,.0f} × exp(−{c['eq_duration']:.0f}×{d_val_bp:+.1f}bp − "
                        f"{c['credit_beta']:.2f}%×{ds:+.1f}bp) = {price:,.0f}원"),
        }

    # ---------------------------------------------------------------- state
    def state(self, d=None, shock=None, anchors=None):
        shock = {k: float(v) for k, v in (shock or {}).items() if v not in (None, "", 0, "0")}
        d = self.resolve(d)
        r = self.row(d)
        base_nodes = {
            "mac_gdp": r["gdp_now"], "mac_uscpi": r["us_cpi"], "mac_krcpi": r["kr_cpi_fcst"], "mac_fed": r["fed"],
            "mac_bok": r["bok"], "rat_ust": r["ust10"], "rat_ktb": r["ktb3"], "rat_curve": r["curve_bp"],
            "rat_credit": r["credit_bp"], "eq_fin": r["loss_share"],
            "eq_val": r["ktb10"] + O.ERP_KOSDAQ, "eq_ipo": r["ipo_demand"], "eq_kospi": r["kospi"],
        }

        # ---- linear propagation in bp, in topological order
        order = ["mac_gdp", "mac_uscpi", "mac_krcpi", "mac_fed", "mac_bok", "rat_ust", "rat_ktb",
                 "rat_curve", "rat_credit", "eq_fin", "eq_val"]
        direct = {nid: 0.0 for nid in order}
        for k, nid in SHOCK_KEYS.items():
            if k in shock:
                direct[nid] += shock[k]
        delta, terms = {}, {}
        for nid in order:
            parts = []
            for a, b, w, s, kind in O.EDGES:
                if b == nid and kind == "linear":
                    parts.append((a, w, s, s * w * delta[a]))
            dv = direct[nid] + sum(p[3] for p in parts)
            if nid == "rat_credit" and "credit_level" in shock:   # absolute what-if level
                direct[nid] = shock["credit_level"] - (base_nodes[nid] + sum(p[3] for p in parts))
                dv = shock["credit_level"] - base_nodes[nid]
            delta[nid], terms[nid] = dv, parts

        def pct_or_bp(nid, v):
            return v if O.NODES[nid]["unit"] == "bp" else v / 100

        nodes = {}
        for nid in order:
            base = base_nodes[nid]
            after = base + pct_or_bp(nid, delta[nid]) if base is not None else None
            if nid == "eq_fin":
                after = base   # structural node: not moved by rate shocks
            nodes[nid] = {"id": nid, "base": base, "value": after, "delta_bp": delta[nid],
                          "formula": self._formula(nid, base, after, delta[nid], direct[nid], terms[nid])}

        ktb10_after = r["ktb10"] + (delta["rat_ktb"] + delta["rat_curve"]) / 100
        d_val = delta["eq_val"]

        # ---- IPO demand (function of discount rate)
        w_ipo = next(w for a, b, w, s, k in O.EDGES if (a, b) == ("eq_val", "eq_ipo"))
        ipo_mult = math.exp(-w_ipo * d_val / O.IPO_SCALE_BP)
        ipo_after = base_nodes["eq_ipo"] * ipo_mult
        nodes["eq_ipo"] = {"id": "eq_ipo", "base": base_nodes["eq_ipo"], "value": ipo_after,
                           "delta_pct": (ipo_mult - 1) * 100,
                           "formula": {"lines": [
                               f"IPO′ = IPO × exp(−β × Δ할인율 / {O.IPO_SCALE_BP:.0f}bp)",
                               f"= {base_nodes['eq_ipo']:.0f} × exp(−{w_ipo:.2f} × {d_val:+.1f} / {O.IPO_SCALE_BP:.0f})",
                               f"= {ipo_after:.0f} : 1  ({(ipo_mult - 1) * 100:+.1f}%)"],
                               "source": ("38커뮤니케이션 수요예측 기관경쟁률 · 최근 10건 중앙값 (REAL)" if self.real
                                          else "DEMO IPO 표본 최근 10건 중앙값")}}

        # ---- KOSPI (function of UST: global rates / foreign-flow channel) + 8512 market-risk score
        w_k = next(w for a, b, w, s, k in O.EDGES if (a, b) == ("rat_ust", "eq_kospi"))
        k_pct = -O.D_KOSPI * w_k * delta["rat_ust"] / 100
        k_after = r["kospi"] * (1 + k_pct / 100)
        k_risk = r.get("kospi_risk")
        # 8512 score_dd (25%, full at -15%) and score_trend (20%, full at -8%) respond to an extra drawdown
        k_risk_after = None if k_risk is None else clamp(k_risk + (0.25 / 15 + 0.20 / 8) * max(0.0, -k_pct), 0, 1)
        nodes["eq_kospi"] = {
            "id": "eq_kospi", "base": r["kospi"], "value": k_after, "delta_pct": k_pct,
            "market_risk": {"base": k_risk, "value": k_risk_after, "state": equity_state(k_risk_after),
                            "base_state": r.get("kospi_state"), "w_target": r.get("kospi_wt"),
                            "kosdaq": r.get("kosdaq_risk"), "kosdaq_state": r.get("kosdaq_state")},
            "formula": {"lines": [
                "KOSPI′ = KOSPI × (1 − D × β × ΔUST)",
                f"= {r['kospi']:,.2f} × (1 − {O.D_KOSPI:.0f} × {w_k:.2f} × {delta['rat_ust']:+.1f}bp / 10⁴) = {k_after:,.2f}  ({k_pct:+.2f}%)",
                (f"8512 위험점수 {k_risk:.2f} → {k_risk_after:.2f} ({equity_state(k_risk_after)}) · 고점대비·60일선 항 근사"
                 if k_risk is not None else "8512 위험점수 없음")],
                "source": "KOSPI: 한국은행 ECOS EOD · 위험점수: 8512 equity/equity_plan.py (PIT)"}}

        # ---- CB rescoring (cross-asset bridge)
        spread_after = nodes["rat_credit"]["value"]
        pool = [c for c in self.cb if str(c.get("issue_date")) <= d] or self.cb[:1]   # PIT: issued by d
        cb_base = [self.score_cb(c, d, r["credit_bp"], r["credit_bp"], 0.0, r["loss_share"]) for c in pool]
        cb_after = [self.score_cb(c, d, spread_after, r["credit_bp"], d_val, r["loss_share"]) for c in pool]
        fi = self._focus(pool, d, r)
        put_base = sum(c["put_risk"] for c in cb_base)
        put_after = sum(c["put_risk"] for c in cb_after)
        nodes["eq_cb"] = {"id": "eq_cb", "base": put_base, "value": put_after, "delta": put_after - put_base,
                          "formula": {"lines": [
                              "Put 위험 = Σ 1[P′ < 1.05·CP′ ∧ Put ≤ 12개월]",
                              "P′ = P·exp(−D·Δ할인율 − β_c·Δ크레딧),  CP′ = max(하한, min(CP, P′))",
                              f"크레딧 {r['credit_bp']:.1f} → {spread_after:.1f}bp · 할인율 {d_val:+.1f}bp",
                              f"= {put_base} → {put_after}곳 / {len(pool)}곳" + (" (REAL)" if self.real else " (DEMO 표본)")],
                              "source": (f"CB Zero Finder(DART) 코스닥 CB {len(pool)}건 ({d}까지 발행) · 가격·재무 NAVER · "
                                         "가정: Put = 발행 12개월 후" if self.real else "DEMO CB 표본 50건 · 발행조건 가상")}}

        # ---- signals
        sig = self._signals(r, nodes, delta, ktb10_after, cb_after, put_after, shock, fi, anchors)
        nodes.update(sig["nodes"])
        eqs = sig["signals"]["equity"]
        nodes["eq_cb"]["outflow_share"] = eqs["cb_flow"]["share"]
        nodes["eq_cb"]["formula"]["lines"].append(
            f"차환 유출 압력 = Σ Put위험 잔액×(1−접근성) ÷ Σ잔액 = {eqs['cb_flow']['share']:.0f}% (≥25% 경계)")
        nodes["eq_ipo"]["weak"] = next(i["hit"] for i in eqs["risk_items"] if i["key"] == "수요 부진")

        # ---- statuses
        for nid, n in nodes.items():
            n["status"] = self._status(nid, n, r, shock)
            n["label"] = O.NODES[nid]["label"]
        risk = self._risks(r, nodes, shock, ktb10_after)

        demo = cb_after[fi]
        demo_base = cb_base[fi]
        impact = self._impact(r, nodes, delta, ktb10_after, put_base, put_after)
        shared = {
            "ktb10_price_pct": -O.D_KTB10 * (ktb10_after - r["ktb10"]),
            "kosdaq_value_pct": -O.D_KOSDAQ * d_val / 100,
            "text": (f"국고 10Y 가격 −{O.D_KTB10:.0f}×Δy = {-O.D_KTB10 * (ktb10_after - r['ktb10']):+.2f}%  ·  "
                     f"코스닥 성장주 −{O.D_KOSDAQ:.0f}×Δr = {-O.D_KOSDAQ * d_val / 100:+.2f}%"),
        }
        return {
            "date": d, "requested_shock": shock, "shock_label": self.shock_label(shock),
            "mode": "SNAPSHOT" if not shock else "WHAT-IF",
            "vintage": {"kr_cpi_month": r["kr_cpi_month"], "us_cpi_month": r["us_cpi_month"],
                        "rule": "PIT 가정: KR CPI 익월 3일, US CPI 익월 13일, GDP 분기말+3개월 28일 공표로 반영"},
            "raw": {k: r[k] for k in ("ktb3", "ktb10", "aa3", "bok", "ust10", "fed", "kospi", "kosdaq", "taylor",
                                      "kr_cpi", "us_cpi", "gdp_now", "cpi_surprise", "kosdaq_val")},
            "nodes": nodes, "signals": sig["signals"], "conflict": sig["conflict"],
            "briefing": self._briefing(r, nodes, delta, shock, sig["signals"]),
            "impact": impact, "shared_duration": shared, "risk": risk,
            "cb": {"demo": demo, "demo_base": demo_base, "all": cb_after, "n": len(cb_after), "real": self.real,
                   "put_share": 100 * put_after / len(cb_after)},
        }

    def shock_label(self, shock):
        if not shock:
            return "충격 없음"
        out = []
        for k, v in shock.items():
            out.append(f"{SHOCK_LABEL.get(k, k)} {v:.0f}bp" if k == "credit_level" else f"{SHOCK_LABEL.get(k, k)} {v:+.0f}bp")
        return " · ".join(out)

    def _formula(self, nid, base, after, dv, direct, parts):
        unit = O.NODES[nid]["unit"]
        lines = []
        if parts:
            expr = " + ".join(f"{'−' if s < 0 else ''}{w:.2f}×Δ{O.NODES[a]['label']}({delta_fmt(p / (s * w) if w else 0)})"
                              for a, w, s, p in parts)
            if direct:
                expr += f" + 직접충격({delta_fmt(direct)})"
            lines.append(f"Δ{O.NODES[nid]['label']} = {expr}")
            lines.append(f"= {delta_fmt(dv)}")
        elif direct:
            lines.append(f"Δ{O.NODES[nid]['label']} = 직접충격 {delta_fmt(direct)}")
        else:
            lines.append(f"Δ{O.NODES[nid]['label']} = 0 (상류 충격 없음)")
        if base is not None and after is not None:
            if unit == "bp":
                lines.append(f"{O.NODES[nid]['label']} = {base:.1f} {delta_fmt(dv)} = {after:.1f}bp")
            else:
                lines.append(f"{O.NODES[nid]['label']} = {base:.2f}% {sgn(dv / 100, 2)}%p = {after:.2f}%")
        return {"lines": lines}

    # ---------------------------------------------------------------- signals
    def _signals(self, r, nodes, delta, ktb10_after, cb_after, put_after, shock, fi=0, anchors=None):
        anchors = anchors or {}
        kr_cpi = r["kr_cpi"] + delta["mac_krcpi"] / 100
        gdp = (r["gdp_now"] or 2.0) + delta["mac_gdp"] / 100
        taylor = 0.5 + kr_cpi + 0.5 * (kr_cpi - 2.0) + 0.5 * (gdp - 2.0)
        bok = nodes["mac_bok"]["value"]
        gap = taylor - bok
        fed60 = (r["fed"] - self.lag(r["date"], 60, "fed")) * 100 + delta["mac_fed"]
        cycle, cyc_date, cyc_bp = self.policy_cycle(r["date"])
        if delta["mac_bok"]:   # what-if BOK 충격은 그 자체가 새 결정으로 사이클 방향을 정한다
            cycle, cyc_date, cyc_bp = ("HIKING" if delta["mac_bok"] > 0 else "EASING"), "시나리오", delta["mac_bok"]
        m_dir = "HAWKISH" if gap >= 0.75 else "DOVISH" if gap <= -0.5 else "NEUTRAL"
        m_call = {
            ("HIKING", "HAWKISH"): "인상 사이클 지속 · 추가 인상",
            ("HIKING", "NEUTRAL"): "인상 막바지 · 데이터 의존",
            ("HIKING", "DOVISH"): "인상 종료 · 동결 전환",
            ("EASING", "HAWKISH"): "인하 지연 · 긴축 장기화",
            ("EASING", "NEUTRAL"): "인하 막바지 · 데이터 의존",
            ("EASING", "DOVISH"): "인하 사이클 지속",
            ("HOLD", "HAWKISH"): "동결 후 인상 전환 압력",
            ("HOLD", "NEUTRAL"): "동결 · 데이터 의존",
            ("HOLD", "DOVISH"): "인하 사이클 진입",
        }[(cycle, m_dir)]
        if cyc_date == "시나리오":   # 가정한 결정이 테일러 갭과 반대 방향이면 그 상충을 그대로 보여준다
            m_call = {("EASING", "HAWKISH"): "인하 단행 · 물가 부담과 상충",
                      ("HIKING", "DOVISH"): "인상 단행 · 과잉 긴축 위험"}.get((cycle, m_dir), m_call)
        cyc_txt = {"HIKING": "인상 사이클", "EASING": "인하 사이클", "HOLD": "동결 국면"}[cycle]
        cyc_last = f"최근 {cyc_date} {sgn(cyc_bp, 0)}bp" if cyc_date else "최근 1년 변경 없음"
        am = anchors.get("macro") or {}
        macro = {"id": "sig_macro", "title": "금리경로 전망", "owner": "정희강", "call": m_call, "dir": m_dir, "us_regime": am or None,
                 "confidence": round(clamp(55 + 18 * abs(gap), 50, 92)), "cycle": cycle,
                 "rule": ("사이클(최근 1년 내 마지막 기준금리 변경 방향) × 테일러 갭(적정금리 − 기준금리; "
                          "≥ +0.75%p HAWKISH, ≤ −0.50%p DOVISH)"),
                 "reasons": [
                     f"{cyc_txt} ({cyc_last}) · 테일러 적정 {taylor:.2f}% vs 기준금리 {bok:.2f}% (갭 {sgn(gap, 2)}%p)",
                     f"KR CPI {kr_cpi:.2f}% · 익월 예측 {nodes['mac_krcpi']['value']:.2f}%",
                     f"Fed Funds {nodes['mac_fed']['value']:.2f}% (60영업일 {sgn(fed60, 0)}bp)" + (f" · 8501 US 국면 {am['regime']}" if am.get("regime") else "")],
                 "evidence": ["mac_bok", "mac_krcpi", "mac_fed"]}

        ust20 = (r["ust10"] - self.lag(r["date"], 20, "ust10")) * 100
        curve20 = r["curve_bp"] - self.lag(r["date"], 20, "curve_bp") + delta["rat_curve"]
        w_uk = next(w for a, b, w, s, k in O.EDGES if (a, b) == ("rat_ust", "rat_ktb"))
        pressure = delta["rat_ktb"] + w_uk * ust20 + 20 * clamp(gap, -1, 1)
        rule_dir = "SHORT" if pressure > 8 else "LONG" if pressure < -8 else "NEUTRAL"
        press_kr = {"SHORT": "상승 압력", "LONG": "하락 압력", "NEUTRAL": "압력 중립"}[rule_dir]
        anc = anchors.get("rates")
        d10 = (ktb10_after - r["ktb10"]) * 100        # what-if move of 국고10Y in bp (8511's σ20 is on 10Y daily changes)
        sizing = None
        if anc and anc.get("target") is not None and anc.get("bm"):
            # D-013: 8511's duration is VOLATILITY TARGETING — BM × clip(σ_ref/σ20, 0.3..1.2) — i.e. how much risk to
            # carry, not which way rates go. A what-if shock enters as one more day in the 20-day window,
            # σ' = √((19σ² + Δ²)/20): it shortens duration whichever way rates move and never "flips" 8511.
            # Direction ("which way") is VALKYRIE's own pressure rule and is shown separately.
            bm, s20, sref, target, mult = anc["bm"], anc.get("sigma20"), anc.get("sigma_ref"), anc["target"], anc.get("mult")
            shocked = bool(abs(d10) >= 1 and s20 and sref)
            if shocked:
                s_new = math.sqrt((19 * s20 ** 2 + d10 ** 2) / 20)
                mult_s = clamp(sref / s_new, 0.3, 1.2)
                target_s = mult_s * bm
            else:
                s_new, mult_s, target_s = s20, mult, target
            cur = anc.get("current") or bm
            chg = target_s - cur
            r_dir = "SHORT" if target_s - bm <= -0.5 else "LONG" if target_s - bm >= 0.5 else "NEUTRAL"
            per = anc.get("hedge_per_year")
            contracts = chg * per if per else None
            trade = abs(chg) >= 0.5                       # 8511 rebalancing band
            sizing = {"target": target, "bm": bm, "mult": mult, "sigma20": s20, "sigma_ref": sref, "shocked": shocked, "d10": round(d10, 1),
                      "sigma_shock": s_new, "mult_shock": mult_s, "target_shock": target_s, "current": cur, "current_src": anc.get("current_src"),
                      "change": chg, "trade": trade, "contracts": contracts, "src": "8511 변동성 타깃 (위험 사이징)"}
            r_call = {"SHORT": "듀레이션 축소 · 위험 축소", "LONG": "듀레이션 확대", "NEUTRAL": "듀레이션 중립 · BM 유지"}[r_dir] + f" ({target_s:.2f}년)"
            r_act = (f"듀레이션 {cur:.2f} → {target_s:.2f}년"
                     + (f" · 3년 국채선물 {abs(contracts):,.0f}계약 {'매도' if contracts < 0 else '매수'}" if contracts and trade else " · 0.5년 밴드 내 → 매매 없음")
                     + f" · 금리 {press_kr} (VALKYRIE)")
            anchor_txt = (f"8511 목표 듀레이션 {target:.2f}년 = BM {bm:.2f} × {mult:.2f} (기준 변동성 {sref:.1f} ÷ 20일 변동성 {s20:.1f}bp/일) — 위험 사이징, 금리 전망 아님"
                          if mult is not None and s20 and sref else f"8511 목표 듀레이션 {target:.2f}년 (BM {bm:.2f}, {target - bm:+.2f}년) — 위험 사이징")
            if shocked:
                anchor_txt += f" · 충격 Δ국고10Y {d10:+.0f}bp를 20일 창에 넣으면 변동성 {s_new:.1f}bp/일 → ×{mult_s:.2f} = {target_s:.2f}년 (방향과 무관하게 축소)"
        else:
            r_dir = rule_dir
            r_call, r_act = {"SHORT": ("듀레이션 축소 (VALKYRIE 압력 규칙)", "장기채 축소 · 단기채 확대"), "LONG": ("듀레이션 확대 (VALKYRIE 압력 규칙)", "장기채 확대"),
                             "NEUTRAL": ("듀레이션 중립", "BM 유지")}[r_dir]
            anchor_txt = "8511 듀레이션 데이터 없음 → VALKYRIE 금리 압력 규칙만 사용"
        curve_after = nodes["rat_curve"]["value"]
        rates = {"id": "sig_rates", "title": "듀레이션 판단", "owner": "정훈", "call": r_call, "dir": r_dir,
                 "action": r_act, "confidence": round(clamp(55 + 0.8 * abs(pressure), 50, 92)),
                 "rule_dir": rule_dir, "pressure": round(pressure, 1), "pressure_kr": press_kr, "sizing": sizing, "anchor": anc,
                 "rule": (f"얼마나(사이징) = 8511 변동성 타깃: BM × clip(기준 변동성/20일 변동성, 0.3~1.2), 보유와 0.5년 이상 차이일 때만 매매 · "
                          f"충격은 20일 창의 하루로 반영 σ' = √((19σ² + Δ국고10Y²)/20) · "
                          f"어느 쪽(방향 압력, VALKYRIE) = Δ국고3Y + {w_uk:.2f}×UST 20일 + 20×clamp(테일러 갭), ±8bp 경계 — 별도 표시"),
                 "reasons": [
                     anchor_txt,
                     f"VALKYRIE 금리 방향 압력 {sgn(pressure)}bp (충격 {sgn(delta['rat_ktb'])} · UST 20일 {sgn(ust20)} · 갭 {sgn(20 * clamp(gap, -1, 1))}) → {press_kr} — 방향 참고, 사이징은 8511",
                     f"3s10s {curve_after:.0f}bp (20일 {sgn(curve20, 0)}bp · {'플래트닝' if curve20 < 0 else '스티프닝'})",
                     f"크레딧 AA- {nodes['rat_credit']['value']:.0f}bp"],
                 "evidence": ["rat_ktb", "rat_curve", "rat_credit"]}

        put_share = 100 * put_after / len(cb_after)
        d_val = delta["eq_val"]
        ipo = nodes["eq_ipo"]["value"]
        credit = nodes["rat_credit"]["value"]
        # Calibrated on REAL samples (2026-09-30, docs/DECISIONS.md): level rules tuned for the DEMO table were
        # always-on with real data, so each element now reacts to a move or to its own history.
        val20 = (r["ktb10"] - self.lag(r["date"], 20, "ktb10")) * 100 + d_val      # discount-rate move, bp
        flow = self.cb_outflow(cb_after)
        q20 = self.ipo_floor(r["date"])
        weak = ipo is not None and q20 is not None and ipo < q20
        mr = (nodes.get("eq_kospi") or {}).get("market_risk", {}).get("value")
        risk = [
            ("할인율 급등", val20 > 15, f"코스닥 할인율 20일 {sgn(val20)}bp (>+15bp 경계)"),
            ("크레딧 경계", credit >= 65, f"크레딧 {credit:.0f}bp (≥65 경계)"),
            ("CB 차환 유출", flow["share"] >= 25,
             f"CB 차환 유출 압력 {flow['share']:.0f}% ({flow['outflow']:,.0f}억/{flow['balance']:,.0f}억, ≥25% 경계)"),
            ("수요 부진", weak, f"수요예측 중앙값 {ipo:.0f}:1 (1년 하위 20% {q20:.0f}:1{' 미만' if weak else ' 이상'})"
             if q20 is not None else f"수요예측 {ipo:.0f}:1"),
            ("시장 위험", mr is not None and mr >= 0.45,
             f"코스피 위험점수 {mr:.2f} ({VERDICT_KR.get(equity_state(mr), '—')}, 8512 ≥0.45 경계)" if mr is not None else "코스피 위험점수 없음"),
        ]
        pts = sum(1 for _, hit, _ in risk if hit)
        if pts >= 3:
            e_call, e_dir = "적자 코스닥 청약 보류", "AVOID"
        elif pts >= 1:
            e_call, e_dir = "선별 청약 · 흑자 우선", "SELECTIVE"
        else:
            e_call, e_dir = "적극 청약", "ENGAGE"
        demo = cb_after[fi]
        reasons = [txt for _, hit, txt in risk if hit][:3]
        cb_reason = f"{demo['name']} 재무스코어 {demo['score']}/5 · Put {'위험' if demo['put_risk'] else '안정'}"
        if not any("CB" in x for x in reasons):
            reasons = (reasons + [cb_reason])[:3]
        while len(reasons) < 3:
            reasons.append([txt for _, hit, txt in risk if not hit][len(reasons) - len([1 for _, h, _ in risk if h])])
        mk = anchors.get("equity") or {}
        e_act = None
        if mk.get("w_target") is not None:
            e_act = f"코스피 비중 {mk['w_target'] * 100:.0f}%"
            cur = mk.get("current")
            if cur is not None:   # D-013: trade only outside 8512's ±10%p band, sized against the recorded book (or 100%)
                if mk.get("rebalance") and mk.get("contracts"):
                    e_act += (f" (보유 {cur * 100:.0f}% → {(mk['w_target'] - cur) * 100:+.0f}%p · "
                              f"{mk.get('contract') or '코스피200 선물'} {abs(mk['contracts']):.0f}계약 {mk.get('side') or ''})")
                else:
                    e_act += f" (보유 {cur * 100:.0f}% · ±10%p 밴드 내 → 매매 없음)"
                e_act += " · " + ("보유 기록 기준" if mk.get("current_src") == "기록" else "보유 100% 가정")
            e_act += " (8512" + (" · 장중 잠정" if mk.get("provisional") else "") + ")"
            if mk.get("score") is not None:
                reasons = (reasons + [f"8512 코스피 위험 {mk['score']:.2f} ({mk.get('verdict') or '—'}) → 권장 비중 {mk['w_target'] * 100:.0f}% 반영"])[-3:]
        equity = {"id": "sig_equity", "title": "주식 · 비중 + IPO 선별", "owner": "김유찬", "call": e_call, "dir": e_dir, "action": e_act, "market": mk or None,
                  "confidence": round(clamp(58 + 8 * pts, 50, 92)),
                  "rule": ("위험 5요소(할인율 20일>+15bp, 크레딧≥65bp, CB 차환 유출 압력≥25%, 수요예측 중앙값<1년 하위 20%, "
                           "코스피 위험점수≥0.45) 중 ≥3 보류, 1~2 선별, 0 적극"),
                  "reasons": reasons, "risk_points": pts, "cb_demo": cb_reason, "cb_flow": flow,
                  "risk_items": [{"key": k, "hit": bool(h), "text": t} for k, h, t in risk],
                  "evidence": ["eq_val", "eq_cb", "eq_ipo", "eq_kospi"]}

        # VALKYRIE-internal consistency check (macro path vs VALKYRIE's own rate pressure / IPO stance) — never about
        # the owner models, whose sizing answers a different question (D-013)
        conflict = None
        if m_dir == "DOVISH" and rule_dir == "SHORT":
            conflict = f"점검: 매크로 경로 {m_call}(완화)인데 VALKYRIE 금리 압력은 상승 — 압력 원천(UST 20일·충격) 확인"
        elif m_dir == "HAWKISH" and rule_dir == "LONG":
            conflict = f"점검: 매크로 경로 {m_call}(긴축)인데 VALKYRIE 금리 압력은 하락 — 압력 원천 확인"
        elif m_dir == "HAWKISH" and e_dir == "ENGAGE":
            conflict = f"점검: 매크로 {m_call} vs 적극 청약 — 할인율 리스크 재확인"

        sig_nodes = {}
        for s in (macro, rates, equity):
            sig_nodes[s["id"]] = {"id": s["id"], "value": s["call"], "confidence": s["confidence"],
                                  "formula": {"lines": [s["rule"]] + s["reasons"]}}
        return {"signals": {"macro": macro, "rates": rates, "equity": equity}, "conflict": conflict, "nodes": sig_nodes}

    def _status(self, nid, n, r, shock):
        if nid.startswith("sig_"):
            return "SIGNAL"
        moved = abs(n.get("delta_bp") or 0) >= 5 or abs(n.get("delta_pct") or 0) >= 5 or (n.get("delta") or 0) != 0
        v = n["value"]
        alert = {
            "mac_uscpi": v is not None and v >= 3.0, "mac_krcpi": v is not None and v >= 3.0,
            "mac_bok": (r["taylor"] - (v or 0)) >= 0.75, "rat_curve": v is not None and v < 0,
            "rat_credit": v is not None and v >= 65, "eq_fin": v is not None and v >= 60,
            "eq_cb": (n.get("outflow_share") or 0) >= 25, "eq_ipo": bool(n.get("weak")),
            "eq_kospi": ((n.get("market_risk") or {}).get("value") or 0) >= 0.45,
            "rat_ust": v is not None and v >= 4.75,
        }.get(nid, False)
        if shock and moved:
            return "SHOCK"
        return "ALERT" if alert else "NORMAL"

    def _impact(self, r, nodes, delta, ktb10_after, put_base, put_after):
        def row(label, before, after, unit, digits=2):
            return {"label": label, "before": before, "after": after, "delta": after - before, "unit": unit, "digits": digits}
        return [
            row("국고 3Y", nodes["rat_ktb"]["base"], nodes["rat_ktb"]["value"], "%"),
            row("국고 10Y", r["ktb10"], ktb10_after, "%"),
            row("3s10s 커브", nodes["rat_curve"]["base"], nodes["rat_curve"]["value"], "bp", 1),
            row("크레딧 AA- 3Y", nodes["rat_credit"]["base"], nodes["rat_credit"]["value"], "bp", 1),
            row("코스닥 할인율", nodes["eq_val"]["base"], nodes["eq_val"]["value"], "%"),
            row("IPO 경쟁률", nodes["eq_ipo"]["base"], nodes["eq_ipo"]["value"], ":1", 0),
            row("CB Put 위험", put_base, put_after, "곳", 0),
            row("KOSPI", nodes["eq_kospi"]["base"], nodes["eq_kospi"]["value"], "pt", 2),
        ]

    def _briefing(self, r, nodes, delta, shock, sig):
        if shock:
            trigger = f"{self.shock_label(shock)} 충격"
        else:
            gap = r["taylor"] - r["bok"]
            trigger = (f"KR CPI {r['kr_cpi']:.1f}% · 테일러 갭 {sgn(gap, 1)}%p" if abs(gap) >= 0.5
                       else f"US CPI {r['us_cpi']:.1f}% · UST {r['ust10']:.2f}%")
        c = nodes["rat_curve"]
        curve_word = ("베어 플래트닝" if delta["rat_curve"] < -2 else "스티프닝" if delta["rat_curve"] > 2
                      else f"커브 {c['value']:.0f}bp")
        trans = (f"국고3Y {nodes['rat_ktb']['value']:.2f}% · {curve_word} · 크레딧 {nodes['rat_credit']['value']:.0f}bp")
        decide = f"{sig['rates']['action']} / {sig['equity']['call']}"
        return {"trigger": trigger, "transmission": trans, "decision": decide,
                "text": f"{trigger} → {trans} → {decide}"}

    # ---------------------------------------------------------------- series
    def series(self, keys, start=None, end=None):
        out = {"dates": []}
        for k in keys:
            out[k] = []
        for r in self.daily:
            if (start and r["date"] < start) or (end and r["date"] > end):
                continue
            out["dates"].append(r["date"])
            for k in keys:
                out[k].append(r.get(k))
        return out


def delta_fmt(v):
    return f"{'+' if v >= 0 else '−'}{abs(v):.1f}bp"
