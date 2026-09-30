"""RESEARCH STACK cross-check: each owner's deep model next to VALKYRIE's terminal signal for the same date.

  MACRO  정희강 :8501 QUANT MACRO TERMINAL — the app writes no file, so its regime rule is reproduced from FRED
         real-data defaults (What-If off): quadrant of (core PCE YoY − 2%, real GDP YoY − 2%), GDP with a release lag.
  RATES  정훈  :8511 채권 위기 진단 — bond/action_plan.py output: data/30_BOND/korea_bond_action_plan.json (latest)
         and korea_bond_action_history.csv (by date; Kim filter refit on the full sample → not point-in-time).
  EQUITY 김유찬 :8512 주식 시장 진단 — equity/equity_plan.py run read-only in the project venv (pandas lives there, not
         in the server's stdlib Python); expanding-window rules → point-in-time. Cached in data/state/tools_equity.json.

VALKYRIE never writes into those apps' folders; the apps are not modified.
"""
import csv
import json
import os
import subprocess
import threading
import time
from . import book as BK
from .paths import BOND, RAW, ROOT, STATE

VENV_PY = ROOT / ".venv" / "Scripts" / "python.exe"
NAVER_MANIFEST = RAW / "naver" / "_manifest.json"   # written last by collect_naver.py -> a new mtime = complete refresh
EQUITY_CACHE = STATE / "tools_equity.json"
EQUITY_EVERY = 600
EQUITY_SCRIPT = r"""
import json, sys
sys.path.insert(0, sys.argv[1]); sys.path.insert(0, sys.argv[1] + r"\equity")
import equity_plan as ep
d = ep.load()
cur = float(sys.argv[2]) if len(sys.argv) > 2 else 1.0   # held equity weight (data/state/book.json); 8512's default is 1.0
out = {}
for mk in ("kospi", "kosdaq"):
    s = ep.build_signals(d, mk)
    p = ep.plan_for(s, 1000, current=cur)
    hist = [[str(i.date()), round(float(r.composite), 4), r.state, round(float(r.w_target), 3)]
            for i, r in s[["composite", "state", "w_target"]].iterrows() if r.state]
    out[mk] = {"asof": str(p["asof"].date()), "diagnosis": {k: v for k, v in p["diagnosis"].items() if k != "contrib"},
               "contrib": p["diagnosis"]["contrib"], "exposure": p["exposure"],
               "futures": {k: p["futures"][k] for k in ("contract", "contracts", "side")}, "history": hist[-800:]}
print(json.dumps(out, ensure_ascii=False, default=str))
"""
QUAD = {(True, True): ("과열", "REFLATION"), (False, True): ("골디락스", "GOLDILOCKS"),
        (True, False): ("스태그플레이션", "STAGFLATION"), (False, False): ("침체", "DEFLATION")}
BOND_VERDICT = {"NORMAL": "안정", "WARNING": "주의", "HIGH": "경계", "SEVERE": "위기"}
CURVE = {"bear_flat": "베어 플래트닝", "bear_steep": "베어 스티프닝", "bull_flat": "불 플래트닝",
         "bull_steep": "불 스티프닝", "neutral": "중립"}


def _rows(path):
    with open(path, encoding="utf-8-sig") as f:   # bond CSVs are written with a BOM
        return list(csv.DictReader(f))


def _f(v):
    try:
        return None if v in (None, "") else float(v)
    except ValueError:
        return None


def _shift(d, months, day):
    y, m = int(d[:4]), int(d[5:7]) + months
    y, m = y + (m - 1) // 12, (m - 1) % 12 + 1
    return f"{y:04d}-{m:02d}-{day:02d}"


def _yoy(rows, step):
    return [(rows[i][0], (rows[i][1] / rows[i - step][1] - 1) * 100) for i in range(step, len(rows))]


def _asof(pairs, d):
    """pairs: [(available_date, obs_date, value)] sorted; latest available on d."""
    hit = None
    for a, o, v in pairs:
        if a <= d:
            hit = (o, v)
        else:
            break
    return hit


