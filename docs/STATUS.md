# Project Status

_Last updated: 2026-09-15_

## Current state

VALKYRIE now has three deliberately separated prototype lines:

```text
prototype/valkyrie-v2/      regression / behavior reference
prototype/valkyrie-v2.5/    stable GitHub Pages fallback at /
prototype/valkyrie-v3/      active development baseline at /v3/
```

The **active v3 source of truth has been rebased on the user-approved `VALKYRIE v2.6 — Research Intelligence System` prototype.** The previous v3.2 ontology-command-center experiment is retired and its runtime files have been removed.

## Active v3 baseline

```text
prototype/valkyrie-v3/
├── index.html
├── styles.css
├── data-core.js
├── view.js
├── interaction.js
└── README.md
```

The uploaded v2.6 prototype originally bundled large Chart.js/date-adapter payloads that were not used by the actual interface. Those unused libraries were removed during the rebase; the visible research OS and custom interactions were preserved and split into local files for maintainability and Pages reliability.

### Core v3 invariants

- 16 research objects
- 22 predefined causal relations
- 5 deterministic temporal snapshots
- 3 terminal signals: Macro / Rates / Equity
- Hydro-flow causal edges
- Shared Duration Logic
- Evidence / Confidence / Data Vintage inspector
- deterministic Stress presets
- cinematic RUN SIGNATURE
- temporal REPLAY
- Decision Log with benchmark-relative framing
- IPO MARKET REPORT
- CB ZERO FINDER
- local/static demo path with no required external API call

## Team-domain mapping

| Domain | Owner | Active research assets |
|---|---|---|
| MACRO | 정희강 | GDP Nowcast, CPI model, Fed/BOK path, Taylor Rule, Financial Stress, Stress Test & VaR |
| RATES | 정훈 | UST/KTB, curve, credit spread, duration signal, Decision Log, ontology/rule validation |
| EQUITY | 김유찬 | KOSDAQ discount-rate sensitivity, IPO demand, IPO score, CB refinancing/put risk, integration/demo |

The product story remains:

```text
MACRO SHOCK
→ RATES / CREDIT TRANSMISSION
→ SHARED DURATION / FUNDING LOGIC
→ EQUITY / IPO / CB DECISION
→ DECISION LOG / REPLAY
```

## Validation

GitHub Actions validates v2, v2.5, and the rebased v3.

v3 validation covers:

- required files
- JavaScript syntax
- local-only asset/CSP contract
- exactly 16 unique objects
- exactly 22 causal relations
- exactly 5 snapshots
- team-owner coverage
- `rat_credit → eq_cb` cross-domain funding relation
- Shared Duration concept link
- Hydro Flow animation contract
- deterministic Stress presets
- Signature / Replay / Command interactions
- Decision Log / IPO / CB / Data Vintage / PIT surfaces
- static DOM/runtime ID integrity

Validation entry points:

```text
scripts/validate_prototype.mjs
scripts/validate_v25.mjs
scripts/validate_v3.mjs
.github/workflows/prototype-validation.yml
```

## GitHub Pages

Pages is active and deployed through:

```text
.github/workflows/pages.yml
```

Routes:

```text
/       → prototype/valkyrie-v2.5/
/v3/    → prototype/valkyrie-v3/
```

Public URLs:

```text
https://alpha-crew-labs.github.io/Valkyrie-Odin/
https://alpha-crew-labs.github.io/Valkyrie-Odin/v3/
```

The root v2.5 route remains the safe fallback. All new product/UI work should target `/v3/` and preserve the v2.6 baseline unless a deliberate replacement decision is made.

## Research integrity

- Ontology relations are predefined research relationships; do not describe them as AI-discovered causality.
- Node values, states, signals, scenarios, and model outputs may be data/model driven.
- Quant calculations and LLM synthesis must remain distinguishable.
- Replay must disclose revision/PIT limitations.
- Do not use `적중률` as a headline metric. Use **Decision Log** and benchmark-relative outcomes.
- Public repository data must remain synthetic, public, or explicitly safe to publish.

## Quant boundary

Preferred architecture:

```text
정희강 Quant Engine / Python
→ normalized state / JSON
→ VALKYRIE state
→ Ontology / Evidence / Stress / Replay
→ Cross-Asset Signal
→ Decision / Decision Log
```

Do not make Streamlit iframe embedding the final product experience. Integrate calculations and normalized outputs into VALKYRIE.

## Next improvements

Build incrementally on the rebased v2.6 baseline:

1. preserve and refine the Hydro Flow / causal readability
2. connect 정희강 Quant Stress calculations to the existing Stress interaction
3. merge Macro Clock semantics into temporal Replay
4. deepen 정훈 Decision Log with verified signal rules and benchmark data
5. connect 김유찬 IPO/CB data contracts without turning them into isolated dashboards
6. upgrade Command into a UI-operating agent only after deterministic demo actions are stable
7. run final 1920×1080 / 1440×900 / 1366×768 browser QA

## Repository / product risk

The largest product risk remains feature accumulation without integration. New functionality should normally enter through:

```text
OBJECT / EVENT
→ RELATION / TRANSMISSION
→ EVIDENCE
→ SIGNAL
→ DECISION
→ REPLAY / OUTCOME
```

rather than another isolated dashboard tab.
