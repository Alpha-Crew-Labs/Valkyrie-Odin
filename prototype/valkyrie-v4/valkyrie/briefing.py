"""VALKYRIE market briefing "video": scene list + Korean narration, rebuilt every hour (06-09h = 모닝 브리핑).

The browser plays it as an auto-advancing scene player (web/js/brief.js): live NAVER prices keep updating inside
the scenes, numbers count up, transmission paths flow, and the viewer can click into anything — tiles → chart,
nodes → node insight, what-if chips → the chain recomputed by the engine, "AI에게 묻기" → the assistant.
Every sentence is a template over engine / owner-model / NAVER numbers, paced for ~60 s end to end.
"""
from datetime import datetime, timedelta, timezone

from . import ontology as O
from .engine import PRESETS

KST = timezone(timedelta(hours=9))
LANES = {"mac": ["mac_gdp", "mac_uscpi", "mac_krcpi", "mac_fed", "mac_bok", "sig_macro"],
         "rat": ["rat_ust", "rat_ktb", "rat_curve", "rat_credit", "sig_rates"],
         "eq": ["eq_kospi", "eq_fin", "eq_val", "eq_cb", "eq_ipo", "sig_equity"]}
ASK = {"hero": "지금 상황을 요약하고 오늘 데스크별 액션 플랜을 알려줘",
       "market": "오늘 글로벌 마켓 움직임이 우리 체인(금리 → 코스닥)에 주는 시사점은?",
       "macro": "매크로 판단의 근거와 가장 큰 리스크는?",
       "rates": "채권 데스크 액션 플랜을 규모까지 구체적으로 알려줘",
       "equity": "주식 데스크 액션 플랜과 IPO·CB 스탠스의 근거는?",
       "sectors": "주목 섹터 중 어디에 집중하고 무엇을 피해야 하나?",
       "actions": "오늘 액션 플랜의 우선순위를 정해줘",
       "whatif": "UST +50bp 시나리오에서 데스크별 대응은?",
       "watch": "판단이 바뀌는 조건과 체크포인트를 정리해줘"}


def _sg(v, d=1):
    return "보합" if v is None or abs(v) < 10 ** -d / 2 else f"{'+' if v > 0 else '−'}{abs(v):.{d}f}"


def _updown(v, unit="%", d=2, zero="보합"):
    if v is None:
        return "—"
    if abs(v) < 10 ** -d / 2:
        return zero
    return f"{abs(v):.{d}f}{unit} {'상승' if v > 0 else '하락'}"


def edition(now=None):
    now = now or datetime.now(KST)
    h = now.hour
    label = "모닝 브리핑" if 6 <= h < 10 else f"{h:02d}:00 업데이트"
    return {"key": now.strftime("%Y-%m-%dT%H"), "label": label, "at": now.strftime("%Y-%m-%d %H:00"),
            "next": (now.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)).strftime("%H:00")}


def _lane_nodes(st, lane):
    """[id, label, value, level score, unit] for every object on the lane (signal node = its call)."""
    nodes, sg = st["nodes"], st["signals"]
    out = []
    for n in LANES[lane]:
        if n.startswith("sig_"):
            s = sg[n[4:]]
            out.append([n, O.NODES[n]["label"], s["call"], None, "call"])
        else:
            x = nodes[n]
            out.append([n, x["label"], x.get("value"), (x.get("risk") or {}).get("score"), O.NODES[n].get("unit")])
    return out


def _lane_edges(lane):
    ids = set(LANES[lane])
    return [[a, b, w] for a, b, w, s, k in O.EDGES if a in ids and b in ids]


