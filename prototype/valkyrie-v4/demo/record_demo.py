"""VALKYRIE demo recorder: drives the live app (http://127.0.0.1:4134/) in headless Chrome and records it,
paced by an announcer-style Korean narration.

Steps
  1. numbers()   engine values for the narration and captions (read from the API right before recording)
  2. script()    narration beats: caption (on screen) + voice (spoken, pronunciation-friendly)
  3. tts()       neural Korean voice via edge-tts (Microsoft online TTS; only the narration text is sent), cached
  4. demo()      clicks through the app; every beat waits for its narration to finish
Output (_work/<run>/): frames/*.jpg (CDP screencast, all tabs) + events.json + voices.json → compose_demo.py

  python demo/record_demo.py                 full demo (AI question + ODIN publish: writes to data/state)
  python demo/record_demo.py --no-ai         layout check: skips the AI question and the publish flow
  python demo/record_demo.py --voice ko-KR-InJoonNeural --rate +5%
"""
import argparse, asyncio, base64, hashlib, json, re, shutil, subprocess, sys, time, urllib.parse, urllib.request, wave
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "_vendor"))
import websockets

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
APP = "http://127.0.0.1:4134"
W, H = 1920, 1080
INTRO = 3.2          # intro card seconds (compose reads it from events.json)
GAP = 0.3          # pause after each narration line
DARK = [{"name": "prefers-color-scheme", "value": "dark"}]


def api(path, **p):
    q = ("?" + urllib.parse.urlencode(p)) if p else ""
    with urllib.request.urlopen(APP + path + q, timeout=60) as r:
        return json.loads(r.read())


# ---------------------------------------------------------------- numbers for the narration (engine values only)
def numbers():
    meta = api("/api/meta")
    base = api("/api/state")
    ust = api("/api/state", ust=50)
    cr = api("/api/state", credit_level=52)
    logs = api("/api/decisions")
    sim = api("/api/similar", date=base["date"])
    O = meta["ontology"]
    beta = {(e["from"], e["to"]): e["beta"] for e in O["edges"]}
    real = next(l for l in logs if l["source"] == "REAL")
    then = api("/api/state", date=real["date"])
    n = lambda st, k: st["nodes"][k]
    c0, c1 = cr["cb"]["demo_base"], cr["cb"]["demo"]
    items = [i["text"] for d in (base.get("plan") or {}).get("desks", []) for i in d["items"]]
    grab = lambda pat: next((re.search(pat, t) for t in items if re.search(pat, t)), None)
    dur, fut, k200, wgt = (grab(r"목표 듀레이션 ([\d.]+)년"), grab(r"3년 국채선물 ([\d,]+)계약 매도"),
                           grab(r"코스피200 선물 ([\d,]+)계약 (매도|매수)"), grab(r"권장 주식비중 (\d+)%"))
    tools = {i["id"]: i for i in (base.get("tools") or {}).get("items", [])}
    sg = base["signals"]
    return {
        "calls": [sg["macro"]["call"], sg["rates"]["call"], sg["equity"]["call"]],
        "dirs": [sg["macro"]["dir"], sg["rates"]["dir"], sg["equity"]["dir"]],
        "dur": dur.group(1) if dur else None, "fut": fut.group(1) if fut else None,
        "k200": k200.group(1) if k200 else None, "k200_side": k200.group(2) if k200 else None,
        "weight": wgt.group(1) if wgt else None,
        "macro_verdict": (tools.get("macro") or {}).get("verdict"),
        "rates_verdict": (tools.get("rates") or {}).get("verdict"), "rates_score": (tools.get("rates") or {}).get("score"),
        "then_rates": then["signals"]["rates"]["call"],
        "date": base["date"], "n_nodes": len(O["nodes"]), "n_edges": len(O["edges"]),
        "ktb0": n(ust, "rat_ktb")["base"], "ktb1": n(ust, "rat_ktb")["value"],
        "ipo0": n(ust, "eq_ipo")["base"], "ipo1": n(ust, "eq_ipo")["value"],
        "put0": n(ust, "eq_cb")["base"], "put1": n(ust, "eq_cb")["value"],
        "b_bok": beta.get(("mac_bok", "rat_ktb")), "b_ust": beta.get(("rat_ust", "rat_ktb")),
        "credit": n(base, "rat_credit")["value"],
        "eq_call0": base["signals"]["equity"]["call"], "eq_call1": cr["signals"]["equity"]["call"],
        "refi0": c0.get("refi_access"), "refi1": c1.get("refi_access"),
        "cbput0": n(base, "eq_cb")["value"], "cbput1": n(cr, "eq_cb")["value"],
        "cb_name": c1["name"], "cb_s0": c0["score"], "cb_s1": c1["score"], "cb_put0": c0["put_risk"], "cb_put1": c1["put_risk"],
        "real_date": real["date"], "real_dec": real["decision"],
        "d5": real["perf"]["d5"], "d20": real["perf"]["d20"], "d60": real["perf"]["d60"],
        "sim": [(r["date"], r["similarity"]) for r in sim["results"]], "sim_ms": sim["elapsed_ms"],
    }


def bp(p):
    return "PENDING" if not p or p.get("status") == "PENDING" else ("+" if p["bp"] >= 0 else "−") + f"{abs(p['bp']):.0f}bp"


def ro(word):
    """Korean particle 로/으로 by the last syllable's final consonant (ㄹ takes 로)"""
    c = ord(word.strip()[-1]) - 0xAC00
    return word + ("으로" if 0 <= c < 11172 and c % 28 not in (0, 8) else "로")


def native(n):
    """native Korean count word before 개 (1–99): 17 → 열일곱, 24 → 스물네"""
    ones = ["", "한", "두", "세", "네", "다섯", "여섯", "일곱", "여덟", "아홉"]
    tens = ["", "열", "스물", "서른", "마흔", "쉰", "예순", "일흔", "여든", "아흔"]
    if not 0 < n < 100:
        return str(n)
    t, o = divmod(n, 10)
    return (tens[t] + ones[o]) if o else {1: "열", 2: "스무"}.get(t, tens[t])


