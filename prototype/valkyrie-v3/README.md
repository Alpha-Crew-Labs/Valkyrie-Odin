# VALKYRIE v3 — v2.6 Baseline Rebase

`prototype/valkyrie-v3` is now the active development line for VALKYRIE and has been **rebased on the user-approved `VALKYRIE v2.6 — Research Intelligence System` prototype**.

The previous v3.2 ontology-command-center experiment is retired. Future UI, ontology, quant, motion, and AI work should evolve from this baseline rather than reintroducing the retired shell.

## Current baseline

- 16 research objects
- 22 predefined causal relations
- 5 temporal snapshots
- Macro / Rates / Equity domain workspaces
- Hydro-flow causal edges
- RUN SIGNATURE cinematic sequence
- deterministic Stress presets
- temporal REPLAY
- Decision Log with benchmark-relative framing
- IPO MARKET REPORT
- CB ZERO FINDER
- Evidence / Confidence / Data Vintage inspector
- Shared Duration Logic between fixed income and equity

## Team-domain mapping

- **정희강 — Macro / Quant Engine**: GDP nowcast, CPI model, policy-rate path, Taylor Rule, Financial Stress, Stress Test & VaR
- **정훈 — Fixed Income**: UST/KTB, curve, credit spread, duration signal, Decision Log, ontology/rule validation
- **김유찬 — Equity / IPO / CB**: KOSDAQ discount-rate sensitivity, IPO demand, IPO fundamental score, CB refinancing/put risk, integration and demo

## File structure

```text
prototype/valkyrie-v3/
├── index.html       # approved v2.6 shell
├── styles.css       # visual system + hydro-flow motion
├── data-core.js     # objects, relations, snapshots, graph runtime
├── view.js          # research workspaces, inspector, quantitative views
├── interaction.js   # signature, replay, stress, command interactions
└── README.md
```

The original uploaded prototype embedded large Chart.js/date-adapter bundles that were not used by the actual interface. Those unused bundles were intentionally removed during the rebase, and the remaining application code was split into local files for stability and maintainability. The user-visible baseline and core behavior are preserved.

## Deployment policy

- `/` remains the v2.5 stable fallback.
- `/v3/` is the current development baseline.
- GitHub Pages deploys from `main`.
- Core demo behavior must remain deterministic and local/static; external APIs are not required during the live presentation.

## Research integrity

- Relations are **predefined research ontology**, not AI-discovered causality.
- Node values and states are data/model driven.
- Replay data must disclose vintage limitations; demo snapshots may be revision-adjusted.
- Do not use `적중률` as a headline metric. Use **Decision Log** and benchmark-relative outcomes.

## Rule for future changes

Do not redesign v3 around the retired v3.2 shell. Preserve this baseline first, then add improvements incrementally with validation and browser QA after each meaningful change.