class Tools:
    def __init__(self):
        self.lock = threading.Lock()
        self.equity = json.loads(EQUITY_CACHE.read_text(encoding="utf-8")) if EQUITY_CACHE.exists() else None
        self.equity_error = None
        self._bond_mtime = None
        self.bond_plan, self.bond_hist = None, []
        self.macro = self._load_macro()
        self._load_bond()

    # ------------------------------------------------------------ loaders
    def _load_macro(self):
        try:
            pce = [(r["date"], float(r["value"])) for r in _rows(RAW / "us_core_pce.csv")]
            gdp = [(r["date"], float(r["value"])) for r in _rows(RAW / "us_gdp_real.csv")]
        except (OSError, KeyError, ValueError):
            return None
        # release lags: core PCE month m ~ end of m+1; GDP advance ~ 30 days after quarter end
        return {"pce": [(_shift(d, 1, 28), d, v) for d, v in _yoy(pce, 12)],
                "gdp": [(_shift(d, 3, 30), d, v) for d, v in _yoy(gdp, 4)]}

    def _load_bond(self):
        plan, hist = BOND / "korea_bond_action_plan.json", BOND / "korea_bond_action_history.csv"
        if not plan.exists() or not hist.exists():
            return
        mt = max(plan.stat().st_mtime, hist.stat().st_mtime)
        if mt == self._bond_mtime:
            return
        try:
            p = json.loads(plan.read_text(encoding="utf-8"))
            h = [r for r in _rows(hist) if r.get("date", "") >= "2023-06-01"]
        except (OSError, ValueError):
            return
        with self.lock:
            self.bond_plan, self.bond_hist, self._bond_mtime = p, h, mt

    def refresh_equity(self, timeout=180):
        if not VENV_PY.exists():
            self.equity_error = "project .venv not found"
            return False
        held = BK.equity_weight()                       # D-013: size 8512's trade against the recorded book, not 100%
        try:
            out = subprocess.run([str(VENV_PY), "-c", EQUITY_SCRIPT, str(ROOT), str(1.0 if held is None else held)],
                                 capture_output=True, timeout=timeout,
                                 cwd=str(ROOT), env={**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONDONTWRITEBYTECODE": "1"})
            data = json.loads(out.stdout.decode("utf-8"))
        except Exception as exc:
            self.equity_error = f"{type(exc).__name__}: {exc}"[:200]
            return False
        data["fetchedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S")
        data["held_equity"] = held
        with self.lock:
            self.equity, self.equity_error = data, None
        STATE.mkdir(parents=True, exist_ok=True)
        EQUITY_CACHE.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        return True

    def start(self):
        """Re-run the 8512 model whenever the NAVER collector finishes (manifest mtime), so v4 never lags :8512."""
        def loop():
            last, wait = None, 30
            while True:
                self._load_bond()
                try:   # a new NAVER refresh or a newly recorded book -> re-run 8512
                    mt = (NAVER_MANIFEST.stat().st_mtime, BK.PATH.stat().st_mtime if BK.PATH.exists() else None)
                except OSError:
                    mt = None
                if mt != last or self.equity is None:
                    if self.refresh_equity():
                        last, wait = mt, 30
                    else:
                        wait = 300          # venv/app broken: back off instead of spawning every 30 s
                time.sleep(wait)
        threading.Thread(target=loop, daemon=True, name="tools").start()

    @staticmethod
    def _provisional(asof):
        """8512's last row is intraday while KRX is open (NAVER marketStatus) -> label it 장중 · 잠정값."""
        try:
            b = json.loads((RAW / "naver" / "market_board.json").read_text(encoding="utf-8"))
            k = next((x for x in b.get("items", []) if x.get("code") == "KOSPI"), None)
            return bool(k and k.get("marketStatus") == "OPEN" and str(k.get("tradedAt", ""))[:10] == asof)
        except (OSError, ValueError):
            return False

    # ------------------------------------------------------------ per-domain verdicts
    def _macro(self, d, sig):
        m = self.macro
        base = {"id": "macro", "owner": "정희강", "domain": "MACRO", "app": "QUANT MACRO TERMINAL", "port": 8501,
                "basis": "8501 규칙 재현 · FRED 실데이터 기본값 (What-If 끔) · 공표 시차 반영"}
        if not m:
            return {**base, "verdict": "대기", "headline": "FRED 근원 PCE·실질 GDP 미수집", "match": "NA", "matchText": "데이터 대기"}
        p, g = _asof(m["pce"], d), _asof(m["gdp"], d)
        if not p or not g:
            return {**base, "verdict": "대기", "headline": "해당 날짜 공표값 없음", "match": "NA", "matchText": "데이터 대기"}
        name, code = QUAD[(p[1] - 2 > 0, g[1] - 2 > 0)]
        inflationary = p[1] > 2
        vd = sig["macro"]["dir"]
        if vd == "NEUTRAL":
            match = "PARTIAL"
        else:
            match = "AGREE" if (vd == "HAWKISH") == inflationary else "CONFLICT"
        text = {"AGREE": f"KR 금리경로 {vd}와 정합 (US 물가 {'상회' if inflationary else '하회'})",
                "PARTIAL": "KR 금리경로 중립 — US 국면만 방향성", "CONFLICT": f"US {name} vs KR {vd} — 금리경로 재확인"}[match]
        return {**base, "verdict": name, "code": code, "date": d, "dir": "INFLATION" if inflationary else "DISINFLATION",
                "headline": f"근원 PCE {p[1]:.2f}% ({p[0][:7]}) · 실질 GDP {g[1]:+.2f}% ({g[0][:7]})",
                "metrics": {"core_pce_yoy": round(p[1], 3), "gdp_yoy": round(g[1], 3), "pce_month": p[0][:7], "gdp_quarter": g[0][:7]},
                "match": match, "matchText": text,
                "detail": "국면 = (근원 PCE YoY − 2%, 실질 GDP YoY − 2%) 부호 사분면 — 8501 QUADRANTS와 동일 규칙"}

    def _rates(self, d, sig):
        base = {"id": "rates", "owner": "정훈", "domain": "RATES", "app": "채권 위기 진단 · 액션 플랜", "port": 8511}
        with self.lock:
            plan, hist = self.bond_plan, self.bond_hist
        if not plan:
            return {**base, "verdict": "대기", "headline": "data/30_BOND 결과 없음", "match": "NA", "matchText": "데이터 대기",
                    "basis": "bond/action_plan.py 산출물"}
        if plan.get("asof") and d >= plan["asof"]:
            dg, du, cv = plan["diagnosis"], plan["duration"], plan.get("curve") or {}
            verdict, score, state = dg["verdict"], dg["composite"], dg["state"]
            driver, cr = dg.get("driver"), plan.get("credit") or {}
            credit = {"verdict": dg.get("credit_verdict"), "stress": dg.get("credit_stress"), "state": dg.get("credit_state"),
                      "action": cr.get("action"), "reason": cr.get("reason"), "short_term": cr.get("short_term"),
                      "target_weight": cr.get("target_weight"), "current_weight": cr.get("current_weight"),
                      "benchmark_weight": cr.get("benchmark_weight"), "trade_eok": cr.get("trade_eok"),
                      "spread_bp": cr.get("spread_bp"), "chg20_bp": cr.get("chg20_bp"), "cp_pickup_bp": cr.get("cp_pickup_bp")}
            target, bm, change = du["target"], du["benchmark"], du["change"]
            curve = cv.get("name") or CURVE.get(cv.get("view"), "")
            hedge = plan.get("futures_hedge") or {}
            action = f"{hedge.get('contract', '선물')} {abs(hedge.get('contracts') or 0):,.0f}계약 {hedge.get('side', '')}".strip()
            when, basis = plan["asof"], "최신 액션 플랜 (korea_bond_action_plan.json · 운용 1000억 기본값)"
            per_year = (hedge.get("contracts") / change) if change and hedge.get("contracts") else None   # 3Y futures per 1y of duration
            self._hedge_per_year = per_year or getattr(self, "_hedge_per_year", None)
            struct = {"target": target, "benchmark": bm, "change": change, "hedge": action, "curve": curve,
                      "mult": du.get("mult"), "sigma20": du.get("sigma20_bp"), "sigma_ref": du.get("sigma_ref_bp"),
                      "current": du.get("current"), "hedge_contracts": hedge.get("contracts"), "hedge_per_year": per_year,
                      "curve_trade": cv.get("trade"), "credit": cr.get("action"), "credit_model": credit, "driver": driver,
                      "rate_verdict": dg.get("rate_verdict"), "triggers": plan.get("triggers") or {}, "monitoring": dg.get("monitoring")}
        else:
            row = None
            for r in hist:
                if r["date"] <= d:
                    row = r
                else:
                    break
            if not row:
                return {**base, "verdict": "대기", "headline": "해당 날짜 이력 없음", "match": "NA", "matchText": "데이터 대기"}
            # D-009 (8511): the history CSV carries the per-date verdict from the same function as the JSON
            # (crisis_dashboard.overall_view: rate score + Kim regime vs credit model). Read it as-is; only reconstruct
            # "worse of state / credit_state" for older files without those columns (Kim regime then unknown -> 3% off).
            order = ["NORMAL", "WARNING", "HIGH", "SEVERE"]
            rate_state, cred_state = row["state"], row.get("credit_state") or "NORMAL"
            score = _f(row["composite"])
            cs = _f(row.get("credit_stress"))
            if row.get("verdict"):
                verdict, driver = row["verdict"], row.get("driver") or "없음"
                state = {v: k for k, v in BOND_VERDICT.items()}.get(verdict, rate_state)
                rate_state = {v: k for k, v in BOND_VERDICT.items()}.get(row.get("rate_verdict"), rate_state)
                cred_state = {v: k for k, v in BOND_VERDICT.items()}.get(row.get("credit_verdict"), cred_state)
            else:
                state = max(rate_state, cred_state, key=lambda s: order.index(s) if s in order else 0)
                verdict = BOND_VERDICT.get(state, state)
                driver = ("금리+신용" if rate_state == cred_state != "NORMAL" else "신용" if state == cred_state != rate_state
                          else "금리" if state != "NORMAL" else "없음")
            credit = {"verdict": BOND_VERDICT.get(cred_state, cred_state), "stress": cs, "state": cred_state,
                      "target_weight": _f(row.get("w_credit")), "spread_bp": _f(row.get("cs_bp")), "chg20_bp": _f(row.get("cs_chg20_bp"))}
            target, bm = _f(row["D_target"]), _f(row["D_BM"])
            change = (target - bm) if target is not None and bm is not None else 0.0
            curve, action, when = CURVE.get(row.get("curve_view"), row.get("curve_view") or ""), "", row["date"]
            struct = {"target": target, "benchmark": bm, "change": change, "curve": curve, "credit_model": credit, "driver": driver,
                      "mult": _f(row.get("dur_mult")), "sigma20": _f(row.get("sigma20_bp")), "sigma_ref": _f(row.get("sigma_ref_bp")),
                      "current": bm, "hedge_per_year": getattr(self, "_hedge_per_year", None),
                      "rate_verdict": BOND_VERDICT.get(rate_state, rate_state)}
            basis = "일별 이력 (korea_bond_action_history.csv · 판정 열 그대로 · Kim filter 전체표본 재추정 → PIT 아님)"
        # duration vs BM is RISK SIZING (volatility target), not a rate view (D-013); verdicts() writes how it was reflected
        tdir = "SHORT" if change <= -0.5 else "LONG" if change >= 0.5 else "NEUTRAL"
        match, text = "AGREE", ""
        head = f"위기점수 {score:.2f} · 권장 듀레이션 {target:.2f}년 (BM {bm:.2f}, {change:+.2f}년)" + (f" · {curve}" if curve else "")
        if credit.get("stress") is not None:
            head += f" · 신용 {credit.get('verdict') or '—'} {credit['stress']:.2f}" + (f" (주도: {driver})" if driver and driver != "없음" else "")
        return {**base, "verdict": verdict, "score": score, "threshold": 0.40, "state": state, "date": when, "dir": tdir,
                "driver": driver, "credit": credit, "headline": head,
                "action": action, "basis": basis, "match": match, "matchText": text, "plan": struct,
                "detail": "판정 = 금리 모형(위기점수+Kim)과 신용 모형(크레딧 스트레스) 중 더 나쁜 쪽 · 목표 듀레이션 = BM × clip(기준변동성/20일변동성, 0.3~1.2) · 0.5년 이상 차이일 때만 매매"}

    def _equity(self, d, sig):
        base = {"id": "equity", "owner": "김유찬", "domain": "EQUITY", "app": "주식 시장 진단 · 액션 플랜", "port": 8512,
                "basis": "equity/equity_plan.py 규칙 (코스닥 · 중립 위험성향 · 1000억) · 확장창 → PIT"}
        with self.lock:
            eq = self.equity
        if not eq or "kosdaq" not in eq:
            return {**base, "verdict": "대기", "headline": self.equity_error or "계산 대기", "match": "NA", "matchText": "데이터 대기"}
        k, kp = eq["kosdaq"], eq.get("kospi") or {}

        def at(block):
            row = None
            for h in block.get("history", []):
                if h[0] <= d:
                    row = h
                else:
                    break
            return row
        row, rowp = at(k), at(kp)
        if not row:
            return {**base, "verdict": "대기", "headline": "해당 날짜 이력 없음", "match": "NA", "matchText": "데이터 대기"}
        _, comp, state, w = row
        verdict = BOND_VERDICT.get(state, state)
        hist_k = k.get("history") or []
        latest = len(hist_k) >= 2 and row[0] >= hist_k[-2][0]   # the latest plan also serves the EOD date just before it
        match, text = "AGREE", ""   # market weight is an input to the equity signal (D-011); verdicts() writes how
        drv = (k.get("diagnosis") or {}).get("driver") if latest else None
        prov = latest and self._provisional(k.get("asof"))
        head = f"코스닥 위험점수 {comp:.2f} · 권장 주식비중 {w * 100:.0f}%"
        if rowp:
            head += f" · 코스피 {BOND_VERDICT.get(rowp[2], rowp[2])} {rowp[1]:.2f}"
        if prov:
            head += " · 장중 잠정값"
        plan = {"kosdaq": {"verdict": verdict, "score": comp, "w_target": w, "provisional": prov,
                           "futures_proxy": "코스피200 선물로 근사 (KOSDAQ150 데이터 없음)"}}
        if rowp:
            plan["kospi"] = {"verdict": BOND_VERDICT.get(rowp[2], rowp[2]), "score": rowp[1], "w_target": rowp[3],
                             "provisional": prov, "asof": kp.get("asof") if latest else rowp[0]}
        if latest:
            for mk in ("kospi", "kosdaq"):
                blk = eq.get(mk) or {}
                if mk in plan and blk.get("exposure"):
                    plan[mk].update({"exposure": blk["exposure"], "futures": blk.get("futures"),
                                     "driver": (blk.get("diagnosis") or {}).get("driver"), "contrib": blk.get("contrib")})
        return {**base, "verdict": verdict, "score": comp, "threshold": 0.45, "state": state, "date": row[0], "dir": state,
                "headline": head, "action": (f"주된 원인: {drv}" if drv else ""), "match": match, "matchText": text, "plan": plan,
                "provisional": prov,
                "detail": "위험점수 = 변동성 25%·고점대비 25%·60일선 20%·빚투 15%·예탁금 15% · 0.30/0.45/0.60 경계"}

    # ------------------------------------------------------------ public tools (김유찬): IPO Market Report · CB Zero Finder
    def public_tools(self):
        """Headline stats from the two public tools, refreshed when the research files change."""
        base = RAW / "research"
        meta, cbf = base / "ipo_report_meta.json", base / "cb_issues.json"
        try:
            mt = max((f.stat().st_mtime for f in (meta, cbf) if f.exists()), default=None)
        except OSError:
            mt = None
        cached = getattr(self, "_public", None)
        if cached and cached.get("_mtime") == mt:
            return cached["data"]
        out = {}
        if meta.exists():
            try:
                m = json.loads(meta.read_text(encoding="utf-8"))
                out["ipo_market_report"] = {"owner": "김유찬", "url": "https://ipo-market-report.vercel.app/", "companies": m.get("companies"),
                                            "period": m.get("period"), "dataDate": m.get("dataDate"), "generatedAt": m.get("generatedAt"),
                                            "note": "공모주 시장 리포트(PDF) 메타 · 수요예측·상장 수익률 실데이터는 38커뮤니케이션 표본으로 엔진에 반영"}
            except (OSError, ValueError):
                pass
        if cbf.exists():
            try:
                rows = json.loads(cbf.read_text(encoding="utf-8")).get("rows", [])
                fz = lambda v: _f(str(v).replace(",", "")) if v not in (None, "", "-") else None
                zz = [r for r in rows if (fz(r.get("surfaceRate")) or 0) == 0 and (fz(r.get("maturityRate")) or 0) == 0]
                dil = [fz(r.get("dilutionRate")) for r in rows if fz(r.get("dilutionRate")) is not None]
                amt = sum(fz(r.get("amountEok")) or 0 for r in rows)
                kq = [r for r in rows if r.get("market") == "KOSDAQ"]
                last30 = [r for r in rows if r.get("receiptDate", "") >= (rows[0].get("receiptDate", "")[:8] + "01" if rows else "")]
                out["cb_zero_finder"] = {"owner": "김유찬", "url": "https://cb-zero-finder.vercel.app/", "issues": len(rows), "kosdaq_issues": len(kq),
                                        "amount_eok": round(amt), "zero_zero_count": len(zz), "zero_zero_share_pct": round(100 * len(zz) / len(rows), 1) if rows else None,
                                        "avg_dilution_pct": round(sum(dil) / len(dil), 1) if dil else None,
                                        "high_dilution_share_pct": round(100 * sum(1 for x in dil if x >= 20) / len(dil), 1) if dil else None,
                                        "latest_receipt": rows[0].get("receiptDate") if rows else None, "this_month_issues": len(last30),
                                        "note": "DART 전환사채 발행 공시(올해 누적) · 엔진 CB 노드의 실표본 원천"}
            except (OSError, ValueError, ZeroDivisionError):
                pass
        self._public = {"_mtime": mt, "data": out}
        return out

    def anchors(self, d):
        """Owner-model outputs for date d, fed INTO the engine signals (D-011/D-013): 8511 volatility-target duration
        (risk sizing, with σ20/σ_ref so a what-if shock can be pushed through the same formula), 8512 market weight sized
        against the recorded book, 8501 regime. Built from the same readers as the cross-check, so verdicts() cannot
        disagree with what the engine used."""
        dummy = {"macro": {"dir": "NEUTRAL", "call": ""}, "rates": {"dir": "NEUTRAL", "call": ""}, "equity": {"dir": "SELECTIVE", "call": ""}}
        self._load_bond()
        book = BK.load()
        out = {}
        r = self._rates(d, dummy)
        p = r.get("plan") or {}
        if p.get("target") is not None:
            ch = p["change"]
            held = BK.duration(book)
            out["rates"] = {"dir": "SHORT" if ch <= -0.5 else "LONG" if ch >= 0.5 else "NEUTRAL", "target": p["target"], "bm": p["benchmark"],
                            "change": ch, "mult": p.get("mult"), "sigma20": p.get("sigma20"), "sigma_ref": p.get("sigma_ref"),
                            "current": held if held is not None else (p.get("current") or p["benchmark"]),
                            "current_src": "기록" if held is not None else "BM 가정", "hedge_per_year": p.get("hedge_per_year"),
                            "verdict": r.get("verdict"), "score": r.get("score"), "date": r.get("date"), "hedge": p.get("hedge"),
                            "credit": p.get("credit_model"), "basis": r.get("basis")}
        e = self._equity(d, dummy)
        kp = ((e.get("plan") or {}).get("kospi")) or {}
        if kp.get("w_target") is not None:
            fu, ex = kp.get("futures") or {}, kp.get("exposure") or {}
            out["equity"] = {"w_target": kp["w_target"], "score": kp.get("score"), "verdict": kp.get("verdict"), "state": e.get("state"),
                             "contracts": fu.get("contracts"), "side": fu.get("side"), "contract": fu.get("contract"), "driver": kp.get("driver"),
                             "current": ex.get("current"), "change": ex.get("change"), "rebalance": ex.get("rebalance"), "trade_eok": ex.get("trade_eok"),
                             "current_src": "기록" if BK.equity_weight(book) is not None else "100% 가정",
                             "provisional": bool(kp.get("provisional")), "date": kp.get("asof") or e.get("date"),
                             "kosdaq": ((e.get("plan") or {}).get("kosdaq")) or None}
        m = self._macro(d, dummy)
        if m.get("verdict") and m["verdict"] != "대기":
            out["macro"] = {"regime": m["verdict"], "code": m.get("code"), "dir": m.get("dir"), "metrics": m.get("metrics"), "headline": m.get("headline")}
        return out

    def verdicts(self, d, signals):
        self._load_bond()
        items = [self._macro(d, signals), self._rates(d, signals), self._equity(d, signals)]
        stance = {"SHORT": "듀레이션 축소(위험 축소)", "LONG": "듀레이션 확대", "NEUTRAL": "BM 유지"}
        # D-011/D-013: owner models are inputs to the engine (see anchors); the check reports HOW each was reflected, never "conflict"
        for it in items:
            sg = signals.get(it["id"]) or {}
            if it.get("verdict") in (None, "대기"):
                it["match"], it["matchText"] = "NA", "데이터 대기"
                continue
            if it["id"] == "rates":
                sz = sg.get("sizing") or {}
                if sz.get("target") is not None:
                    it["match"] = "AGREE"
                    txt = f"반영: 8511 변동성 타깃 듀레이션 {sz['target']:.2f}년 (BM {sz['bm']:.2f}" + (f" × {sz['mult']:.2f}" if sz.get("mult") is not None else "") + f") → {stance.get(sg.get('dir'), '')}"
                    if sz.get("shocked"):
                        txt += f" · 충격 후 변동성 {sz['sigma_shock']:.1f}bp/일 → {sz['target_shock']:.2f}년"
                    it["matchText"] = txt + f" · 금리 {sg.get('pressure_kr') or '—'}은 VALKYRIE 별도 표시"
                else:
                    it["match"], it["matchText"] = "PARTIAL", "8511 듀레이션 없음 → VALKYRIE 금리 압력 규칙만"
            elif it["id"] == "equity":
                mk = sg.get("market") or {}
                it["match"] = "AGREE"
                if mk:
                    sc = f"{mk['score']:.2f}" if mk.get("score") is not None else "—"
                    wt = f"{mk['w_target'] * 100:.0f}%" if mk.get("w_target") is not None else "—"
                    txt = f"반영: 코스피 위험 {sc} ({mk.get('verdict') or '—'}) → 권장 비중 {wt} · IPO 5요소 중 시장 위험"
                    if mk.get("current") is not None:
                        txt += f" · 보유 {mk['current'] * 100:.0f}%({mk.get('current_src')}) 대비 " + ("매매" if mk.get("rebalance") else "밴드 내 유지")
                    it["matchText"] = txt
                else:
                    it["matchText"] = "반영 대기 (8512)"
            else:
                inflationary = it.get("dir") == "INFLATION"
                vd = sg.get("dir")
                aligned = vd == "NEUTRAL" or (vd == "HAWKISH") == inflationary
                it["match"] = "AGREE" if aligned else "PARTIAL"
                it["matchText"] = f"참고: US {it['verdict']} · KR 금리경로 {vd}" + ("" if aligned else " — 국면 다름 (US vs KR)")
        pub = self.public_tools()
        items[2]["public_tools"] = pub
        agree = sum(i["match"] in ("AGREE", "PARTIAL") for i in items)
        # conflicts/flips stay empty by construction: the models answer "how much" (sizing) and VALKYRIE "which way" (pressure)
        return {"date": d, "items": items, "agree": agree, "conflicts": [], "flips": [], "public_tools": pub,
                "book": BK.load(), "summary": f"담당 모델 반영 {agree}/3"}