def spoken(s):
    """caption typography → speech: VALKYRIE, %, %p, bp, arrows, middle dots"""
    for a, b in [("VALKYRIE", "발키리"), ("%p", "퍼센트포인트"), ("%", "퍼센트"), ("bp", "비피"), (" → ", "에서 "), (" · ", ", "), ("·", ", ")]:
        s = s.replace(a, b)
    return s


# ---------------------------------------------------------------- narration
def script(N):
    """key → (caption, voice). Captions follow the voice closely; numbers come from the engine."""
    m, r_, e_ = N["calls"]
    dm, dr, de = N["dirs"]
    say_m = {"HAWKISH": "금리는 인상이 이어지고", "DOVISH": "금리는 인하 쪽으로 기울고"}.get(dm, "금리는 방향을 탐색하고")
    say_r = {"SHORT": "채권은 듀레이션을 줄이며", "LONG": "채권은 듀레이션을 늘리며"}.get(dr, "채권은 듀레이션을 중립으로 두며")
    say_e = {"AVOID": "적자 코스닥 공모주는 보류합니다", "SELECTIVE": "코스닥 공모주는 흑자 기업 위주로 고릅니다",
             "ENGAGE": "코스닥 공모주에 적극 참여합니다"}.get(de, "코스닥 공모주는 신중하게 봅니다")
    dur, fut = N["dur"] or "?", N["fut"] or "?"
    c0, c1 = N["eq_call0"], N["eq_call1"]
    c1v = c1.replace(" · ", ", ")
    mm, dd = int(N["real_date"][5:7]), int(N["real_date"][8:10])
    d60 = N["d60"]["bp"] if N["d60"] and N["d60"].get("status") != "PENDING" else None
    plan = []
    if N["dur"]:
        plan.append(f"목표 듀레이션(금리 민감도) {N['dur']}년")
    if N["fut"]:
        plan.append(f"3년 국채선물 {N['fut']}계약 매도")
    if N["k200"]:
        plan.append(f"코스피200 선물 {N['k200']}계약 {N['k200_side']}")
    S = {
        "intro": ("", "매크로와 채권, 코스닥 주식을 하나의 판단으로 잇는 인텔리전스 체인, 발키리입니다."),
        "b1": ("사내 포털 '오딘'의 VALKYRIE — 질문 하나로 시작하는 운용역의 의사결정 오토파일럿",
               "사내 포털 오딘의 발키리입니다. 질문 하나로 시작하는, 운용역의 의사결정 오토파일럿입니다."),
        "b2": (f"오늘의 결론 — 금리: {m} · 채권: {r_} · 주식: {e_}\n{say_m}, {say_r}, {say_e}",
               f"오늘의 결론은 세 줄입니다. {say_m}, {say_r}, {say_e}."),
        "b3": (f"매크로 → 채권 → 주식, {N['n_nodes']}개 지표를 {N['n_edges']}개 연결로 미리 이어 두었습니다 · 버튼 하나면 순서대로 판단이 확정됩니다\n데이터가 바뀌면 숫자만 바뀌고, 연결 구조는 그대로입니다",
               f"매크로에서 주식까지 {native(N['n_nodes'])} 개 지표를 {native(N['n_edges'])} 개 연결로 이어 두었습니다. 버튼 하나면 순서대로 판단이 확정됩니다."),
        "b5": ("판단은 '오늘 무엇을 얼마나 할지'로 끝납니다 · 모두 정해진 규칙으로 계산한 숫자\n" + " · ".join(plan),
               f"판단은 오늘 무엇을 얼마나 할지로 끝납니다. 목표 듀레이션 {dur}년, 국채선물 {fut}계약 매도입니다."),
        "b6": ("미국 10년 국채금리가 0.5%p 오르면 어떻게 될까요?",
               "미국 10년 국채금리가 0.5퍼센트포인트 오르면, 어떻게 될까요?"),
        "b7": ("클릭 한 번에 연결을 따라 채권 → 코스닥 주식까지 다시 계산됩니다 (주황색 = 충격이 전달된 경로)",
               "클릭 한 번에 채권과 주식까지 다시 계산됩니다. 주황색이 충격이 전달된 경로입니다."),
        "b8": (f"국고 3년 {N['ktb0']:.2f}% → {N['ktb1']:.2f}% · 공모주 경쟁률 {N['ipo0']:.0f} → {N['ipo1']:.0f} : 1 · 풋 위험 CB {N['put0']:.0f} → {N['put1']:.0f}곳\n"
               f"엑셀로 반나절 걸리던 재계산이 1초 — 계산식도 함께: 국고 3년 변화 = {N['b_bok']:.2f} × 기준금리 변화 + {N['b_ust']:.2f} × 미국금리 변화",
                f"국고 3년은 {N['ktb1']:.2f}퍼센트로, 공모주 경쟁률은 {N['ipo1']:.0f}대 1로 바뀝니다. 반나절 걸리던 재계산이 계산식과 함께 1초면 끝납니다."),
        "b10": (f"반대로 회사채 금리차(크레딧 스프레드)가 {N['credit']:.0f}bp → 52bp로 좁혀지면",
                f"반대로 크레딧 스프레드가 {N['credit']:.0f}비피에서 52비피로 좁혀지면,"),
        "b11": (f"코스닥 판단이 '{c0}' → '{c1}'{ro(c1)[len(c1):]} 바뀝니다",
                f"코스닥 판단이 {c0}에서 {ro(c1v)} 바뀝니다."),
        "b12": ("지표를 누르면 연결된 경로만 밝아지고, 근거 자료가 아래에 열립니다",
                "지표를 누르면 연결된 경로만 밝아집니다."),
        "b13": (f"크레딧 → CB 전이: 차환 접근성 {round((N['refi0'] or 0) * 100)}% → {round((N['refi1'] or 0) * 100)}% · 풋 위험 CB {N['cbput0']:.0f} → {N['cbput1']:.0f}곳\n"
                "자금 조달이 쉬워질수록 조기상환(풋) 위험이 줄어듭니다",
                f"크레딧이 좁혀지면 전환사채 차환이 쉬워져, 풋 위험 기업이 {N['cbput0']:.0f}곳에서 {N['cbput1']:.0f}곳으로 줄어듭니다."),
        "b14": (f"타임라인에서 {mm}월 {dd}일을 누르면, 그날 알 수 있던 데이터만으로 당시 화면을 되살립니다\n실제로 '{N['real_dec']}' 판단을 보낸 날 — 그날 화면의 채권 판단도 {N['then_rates']}",
                f"타임라인에서 {mm}월 {dd}일을 누르면 당시 화면이 되살아납니다. 실제로 {spoken(N['real_dec'])} 판단을 보낸 날입니다."),
        "b16": (f"그 성과는 자동으로 쌓입니다 — 국고 3년 대비 5일 {bp(N['d5'])} · 20일 {bp(N['d20'])} · 60일 {bp(N['d60'])} (영업일)\n"
                "연습용 가상 판단은 SIMULATED, 아직 결과가 안 나온 칸은 PENDING으로 구분합니다",
                "그 성과는 자동으로 쌓입니다. " + (f"60영업일 뒤, 국고 3년 대비 플러스 {d60:.0f}비피입니다." if d60 is not None and d60 >= 0
                                             else "아직 확정되지 않은 성과는 따로 표시합니다.")),
        "b17": (f"지금과 닮은 과거 국면 3개와 그 뒤의 시장 흐름을 순식간에 찾아 줍니다 (1위 {N['sim'][0][0]} · 유사도 {N['sim'][0][1]:.2f})",
                "닮은 과거 국면과 그 뒤의 흐름도 바로 찾아 줍니다."),
        "b18": ("왼쪽 사이드바는 리서치 스택 — 세 담당자의 심화 분석 도구가 한곳에 연결돼 있습니다\nVALKYRIE는 판단 레이어, 도구는 심화 분석 · 접속 상태는 15초마다 확인",
                "왼쪽 사이드바는 세 담당자의 심화 도구를 모은 리서치 스택입니다."),
        "b19": ("매시 정각, 마켓 브리핑 영상이 자동으로 만들어집니다\n오늘의 결론부터 글로벌 시장 · 섹터 · 액션 플랜까지 음성과 자막으로 자동 재생",
                "매시 정각에는 마켓 브리핑 영상이 자동으로 만들어집니다."),
        "bw": ("정희강 · Weekly Updates 보고서 (PDF) — 매주 금요일 종가 기준 2쪽\n1쪽 글로벌 주가 · 금리 · 환율 · 원자재, 2쪽 VALKYRIE 인텔리전스 체인의 주간 변화",
               "주간 보고서는 글로벌 시장과 체인의 한 주 변화를 두 쪽에 담습니다."),
        "b21": ("정희강 · Quant Macro Terminal (:8501)" + (f" — 현재 매크로 국면 '{N['macro_verdict']}'" if N["macro_verdict"] else "")
                + "\n미국 거시 지표를 FRED 실데이터로 읽고, 3단계 확률 네트워크로 목표 자산 비중을 계산합니다",
                "정희강의 매크로 터미널은 " + (f"현재 국면을 {ro(N['macro_verdict'])} 판정하고, " if N["macro_verdict"] else "현재 국면을 판정하고, ")
                + "자산 비중을 계산합니다."),
        "b22": ("정훈 · 채권 위기 진단 & 액션 플랜 (:8511)" + (f" — 오늘의 판정 '{N['rates_verdict']}'" if N["rates_verdict"] else "")
                + "\n금리 위험과 신용 위험을 매일 진단해, 권장 듀레이션과 국채선물 계약 수로 바꿔 줍니다",
                "정훈의 채권 진단은 위험을 권장 듀레이션과 선물 계약 수로 바꿔 줍니다."),
        "b23": ("김유찬 · 주식 시장 진단 & 액션 플랜 (:8512)" + (f" — 권장 주식 비중 {N['weight']}%" if N["weight"] else "")
                + "\n가격 · 변동성 · 빚투 · 증시자금으로 코스피 위험을 진단해, 비중과 선물 계약 수를 제시합니다",
                "김유찬의 주식 진단은 " + (f"권장 주식 비중 {N['weight']}퍼센트와 " if N["weight"] else "권장 주식 비중과 ")
                + "헤지 수량을 제시합니다."),
        "b24": ("IPO Market Report — 매주 발행하는 IPO 시장 수익률 리포트\n최근 12개월 상장 기업의 공모가 대비 성과를 월별 · 섹터별로 분석합니다",
                "아이피오 리포트는 매주 공모주 성과를 분석합니다."),
        "b25": ("CB Zero Finder — 전환사채 발행 공시를 조건으로 빠르게 찾습니다 (DART 공시 · 매일 갱신)\n0% 금리 · 희석률 · 리픽싱 조건 비교 · VALKYRIE의 CB 분석도 이 데이터를 씁니다",
                "씨비 제로 파인더는 전환사채 공시를 조건별로 찾아 줍니다."),
        "b26": ("VALKYRIE v3 기준본 — 지금의 v4가 출발한 원본이자 읽기 전용 폴백\n데이터가 없으면 샘플 숫자로 채우지 않고 'DATA PENDING'으로 표시합니다",
                "브이 쓰리 기준본은 숫자를 지어내지 않는 읽기 전용 폴백입니다."),
        "b27": ("궁금한 건 첫 화면에서 검색하듯 물으면 됩니다 — '지금 커브 포지션 어떻게 가져가나?'",
                "궁금한 건 첫 화면에서 검색하듯 물으면 됩니다. 지금 커브 포지션, 어떻게 가져갈까요?"),
        "b28": ("AI가 엔진을 직접 돌려 시나리오를 계산하는 중 (빨리감기)",
                "인공지능이 엔진을 직접 돌려, 시나리오를 계산합니다."),
        "b29": ("숫자는 모두 엔진 · 담당 모델의 계산값 — AI는 데스크별 액션과 판단이 바뀌는 조건을 정리합니다",
                "숫자는 모두 엔진과 담당 모델의 값이고, 인공지능은 데스크별 액션과 판단이 바뀌는 조건을 정리합니다."),
        "b31": ("코멘트 초안 → 담당자 승인 → 오딘 게시까지 클릭 몇 번, 누가 언제 승인했는지도 남습니다",
                "초안을 만들어 승인하면 오딘에 바로 게시되고, 승인 이력도 남습니다."),
        "outro": ("", "하나의 금리 충격이, 채권과 코스닥 주식에서 같은 듀레이션 논리로 갈라집니다."),
    }
    return S


