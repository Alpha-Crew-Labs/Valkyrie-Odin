# CLAUDE.md — VALKYRIE Development Guide

This file is the working contract for AI-assisted development in this repository.

## Product

**VALKYRIE** is a Research Intelligence & Decision System for Hanwha Asset Management AI PLUSthon 2026.

Core loop:

```text
SEE → CONNECT → DECIDE → ACT → LEARN
```

The product connects MACRO, RATES and EQUITY research through a fixed financial ontology, turns evidence into cross-asset signals, and preserves prior decisions through Replay / Decision Log.

Do not redesign VALKYRIE into a generic dashboard or chatbot.

## Product North Star

> 시장 데이터를 연결해 판단으로 바꾸고, 그 판단의 결과까지 기억하는 Research Intelligence System.

The intended feeling is:

> Bloomberg information density × Palantir operational UX × cinematic system motion × institutional asset-management logic.

The UI should feel **Always Alive · Always Watching · Always Connected · Always Ready to Decide**.

## Core domains

- `MACRO` — owner: 정희강
- `RATES` — owner: 정훈
- `EQUITY` — owner: 김유찬

Domain ownership is for implementation/review clarity. The final product must feel like **one system**, not three embedded websites.

## Non-negotiable interaction model

A primary object interaction should coordinate multiple surfaces:

```text
Object selected
  → causal path propagates
  → unrelated context dims
  → Inspector updates
  → owning workspace activates
  → relevant table/chart focuses
  → terminal signal resolves
```

Do not implement important features as isolated tabs if they can be expressed as actions on an object or ontology.

Preferred object actions:

- INSPECT
- COMPARE
- CORRELATE
- STRESS
- SIMULATE
- REPLAY
- BRIEF

## Ontology rules

- The financial relationship graph is **predefined by the team**.
- Data changes node state; data does not invent arbitrary relationships at runtime.
- Keep MACRO → RATES → EQUITY causal readability.
- Preserve the cross-asset `SHARED DURATION LOGIC` concept between rates and equity.
- Quantitative calculations must be deterministic code where possible.
- LLMs may synthesize, classify, explain or draft; they must not silently replace deterministic calculations.

Before changing node/edge counts or financial causality, document the reason in the PR.

## Motion system

Motion must explain system behavior, not decorate it.

Motion grammar:

| Motion | Meaning |
|---|---|
| Spark | information transmission |
| Sweep | state/time transition |
| Bracket | selection/acquisition |
| Rolling number | data change |
| Pulse | event/signal |
| Masked reveal | new information |
| Dim | out of current context |

Allowed always-on ambient motion:

- slow data-field particle drift
- slow edge flow
- clock
- subtle LIVE heartbeat
- tiny system activity feed

Event motion can be stronger for:

- RUN SIGNATURE
- REPLAY
- Command resolution
- Signal lock
- Conflict detection

Avoid neon glow, rainbow gradients, Matrix rain, particle explosions, meaningless 3D, elastic/bouncy animation, giant SaaS cards and chat bubbles.

## Visual system

Base colors:

```text
BG        #0B0E14
PANEL     #11151E
BORDER    #1E2530
TEXT      #E6E9EF
SECONDARY #8A94A6
AMBER     #F5A623
RED       #E5484D
GREEN     #30A46C
CYAN      #22B8CF
```

Use color semantically:

- Cyan = selection / system intelligence
- Amber = attention / transmission / warning
- Red = risk / conflict
- Green = verified / normal / complete

Use tabular numbers. Prefer thin lines, precise alignment, small radii, dense but legible layouts.

## Key demo features

Protect these from regressions:

1. Boot / system initialization
2. Intelligence Chain
3. Node → Inspector → Workspace synchronization
4. RUN SIGNATURE
5. Terminal Signals
6. Replay / Decision Log
7. Data Vintage
8. VALKYRIE Command
9. Quant Engine actions such as Stress / Macro Clock / Yield Curve

## Quant Engine integration

The existing Quant Macro Terminal should be treated as a **calculation engine**, not embedded as a visually separate Streamlit application.

Preferred architecture:

```text
Python Quant Logic
      ↓ JSON / API / snapshot
VALKYRIE state model
      ↓
Ontology + Inspector + Workspace
      ↓
Signal / Decision / Replay
```

Highest-priority integrations:

1. Stress Test & VaR
2. Macro Clock
3. 3D Yield Curve
4. Financial Stress
5. Correlation / Custom Lab
6. Monte Carlo
7. AI CIO / Briefing

## Data and security

This repository is public.

Never commit:

- confidential Hanwha Asset Management data
- unpublished internal research
- customer/personal data
- API keys, passwords, tokens, cookies or `.env` values
- internal URLs or infrastructure details not approved for disclosure
- licensed datasets that cannot be redistributed

Use public, anonymized, synthetic or demo data in this repository.

Do not weaken `.gitignore` or bypass `docs/DATA_POLICY.md` to make a demo easier.

## Demo reliability

The hackathon demo must survive network/API failure.

- Keep local/static snapshot fallback.
- Preset demo commands should be deterministic.
- Distinguish LIVE, SAMPLE, DEMO and REVISION-ADJUSTED states.
- Do not fake a live external calculation without labeling it.
- Avoid layout shift and animation jank.

Target environment:

- Chrome
- 1920×1080 fullscreen
- 100% browser zoom
- also sanity-check 1440×900 and 1366×768

## Performance

- Prefer `transform`, `opacity`, SVG and `clip-path` for motion.
- Avoid per-frame DOM mutation.
- Reuse charts instead of recreating them.
- Pause/cap ambient animation when the page is hidden.
- Clamp particle count and device pixel ratio.
- Support `prefers-reduced-motion` without losing functionality.

## Repository direction

Target structure:

```text
apps/valkyrie-web/     UI / ontology / interaction
quant-core/            deterministic Python models
quant-api/             optional API adapter
data/sample/            safe public demo data
data/snapshots/         replay snapshots
docs/                   architecture/product/demo docs
```

During prototype phase, preserving a working single-file HTML demo is acceptable. Do not rewrite working prototype code merely to satisfy framework preference.

## Git workflow

- Start from latest `main`.
- Use `feat/<scope>` or `fix/<scope>` branches.
- Keep commits small and purposeful.
- Open PRs for meaningful changes.
- Prefer squash merge.
- Explain financial-logic changes separately from visual changes.
- Never mix secrets/data cleanup with unrelated UI work.

## Definition of Done

A change is not done until:

- the main demo flow still works
- no confidential data/secrets were added
- relevant viewport remains usable without accidental scrolling
- node/inspector/workspace state stays synchronized
- motion has semantic purpose
- fallback behavior is preserved
- README/docs are updated if architecture or user flow changed

## Final test

For every major interaction ask:

1. What did the user select?
2. What changed?
3. Why did it change?
4. What is the current conclusion?
5. What can the user do next?

If those answers are not understandable within a few seconds, simplify the interaction.