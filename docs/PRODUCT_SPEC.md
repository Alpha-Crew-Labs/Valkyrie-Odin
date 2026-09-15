# VALKYRIE Product Specification

## 1. Product definition

VALKYRIE is a **Research Intelligence & Decision System** that connects macro, rates and equity research into a single operating surface.

It is not a dashboard collection. The product must make the causal chain visible:

```text
Data → Evidence → Signal → Action → Post-performance
```

Operating loop:

```text
SEE → CONNECT → DECIDE → ACT → LEARN
```

## 2. Primary user

Institutional investment professionals who need to move quickly from market change to portfolio implication while preserving evidence and prior judgment.

## 3. Core problem

- Macro, rates and equity research are fragmented across tools and files.
- Analysts manually collect data, update tables and write recurring commentary.
- Signals lose timing while being converted into reports, webinars or videos.
- Historical calls are not systematically replayed and evaluated.
- Existing research infrastructure is underused when useful connected content is missing.

## 4. Product thesis

VALKYRIE should make one market shock understandable across asset classes.

Example thesis:

> A rate shock propagates through bonds and long-duration equity using the same discount-rate logic.

This is represented through a fixed ontology, evidence inspector, terminal signals, domain workspaces and replay.

## 5. Core surfaces

### Intelligence Chain

Three lanes:

- MACRO
- RATES
- EQUITY

Right boundary:

- Macro terminal signal
- Rates terminal signal
- Equity terminal signal

Cross-asset concept:

- `SHARED DURATION LOGIC`

### Inspector

For the selected object:

- current value/state
- owner/domain
- evidence
- confidence
- analyst view
- model metadata
- data vintage

### VALKYRIE Command

Command-line interaction, not chat UI.

A query should manipulate the system itself:

```text
Query
→ identify relevant objects
→ trace relations
→ focus evidence
→ resolve signal
→ activate workspace
```

### Domain Workspaces

#### MACRO

- CPI / policy-rate model
- scenario matrix
- macro regime / clock
- financial stress inputs
- stress assumptions

#### RATES

- curve regime
- duration signal
- yield-curve visualization
- Decision Log
- benchmark-relative post-performance

#### EQUITY

- IPO market report
- IPO selectivity
- financing / CB risk
- discount-rate sensitivity

### Replay

Replay restores a historical snapshot and makes the entire system react together.

Must update:

- values
- states
- active signals
- market status
- workspace context
- Decision Log focus
- data-vintage label

## 6. Object actions

Rather than adding many disconnected tabs, expose capabilities as actions on objects.

Preferred actions:

```text
INSPECT
COMPARE
CORRELATE
STRESS
SIMULATE
REPLAY
BRIEF
```

Example:

```text
UST10Y → STRESS +50bp
        → KTB reprices
        → curve regime updates
        → rates terminal signal changes
        → KOSDAQ discount-rate sensitivity updates
        → equity selectivity signal changes
```

## 7. Quant integration priorities

### S tier

1. Stress Test & VaR
2. Macro Clock
3. 3D Yield Curve
4. Financial Stress Monitor

### A tier

5. Correlation Lens
6. Custom Compare Lab
7. AI CIO / Briefing

### B tier

8. Monte Carlo
9. Global 3D Globe

The 3D globe is visually impressive but should not outrank features that strengthen the investment-decision loop.

## 8. Motion principles

The screen should feel alive even when idle.

Ambient motion:

- slow data field
- causal edge flow
- live clock
- heartbeat
- system activity

Event motion:

- causal propagation
- signal lock
- replay rewind
- command resolution
- conflict detection

Motion must preserve attention hierarchy.

## 9. Research integrity

- Ontology relationships are predefined by the team.
- Data changes state; it does not fabricate financial causality.
- Quantitative output should be deterministic when possible.
- Revised data must be labeled; practical validation requires PIT data.
- Use Decision Log and benchmark-relative performance rather than vague 'hit rate'.
- Demo/sample data must be explicitly labeled.

## 10. Demo success criteria

Within 30–60 seconds, a judge should understand:

1. what changed in the market
2. how that change propagates
3. what the system concludes
4. what action is implied
5. how previous decisions can be replayed and evaluated

The ideal reaction:

> “This looks like an actual institutional operating system, not a hackathon dashboard.”

## 11. MVP success state

The MVP is complete when:

- one macro shock can propagate through rates and equity
- terminal signals are visually obvious
- Inspector and workspace stay synchronized
- Replay changes the entire state coherently
- at least one Quant Engine action changes the ontology state
- the full demo can run without external-network dependency
- no confidential data or secrets are stored in the public repository
