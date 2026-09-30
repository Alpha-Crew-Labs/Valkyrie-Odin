"""Lv2-5 command console + approval-based publishing.

Prepared questions are answered by deterministic templates over the engine state (same question, same
answer). Free text is routed by keywords here; the AI assistant (valkyrie/ai.py) handles everything else.
"""
import json
import re
import uuid
from datetime import datetime

from . import ontology as O
from .paths import STATE


def _beta(a, b):
    return next(w for x, y, w, s, k in O.EDGES if (x, y) == (a, b))

PUBLISH_FILE = STATE / "publish.json"

PRESET_QUESTIONS = [
    {"id": "curve", "q": "지금 커브 포지션 어떻게 가져가나?"},
    {"id": "ust_ipo", "q": "UST가 50bp 오르면 코스닥 IPO는?"},
    {"id": "credit_cb", "q": "크레딧이 52bp에서 68bp로 벌어지면 CB는?"},
]


def _f(v, d=2):
    return f"{v:.{d}f}"


def answer(e, date, q):
    q = (q or "").strip()
    qid = next((p["id"] for p in PRESET_QUESTIONS if p["q"] == q), None)
    mode = "CACHED"
    if not qid:
        mode = "ROUTED"
        low = q.lower()
        if re.search(r"ust|미국|미 국채|10년물|treasury", low):
            qid = "ust_ipo"
        elif re.search(r"cb|크레딧|credit|풋|put|리픽싱", low):
            qid = "credit_cb"
        elif re.search(r"커브|듀레이션|채권|국고|포지션|duration", low):
            qid = "curve"
        elif re.search(r"ipo|청약|공모", low):
            qid = "ust_ipo"
    if not qid:
        return {"mode": "UNROUTED", "question": q, "path": [],
                "answer": ["준비 질문(커브·듀레이션·UST·IPO·크레딧·CB)은 엔진이 즉시 답합니다.",
                           "그 밖의 질문은 AI 어시스턴트가 엔진 시나리오를 실행해 답합니다."],
                "shock": {}}

    bp = 50.0
    m = re.search(r"([+-]?\d+(?:\.\d+)?)\s*bp", q)
    if qid == "ust_ipo" and m:
        bp = float(m.group(1))

    if qid == "curve":
        st = e.state(date)
        s, n = st["signals"]["rates"], st["nodes"]
        lines = [
            f"결론: {s['call']} — {s['action']} (컨피던스 {s['confidence']}).",
            f"근거① 기준금리 {_f(n['mac_bok']['value'])}% vs 테일러 적정 {_f(st['raw']['taylor'])}% → {st['signals']['macro']['call']}.",
            f"근거② UST 10Y {_f(n['rat_ust']['value'])}% → 국고 3Y {_f(n['rat_ktb']['value'])}% (전이계수 {_beta('rat_ust', 'rat_ktb'):.2f}).",
            f"근거③ 3s10s {n['rat_curve']['value']:.0f}bp · 크레딧 {n['rat_credit']['value']:.0f}bp.",
            f"규칙: {s['rule']}",
        ]
        path, shock = ["mac_bok", "rat_ust", "rat_ktb", "rat_curve", "rat_credit", "sig_rates"], {}
    elif qid == "ust_ipo":
        shock = {"ust": bp}
        b, st = e.state(date), e.state(date, shock)
        n0, n = b["nodes"], st["nodes"]
        s = st["signals"]["equity"]
        lines = [
            f"결론: UST {bp:+.0f}bp 충격 시 IPO 판단은 '{s['call']}' (기준: '{b['signals']['equity']['call']}').",
            f"전이: 국고 3Y {n['rat_ktb']['delta_bp']:+.1f}bp → 코스닥 할인율 {n['eq_val']['delta_bp']:+.1f}bp "
            f"({_beta('rat_ktb', 'eq_val'):.2f}×Δ국고3Y).",
            f"IPO 수요예측 {n0['eq_ipo']['value']:.0f} → {n['eq_ipo']['value']:.0f}:1 ({n['eq_ipo']['delta_pct']:+.1f}%).",
            f"CB Put 위험 {n0['eq_cb']['value']} → {n['eq_cb']['value']}곳 · {st['shared_duration']['text']}.",
            "근거: " + " / ".join(s["reasons"]),
        ]
        path = ["rat_ust", "rat_ktb", "eq_val", "eq_ipo", "eq_cb", "sig_equity"]
    else:
        lo, hi = e.state(date, {"credit_level": 52}), e.state(date, {"credit_level": 68})
        d0, d1 = lo["cb"]["demo"], hi["cb"]["demo"]
        failed = [i["key"] for i in d1["items"] if not i["pass"]]
        lines = [
            f"결론: 크레딧 52→68bp 시 {d1['name']} 재무스코어 {d0['score']}/5 → {d1['score']}/5.",
            f"경로: 크레딧 확대 → 차환 접근성 {d0['refi_access'] * 100:.0f}% → {d1['refi_access'] * 100:.0f}% → "
            f"주가 {d0['price']:,.0f} → {d1['price']:,.0f}원 → 리픽싱 {'발생' if d1['refixed'] else '없음'} → "
            f"Put {'위험' if d1['put_risk'] else '안정'}.",
            f"탈락 항목: {', '.join(failed)} · Put 유출 {d1['outflow']:.0f}억 반영 런웨이 {d1['items'][4]['fmt']}.",
            f"코스닥 CB 표본 Put 위험 {lo['nodes']['eq_cb']['value']} → {hi['nodes']['eq_cb']['value']}곳 · IPO 판단 '{hi['signals']['equity']['call']}'.",
        ]
        path, shock = ["rat_ktb", "rat_credit", "eq_cb", "sig_equity"], {"credit_level": 68}
    return {"mode": mode, "question": q, "qid": qid, "path": path, "answer": lines, "shock": shock,
            "note": "준비 질문 · 엔진 계산" if mode == "CACHED" else "키워드 라우팅 · 엔진 계산"}


