# VALKYRIE Demo Playbook

## Objective

The live demo should communicate one coherent story:

> A market shock is detected, propagated across asset classes, converted into an investment decision, and later replayed to evaluate that decision.

Do not tour every feature. Demonstrate the operating loop.

## 60-second core sequence

### 0–5s — Boot / system identity

Show:

```text
RAVENS
VALKYRIE · MARKET INTELLIGENCE SYSTEM
SYSTEM READY
```

Presenter line:

> “VALKYRIE는 매크로·채권·주식 리서치를 하나의 의사결정 체계로 연결합니다.”

### 5–20s — Market shock → rates

Select `US CPI` or use RUN SIGNATURE.

Expected UI:

```text
US CPI
→ FED PATH
→ UST10Y
→ KTB
→ CURVE
→ SHORT DURATION
```

Presenter line:

> “CPI 충격이 금리 경로와 국채 커브를 거쳐 채권 포지션으로 전달됩니다.”

### 20–32s — Cross-asset transmission

Continue from rates into equity.

Expected UI:

```text
KTB / CREDIT
→ KOSDAQ DISCOUNT RATE
→ CB FUNDING
→ IPO DEMAND
→ IPO SELECTIVITY
```

Emphasize `SHARED DURATION LOGIC`.

Presenter line:

> “같은 할인율 충격이 적자 성장주와 IPO의 선택 기준에도 연결됩니다.”

### 32–45s — Scenario / Stress

Use one deterministic preset:

```text
UST10Y +50bp
VIX +8
HY +40bp
```

Expected behavior:

- values roll
- relevant objects change state
- rates/equity signals re-resolve
- Inspector explains evidence

Presenter line:

> “가정을 바꾸면 별도 화면이 아니라 온톨로지 전체의 판단이 다시 계산됩니다.”

### 45–57s — Replay / Decision Log

Replay a prepared historical snapshot.

Expected behavior:

- temporal rewind
- historical signal appears
- Decision Log row highlights
- D+5 / D+20 / D+60 / benchmark-relative outcome visible

Presenter line:

> “그리고 과거 판단을 다시 불러와 이후 성과까지 추적합니다.”

### 57–60s — Close

End on resolved system state.

Closing line:

> “즉 VALKYRIE는 데이터를 보여주는 대시보드가 아니라, 판단하고 기억하는 Research Intelligence System입니다.”

## 30-second fallback sequence

If presentation time is reduced:

1. RUN SIGNATURE
2. Stress preset
3. Replay one Decision Log
4. closing statement

## Presenter interaction rules

- Do not type long free-form prompts during the core demo.
- Use prepared command chips or deterministic presets first.
- Keep the pointer near the next target before each action.
- Do not open browser devtools.
- Do not navigate away from the main system during the core story.
- Avoid explaining every number; explain the causal chain.

## Demo presets

### Preset A — Rates shock

```text
UST10Y +50bp
VIX +8
HY +40bp
```

Purpose: show cross-asset repricing.

### Preset B — Easing

```text
UST10Y -35bp
Credit -15bp
VIX -4
```

Purpose: show easing into valuation/funding conditions.

### Preset C — Historical replay

Use a snapshot with a clearly documented rates call and subsequent benchmark-relative performance.

Only use exact dates/performance once verified by the team.

## Failure fallbacks

### Network failure

Use local/static snapshot data.

### Quant API failure

Load the same preset result from bundled JSON.

### LLM failure

Keep deterministic signal/evidence state; skip generated narrative.

### 3D visualization failure

Fall back to 2D curve/time chart without interrupting the story.

### Browser animation lag

Disable high-cost ambient effects; preserve causal propagation and Replay.

## Pre-demo checklist

- [ ] Chrome latest
- [ ] 1920×1080 display tested
- [ ] 100% zoom
- [ ] fullscreen tested
- [ ] demo URL opened once before presentation
- [ ] local/offline fallback available
- [ ] RUN SIGNATURE reset verified
- [ ] Replay reset verified
- [ ] Stress preset verified
- [ ] all visible data labeled LIVE / SAMPLE / DEMO appropriately
- [ ] no confidential data or API keys visible
- [ ] Decision Log dates/performance verified
- [ ] audio/video assets cached locally if used

## Principle

The strongest demo is not the one with the most screens.

The strongest demo makes the judge understand, in under one minute:

```text
WHAT CHANGED
→ WHY IT MATTERS
→ WHAT WE DO
→ WHETHER WE WERE RIGHT
```
