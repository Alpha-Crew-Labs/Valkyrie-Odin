# VALKYRIE Hackathon Roadmap

## Objective

Reach a demo-ready system where one market shock can propagate through MACRO → RATES → EQUITY, update terminal signals, run at least one quant scenario, and replay a prior decision.

## Milestone 0 — Repository / operating model

Status: **in progress**

- [x] README / product framing
- [x] contribution rules
- [x] data policy
- [x] architecture document
- [x] AI coding guide (`CLAUDE.md`)
- [x] product specification
- [x] motion system guide
- [x] quant integration guide
- [x] demo playbook
- [x] issue / PR templates
- [ ] verify 3-person GitHub write access
- [ ] add actual v2 prototype source to repository

## Milestone 1 — VALKYRIE shell

Priority: **S0**

- [ ] stable 1920×1080 no-scroll shell
- [ ] header / market status / AS-OF
- [ ] 3-lane Intelligence Chain
- [ ] fixed ontology edges
- [ ] terminal signals
- [ ] Inspector
- [ ] MACRO / RATES / EQUITY workspaces
- [ ] timeline / Replay footer
- [ ] local deterministic snapshots

Exit criteria:

> Clicking an object updates the causal chain, Inspector and owning workspace without desynchronization.

## Milestone 2 — Motion System v3

Priority: **S0**

- [ ] ambient data field
- [ ] slow causal edge flow
- [ ] cursor telemetry
- [ ] targeting bracket
- [ ] sequential causal propagation
- [ ] spark / information packet
- [ ] signal-lock animation
- [ ] evidence stagger + confidence resolve
- [ ] panel masked transition
- [ ] LIVE heartbeat
- [ ] performance/reduced-motion guardrails

Exit criteria:

> The screen feels continuously active while keeping current reasoning and signal visually dominant.

## Milestone 3 — Domain modules

### MACRO — 정희강

- [ ] CPI / policy-rate model state
- [ ] Base / Hawkish / Dovish scenario matrix
- [ ] Macro Clock
- [ ] financial-stress evidence

### RATES — 정훈

- [ ] curve / duration state
- [ ] duration terminal signal
- [ ] Decision Log
- [ ] D+5 / D+20 / D+60 / BM-relative performance
- [ ] yield-curve visualization

### EQUITY — 김유찬

- [ ] IPO market state
- [ ] IPO selectivity
- [ ] KOSDAQ discount-rate sensitivity
- [ ] CB financing / put-risk state
- [ ] existing IPO/CB tools adapted to unified design

Exit criteria:

> Each domain adds unique analytical value while sharing the same VALKYRIE state model and interaction grammar.

## Milestone 4 — Quant Engine integration

Priority: **S0/S1**

### S0

- [ ] Stress Test & VaR normalized contract
- [ ] stress preset integrated with ontology
- [ ] Macro Clock synchronized with Replay
- [ ] 3D Yield Curve detail action
- [ ] Financial Stress inputs normalized

### S1

- [ ] Correlation Lens
- [ ] Custom Compare action
- [ ] Monte Carlo scenario result
- [ ] AI CIO / briefing synthesis

Exit criteria:

> A scenario changes the system state rather than opening an unrelated analytics page.

## Milestone 5 — Replay / learning loop

Priority: **S0**

- [ ] at least 5 prepared snapshots
- [ ] time scrub / rewind animation
- [ ] Decision Log row synchronization
- [ ] conflict event
- [ ] benchmark-relative post-performance
- [ ] vintage labels
- [ ] PIT limitation disclosure

Exit criteria:

> A judge can see what VALKYRIE believed at a prior date and what happened afterward.

## Milestone 6 — Command / briefing

Priority: **S1**

- [ ] prepared deterministic command chips
- [ ] free-text routing
- [ ] system activity states (`SCANNING`, `TRACING`, `EVIDENCE FOUND`)
- [ ] UI manipulation before prose answer
- [ ] briefing generation pipeline
- [ ] pre-rendered briefing fallback

Exit criteria:

> Command feels like operating VALKYRIE, not opening a chatbot.

## Milestone 7 — Demo hardening

Priority: **S0**

- [ ] RUN SIGNATURE 6–9s sequence
- [ ] 60s demo script
- [ ] 30s fallback script
- [ ] static data fallback
- [ ] quant preset fallback
- [ ] local copy / backup deployment
- [ ] Chrome 1920×1080 test
- [ ] 1440×900 test
- [ ] 1366×768 sanity test
- [ ] reset path verified
- [ ] secrets/confidential-data scan
- [ ] full demo recording backup

## Definition of hackathon-ready

VALKYRIE is ready when the team can reliably demonstrate:

```text
MARKET CHANGE
→ CAUSAL PROPAGATION
→ CROSS-ASSET SIGNAL
→ STRESS / SCENARIO
→ INVESTMENT DECISION
→ REPLAY / TRACK RECORD
```

without needing to explain around broken transitions, disconnected apps or unavailable external APIs.