# ------------------------------------------------------------------ publishing
def draft_comment(e, date, shock=None):
    st = e.state(date, shock)
    sg = st["signals"]
    body = [
        f"[VALKYRIE 데일리 크로스에셋 코멘트 · {st['date']}]",
        f"한 줄 결론: {st['briefing']['text']}",
        f"· 매크로({sg['macro']['owner']}): {sg['macro']['call']} — {sg['macro']['reasons'][0]}",
        f"· 채권({sg['rates']['owner']}): {sg['rates']['call']} / {sg['rates']['action']} — {sg['rates']['reasons'][0]}",
        f"· 코스닥({sg['equity']['owner']}): {sg['equity']['call']} — {'; '.join(sg['equity']['reasons'][:2])}",
        f"· 공유 듀레이션: {st['shared_duration']['text']}",
        f"※ 시나리오: {st['shock_label']} · 데이터 PIT {st['vintage']['kr_cpi_month']} CPI 기준 · 가상 표본(DEMO) 포함",
    ]
    return {"title": f"{st['date']} 크로스에셋 코멘트 — {sg['rates']['call']} / {sg['equity']['call']}",
            "body": body, "snapshot_date": st["date"], "shock": st["shock_label"],
            "evidence": sg["macro"]["evidence"] + sg["rates"]["evidence"] + sg["equity"]["evidence"],
            "confidence": round((sg["macro"]["confidence"] + sg["rates"]["confidence"] + sg["equity"]["confidence"]) / 3)}


def _load():
    return json.loads(PUBLISH_FILE.read_text(encoding="utf-8")) if PUBLISH_FILE.exists() else []


def _save(rows):
    STATE.mkdir(parents=True, exist_ok=True)
    PUBLISH_FILE.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")


def publish_list():
    return sorted(_load(), key=lambda r: r["created_at"], reverse=True)


def publish_action(e, payload):
    rows = _load()
    now = datetime.now().isoformat(timespec="seconds")
    act = payload.get("action")
    if act == "draft":
        d = draft_comment(e, payload.get("date"), payload.get("shock"))
        item = {"id": uuid.uuid4().hex[:8], **d, "status": "DRAFT", "created_at": now,
                "history": [{"status": "DRAFT", "at": now, "by": "VALKYRIE"}]}
        rows.append(item)
    else:
        item = next((r for r in rows if r["id"] == payload.get("id")), None)
        if not item:
            raise KeyError("unknown item")
        who = payload.get("by") or "담당자"
        if act == "submit" and item["status"] == "DRAFT":
            item["status"] = "PENDING"
        elif act == "approve" and item["status"] == "PENDING":
            item["status"] = "PUBLISHED"
            item["approver"], item["approved_at"] = who, now
        elif act == "reject" and item["status"] == "PENDING":
            item["status"] = "DRAFT"
        else:
            raise ValueError(f"invalid transition {item['status']} -> {act}")
        item["history"].append({"status": item["status"], "at": now, "by": who})
    _save(rows)
    return item
