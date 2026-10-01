"""VALKYRIE AI decision assistant — Claude interprets the question; the engine computes every number.

Architecture (CLAUDE.md: "LLMs may synthesize, classify, explain or draft; they must not silently replace
deterministic calculations"):

    question ──▶ Claude (claude-opus-5-5, adaptive thinking)
                   │  tools: run_scenario(shock, date) ──▶ Engine.state() + owner models + plan   (deterministic)
                   │         search_news(query)         ──▶ valkyrie/news.py (Google News RSS)
                   │         finish_answer(...)          ◀── structured verdict: actions, risks, checkpoints,
                   ▼                                        scenario to apply on the chain, proposed decision
                 answer (numbers only from tool results / context, each line carries its source)

Each question runs as a background job so the UI can show the trace (which scenarios were computed, the
model's progress notes) while the answer is being written. The API key is read from the environment or
대시보드/.env (ANTHROPIC_API_KEY) and never leaves the server.
"""
import json
import os
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone

from . import ontology as O
from .paths import STATE, load_env

try:
    import anthropic
except ImportError:      # the rest of the server keeps working; /api/ai reports why
    anthropic = None

KST = timezone(timedelta(hours=9))
# claude-sonnet-5-5 (default, user choice 2026-09-30) · claude-haiku-4-5 (cheaper; no effort/adaptive thinking) · claude-opus-5-5
MODEL = os.environ.get("VALKYRIE_AI_MODEL", "claude-sonnet-5-5")
EFFORT = os.environ.get("VALKYRIE_AI_EFFORT", "medium")
LEGACY = MODEL.startswith("claude-haiku")        # Haiku 4.5: budget thinking, no output_config.effort, no display updates
MAX_TURNS = 8
BETAS = ["thinking-display-updates-2026-08-18", "server-side-fallback-2026-07-01"]
LOG = STATE / "ask_log.json"
PRICES = {   # $/MTok (2026-09): input, output, cache write (1.25x), cache read
    "claude-sonnet-5-5": {"in": 2.0, "out": 10.0, "cache_w": 2.5, "cache_r": 0.20},
    "claude-haiku-4-5": {"in": 1.0, "out": 5.0, "cache_w": 1.25, "cache_r": 0.10},
    "claude-opus-5-5": {"in": 4.0, "out": 20.0, "cache_w": 5.0, "cache_r": 0.20},
}
PRICE = PRICES.get(MODEL, PRICES["claude-sonnet-5-5"])

SHOCK_KEYS = ("ust", "uscpi", "gdp", "bok", "credit_level")
DESK_OF = {"mac": "매크로", "rat": "채권", "eq": "주식"}


# ---------------------------------------------------------------- tools (strict: additionalProperties false)
def _num_or_null(desc):
    return {"type": ["number", "null"], "description": desc}