# ---------------------------------------------------------------- TTS (edge-tts, cached; wav 48 kHz mono for mixing)
async def tts(S, work, voice, rate):
    import edge_tts, imageio_ffmpeg
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    cache = HERE / "_work" / "tts"
    cache.mkdir(parents=True, exist_ok=True)
    out = {}

    async def one(key, text):
        h = hashlib.sha1(f"{voice}|{rate}|{text}".encode("utf-8")).hexdigest()[:16]
        mp3, wav_ = cache / f"{h}.mp3", cache / f"{h}.wav"
        if not wav_.exists():
            for attempt in range(3):
                try:
                    await edge_tts.Communicate(text, voice, rate=rate).save(str(mp3))
                    break
                except Exception as e:
                    print("  ! tts retry", key, e)
                    await asyncio.sleep(1.5)
            subprocess.run([ff, "-y", "-loglevel", "error", "-i", str(mp3), "-ac", "1", "-ar", "48000", str(wav_)], check=True)
        with wave.open(str(wav_)) as w:
            dur = w.getnframes() / w.getframerate()
        out[key] = {"wav": str(wav_), "dur": round(dur, 3), "caption": S[key][0], "voice": text}

    sem = asyncio.Semaphore(4)
    async def guarded(k, t):
        async with sem:
            await one(k, t)
    await asyncio.gather(*[guarded(k, v[1]) for k, v in S.items()])
    (work / "voices.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    return out


# ---------------------------------------------------------------- CDP
class CDP:
    def __init__(self, ws):
        self.ws, self.n, self.fut, self.on = ws, 0, {}, {}
        self.task, self.tab = None, None

    async def reader(self):
        try:
            async for raw in self.ws:
                m = json.loads(raw)
                if "id" in m:
                    f = self.fut.pop(m["id"], None)
                    if f and not f.done():
                        f.set_result(m)
                elif m.get("method") in self.on:
                    self.on[m["method"]](m["params"])
        except websockets.ConnectionClosed:
            pass

    async def send(self, method, **params):
        self.n += 1
        i = self.n
        f = asyncio.get_running_loop().create_future()
        self.fut[i] = f
        await self.ws.send(json.dumps({"id": i, "method": method, "params": params}))
        m = await asyncio.wait_for(f, 90)
        if "error" in m:
            raise RuntimeError(f"{method}: {m['error']}")
        return m.get("result", {})


def chrome_ua():
    vs = [p.name for p in Path(CHROME).parent.iterdir() if re.match(r"^\d+\.\d+\.\d+\.\d+$", p.name)]
    major = max(vs, key=lambda v: [int(x) for x in v.split(".")]).split(".")[0] if vs else "141"
    return f"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{major}.0.0.0 Safari/537.36"


def targets(port):
    return json.loads(urllib.request.urlopen(f"http://127.0.0.1:{port}/json/list", timeout=5).read())


class Director:
    """Performs the demo and logs everything compose_demo.py needs to draw on top of the frames."""

    def __init__(self, cdp, work, voices, port):
        self.c = self.main = cdp
        self.work, self.V, self.port = work, voices, port
        self.ev, self.frames = [], []
        self.cur = (W * 0.72, H * 0.62)
        self.voice_end = 0.0
        (work / "frames").mkdir(parents=True, exist_ok=True)
        self.attach(cdp)

    def attach(self, c):
        c.on["Page.screencastFrame"] = lambda p, c=c: self._frame(c, p)
        c.on["Runtime.exceptionThrown"] = lambda p: print("  ! page error:", p["exceptionDetails"].get("text"),
                                                          (p["exceptionDetails"].get("exception") or {}).get("description", "")[:160])

    def _frame(self, c, p):
        i = len(self.frames)
        path = self.work / "frames" / f"{i:06d}.jpg"
        path.write_bytes(base64.b64decode(p["data"]))
        self.frames.append([p["metadata"].get("timestamp") or time.time(), path.name])
        asyncio.ensure_future(c.send("Page.screencastFrameAck", sessionId=p["sessionId"]))

    async def cast(self, c, on):
        if on:
            await c.send("Page.startScreencast", format="jpeg", quality=92, maxWidth=W, maxHeight=H, everyNthFrame=1)
        else:
            await c.send("Page.stopScreencast")

    def log(self, kind, **kw):
        self.ev.append({"t": time.time(), "type": kind, **kw})

    def save(self):
        (self.work / "events.json").write_text(json.dumps({"events": self.ev, "frames": self.frames, "size": [W, H], "intro": INTRO},
                                                          ensure_ascii=False, indent=0), encoding="utf-8")

    # ---- page helpers
    async def js(self, expr):
        r = await self.c.send("Runtime.evaluate", expression=expr, returnByValue=True, awaitPromise=True)
        if "exceptionDetails" in r:
            raise RuntimeError(r["exceptionDetails"].get("text", "") + " :: " + expr[:120])
        return r["result"].get("value")

    async def rect(self, sel, text=None, up=None):
        """visible, on-screen element (text: exact match, or '~part' = contains), optionally widened to a closest() ancestor"""
        if text and text.startswith("~"):
            pick = "L.find(e => e.textContent.includes(%s))" % json.dumps(text[1:])
        elif text:
            pick = "L.find(e => e.textContent.trim() === %s)" % json.dumps(text)
        else:
            pick = "L[0]"
        return await self.js("(() => { const L = [...document.querySelectorAll(%s)].filter(e => { const r = e.getBoundingClientRect();"
                             " return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight; });"
                             " let e = %s; if (e && %s) e = e.closest(%s); if (!e) return null;"
                             " const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, Math.min(r.height, innerHeight - r.y)]; })()"
                             % (json.dumps(sel), pick, json.dumps(bool(up)), json.dumps(up or "")))

    async def wait(self, cond, timeout=20, every=0.15):
        t0 = time.time()
        while time.time() - t0 < timeout:
            try:
                if await self.js(cond):
                    return True
            except RuntimeError:
                pass
            await asyncio.sleep(every)
        print("  ! timeout:", cond[:100])
        return False

    async def hold(self, s):
        await asyncio.sleep(s)

    # ---- narration
    def out_now(self, t=None):
        """video time of real time t, with the same fast-forward rules as compose_demo.Timeline"""
        t = t or time.time()
        segs = [(e["t"], e.get("v", 1)) for e in self.ev if e["type"] in ("start", "speed") and e["t"] <= t]
        out = 0.0
        for i, (t0, v) in enumerate(segs):
            L = (segs[i + 1][0] if i + 1 < len(segs) else t) - t0
            out += min(L, float(v[4:])) if isinstance(v, str) and v.startswith("fit:") else L / float(v)
        return out

    def say(self, key, step=None, pos="bottom"):
        v = self.V[key]
        self.log("sub", text=v["caption"], step=step, pos=pos, voice=key)
        self.voice_end = self.out_now() + v["dur"]

    async def wait_voice(self, gap=GAP):
        while True:
            rem = self.voice_end + gap - self.out_now()
            if rem <= 0:
                return
            await asyncio.sleep(min(rem, 0.5))

    # ---- overlays (drawn later)
    def sub(self, text, step=None, pos="bottom"):
        self.log("sub", text=text, step=step, pos=pos)

    async def spot(self, sel=None, text=None, pad=6, color="cy", rect=None, up=None):
        r = rect or (await self.rect(sel, text, up) if sel else None)
        if sel and not r:
            print("  ! spot not found:", sel, text)
        self.log("spot", rect=[r[0] - pad, r[1] - pad, r[2] + 2 * pad, r[3] + 2 * pad] if r else None, color=color)

    def speed(self, v):
        """v = factor, or "fit:<sec>" = compress this segment to <sec> seconds of video whatever its real length"""
        self.log("speed", v=v)

    def still(self, name):
        self.log("still", name=name)

    # ---- pointer
    async def move(self, x, y, dur=0.6):
        """the drawn cursor follows the logged path exactly; the real pointer gets a few hover events on the way"""
        x0, y0 = self.cur
        self.log("move", frm=[x0, y0], to=[x, y], dur=dur)
        t0, steps = time.time(), 6
        for i in range(1, steps + 1):
            k = i / steps
            e = k * k * (3 - 2 * k)
            p = dict(type="mouseMoved", x=x0 + (x - x0) * e, y=y0 + (y - y0) * e)
            if i == steps:
                await self.c.send("Input.dispatchMouseEvent", **p)
            else:
                asyncio.ensure_future(self.c.send("Input.dispatchMouseEvent", **p))
            await asyncio.sleep(max(0, t0 + dur * k - time.time()))
        self.cur = (x, y)

    async def to(self, sel, text=None, dx=0.5, dy=0.5, dur=0.6):
        r = await self.rect(sel, text)
        if not r:
            print("  ! not found:", sel, text)
            return None
        await self.move(r[0] + r[2] * dx, r[1] + r[3] * dy, dur)
        return r

    async def click(self, sel=None, text=None, dur=0.6, pause=0.14, dx=0.5):
        if sel and not await self.to(sel, text, dx=dx, dur=dur):
            return False
        x, y = self.cur
        await asyncio.sleep(pause)
        self.log("click", at=[x, y])
        await self.c.send("Input.dispatchMouseEvent", type="mousePressed", x=x, y=y, button="left", clickCount=1)
        await asyncio.sleep(0.07)
        await self.c.send("Input.dispatchMouseEvent", type="mouseReleased", x=x, y=y, button="left", clickCount=1)
        return True

    async def type(self, text, cps=13):
        for ch in text:
            await self.c.send("Input.insertText", text=ch)
            await asyncio.sleep(1 / cps)

    async def park(self, x=360, y=455, dur=0.5):
        """move the pointer to empty chain space (hover tooltips would cover the screen)"""
        await self.move(x, y, dur)

    # ---- research-rail tools open in a new tab: record that tab, then come back
    async def open_tool(self, sel, ready, timeout=60, on_open=None, settle=1.2):
        before = {t["id"] for t in targets(self.port)}
        href = await self.js("(e => e ? e.href : null)(document.querySelector(%s))" % json.dumps(sel))
        u = urllib.parse.urlparse(href or "")
        want = lambda url: (lambda v: v.port == u.port and v.path.startswith(u.path.rstrip("/") or "/")
                            and (v.hostname in ("localhost", "127.0.0.1") if u.hostname in ("localhost", "127.0.0.1") else v.hostname == u.hostname))(urllib.parse.urlparse(url))
        if not href or not await self.click(sel, dx=0.3):
            return False
        tab = None
        for _ in range(120):
            new = [t for t in targets(self.port) if t.get("type") == "page" and t["id"] not in before and want(t.get("url", ""))]
            if new:
                tab = new[0]
                break
            await asyncio.sleep(0.1)
        if not tab:
            print("  ! no new tab for", sel)
            return False
        ws = await websockets.connect(tab["webSocketDebuggerUrl"], max_size=2 ** 28)
        c = CDP(ws)
        c.tab, c.task = tab, asyncio.ensure_future(c.reader())
        self.attach(c)
        await c.send("Page.enable")
        await c.send("Runtime.enable")
        await c.send("Emulation.setDeviceMetricsOverride", width=W, height=H, deviceScaleFactor=1, mobile=False)
        await c.send("Emulation.setEmulatedMedia", features=DARK)
        await self.cast(self.main, False)
        await c.send("Page.bringToFront")
        await self.cast(c, True)
        self.c = c
        self.speed("fit:1.0")                    # loading is squeezed into one second of video
        if on_open:
            on_open()
        ok = await self.wait(ready, timeout, 0.4)
        await self.hold(settle)                  # charts / PDF pages settle
        self.speed(1)
        return ok

    async def close_tool(self):
        c = self.c
        if c is self.main:
            return
        await self.cast(c, False)
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{self.port}/json/close/{c.tab['id']}", timeout=5)
        except Exception:
            pass
        c.task.cancel()
        self.c = self.main
        await self.main.send("Page.bringToFront")
        await self.cast(self.main, True)
        await self.hold(0.25)

    async def scroll(self, top, smooth=True):
        """scroll the page's main scroll container (Streamlit scrolls an inner section, not the window)"""
        await self.js("(() => { const c = [document.querySelector('[data-testid=stMain]'), document.querySelector('[data-testid=stAppViewContainer]'),"
                      " document.querySelector('section.main'), document.scrollingElement].find(e => e && e.scrollHeight > e.clientHeight + 10);"
                      " if (c) c.scrollTo({top: %d, behavior: '%s'}); return !!c; })()" % (top, "smooth" if smooth else "auto"))


ST_READY = ("document.querySelectorAll('[data-testid=stSkeleton]').length === 0 && document.querySelectorAll('[data-testid=stTab]').length > 0"
            " && !document.querySelector('[data-testid=stStatusWidget] [data-testid=stStatusWidgetRunningIcon]')")


# ---------------------------------------------------------------- the demo
async def demo(d, N, ai=True):
    T1, T2, T3, T4, T5, T6, T7 = ("오늘의 결론", "금리 충격 시뮬레이션", "크레딧 → 코스닥 CB", "시간 재생 · 판단 로그",
                                  "유사 국면 검색", "리서치 스택", "AI 질의 · 승인 발간")
    pane = "document.getElementById('pane')"
    ws_on = "document.getElementById('ws').classList.contains('on')"
    sr_pause = "(b => b && b.click())(document.querySelector('#sitrep [data-sr=pause]'))"

    async def close_ws():
        await d.click("#wsClose")
        await d.wait("!" + ws_on, 5)
        await d.hold(0.35)          # drawer slides out, chain re-fits

    async def open_ws():
        await d.click("#wsBtn")
        await d.wait(ws_on, 5)
        await d.hold(0.45)          # drawer slides in (tabs are below the viewport until it lands)

    # boot (loading is fast-forwarded); the intro narration plays over the title card and the boot
    d.log("cursor", on=False)
    await d.c.send("Page.navigate", url=APP + "/")
    d.log("start")
    t_start = time.time()
    await d.hold(1.4)
    d.speed("fit:0.6")
    await d.wait("document.getElementById('boot').classList.contains('go')", 60)
    d.speed(1)
    boot_out = 1.4 + 0.6
    await d.js(sr_pause)                     # keep today's conclusion on the SITREP line while it is explained
    # first line starts only after the intro narration (card INTRO s + boot) has finished
    await d.hold(0.6)
    while d.out_now() < 0.35 + d.V["intro"]["dur"] + 0.4 - INTRO:
        await asyncio.sleep(0.1)
    d.log("cursor", on=True)
    d.still("01_overview")

    # 1. today's conclusion
    home_on = "!!document.getElementById('home') && document.getElementById('home').classList.contains('on')"
    d.say("b1", T1)
    await d.spot(".odin-nav .act", pad=5)
    await d.to(".odin-nav .act", dur=0.7)
    await d.hold(1.2)
    await d.spot(".hm-c", pad=10)
    await d.move(W * 0.62, 820, 0.6)
    await d.wait_voice()
    d.say("b2", T1)
    await d.spot("#homeCalls", pad=8, color="am")
    await d.wait_voice(0.2)
    await d.spot(None)
    await d.click("#homeSkip")                    # → the intelligence chain
    await d.wait("!(" + home_on + ")", 5)
    await d.hold(0.5)
    d.say("b3", T1)
    await d.spot("#chain", pad=0)
    await d.park(dur=0.6)
    await d.hold(1.6)
    await d.js(sr_pause)
    await d.spot(None)
    await d.click("#sigBtn")                    # lanes light up macro → rates → equity while the line plays
    await d.park()
    await d.wait_voice()
    await d.wait(ws_on, 10)
    await d.park()
    d.say("b5", T1)
    r = await d.rect("#pane .apl", up=".cd")
    await (d.spot(rect=r, pad=3, color="gr") if r else d.spot("#pane .grid", pad=3))
    d.still("02_action_plan")
    await d.wait_voice(0.8)

    # 2. UST +50bp
    d.say("b6", T2)
    await d.spot(None)
    await d.click('#tabs .tab[data-t="impact"]')
    await d.wait("!!document.querySelector('#stress .cp[data-k=ust50]')", 8)
    await d.hold(0.4)
    await d.click("#stress .cp[data-k=ust50]")
    await d.wait("document.querySelector('#mode').textContent.includes('WHAT-IF')", 15)
    await d.hold(0.4)
    await close_ws()
    await d.park()
    await d.wait_voice(0.2)
    d.say("b7", T2)
    await d.spot("#chain", pad=0, color="am")
    d.still("03_shock_chain")
    await d.wait_voice()
    await d.spot(None)
    await open_ws()
    await d.park()
    d.say("b8", T2)
    await d.spot("#pane .cd", pad=3, color="am")
    d.still("04_shock_table")
    await d.hold(3.4)
    await d.spot("#pane .cd .fx", pad=4)
    await d.wait_voice(0.8)

    # 3. credit → KOSDAQ CB bridge
    d.say("b10", T3)
    await d.spot(None)
    await d.click("#stress .cp[data-k=credit52]")
    await d.wait("document.querySelector('#kpLab').textContent.includes('52')", 15)
    await d.hold(0.4)
    await close_ws()
    await d.park()
    await d.wait_voice(0.1)
    d.say("b11", T3)
    await d.spot('#chain g.nd[data-id="sig_equity"]', pad=8, color="am")
    await d.wait_voice(0.6)
    d.say("b12", T3)
    await d.spot(None)
    await d.click('#chain g.nd[data-id="eq_cb"]')
    await d.wait(ws_on, 5)
    await d.park()
    await d.wait_voice(0.6)
    await d.click('#tabs .tab[data-t="cb"]')
    await d.wait("document.getElementById('pane').innerText.includes('CB 전이')", 8)
    await d.park()
    d.say("b13", T3)
    # bring the credit → CB block (bottom of the middle card) into view and spotlight just that block
    blk = ("(() => { const t = [...document.querySelectorAll('#pane .sec-t')].find(e => e.textContent.includes('CB 전이')); if (!t) return null;"
           " const els = [t]; let n = t.nextElementSibling; for (let i = 0; i < 3 && n; i++) { els.push(n); n = n.nextElementSibling; }"
           " %s })()")
    await d.js(blk % "t.scrollIntoView({block: 'center', behavior: 'smooth'}); return true;")
    await d.hold(0.7)
    r = await d.js(blk % ("const R = els.map(e => e.getBoundingClientRect()); const x0 = Math.min(...R.map(r => r.left)), y0 = Math.min(...R.map(r => r.top));"
                          " return [x0, y0, Math.max(...R.map(r => r.right)) - x0, Math.max(...R.map(r => r.bottom)) - y0];"))
    await (d.spot(rect=r, pad=8) if r else d.spot("#pane .grid > .cd:nth-child(2)", pad=3))
    d.still("05_cb_bridge")
    await d.wait_voice(0.8)

    # 4. time replay + decision log
    await d.spot(None)
    d.sub(None)
    await d.click("#rstBtn")
    await d.wait("!" + ws_on, 5)
    await d.hold(0.4)
    d.say("b14", T4, pos="bottom-left")
    await d.spot("#tks .tk.real", pad=12, color="am")
    await d.click("#tks .tk.real", dur=0.8)
    await d.wait("document.getElementById('asof').textContent === %s" % json.dumps(N["real_date"]), 10)
    await d.park()
    await d.hold(0.8)
    await d.spot('#chain g.nd[data-id="sig_rates"]', pad=8, color="am")
    d.still("06_replay")
    await d.wait_voice(0.9)
    await d.spot(None)
    d.sub(None)
    await d.click('#tks .tk[data-d="%s"]' % N["date"], dur=0.8)
    await d.wait("document.getElementById('asof').textContent === %s" % json.dumps(N["date"]), 10)
    d.say("b16", T4)
    await open_ws()
    await d.click('#tabs .tab[data-t="log"]')
    await d.wait("!!document.querySelector('#pane tr.real')", 10)
    await d.park()
    await d.spot("#pane tr.real", pad=3, color="am")
    d.still("07_decision_log")
    await d.wait_voice(0.9)

    # 5. similar regimes
    await d.spot(None)
    d.say("b17", T5)
    await d.click('#tabs .tab[data-t="similar"]')
    await d.wait("!!document.querySelector('#pane .sim-bar')", 10)
    await d.park()
    await d.spot("#pane .grid", pad=3)
    d.still("08_similar")
    await d.wait_voice(0.8)

    # 6. research stack (left rail): hourly briefing + the owners' tools, each opened for real
    await d.spot(None)
    d.sub(None)
    await close_ws()
    await d.move(24, 560, 0.7)                        # hover → the rail slides open
    await d.hold(0.7)
    d.say("b18", T6)
    await d.spot("#researchRail", pad=0)
    await d.move(140, 600, 0.5)
    await d.wait_voice(0.3)
    await d.spot(None)
    d.say("b19", T6)
    await d.click("#researchRail [data-act=brief]", dx=0.3)
    await d.wait("!!document.querySelector('.bp') && document.querySelector('.bp').offsetParent !== null", 8)
    await d.move(1250, 700, 0.6)
    d.still("09_briefing")
    await d.wait_voice(1.0)
    await d.click('.bp-x[data-bp="close"]')
    await d.hold(0.4)

    tools = [
        ("b21", '#researchRail a[href*=":8501"]', ST_READY, "10_tool_8501", lambda: d.scroll(430), 1.2),
        ("bw", '#researchRail a[href*="/reports/"]', "true", "11_tool_weekly", None, 2.5),
        ("b22", '#researchRail a[href*=":8511"]', ST_READY, "12_tool_8511", lambda: d.click('[role=tab]', "~액션 플랜"), 1.2),
        ("b23", '#researchRail a[href*=":8512"]', ST_READY, "13_tool_8512", lambda: d.click('[role=tab]', "~액션 플랜"), 1.2),
        ("b24", '#researchRail a[href*="ipo-market"]', "document.readyState === 'complete' && !document.body.innerText.includes('불러오는 중')",
         "14_tool_ipo", None, 1.5),
        ("b25", '#researchRail a[href*="cb-zero"]', "document.readyState === 'complete' && document.body.innerText.includes('조건')",
         "15_tool_cb", lambda: d.scroll(560), 1.0),
        ("b26", '#researchRail a[href*=":8765"]', "document.readyState === 'complete'", "16_tool_v3", None, 2.0),
    ]
    for key, sel, ready, still, act, settle in tools:
        if key not in d.V:
            continue
        await d.move(24, 560, 0.35)                   # keep the rail open
        await d.hold(0.2)
        if not await d.open_tool(sel, ready, on_open=lambda k=key: d.say(k, T6), settle=settle):
            await d.close_tool()
            continue
        d.still(still)
        if act:
            await d.hold(min(1.6, d.V[key]["dur"] * 0.35))
            await act()
        await d.wait_voice(0.5)
        await d.close_tool()
    await d.js("document.activeElement && document.activeElement.blur()")   # the rail stays open while a link inside keeps focus
    await d.park(dur=0.6)
    await d.hold(0.3)

    # 7. AI question → ODIN publish
    if ai:
        d.say("b27", T7)
        await d.click(".hd .lg", dur=0.7)            # header logo → home
        await d.wait(home_on, 5)
        await d.hold(0.5)
        await d.click("#homeQ", dur=0.6)
        await d.type("지금 커브 포지션 어떻게 가져가나?")
        await d.hold(0.3)
        n0 = await d.js("VK.ask.items.length")
        await d.click("#homeGo", dur=0.5)
        await d.wait("VK.ask.items.length > %d" % n0, 15)
        jid = await d.js("VK.ask.items[0] && VK.ask.items[0].id")
        await d.hold(0.8)
        await d.park()
        await d.wait_voice(0.1)
        d.say("b28", T7)
        d.speed("fit:%.2f" % (d.V["b28"]["dur"] + 0.5))
        ok = bool(jid) and await d.wait("(VK.ask.items.find(j => j.id === %s) || {}).status === 'done'" % json.dumps(jid), 300, 0.4)
        await d.hold(0.8)
        d.speed(1)
        await d.js(pane + ".scrollTop = 0")
        d.say("b29", T7)
        await d.spot('.ai-item[data-job="%s"]' % jid if jid else "#pane .ai-item", pad=2)
        d.still("17_ai_answer")
        await d.hold(2.4)
        await d.spot(None)
        btns = None
        if ok:
            btns = '.ai-item[data-job="%s"] .ai-btns' % jid
            # scroll through the desk actions / risks down to the buttons at the end of the answer
            await d.js("(e => e && e.scrollIntoView({behavior: 'smooth', block: 'end'}))(document.querySelector(%s))" % json.dumps(btns))
        await d.wait_voice(0.3)
        if ok:
            d.say("b31", T7)
            await d.click(btns + ' [data-ai="draft"]')
            await d.wait("!!document.querySelector('#pane .pub [data-act=submit]')", 10)
            await d.hold(0.6)
            await d.click("#pane .pub [data-act=submit]")
            await d.wait("!!document.querySelector('#pane .pub [data-act=approve]')", 10)
            await d.hold(0.5)
            await d.click("#pane .pub [data-act=approve]")
            await d.wait("document.querySelector('#pane .pub .chip').textContent.includes('PUBLISHED')", 10)
            await d.park()
            await d.spot("#pane .pub", pad=3, color="gr")
            d.still("18_published")
            await d.wait_voice(1.2)

    # outro: back to today's chain (the closing line plays over the outro card)
    d.sub(None)
    await d.spot(None)
    await d.click("#rstBtn")
    await d.park(W * 0.66, 560, 0.7)
    await d.hold(1.2)
    d.log("end")


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-ai", action="store_true", help="skip the AI question and publish flow (layout check)")
    ap.add_argument("--port", type=int, default=9473)
    ap.add_argument("--voice", default="ko-KR-SunHiNeural")
    ap.add_argument("--rate", default="+15%")
    ap.add_argument("--out", default=str(HERE / "_work" / "run"))
    a = ap.parse_args()

    print("engine numbers …")
    N = numbers()
    print(json.dumps(N, ensure_ascii=False))
    work = Path(a.out)
    if work.exists():
        shutil.rmtree(work)
    work.mkdir(parents=True)
    (work / "numbers.json").write_text(json.dumps(N, ensure_ascii=False, indent=1), encoding="utf-8")
    S = script(N)
    print(f"narration: {len(S)} lines, {sum(len(v[1]) for v in S.values())} chars · voice {a.voice} {a.rate}")
    V = await tts(S, work, a.voice, a.rate)
    print(f"voice total {sum(v['dur'] for v in V.values()):.1f}s")

    prof = HERE / "_work" / "chrome-profile"
    proc = subprocess.Popen([CHROME, "--headless=new", f"--remote-debugging-port={a.port}", f"--user-data-dir={prof}",
                             f"--window-size={W},{H}", "--hide-scrollbars", "--force-device-scale-factor=1",
                             f"--user-agent={chrome_ua()}", "--disable-blink-features=AutomationControlled",
                             "--no-first-run", "--no-default-browser-check", "--mute-audio", "about:blank"])
    try:
        for _ in range(100):
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{a.port}/json/version", timeout=1)
                break
            except Exception:
                time.sleep(0.2)
        req = urllib.request.Request(f"http://127.0.0.1:{a.port}/json/new?about:blank", method="PUT")
        tab = json.loads(urllib.request.urlopen(req, timeout=5).read())
        async with websockets.connect(tab["webSocketDebuggerUrl"], max_size=2 ** 28) as ws:
            c = CDP(ws)
            c.tab, c.task = tab, asyncio.ensure_future(c.reader())
            d = Director(c, work, V, a.port)
            await c.send("Page.enable")
            await c.send("Runtime.enable")
            await c.send("Emulation.setDeviceMetricsOverride", width=W, height=H, deviceScaleFactor=1, mobile=False)
            await c.send("Emulation.setEmulatedMedia", features=DARK)
            # warm-up load (server caches, fonts) — not recorded
            await c.send("Page.navigate", url=APP + "/")
            await d.wait("document.getElementById('boot') && document.getElementById('boot').classList.contains('go')", 60)
            await asyncio.sleep(2.0)
            await c.send("Page.navigate", url="about:blank")
            await asyncio.sleep(0.8)
            await d.cast(c, True)
            await asyncio.sleep(0.5)
            t0 = time.time()
            try:
                await demo(d, N, ai=not a.no_ai)
            finally:
                try:
                    await d.close_tool()
                    await d.cast(c, False)
                except Exception:
                    pass
                await asyncio.sleep(0.4)
                d.save()
                c.task.cancel()
            dur = time.time() - t0
            print(f"recorded {len(d.frames)} frames in {dur:.1f}s ({len(d.frames) / dur:.1f} fps) → {work}")
    finally:
        proc.terminate()


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    asyncio.run(main())
