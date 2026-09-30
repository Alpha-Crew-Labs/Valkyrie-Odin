"""Today's ACTION PLAN per desk: VALKYRIE terminal signals + owner deep models (valkyrie/tools.py) -> executable lines.

Deterministic templates over engine numbers only (no LLM). Each line says which model it came from so a PM can
trace it: VALKYRIE rule, 8511 bond action plan, 8512 equity plan, 8501 regime reproduction.
"""


def _pct(v, d=0):
    return "—" if v is None else f"{v * 100:.{d}f}%"


def _sg(v, d=1):
    return "—" if v is None else f"{'+' if v >= 0 else '−'}{abs(v):.{d}f}"


def build(st, calendar=None):
    sg, nodes = st["signals"], st["nodes"]
    tools = {i["id"]: i for i in (st.get("tools") or {}).get("items", [])}
    risk = st.get("risk") or {}
    desks = []

    # ---------------------------------------------------------------- RATES
    rs, rt = sg["rates"], tools.get("rates") or {}
    p = rt.get("plan") or {}
    sz = rs.get("sizing") or {}
    items = [{"src": "VALKYRIE", "text": f"{rs['call']} — {rs['action']}", "why": rs["reasons"][1] if len(rs["reasons"]) > 1 else rs["reasons"][0]}]
    if sz.get("target") is not None:
        # D-013: 8511 duration = volatility target (how much risk), shown with its formula; a shock is pushed through it
        t = (f"목표 듀레이션 {sz['target']:.2f}년 = BM {sz['bm']:.2f} × {sz['mult']:.2f} (기준 변동성 {sz['sigma_ref']:.1f} ÷ 20일 {sz['sigma20']:.1f}bp/일)"
             if sz.get("mult") is not None and sz.get("sigma20") and sz.get("sigma_ref") else f"목표 듀레이션 {sz['target']:.2f}년 (BM {sz['bm']:.2f}년)")
        if sz.get("shocked"):
            t += f" → 충격 반영 {sz['target_shock']:.2f}년 (변동성 {sz['sigma20']:.1f}→{sz['sigma_shock']:.1f}bp/일 · 방향 무관)"
        items.append({"src": "8511 정훈", "text": t, "why": f"위기점수 {rt.get('score', 0):.2f} · {rt.get('verdict', '')} · 위험 사이징이지 금리 전망 아님"})
        held = f"보유 {sz['current']:.2f}년 " + ("(기록)" if sz.get("current_src") == "기록" else "(= BM 가정)")
        if sz.get("contracts") is not None:
            if sz.get("trade"):
                items.append({"src": "8511 정훈" + (" · 근사" if sz.get("shocked") else ""),
                              "text": f"헤지: 3년 국채선물 {abs(sz['contracts']):,.0f}계약 {'매도' if sz['contracts'] < 0 else '매수'} ({held} · 운용 1000억)",
                              "why": "DV01 차이만큼 선물로 조정 · 보유와 0.5년 이상 차이일 때만"})
            else:
                items.append({"src": "8511 정훈", "text": f"헤지: 매매 없음 ({held} vs 목표 차이 {abs(sz['change']):.2f}년 < 0.5년 밴드)", "why": "과매매 방지 밴드"})
    elif p.get("target") is not None:
        items.append({"src": "8511 정훈", "text": f"목표 듀레이션 {p['target']:.2f}년 (BM {p['benchmark']:.2f}년, {_sg(p['change'], 2)}년)",
                      "why": f"위기점수 {rt.get('score', 0):.2f} · {rt.get('verdict', '')}"})
        if p.get("hedge"):
            items.append({"src": "8511 정훈", "text": f"헤지: {p['hedge']} (운용 1000억 기준)", "why": "DV01 차이만큼 선물로 조정"})
    if p.get("curve_trade"):
        items.append({"src": "8511 정훈", "text": f"커브: {p['curve']} → {p['curve_trade']}", "why": "20일 10Y·기울기 변화"})
    cr = nodes["rat_credit"]
    crisk = (cr.get("risk") or {}).get("score")
    credit_txt = ("신규 크레딧 매입 보류 · 우량 단기물 위주" if crisk is not None and crisk >= 0.65 else
                  "크레딧 중립 · 만기 분산" if crisk is not None and crisk >= 0.35 else "우량 크레딧 캐리 확대 검토")
    cm = p.get("credit_model") or {}
    if cm.get("target_weight") is not None and cm.get("benchmark_weight") is not None:
        items.append({"src": "8511 정훈", "text": f"크레딧: {cm.get('action') or '비중 조정'} · 목표 {_pct(cm['target_weight'])} (BM {_pct(cm['benchmark_weight'])}"
                      + (f", 현재 {_pct(cm['current_weight'])}" if cm.get("current_weight") is not None else "") + ")"
                      + (f" · 매매 {cm['trade_eok']:+,.0f}억" if cm.get("trade_eok") else ""),
                      "why": f"신용 스트레스 {cm.get('stress', 0):.2f} ({cm.get('verdict') or '—'}) · " + (cm.get("reason") or "")})
        if cm.get("short_term"):
            items.append({"src": "8511 정훈", "text": f"단기 크레딧: {cm['short_term']}", "why": f"CP 가산금리 {cm.get('cp_pickup_bp') or 0:+.0f}bp"})
    items.append({"src": "VALKYRIE", "text": f"크레딧 스프레드 AA- {cr['value']:.0f}bp → {credit_txt}",
                  "why": f"1년 분포 위험 {_pct(crisk)}" + (f" · 8511 {p['credit']}" if p.get("credit") and not cm else "")})
    desks.append({"desk": "채권", "owner": "정훈", "stance": rs["dir"], "call": rs["call"], "items": items,
                  "match": rt.get("match"), "matchText": rt.get("matchText")})

    # ---------------------------------------------------------------- EQUITY
    es, et = sg["equity"], tools.get("equity") or {}
    ep = et.get("plan") or {}
    hits = [i["key"] for i in es.get("risk_items", []) if i["hit"]]
    items = [{"src": "VALKYRIE", "text": f"IPO: {es['call']}", "why": f"위험 {len(hits)}/5 · " + (", ".join(hits) or "해당 없음")}]
    flow = es.get("cb_flow") or {}
    if flow:
        items.append({"src": "VALKYRIE", "text": ("CB: 신규 투자 보류 · Put 도래 종목 점검" if flow["share"] >= 25 else "CB: 선별 투자 가능"),
                      "why": f"차환 유출 압력 {flow['share']:.0f}% ({flow['outflow']:,.0f}억 / {flow['balance']:,.0f}억)"})
    kp, mk = ep.get("kospi") or {}, es.get("market") or {}
    if kp.get("w_target") is not None:
        ex, fu = kp.get("exposure") or {}, kp.get("futures") or {}
        line = f"코스피 권장 주식비중 {_pct(kp['w_target'])}"
        held = "보유 기록" if mk.get("current_src") == "기록" else "보유 100% 가정"
        if ex.get("current") is not None:   # D-013: trade only outside 8512's ±10%p band, against the recorded book
            if ex.get("rebalance"):
                line += f" (보유 {_pct(ex['current'])} → {_sg(ex['change'] * 100, 0)}%p · {held})"
            else:
                line += f" (보유 {_pct(ex['current'])} · ±10%p 밴드 내 → 매매 없음 · {held})"
        why = f"8512 위험점수 {kp['score']:.2f} · {kp['verdict']}" + (f" · 주된 원인 {kp['driver']}" if kp.get("driver") else "")
        if kp.get("provisional"):
            why += " · 장중 잠정값"
        items.append({"src": "8512 김유찬", "text": line, "why": why})
        if fu.get("contracts") and ex.get("rebalance"):
            items.append({"src": "8512 김유찬", "text": f"헤지: {fu.get('contract', '코스피200 선물')} {abs(fu['contracts']):,.0f}계약 {fu.get('side', '')} ({held})",
                          "why": f"현물 유지 시 대안 · 비중 차이 {_sg((ex.get('change') or 0) * 100, 0)}%p만큼 선물 (1000억 기준)"})
    kq = ep.get("kosdaq") or {}
    if kq.get("score") is not None:
        items.append({"src": "8512 김유찬", "text": f"코스닥 시장 {kq['verdict']} (위험점수 {kq['score']:.2f} · 권장 {_pct(kq.get('w_target'))})",
                      "why": et.get("matchText") or ""})
    desks.append({"desk": "주식", "owner": "김유찬", "stance": es["dir"], "call": es["call"], "items": items,
                  "match": et.get("match"), "matchText": et.get("matchText")})

    # ---------------------------------------------------------------- MACRO
    ms, mt = sg["macro"], tools.get("macro") or {}
    impl = {"HAWKISH": "금리 상단 열어둠 → 단기·현금성 선호, 장기채·고밸류 성장주 보수적",
            "DOVISH": "인하 기대 → 듀레이션 확대·성장주 재진입 여지",
            "NEUTRAL": "데이터 의존 → 이벤트 전 포지션 중립 유지"}[ms["dir"]]
    items = [{"src": "VALKYRIE", "text": f"{ms['call']} — {impl}", "why": ms["reasons"][0]}]
    if mt.get("verdict") and mt["verdict"] != "대기":
        items.append({"src": "8501 정희강", "text": f"US 매크로 국면: {mt['verdict']}", "why": mt.get("headline", "")})
    desks.append({"desk": "매크로", "owner": "정희강", "stance": ms["dir"], "call": ms["call"], "items": items,
                  "match": mt.get("match"), "matchText": mt.get("matchText")})

    # ---------------------------------------------------------------- WATCH (what would change the view)
    watch = []
    if st.get("conflict"):
        watch.append({"kind": "CONFLICT", "text": st["conflict"]})
    for c in (st.get("tools") or {}).get("conflicts", []):
        watch.append({"kind": "CROSS-CHECK", "text": c})
    for k, v in list((p.get("triggers") or {}).items())[:2]:
        watch.append({"kind": "TRIGGER", "text": f"{k}: {v}"})
    from . import risk as RK
    for tnode in (risk.get("top") or [])[:3]:
        watch.append({"kind": "LEVEL", "text": f"{tnode['label']} 현재 수준 {tnode['score'] * 100:.0f} ({RK.LEVEL_KR.get(tnode['level'], tnode['level'])}) — 전망 아님, 대응은 위 액션"})
    for ev in (calendar or [])[:4]:
        watch.append({"kind": "EVENT", "text": ev})
    return {"date": st["date"], "temp": (risk.get("temps") or {}).get("all"), "tempLabel": risk.get("label"),
            "desks": desks, "watch": watch}