def build(st, plan, live=None, now=None):
    ed = edition(now)
    sg, nodes, risk = st["signals"], st["nodes"], st.get("risk") or {}
    temp = (risk.get("temps") or {}).get("all")
    tools = {i["id"]: i for i in (st.get("tools") or {}).get("items", [])}
    board = {x["code"]: x for x in ((live or {}).get("market_board") or {}).get("items", [])}
    scenes = []

    # Narration is written for pace: short declarative lines (≈ 3 s each), 2–4 per scene, about 60 s in total.
    def short(text, n=70):
        t = text.replace(" · ", ", ").replace("·", ",").rstrip(".")
        return (t if len(t) <= n else t[:n].rsplit(",", 1)[0]) + "."

    # 1 ---- hero
    y, mo, dd = ed["at"][:10].split("-")
    scenes.append({"id": "hero", "kicker": ed["label"], "title": "오늘의 결론 · 현재 수준과 대응", "go": "signals",
                   "visual": {"type": "hero", "temp": temp, "label": risk.get("label"), "lanes": risk.get("lanes"),
                              "calls": [[s["title"], s["call"], s["dir"], s["confidence"]] for s in (sg["macro"], sg["rates"], sg["equity"])]},
                   "narration": [
                       f"{int(mo)}월 {int(dd)}일 VALKYRIE {ed['label']}.",
                       f"스트레스 수준 {temp:.0f}, 1년 분포 {risk.get('label')}. 수준이지 전망은 아닙니다." if temp is not None else "스트레스 수준 계산 불가.",
                       f"매크로 {sg['macro']['call']}. 채권 {sg['rates']['call']}. 주식 {sg['equity']['call']}."]})

    # 2 ---- global market (the player overlays live prices on these tiles while it plays)
    def q(code):
        return board.get(code) or {}
    tiles = [q(c) for c in (".INX", ".IXIC", "US10YT=RR", "FX_USDKRW", "CLcv1", "GCcv1", "KOSPI", "KOSDAQ", "BTC") if q(c)]
    if tiles:
        ust = q("US10YT=RR")
        lines = [f"S&P 500 {_updown(q('.INX').get('changeRate'))}, 나스닥 {_updown(q('.IXIC').get('changeRate'))}."]
        if ust.get("price") is not None:
            lines.append(f"미 국채 10년 {ust['price']:.2f}%, {_updown((ust.get('change') or 0) * 100, 'bp', 1)}. "
                         f"원달러 {q('FX_USDKRW').get('price', 0):,.0f}원, WTI {q('CLcv1').get('price', 0):,.1f}달러.")
        lines.append(f"코스피 {_updown(q('KOSPI').get('changeRate'))}, 코스닥 {_updown(q('KOSDAQ').get('changeRate'))}. 타일을 누르면 110일 차트.")
        scenes.append({"id": "market", "kicker": "GLOBAL MARKET · LIVE", "title": "글로벌 마켓", "go": "market",
                       "visual": {"type": "tiles", "tiles": [{k: t.get(k) for k in ("code", "label", "price", "change", "changeRate", "spark", "marketStatus")}
                                                             for t in tiles]},
                       "narration": lines})

    # 3 ---- macro
    m, mt = sg["macro"], tools.get("macro") or {}
    scenes.append({"id": "macro", "kicker": "MACRO · 정희강", "title": m["call"], "go": "signals",
                   "visual": {"type": "desk", "lane": "mac", "temp": (risk.get("lanes") or {}).get("mac"), "reasons": m["reasons"], "tool": mt,
                              "call": m["call"], "dir": m["dir"], "conf": m["confidence"], "action": None,
                              "nodes": _lane_nodes(st, "mac"), "path": LANES["mac"], "edges": _lane_edges("mac")},
                   "narration": [f"매크로, {m['call']}.", short(m["reasons"][0], 80),
                                 f"8501 정희강, 미국 국면 {mt.get('verdict')}." if mt.get("verdict") not in (None, "대기") else ""]})

    # 4 ---- rates (D-013: 8511 duration = volatility-target sizing; direction pressure is VALKYRIE's, said separately)
    r, rt = sg["rates"], tools.get("rates") or {}
    sz = r.get("sizing") or {}
    lines = [f"채권, {r['call']}."]
    if sz.get("target") is not None:
        lines.append(f"8511 정훈 변동성 타깃, 목표 {sz['target']:.1f}년, 벤치마크 {sz['bm']:.1f}년 대비 {abs(sz['target'] - sz['bm']):.1f}년 "
                     f"{'축소' if sz['target'] < sz['bm'] else '확대' if sz['target'] > sz['bm'] else '유지'}. 위기점수 {rt.get('score', 0):.2f}, {rt.get('verdict', '')}.")
        if sz.get("contracts") is not None and sz.get("trade"):
            lines.append(f"헤지, 3년 국채선물 {abs(sz['contracts']):,.0f}계약 {'매도' if sz['contracts'] < 0 else '매수'}, "
                         f"{'보유 기록' if sz.get('current_src') == '기록' else '보유는 벤치마크 가정'}.")
    lines.append(f"금리 방향 압력 {r.get('pressure_kr') or '—'}, VALKYRIE. 크레딧 {nodes['rat_credit']['value']:.0f}bp, 커브 {nodes['rat_curve']['value']:.0f}bp.")
    scenes.append({"id": "rates", "kicker": "RATES · 정훈", "title": r["call"], "go": "impact",
                   "visual": {"type": "desk", "lane": "rat", "temp": (risk.get("lanes") or {}).get("rat"), "reasons": r["reasons"], "tool": rt,
                              "call": r["call"], "dir": r["dir"], "conf": r["confidence"], "action": r.get("action"),
                              "nodes": _lane_nodes(st, "rat"), "path": LANES["rat"], "edges": _lane_edges("rat")},
                   "narration": lines})

    # 5 ---- equity
    e, et = sg["equity"], tools.get("equity") or {}
    ep, mk = (et.get("plan") or {}).get("kospi") or {}, e.get("market") or {}
    lines = [f"주식, {e['call']}.", short(e["reasons"][0], 80)]
    if ep.get("w_target") is not None:
        held = ""
        if mk.get("current") is not None:
            held = (f", 보유 {mk['current'] * 100:.0f}% 대비 " + ("매매" if mk.get("rebalance") else "밴드 내 유지")
                    + ("" if mk.get("current_src") == "기록" else ", 보유 100% 가정"))
        lines.append(f"8512 김유찬, 코스피 위험점수 {ep['score']:.2f} {ep['verdict']}, 권장 비중 {ep['w_target'] * 100:.0f}%{held}."
                     + (" 장중 잠정값." if ep.get("provisional") else ""))
    flow = e.get("cb_flow") or {}
    if flow:
        lines.append(f"코스닥 CB 차환 유출 압력 {flow['share']:.0f}%.")
    scenes.append({"id": "equity", "kicker": "EQUITY · 김유찬", "title": e["call"], "go": "cb",
                   "visual": {"type": "desk", "lane": "eq", "temp": (risk.get("lanes") or {}).get("eq"), "reasons": e["reasons"], "tool": et,
                              "call": e["call"], "dir": e["dir"], "conf": e["confidence"], "action": e.get("action"),
                              "nodes": _lane_nodes(st, "eq"), "path": LANES["eq"], "edges": _lane_edges("eq")},
                   "narration": lines})

    # 6 ---- sectors / themes / stocks to watch (valkyrie/watch.py, D-014)
    w = st.get("watch") or {}
    top = (w.get("sectors") or [])[:4] + (w.get("themes") or [])[:3]
    if top:
        lines = ["주목 섹터. " + ", ".join(f"{s['name']} {s['changeRate']:+.1f}%" + (f" ({s['tags'][0]['t']})" if s.get("tags") else "") for s in top[:4]) + "."]
        if w.get("stocks"):
            lines.append("종목은 " + ", ".join(f"{x['name']} {x['kind']}" for x in w["stocks"][:4]) + ". 누르면 코스닥 CB, IPO 탭.")
        scenes.append({"id": "sectors", "kicker": "SECTORS · 자동 선정", "title": "주목 섹터 · 테마 · 종목", "go": "cb",
                       "visual": {"type": "sectors", "sectors": top, "stocks": (w.get("stocks") or [])[:8], "tilt_active": w.get("tilt_active") or []},
                       "narration": lines})

    # 7 ---- action plan
    acts = []
    for d in plan["desks"]:
        extra = [i["text"] for i in d["items"][1:2]]
        acts.append(f"{d['desk']}, {d['call']}. " + " ".join(short(x, 60) for x in extra))
    scenes.append({"id": "actions", "kicker": "ACTION PLAN", "title": "오늘의 액션 플랜", "go": "signals",
                   "visual": {"type": "actions", "desks": plan["desks"]}, "narration": acts})

    # 8 ---- what-if: the viewer presses a shock and the engine recomputes the chain inside the player
    presets = [{"key": k, "label": p["label"], "shock": p["shock"]} for k, p in PRESETS.items() if p["shock"]]
    scenes.append({"id": "whatif", "kicker": "WHAT-IF · 직접 눌러보기", "title": "충격을 누르면 체인이 다시 계산됩니다", "go": "impact",
                   "visual": {"type": "whatif", "presets": presets, "date": st["date"]},
                   "narration": ["충격 버튼을 누르면 전이 경로와 세 판단이 엔진에서 다시 계산됩니다. 첫 시나리오는 자동 재생.",
                                 "충격 후 듀레이션은 8511 변동성 타깃으로, 금리 방향은 VALKYRIE 압력으로 따로 표시됩니다."]})

    # 9 ---- watch
    wl = plan.get("watch") or []
    lines = [short(x["text"], 70) for x in wl[:3]]
    lines.append(f"체크포인트 끝. 다음 업데이트 {ed['next']}.")
    scenes.append({"id": "watch", "kicker": "WATCH", "title": "체크포인트 · 판단이 바뀌는 조건", "go": "signals",
                   "visual": {"type": "watch", "items": wl}, "narration": lines})

    for s in scenes:
        s["narration"] = [x for x in s["narration"] if x]
        s["ask"] = ASK.get(s["id"])
    return {"edition": ed, "date": st["date"], "scenes": scenes, "presets": presets,
            "generatedAt": datetime.now(KST).isoformat(timespec="seconds"),
            "note": f"엔진 EOD {st['date']} · 8501 · 8511 · 8512 · LIVE MARKET"}