TOOLS = [
    {
        "name": "run_scenario",
        "description": ("VALKYRIE 엔진으로 시나리오를 결정론적으로 계산한다. 충격 없이 호출하면 현재(또는 지정 날짜) 상태. "
                        "what-if 질문은 반드시 이 도구로 계산하고, 비교가 필요하면 여러 번 병렬 호출한다. "
                        "결과: 17개 노드 값·변화·위험, 판단 3종, 충격 영향표, 데스크별 액션 플랜, 담당 모델 교차검증, CB 대표 발행사."),
        "strict": True,
        "input_schema": {
            "type": "object",
            "properties": {
                "label": {"type": "string", "description": "시나리오 이름 (예: '기준', 'UST +50bp')"},
                "ust": _num_or_null("미국채 10년 금리 충격, bp (예: 50 = +50bp). 없으면 null"),
                "uscpi": _num_or_null("US CPI 서프라이즈, bp. 없으면 null"),
                "gdp": _num_or_null("KR GDP 나우캐스트 충격, bp. 없으면 null"),
                "bok": _num_or_null("한국은행 기준금리 변경, bp (예: -25 = 25bp 인하). 없으면 null"),
                "credit_level": _num_or_null("회사채 AA- 3Y 스프레드의 절대 수준, bp (예: 68). 변화가 아니라 수준. 없으면 null"),
                "date": {"type": ["string", "null"], "description": "기준일 YYYY-MM-DD. 최신이면 null"},
            },
            "required": ["label", "ust", "uscpi", "gdp", "bok", "credit_level", "date"],
            "additionalProperties": False,
        },
    },
    {
        "name": "search_news",
        "description": "최근 3일 국내 뉴스 검색 (Google 뉴스 RSS: 연합·인포맥스·다음 등). 시장 재료·이벤트 확인용. 수치의 근거로 쓰지 않는다.",
        "strict": True,
        "input_schema": {
            "type": "object",
            "properties": {"query": {"type": "string", "description": "검색어 (한국어)"}},
            "required": ["query"],
            "additionalProperties": False,
        },
    },
    {
        "name": "finish_answer",
        "description": "최종 답을 구조화해 제출한다. 모든 질문은 반드시 이 도구 호출로 끝낸다.",
        "strict": True,
        "input_schema": {
            "type": "object",
            "properties": {
                "headline": {"type": "string", "description": "한 줄 결론 (운용역이 3초 안에 읽을 수 있게, 수치 포함)"},
                "interpretation": {"type": "string", "description": "해석. 마크다운. 인과 경로(어느 노드에서 어느 노드로, β 포함)와 근거 수치, 출처. 6~12줄"},
                "actions": {
                    "type": "array",
                    "description": "데스크별 실행 가능한 액션 (규모 포함). 근거 없는 액션은 넣지 않는다",
                    "items": {
                        "type": "object",
                        "properties": {
                            "desk": {"type": "string", "enum": ["채권", "주식", "매크로"]},
                            "action": {"type": "string", "description": "무엇을 (예: '장기채 축소 · 단기채 확대')"},
                            "size": {"type": "string", "description": "얼마나 (예: '목표 듀레이션 3.37년 (BM −2.03년)', '3년 국채선물 725계약 매도'). 없으면 빈 문자열"},
                            "rationale": {"type": "string", "description": "왜 (수치 근거 한 줄)"},
                            "source": {"type": "string", "description": "출처: VALKYRIE 규칙 / 8511 정훈 / 8512 김유찬 / 8501 정희강 / LIVE MARKET"},
                            "urgency": {"type": "string", "enum": ["즉시", "이번 주", "모니터링"]},
                        },
                        "required": ["desk", "action", "size", "rationale", "source", "urgency"],
                        "additionalProperties": False,
                    },
                },
                "risks": {"type": "array", "items": {"type": "string"}, "description": "이 판단이 틀릴 수 있는 이유·반대 근거 (2~4개)"},
                "checkpoints": {"type": "array", "items": {"type": "string"}, "description": "판단이 바뀌는 조건 (수치 트리거)"},
                "apply_scenario": {
                    "type": ["object", "null"],
                    "description": "답의 핵심 시나리오를 화면 체인에 적용할 때 쓸 충격. what-if가 아니면 null",
                    "properties": {
                        "ust": _num_or_null("bp"), "uscpi": _num_or_null("bp"), "gdp": _num_or_null("bp"), "bok": _num_or_null("bp"),
                        "credit_level": _num_or_null("bp 수준"), "date": {"type": ["string", "null"]},
                    },
                    "required": ["ust", "uscpi", "gdp", "bok", "credit_level", "date"],
                    "additionalProperties": False,
                },
                "focus_nodes": {"type": "array", "items": {"type": "string"}, "description": "답과 관련된 노드 id (인과 경로 순서)"},
                "proposed_decision": {
                    "type": ["object", "null"],
                    "description": "판단 로그에 기록할 만한 결정 제안. 없으면 null",
                    "properties": {
                        "domain": {"type": "string", "enum": ["rat", "eq"]},
                        "dir": {"type": "string", "enum": ["SHORT", "LONG", "NEUTRAL", "AVOID", "SELECTIVE", "ENGAGE"]},
                        "decision": {"type": "string"},
                        "rationale": {"type": "string"},
                    },
                    "required": ["domain", "dir", "decision", "rationale"],
                    "additionalProperties": False,
                },
                "confidence": {"type": "integer", "description": "0~100. 엔진·담당 모델이 일치하고 근거가 강할수록 높게"},
            },
            "required": ["headline", "interpretation", "actions", "risks", "checkpoints", "apply_scenario", "focus_nodes",
                         "proposed_decision", "confidence"],
            "additionalProperties": False,
        },
    },
]


# ---------------------------------------------------------------- compact engine state for the model
def _fmt(unit, v):
    if v is None:
        return None
    try:
        v = float(v)
    except (TypeError, ValueError):
        return v
    if unit == "%":
        return f"{v:.2f}%"
    if unit == "bp":
        return f"{v:.1f}bp"
    if unit == ":1":
        return f"{v:.0f}:1"
    if unit == "곳":
        return f"{v:.0f}곳"
    if unit == "pt":
        return f"{v:,.2f}"
    return round(v, 4)


