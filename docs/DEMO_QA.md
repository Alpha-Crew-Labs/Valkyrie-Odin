# VALKYRIE Demo QA / Acceptance Criteria

This is the release checklist for the hackathon demo. A feature is not demo-ready because it looks correct once; it is demo-ready when the same state transition works repeatedly and predictably.

## 1. Core boot

- [ ] cold load reaches `SYSTEM READY`
- [ ] intro completes without manual input
- [ ] `SKIP INTRO` works
- [ ] latest snapshot loads after boot
- [ ] no JavaScript console error blocks interaction
- [ ] no external network call is required for the reference demo

## 2. Intelligence Chain

- [ ] exactly 16 objects render for the current v2 ontology
- [ ] exactly 22 relations render for the current v2 ontology
- [ ] node click selects the intended object
- [ ] unrelated nodes visibly recede
- [ ] related edges propagate in the expected direction
- [ ] terminal signals remain visually stronger than ordinary nodes
- [ ] `SHARED DURATION LOGIC` is understandable without narration

> Do not change 16 / 22 merely to match an older plan. The intended ontology version must be verified first.

## 3. Object interaction contract

For at least one object in each domain:

- [ ] Graph selection updates
- [ ] Inspector updates
- [ ] Evidence updates
- [ ] Confidence updates
- [ ] correct domain workspace activates
- [ ] relevant workspace content receives focus/highlight where implemented
- [ ] Terminal Signal context remains coherent

Required smoke objects:

```text
MACRO   mac_uscpi
RATES   rat_ktb
EQUITY  eq_cb
```

## 4. RUN SIGNATURE

- [ ] can be run from clean state
- [ ] can be run again after `RESET`
- [ ] sequence is deterministic
- [ ] macro shock is visible
- [ ] rates transmission is visible
- [ ] cross-asset transmission is visible
- [ ] equity decision is visible
- [ ] shared-duration conclusion is visible
- [ ] final state does not leave stale timers or broken selection

Target presentation length: approximately **6–9 seconds** for the cinematic interaction itself.

## 5. Replay

- [ ] 5 bundled snapshots are reachable
- [ ] timeline marker matches current snapshot
- [ ] AS-OF date changes with snapshot
- [ ] mode changes from LIVE to REPLAY
- [ ] object values animate to historical values
- [ ] object risk states update
- [ ] terminal signals update
- [ ] Decision Log matching row is highlighted
- [ ] conflict event appears at the intended snapshot
- [ ] replay returns to latest LIVE state
- [ ] revision-adjusted/PIT limitation remains visible

## 6. Command

Preset commands:

- [ ] 채권 포지션 → RATES signal
- [ ] 금리 경로 → MACRO signal
- [ ] IPO 청약 → EQUITY signal

Behavior:

- [ ] command appears to operate the system, not open a chat bubble
- [ ] relevant graph path activates before/with the recommendation
- [ ] Inspector resolves evidence
- [ ] domain workspace follows
- [ ] demo command does not depend on an external LLM

## 7. Always-alive motion

Idle state should look active but not distracting.

- [ ] ambient data field moves subtly
- [ ] causal edges have low-salience flow
- [ ] AS-OF clock runs
- [ ] LIVE heartbeat is subtle
- [ ] cursor telemetry works inside the chain
- [ ] node targeting bracket works
- [ ] event animation remains more salient than ambient animation

Reject the build if idle motion makes values harder to read.

## 8. Visual hierarchy

At normal presentation distance, the viewer should identify in this order:

1. Market Status
2. Active causal path
3. Terminal Signal
4. Inspector / Evidence
5. Domain workspace
6. Replay timeline

- [ ] no giant hero number dominates the page
- [ ] no excessive glow / gradient / glass effect
- [ ] no game-like particle explosion
- [ ] signal colors retain semantic meaning

## 9. Viewport tests

Mandatory:

- [ ] 1920 × 1080 / browser zoom 100%
- [ ] 1440 × 900
- [ ] 1366 × 768 sanity check

For 1920 × 1080:

- [ ] no accidental page scroll in presentation mode
- [ ] terminal signals fully visible
- [ ] Inspector fully visible
- [ ] current workspace remains usable
- [ ] Replay controls remain visible

## 10. Performance

- [ ] no visible frame drop during RUN SIGNATURE
- [ ] no visible frame drop during Replay
- [ ] no duplicate animation loop after resize
- [ ] Canvas DPR is bounded
- [ ] hidden tabs do not waste unnecessary animation work
- [ ] `prefers-reduced-motion` has a safe fallback

Target is perceived smoothness, not maximum animation density.

## 11. Quant / Scenario acceptance

Before Stress Test is marked complete:

- [ ] same preset returns same demo result
- [ ] scenario state is visibly different from LIVE
- [ ] base snapshot is not overwritten
- [ ] Quant output is normalized before UI rendering
- [ ] affected ontology objects update
- [ ] affected terminal signals re-resolve
- [ ] Inspector explains why
- [ ] bundled JSON fallback exists

Canonical stress preset:

```text
UST10Y +50bp
VIX +8
HY +40bp
```

## 12. Public repository safety

Before every demo/release:

- [ ] no `.env`
- [ ] no API key / token / password
- [ ] no Streamlit secrets
- [ ] no confidential Hanwha Asset Management source data
- [ ] no unpublished internal report text
- [ ] no personal/customer data
- [ ] no restricted-license dataset
- [ ] sample/demo data is labeled appropriately

## 13. Demo recovery

- [ ] `RESET` returns to known state
- [ ] local reference prototype is available
- [ ] static snapshot fallback works
- [ ] stress preset fallback works
- [ ] full-demo recording exists before presentation day

## Release gate

The demo is release-ready only when all S0 paths pass:

```text
BOOT
→ SELECT OBJECT
→ RUN SIGNATURE
→ COMMAND
→ REPLAY
→ RESET
```

and no step depends on undocumented local files or confidential public-repo content.