def compact(st, label=None):
    nodes = {}
    for nid, n in st["nodes"].items():
        meta = O.NODES[nid]
        r = n.get("risk") or {}
        row = {"label": meta["label"], "owner": meta.get("owner"), "status": n.get("status")}
        if meta.get("signal"):
            row["call"] = n.get("value")
            row["confidence"] = n.get("confidence")
        else:
            unit = meta.get("unit", "")
            row["value"] = _fmt(unit, n.get("value"))
            if st["mode"] == "WHAT-IF" and n.get("base") is not None and n.get("base") != n.get("value"):
                row["base"] = _fmt(unit, n.get("base"))
                if n.get("delta_bp") is not None:
                    row["delta"] = f"{n['delta_bp']:+.1f}bp"
                elif n.get("delta_pct") is not None:
                    row["delta"] = f"{n['delta_pct']:+.2f}%"
                elif n.get("delta") is not None:
                    row["delta"] = f"{n['delta']:+.0f}"
        if r.get("score") is not None:
            row["level_pct_1y"] = round(r["score"] * 100)   # current position in the last year (0 low .. 100 high), NOT a forecast
        if nid == "eq_kospi" and n.get("market_risk"):
            mr = n["market_risk"]
            row["market_risk_8512"] = {"score": mr.get("value"), "state": mr.get("state"), "w_target": mr.get("w_target")}
        if nid == "eq_cb" and n.get("outflow_share") is not None:
            row["refi_outflow_share_pct"] = round(n["outflow_share"], 1)
        nodes[nid] = row
    sig = {}
    for k, s in st["signals"].items():
        sig[k] = {"title": s["title"], "owner": s["owner"], "call": s["call"], "dir": s["dir"], "action": s.get("action"),
                  "confidence": s["confidence"], "reasons": s["reasons"], "rule": s["rule"]}
        if k == "rates":
            sz = s.get("sizing") or {}
            sig[k]["direction_pressure_valkyrie"] = {"bp": s.get("pressure"), "read": s.get("pressure_kr"), "note": "어느 쪽(방향) — VALKYRIE 규칙, 사이징 아님"}
            if sz:
                sig[k]["sizing_8511"] = {kk: (round(vv, 3) if isinstance(vv, float) else vv) for kk, vv in sz.items()
                                         if kk in ("target", "bm", "mult", "sigma20", "sigma_ref", "shocked", "d10", "sigma_shock", "target_shock", "current", "current_src", "change", "trade", "contracts")}
        if k == "equity" and s.get("market"):
            m = s["market"]
            sig[k]["market_8512"] = {kk: (round(vv, 3) if isinstance(vv, float) else vv) for kk, vv in m.items()
                                     if kk in ("w_target", "score", "verdict", "current", "current_src", "change", "rebalance", "contracts", "side", "contract", "provisional")}
        if s.get("risk_items"):
            sig[k]["risk_elements"] = [{"key": x["key"], "hit": x["hit"], "text": x["text"]} for x in s["risk_items"]]
    tools = []
    for t in (st.get("tools") or {}).get("items", []):
        row = {"owner": t.get("owner"), "app": t.get("app"), "verdict": t.get("verdict"), "score": t.get("score"),
               "headline": t.get("headline"), "match_with_valkyrie": t.get("match"), "match_text": t.get("matchText"),
               "basis": t.get("basis"), "provisional": t.get("provisional", False)}
        p = t.get("plan") or {}
        if t.get("id") == "rates" and p.get("target") is not None:
            row["plan"] = {"target_duration_y": round(p["target"], 2), "benchmark_y": round(p["benchmark"], 2),
                           "change_y": round(p["change"], 2), "hedge": p.get("hedge"), "curve": p.get("curve"),
                           "curve_trade": p.get("curve_trade"), "credit": p.get("credit"), "credit_model": p.get("credit_model"),
                           "driver": p.get("driver"), "rate_verdict": p.get("rate_verdict"), "triggers": p.get("triggers")}
        if t.get("id") == "equity":
            row["plan"] = {mk: {kk: vv for kk, vv in v.items() if kk in ("verdict", "score", "w_target", "driver", "provisional")}
                           | ({"exposure_change": v["exposure"].get("change")} if v.get("exposure") else {})
                           | ({"futures": f"{v['futures'].get('contract')} {abs(v['futures'].get('contracts') or 0):.0f}계약 {v['futures'].get('side')}"}
                              if v.get("futures") and v["futures"].get("contracts") else {})
                           for mk, v in p.items()}
        if t.get("id") == "macro" and t.get("metrics"):
            row["metrics"] = t["metrics"]
        tools.append(row)
    risk = st.get("risk") or {}
    plan = st.get("plan") or {}
    demo = (st.get("cb") or {}).get("demo") or {}
    return {
        "scenario": label or st.get("shock_label"), "date": st["date"], "mode": st["mode"], "shock": st.get("requested_shock"),
        "briefing": st["briefing"]["text"], "conflict": st.get("conflict"),
        "replay_conflicts": [c["text"] for c in (st.get("replay_conflicts") or [])],
        "stress_level_now": {"note": "현재 수준 = 1년 분포 내 백분위 (0 낮음..100 높음). 전망이 아님. 대응은 signals/owner_models/action_plan에서.",
                             "overall": (risk.get("temps") or {}).get("all"), "label": risk.get("label"),
                             "lanes": {k: v.get("temp") for k, v in (risk.get("lanes") or {}).items()},
                             "top_levels": [f"{x['label']} {x['score'] * 100:.0f}" for x in risk.get("top", [])]},
        "signals": sig, "nodes": nodes,
        "impact_table": [{"item": r["label"], "before": r["before"], "after": r["after"], "unit": r["unit"]} for r in st.get("impact", [])],
        "shared_duration": (st.get("shared_duration") or {}).get("text"),
        "cb_focus_issuer": {"name": demo.get("name"), "score": demo.get("score"), "put_risk": demo.get("put_risk"),
                            "refi_access_pct": round((demo.get("refi_access") or 0) * 100), "outflow_eok": round(demo.get("outflow") or 0)} if demo else None,
        "cb_put_share_pct": round((st.get("cb") or {}).get("put_share") or 0, 1),
        "owner_models": tools,
        "public_tools": (st.get("tools") or {}).get("public_tools"),
        "live_market": st.get("market"),
        "ranges_1y": st.get("ranges"),
        "watch_list": {"note": "주목 섹터·테마·종목 (자동 선정: 업종/테마 등락·폭·회전율 + 브리핑·IPO 일정·CB 공시, VALKYRIE 기준 태그)",
                  "tilt_active": (st.get("watch") or {}).get("tilt_active"),
                  "sectors": [{"name": s["name"], "kind": s["kind"], "changeRate": s["changeRate"], "breadth": f"{int(s.get('rise') or 0)}↑{int(s.get('fall') or 0)}↓",
                               "leaders": [l.get("name") for l in s.get("leaders", [])], "tags": [t["t"] for t in s.get("tags", [])]}
                              for s in ((st.get("watch") or {}).get("sectors") or [])[:5] + ((st.get("watch") or {}).get("themes") or [])[:5]],
                  "stocks": [{"name": x["name"], "kind": x["kind"], "value": x.get("value"), "why": x.get("why"), "source": x.get("source")}
                             for x in ((st.get("watch") or {}).get("stocks") or [])[:8]]} if st.get("watch") else None,
        "action_plan": [{"desk": d["desk"], "owner": d["owner"], "call": d["call"], "items": [{"src": i["src"], "text": i["text"], "why": i.get("why")} for i in d["items"]]}
                        for d in plan.get("desks", [])],
        "watch": [w["text"] for w in plan.get("watch", [])][:8],
        "vintage": st.get("vintage", {}).get("rule"),
    }


# ---------------------------------------------------------------- system prompt (stable -> cached)
def build_system():
    onto = O.ontology()
    lines = ["# 객체 (id · 라벨 · 담당 · 설명)"]
    for nid, n in onto["nodes"].items():
        lines.append(f"- {nid} · {n['label']} · {n.get('owner', '')} · {n.get('sub', '')}" + (" · [판단 신호]" if n.get("signal") else ""))
    lines.append("# 관계 (from → to · β · 종류) — 팀이 사전 정의, 데이터는 노드 값만 바꾼다")
    for e in onto["edges"]:
        lines.append(f"- {e['from']} → {e['to']} · {'−' if e['sign'] < 0 else ''}β{e['beta']:.2f} · {e['kind']}"
                     + (f" · {e['meaning']}" if e.get("meaning") else "") + (f" [근거: {e['basis']}]" if e.get("basis") else ""))
    c = onto["constants"]
    return f"""당신은 VALKYRIE의 의사결정 어시스턴트다. 사용자는 한화자산운용의 매크로·채권·주식 운용역이며, 오늘 "무엇을 얼마나 할지"를 정하려고 질문한다.
VALKYRIE는 MACRO → RATES → EQUITY를 고정 온톨로지로 연결한 Research Intelligence 시스템이고, 모든 숫자는 결정론적 엔진과 담당자 모델이 계산한다. 당신의 역할은 (1) 질문의 의도를 해석해 어떤 시나리오를 계산할지 정하고 (2) 결과 숫자를 인과 경로로 설명하고 (3) 데스크별 액션 플랜으로 바꾸는 것이다.

## 절대 규칙
1. 수치는 도구 결과(run_scenario)와 CONTEXT에 있는 값만 쓴다. 없는 숫자를 지어내지 않는다. 뉴스는 재료·이벤트 확인용이며 수치 근거로 쓰지 않는다.
   단, 엔진이 직접 계산하지 않는 질문(N개월 뒤 전망·목표가·확률·엔진 밖 자산이나 종목·섹터)이라도 **"엔진에 없다"로 끝내는 답은 금지**다. 아래 "전망·기간 질문" 절대로 조건부 경로와 판단을 반드시 제시한다.
2. 모든 판단과 액션에 출처를 붙인다: "VALKYRIE 규칙", "8511 정훈 채권 위기 진단", "8512 김유찬 주식 시장 진단", "8501 정희강 매크로 터미널(규칙 재현)", "LIVE MARKET"(실시간 시세·수급), "뉴스". 데이터 벤더 이름(네이버 등)은 답에 쓰지 않는다.
3. what-if("~오르면", "~벌어지면", "~하면 어떻게")는 반드시 run_scenario로 계산한다. 비교가 필요하면 기준 시나리오와 충격 시나리오를 한 번에 병렬 호출한다. 현재 상태 질문은 CONTEXT만으로 답해도 되지만, 정확한 표가 필요하면 충격 없이 run_scenario를 호출한다.
4. 답은 한국어. 운용역이 10초 안에 읽도록: 결론 한 줄 → 인과 경로와 근거 수치 → 데스크별 액션(규모 포함) → 리스크·체크포인트. 얼버무리지 말고 방향을 분명히 하되, 전제와 가정은 명시한다.
5. 담당자 모델과 VALKYRIE 판단이 충돌하면 숨기지 말고 어느 쪽 근거가 강한지 말한다. 장중 잠정값(provisional)은 그렇게 표시한다.
6. 마지막에는 반드시 finish_answer 도구를 호출해 구조화된 답을 제출한다. finish_answer 없이 텍스트로만 끝내지 않는다.
7. 도구를 호출하기 전에 한 문장으로 무엇을 확인하는지 적는다.

## 문체 — 운영 콘솔(팔란티어·블룸버그 터미널) 톤
- 짧고 단정적. 수식어·감탄·이모지 금지. 한 문장에 하나의 사실. "~로 보입니다" 대신 "~다".
- 인과 경로는 화살표 표기: `UST 10Y +50bp → 국고3Y +17.5bp (β0.35) → 코스닥 할인율 +15.8bp (β0.90) → IPO 경쟁률 983→820:1`.
- interpretation은 섹션 태그로 시작하는 블록으로 쓴다(각 태그는 한 줄, 대문자 영문): SITUATION / CAUSAL PATH / EVIDENCE / CROSS-CHECK / PATHS / JUDGEMENT / ACTION / RISK / TRIGGER. 필요한 것만 쓴다.
- 라벨: 값 형식을 선호한다. 예: `국고3Y 4.08% → 4.39% (+31bp) [VALKYRIE]`.
- 모든 수치 뒤에 출처 태그를 붙인다: [VALKYRIE] [8511 정훈] [8512 김유찬] [8501 정희강] [LIVE] [NEWS]. 장중 잠정값은 [잠정]을 덧붙인다.
- 상태 설명 질문("지금 ~상황", "요약")은 CONTEXT의 노드 값·위험·판단·담당 모델 판정으로 바로 답한다. 노드 id 대신 라벨을 쓴다.
- headline은 결론+핵심 수치 한 줄. actions는 "무엇을 · 얼마나 · 왜 · 출처"가 다 있는 항목만.

## 데스크별 액션 문법
- 채권(정훈): 듀레이션 목표(년)와 보유 대비 변화, 커브(스티프너/플래트너/바벨), 크레딧 스탠스, 3년 국채선물 계약 수(8511 기준 운용 1000억). 듀레이션 축소/확대는 "얼마나 위험을 질지"(변동성 타깃)이고, 금리 방향은 VALKYRIE 압력(상승/하락/중립)으로 따로 말한다.
- 주식(김유찬): 코스피 권장 주식비중(%)과 보유 대비 변화·코스피200 선물 계약 수(8512 · 보유 기록이 없으면 "보유 100% 가정"이라고 쓴다 · ±10%p 밴드 안이면 매매 없음), IPO 청약 스탠스(적극/선별/보류), CB 신규투자 스탠스(차환 유출 압력 기준), 종목군(흑자·확약 우선 등).
- 매크로(정희강): 금리경로(HAWKISH/DOVISH/NEUTRAL)와 자산군 함의, US 국면(과열/골디락스/스태그플레이션/침체).

## 충격 파라미터 (run_scenario)
ust/uscpi/gdp/bok: bp 단위 변화 (+50 = 50bp 상승, -25 = 25bp 인하). credit_level: AA- 3Y 스프레드의 절대 수준(bp). date: 기준일(YYYY-MM-DD), 최신이면 null.
선형 전이: Δto = sign×β×Δfrom (bp). 예: UST +50bp → 국고3Y +0.35×50 = +17.5bp → 코스닥 할인율 +0.90×17.5 ≈ +15.8bp. 함수 전이(CB, IPO, KOSPI)는 엔진이 재계산한다. β는 데이터 추정치 또는 전문가 설정이며 각 관계의 [근거]에 적혀 있다 — 답에서 β를 인용할 때 근거도 함께 적는다.

## 상수
ERP_KOSDAQ {c['ERP_KOSDAQ']}% · 국고3Y 듀레이션 {c['D_KTB3']}년 · 국고10Y {c['D_KTB10']}년 · 코스닥 성장주 듀레이션 {c['D_KOSDAQ']}년 · 코스피 {c['D_KOSPI']}년 · 차환 접근성은 AA- {c['REFI_OPEN_BP']}→{c['REFI_CLOSED_BP']}bp 구간에서 닫힘.

## 온톨로지
{chr(10).join(lines)}

## 수준(level)과 판단(judgement)의 구분 — 반드시 지킬 것
- 노드의 level_pct_1y와 stress_level_now는 **현재 값이 지난 1년 분포에서 어디에 있는지**(0 낮음 ↔ 100 높음)다. 지금·과거의 수준을 말할 뿐 **미래 판단이 아니다**. "위험 99"라고 쓰지 말고 "1년 상단(99 백분위)"처럼 수준으로 표현한다.
- 앞으로 어떻게 대응할지는 signals(VALKYRIE 판단 신호), owner_models(8501·8511·8512 판정과 플랜), action_plan에서 가져온다. 수준이 높다는 이유만으로 방향을 단정하지 않는다.

## 담당 모델은 VALKYRIE 판단의 입력이다 (D-011 · D-013)
- 채권 판단은 두 질문으로 나뉜다. (1) 얼마나: 8511 정훈의 목표 듀레이션 = BM × clip(기준 변동성/20일 변동성, 0.3~1.2)은 **변동성 타깃 위험 사이징**이지 금리 전망이 아니다(8511의 결론: 위기 신호로 금리 방향은 예측 불가). what-if 충격은 20일 변동성에 하루로 들어가 σ' = √((19σ²+Δ²)/20) → 방향과 무관하게 듀레이션이 짧아진다(signals.rates.sizing_8511.target_shock). 8511을 "뒤집었다"고 쓰지 않는다. (2) 어느 쪽: VALKYRIE 금리 방향 압력(signals.rates.direction_pressure_valkyrie)은 별도의 참고 판단이며 "[VALKYRIE]"로 표시한다.
- 주식 판단은 두 부분이다: 시장 비중은 8512 김유찬의 권장 비중·선물 헤지(signals.equity.market_8512 · 보유 기록 대비, 기록 없으면 100% 가정 · ±10%p 밴드 밖일 때만 매매), IPO·CB 스탠스는 VALKYRIE 조달 여건 규칙. 둘은 다른 질문이므로 "충돌"이 아니다.
- 매크로 판단은 KR 금리경로이고 8501의 US 국면은 참고(us_regime). US와 KR 국면이 다른 것은 정보이지 충돌이 아니다.
- owner_models[*].match_with_valkyrie는 "반영 여부"다. CROSS-CHECK에서는 각 모델이 어떻게 반영됐는지 쓰고, 충돌이라고 쓰지 않는다.

## 전망·기간·엔진 밖 질문 — "엔진에 없다"는 답이 아니다 (반드시 지킬 것)
운용역이 "코스피 한 달 뒤 전망?", "국고3Y 연말 레벨?", "목표가?", "확률?", "2차전지 섹터 어떻게 봐?"처럼 엔진에 점 전망이 없는 것을 물어도, VALKYRIE는 **조건부 경로 + 판단**으로 충실히 답한다. 절차:
1. run_scenario를 2~3개 병렬로 돌려 경로를 엔진 수치로 만든다. 예: 기본(충격 없음) / 상방 재료(UST −25bp, BOK −25bp 등) / 하방 재료(UST +50bp, 크레딧 80bp 등). 각 경로의 해당 노드 값(예: KOSPI, 국고3Y, 코스닥 할인율, IPO 경쟁률)과 세 판단을 그대로 인용한다. 이것이 "경로별 레벨"이며 점 전망을 대신한다.
2. 현재 수준(level_pct_1y: 1년 상단이면 되돌림 여지, 하단이면 반등 여지)·20일 변화·담당 모델 판정(8512 위험점수·권장 비중은 위험 예산, 8511 변동성 타깃, 8501 국면)·live_market(수급 20일 누적·예탁금·신용잔고·장중 움직임)·watch_list·필요하면 search_news로 재료를 확인해, 어느 경로가 더 무겁다고 보는지 **방향과 신뢰도를 명시한 판단**을 낸다. 회피하지 않는다.
3. 판단이 뒤집히는 트리거를 수치로 적고(예: UST 20일 +30bp 이상, 외국인 20일 순매도 전환), 데이터 한계는 한 줄만 적는다("VALKYRIE는 점 전망 모델이 아니라 조건부 판단").
4. 기간 해석: 엔진 전이는 즉시 반영형이므로 1개월·분기 질문은 "그 기간에 이런 충격이 오면 이 레벨"로 답하고, 20일 변화와 1년 백분위로 시간 감각을 준다.
5. 충격 크기는 ranges_1y에서 고른다: ranges_1y[key].fwd_20d(1개월)·fwd_60d(분기)의 p10/p90이 지난 1년에 실제로 있었던 변화 폭이다(예: ust10.fwd_20d.p90 = +38bp면 하방 시나리오 UST +40bp, p10 = −25bp면 상방 UST −25bp). 연말·장기 질문은 fwd_60d 또는 그 배수로 넓히고 그렇게 했다고 적는다. 경로 표에 "1년 실현 분포 p10~p90"을 함께 적으면 운용역이 크기를 판단할 수 있다.
6. 확률 질문: 경로 가중은 근거와 함께 대략(예: 하방 6 : 상방 4)으로 말하되 정밀 확률처럼 쓰지 않는다.

대상별 연결표 (질문 대상 → 엔진 노드 · 시나리오 파라미터 · 근거 · 담당 모델):
- 코스피·주식 비중 → eq_kospi(UST 경로 β0.30, 듀레이션 12년), 8512 위험점수·권장 비중(위험 예산), live_market 외국인·기관 20일 수급, 예탁금·신용잔고 · [ust, credit_level]
- 코스닥·성장주·IPO·CB → eq_val(할인율 = 국고10Y + ERP), eq_ipo(수요예측 탄력), eq_cb(차환 유출·Put), 8512 코스닥, watch_list, public_tools · [ust, bok, credit_level]
- 국고 3Y/10Y·듀레이션·커브 → rat_ktb(UST β0.35 + BOK 경로), rat_curve, 8511 변동성 타깃(사이징)·위기점수, VALKYRIE 금리 방향 압력 · [ust, bok, uscpi]
- 크레딧 스프레드·회사채·CB 조달 → rat_credit(수준 + 국고3Y β0.20), 8511 신용 모델(스트레스·크레딧 비중·CP), eq_cb · [credit_level]
- 기준금리·BOK·KR 물가 → mac_bok(테일러 갭·사이클), mac_krcpi(익월 예측), 8501 KR 경로 · [bok, gdp]
- 미국 금리·Fed·US 물가·성장 → rat_ust, mac_fed, mac_uscpi, mac_gdp, 8501 US 국면(과열/골디락스/스태그/침체) · [uscpi, ust, gdp]
- 환율·유가·금·해외지수·크립토 등 엔진 밖 자산 → live_market 현재값·등락(장중 시점 명시) + 전이 연결(원달러↑ → 수출주 수혜·수입물가 → KR CPI → BOK; 유가↑ → US CPI → UST → 국고; 미 지수·VIX → 위험선호 → 코스피·외국인 수급) + search_news 재료. "엔진 밖 자산이라 전이 경로로 연결했다"고 한 줄 적되, 방향 판단은 반드시 낸다(현재 수준·20일 흐름·재료·연결 노드의 압력).
- 섹터·테마·종목 → watch_list(등락·폭·주도주·태그) + 가장 가까운 노드(성장주 → 코스닥 할인율, 은행·보험 → 금리 압력, 건설·증권 → 크레딧, 수출주 → 환율, 경기민감 → 8512 코스피 위험). 개별 종목의 목표가는 내지 않고 "왜 지금 봐야 하는지 · 어느 경로에서 유리/불리한지"로 답한다.
헤드라인 예: "코스피 1개월: 기본 6,871 · UST −25bp면 6,933 · UST +50bp면 6,747 [VALKYRIE] — 8512 위험 0.46(경계)·외국인 20일 −21조라 하방 우세(6:4), 비중 55% 유지". "국고3Y 분기: 기본 4.08% · BOK −25bp면 3.99% · UST +40bp면 4.22% (1년 실현 60일 변화 p10~p90 −35~+42bp) — 금리 압력 상승·1년 상단(99%)이라 되돌림 여지, 사이징은 8511 3.37년 유지".
interpretation에는 PATHS(경로별 표) 와 JUDGEMENT(판단·신뢰도) 섹션을 추가한다.

## 담당 모델·공개 도구 상시 참고 — 반드시 지킬 것
- 모든 답에 CROSS-CHECK 섹션을 넣어 관련 데스크의 담당 모델 판정을 대조한다: 8501 정희강 매크로 터미널(US 국면), 8511 정훈 채권 위기 진단(판정·위기점수·목표 듀레이션·신용 스트레스·크레딧 비중), 8512 김유찬 주식 시장 진단(위험점수·권장 비중·선물 헤지).
- 주식 질문에는 public_tools도 참고한다: IPO Market Report(김유찬, 공모주 시장 리포트 메타), CB Zero Finder(김유찬, DART CB 발행 통계: 건수·제로제로 비중·평균 희석률). 이 둘은 엔진 CB·IPO 노드의 실표본 원천이다.
- 어떤 섹터·종목을 볼지 물으면 watch_list(주목 섹터·테마·종목)를 근거로 답한다: 각 항목의 tags(할인율 민감·크레딧 경계·시장 위험 경계·환율 수혜)는 VALKYRIE 판단에서 나온 이유이고, 등락·폭·주도주는 실시간 시세다. 종목 추천이 아니라 "왜 오늘 봐야 하는지"를 말한다.
- 담당 모델과 VALKYRIE가 다르면 어느 근거가 강한지 밝힌다.
- live_market(실시간 시세: 지수·금리·환율·원자재, 20일 투자자별 수급, 고객예탁금·신용잔고)은 "지금 시장이 어떻게 움직이는지"의 근거로 쓴다. 장중 값은 엔진 EOD와 다를 수 있으므로 시점을 함께 적는다.
"""


# ---------------------------------------------------------------- job runner
class Ask:
    def __init__(self, engine_state, news, logger=print):
        """engine_state(date, shock) -> full state dict (with tools/plan); news -> valkyrie.news.News"""
        self.state_fn, self.news, self.log = engine_state, news, logger
        self.jobs, self.order = {}, []
        self.lock = threading.Lock()
        self.system = build_system()
        self.client, self.reason = None, None
        key = os.environ.get("ANTHROPIC_API_KEY") or load_env().get("ANTHROPIC_API_KEY")
        if anthropic is None:
            self.reason = "anthropic SDK 미설치 (pip install anthropic)"
        elif not key:
            self.reason = "ANTHROPIC_API_KEY 없음 (.env)"
        else:
            self.client = anthropic.Anthropic(api_key=key, max_retries=2, timeout=180.0)
        self.history = self._load_log()
        self.use_betas = True

    @property
    def enabled(self):
        return self.client is not None

    def status(self):
        return {"enabled": self.enabled, "model": MODEL, "effort": EFFORT, "reason": self.reason,
                "questions": len(self.history), "betas": self.use_betas}

    # ------------------------------------------------------------ jobs
    def start(self, question, date=None, shock=None):
        jid = uuid.uuid4().hex[:10]
        job = {"id": jid, "question": question, "date": date, "shock": shock or {}, "status": "running",
               "trace": [], "result": None, "error": None, "usage": {"in": 0, "out": 0, "cache_r": 0, "cache_w": 0},
               "startedAt": datetime.now(KST).isoformat(timespec="seconds"), "model": MODEL}
        with self.lock:
            self.jobs[jid] = job
            self.order.append(jid)
            for old in self.order[:-40]:
                self.jobs.pop(old, None)
            self.order = self.order[-40:]
        threading.Thread(target=self._run, args=(job,), daemon=True, name=f"ask-{jid}").start()
        return jid

    def get(self, jid):
        with self.lock:
            return self.jobs.get(jid)

    def _trace(self, job, kind, text, **extra):
        with self.lock:
            job["trace"].append({"t": time.strftime("%H:%M:%S"), "kind": kind, "text": text, **extra})

    # ------------------------------------------------------------ tools
    def _tool(self, job, name, inp):
        if name == "run_scenario":
            shock = {k: inp.get(k) for k in SHOCK_KEYS if inp.get(k) not in (None, 0)}
            st = self.state_fn(inp.get("date"), shock)
            self._trace(job, "tool", f"시나리오 계산 · {inp.get('label') or st['shock_label']} ({st['date']})",
                        scenario={"label": inp.get("label"), "shock": shock, "date": st["date"], "result": st["briefing"]["text"]})
            return json.dumps(compact(st, inp.get("label")), ensure_ascii=False)
        if name == "search_news":
            r = self.news.search(q=inp["query"], n=8)
            self._trace(job, "tool", f"뉴스 검색 · {inp['query']} ({len(r.get('items', []))}건)")
            return json.dumps({"query": r.get("query"), "status": r.get("status"),
                               "items": [{"title": x["title"], "source": x["source"], "at": x["publishedAt"]} for x in r.get("items", [])]},
                              ensure_ascii=False)
        raise KeyError(name)

    # ------------------------------------------------------------ the loop
    def _create(self, messages):
        kw = dict(model=MODEL, max_tokens=16000,
                  system=[{"type": "text", "text": self.system, "cache_control": {"type": "ephemeral"}}],
                  tools=TOOLS, tool_choice={"type": "auto"}, messages=messages)
        if LEGACY:   # Haiku 4.5: fixed thinking budget, no effort control, no progress-update display
            return self.client.messages.create(thinking={"type": "enabled", "budget_tokens": 3000}, **kw)
        kw["output_config"] = {"effort": EFFORT}
        if self.use_betas:
            try:
                return self.client.beta.messages.create(thinking={"type": "adaptive", "display": "updates"},
                                                        betas=BETAS, fallbacks="default", **kw)
            except anthropic.BadRequestError as exc:      # older gateway / beta not available: plain request
                self.log(f"ai: beta request rejected ({exc.message[:120]}); retrying without betas")
                self.use_betas = False
        return self.client.messages.create(thinking={"type": "adaptive", "display": "summarized"}, **kw)

    def _run(self, job):
        try:
            base = self.state_fn(job["date"], job["shock"])
            ctx = compact(base, "현재 상태")
            user = (f"## CONTEXT · {datetime.now(KST).strftime('%Y-%m-%d %H:%M')} KST · 화면 기준일 {base['date']}"
                    f"{' · 사용자가 이미 적용한 충격: ' + base['shock_label'] if base['mode'] == 'WHAT-IF' else ''}\n"
                    f"```json\n{json.dumps(ctx, ensure_ascii=False)}\n```\n\n## 질문\n{job['question']}")
            messages = [{"role": "user", "content": user}]
            self._trace(job, "route", f"질문 해석 중 · 모델 {MODEL} · 기준 {base['date']}")
            final, text_fallback = None, ""
            for turn in range(MAX_TURNS):
                resp = self._create(messages)
                u = resp.usage
                with self.lock:
                    job["usage"]["in"] += u.input_tokens or 0
                    job["usage"]["out"] += u.output_tokens or 0
                    job["usage"]["cache_r"] += getattr(u, "cache_read_input_tokens", 0) or 0
                    job["usage"]["cache_w"] += getattr(u, "cache_creation_input_tokens", 0) or 0
                if resp.stop_reason == "refusal":
                    d = getattr(resp, "stop_details", None)
                    raise RuntimeError("모델이 요청을 거절했습니다" + (f" ({d.category})" if d and getattr(d, "category", None) else ""))
                if resp.stop_reason == "max_tokens":
                    raise RuntimeError("응답이 너무 길어 잘렸습니다 (max_tokens)")
                for b in resp.content:
                    if b.type == "thinking" and getattr(b, "thinking", ""):
                        self._trace(job, "update", b.thinking.strip()[:300])
                    elif b.type == "text" and b.text.strip():
                        text_fallback = b.text.strip()
                        self._trace(job, "note", b.text.strip()[:300])
                uses = [b for b in resp.content if b.type == "tool_use"]
                if not uses:
                    if resp.stop_reason == "pause_turn":
                        messages.append({"role": "assistant", "content": resp.content})
                        continue
                    break                                   # end_turn without finish_answer -> text fallback
                messages.append({"role": "assistant", "content": resp.content})
                results = []
                for tu in uses:
                    if tu.name == "finish_answer":
                        final = tu.input if isinstance(tu.input, dict) else json.loads(json.dumps(tu.input))
                        results.append({"type": "tool_result", "tool_use_id": tu.id, "content": "제출 완료"})
                        continue
                    try:
                        out = self._tool(job, tu.name, tu.input)
                        results.append({"type": "tool_result", "tool_use_id": tu.id, "content": out})
                    except Exception as exc:
                        results.append({"type": "tool_result", "tool_use_id": tu.id, "is_error": True,
                                        "content": f"{type(exc).__name__}: {exc}"})
                        self._trace(job, "error", f"{tu.name} 실패: {exc}")
                if final is not None:
                    break
                messages.append({"role": "user", "content": results})
            if final is None:
                if not text_fallback:
                    raise RuntimeError("모델이 답을 제출하지 않았습니다")
                final = {"headline": text_fallback.split("\n")[0][:120], "interpretation": text_fallback, "actions": [], "risks": [],
                         "checkpoints": [], "apply_scenario": None, "focus_nodes": [], "proposed_decision": None, "confidence": 50,
                         "unstructured": True}
            final = self._sanitize(final)
            with self.lock:
                job["result"], job["status"] = final, "done"
                job["finishedAt"] = datetime.now(KST).isoformat(timespec="seconds")
                job["cost_usd"] = round((job["usage"]["in"] * PRICE["in"] + job["usage"]["out"] * PRICE["out"] +
                                         job["usage"]["cache_r"] * PRICE["cache_r"] + job["usage"]["cache_w"] * PRICE["cache_w"]) / 1e6, 4)
            self._trace(job, "done", f"답변 완료 · {job['usage']['in'] + job['usage']['cache_r']:,} in / {job['usage']['out']:,} out 토큰"
                        f" · 캐시 {job['usage']['cache_r']:,} · ≈${job['cost_usd']:.3f}")
            self._append_log(job)
        except Exception as exc:
            msg = f"{type(exc).__name__}: {getattr(exc, 'message', None) or exc}"[:300]
            self.log(f"ai job {job['id']} failed: {msg}")
            with self.lock:
                job["status"], job["error"] = "error", msg
            self._trace(job, "error", msg)

    @staticmethod
    def _sanitize(f):
        f = dict(f)
        sc = f.get("apply_scenario")
        if isinstance(sc, dict):
            shock = {k: sc.get(k) for k in SHOCK_KEYS if sc.get(k) not in (None, 0)}
            f["apply_scenario"] = {"shock": shock, "date": sc.get("date")} if shock or sc.get("date") else None
        else:
            f["apply_scenario"] = None
        f["focus_nodes"] = [n for n in (f.get("focus_nodes") or []) if n in O.NODES]
        f["confidence"] = max(0, min(100, int(f.get("confidence") or 0)))
        return f

    # ------------------------------------------------------------ log
    def _load_log(self):
        try:
            return json.loads(LOG.read_text(encoding="utf-8")) if LOG.exists() else []
        except (OSError, ValueError):
            return []

    def _append_log(self, job):
        entry = {k: job[k] for k in ("id", "question", "date", "shock", "startedAt", "finishedAt", "model", "usage", "cost_usd")}
        entry["result"] = job["result"]
        entry["trace"] = [t for t in job["trace"] if t["kind"] in ("tool", "done")]
        with self.lock:
            self.history.append(entry)
            self.history = self.history[-200:]
            try:
                STATE.mkdir(parents=True, exist_ok=True)
                LOG.write_text(json.dumps(self.history, ensure_ascii=False), encoding="utf-8")
            except OSError:
                pass

    def recent(self, n=20):
        with self.lock:
            return list(reversed(self.history[-n:]))
