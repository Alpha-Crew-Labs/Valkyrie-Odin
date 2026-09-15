# Quant Engine Integration

## Goal

Integrate the existing Quant Macro Terminal capabilities into VALKYRIE **without embedding Streamlit as a visually separate application**.

The Streamlit project is treated as a source of models, calculations and useful visual concepts. VALKYRIE remains the unified operating surface.

## Principle

```text
Quant calculation
      ↓
Normalized result/state
      ↓
VALKYRIE object model
      ↓
Ontology propagation
      ↓
Inspector / Workspace / Signal / Replay
```

A calculation is valuable only when its output changes the decision system.

## Priority 1 — Stress Test & VaR

### Inputs

- UST / policy-rate shock
- VIX shock
- HY / credit-spread shock
- optional portfolio or duration assumptions

### Expected output contract

```json
{
  "scenario_id": "stress_001",
  "as_of": "2026-09-30",
  "inputs": {
    "ust10y_bp": 50,
    "vix_points": 8,
    "hy_spread_bp": 40
  },
  "objects": {
    "rat_ust10": {"value": 4.60, "state": "RISK"},
    "rat_ktb": {"value": 3.05, "state": "ALERT"},
    "rat_curve": {"regime": "BEAR_FLAT", "state": "RISK"},
    "eq_val": {"discount_rate_pressure": "HIGH", "state": "RISK"}
  },
  "signals": {
    "rates": {"label": "SHORT DURATION", "confidence": 87},
    "equity": {"label": "IPO SELECTIVITY", "confidence": 81}
  }
}
```

The exact schema can evolve, but VALKYRIE should receive normalized state rather than raw Streamlit UI output.

### UX

Object action:

```text
UST10Y → STRESS
```

The user changes assumptions, then the whole ontology reacts.

Do not show a disconnected stress-test page as the final experience.

## Priority 2 — Macro Clock

Macro Clock should become part of **VALKYRIE's time/regime layer**, not another permanent tab.

Suggested regime states:

- Goldilocks
- Reflation
- Stagflation
- Disinflation / slowdown

Replay synchronization:

```text
Timeline scrub
→ macro-clock point moves
→ macro node states change
→ rates/equity consequences change
→ terminal signals update
```

## Priority 3 — 3D Yield Curve

Use as a detail action on `rat_curve` or `rat_ktb`.

```text
CURVE OBJECT
→ EXPAND SURFACE
```

Preferred axes:

- X: maturity
- Y: time
- Z: yield

Overlay or annotate regime transitions when credible:

- bear flattening
- bear steepening
- bull flattening
- bull steepening

The 3D chart should remain an analytical surface, not decorative 3D.

## Priority 4 — Financial Stress

Normalize stress indicators into evidence objects.

Candidate inputs from the existing terminal:

- VIX
- NFCI
- HY spread
- BAA spread

Potential outputs:

- financial-stress state
- credit-risk state
- equity funding pressure
- confidence modifier for terminal signals

Avoid double-counting correlated inputs when calculating confidence.

## Correlation Lens

Correlation should act as a **lens on the ontology**.

Example:

```text
Select US CPI
→ CORRELATE
→ show rolling correlation to UST10Y / KTB / KOSDAQ / HY / IPO demand
→ adjust edge emphasis in the visualization
```

Important: correlation is not causation. The UI must distinguish:

- predefined ontology relationship
- observed historical correlation

Suggested label:

`RELATION = ONTOLOGY` vs `LENS = CORRELATION`

## Custom Compare Lab

Object-to-object action:

```text
SELECT A
SELECT B
→ COMPARE
```

Output:

- normalized dual-axis series
- rolling correlation
- lead/lag optional later
- date-range control

This should be reusable for any compatible pair of objects.

## Monte Carlo

Monte Carlo should support a scenario rather than become a standalone destination.

Possible use:

```text
Scenario resolved
→ SIMULATE
→ distribution of 1Y outcomes
→ downside probability / recovery probability
```

Do not present Monte Carlo precision as certainty. Inputs and assumptions must be visible.

## AI CIO / Briefing

Quant outputs are evidence for the briefing engine.

Preferred pipeline:

```text
Current system state
+ selected evidence
+ terminal signals
+ scenario assumptions
+ Decision Log context
       ↓
LLM synthesis
       ↓
brief / script / presentation narrative
```

The LLM should not overwrite the source calculations.

## Transport choices

### Hackathon-fast path

Static or generated JSON:

```text
quant-core
→ export JSON
→ VALKYRIE loads snapshot
```

Advantages:

- deterministic
- no network risk
- easy demo fallback

### Integrated path

FastAPI:

```text
POST /scenario/stress
GET  /macro-clock
GET  /yield-curve
POST /correlation
POST /monte-carlo
GET  /financial-stress
```

Use only when the extra runtime complexity is justified.

## Data adapter boundary

Frontend components should not depend directly on FRED/ECOS/other provider response shapes.

Use:

```text
Provider → adapter → VALKYRIE normalized object
```

This allows demo snapshots and live data to use the same UI.

## Integration definition of done

A Quant feature is integrated only if:

1. it uses a normalized data contract
2. it changes or enriches a VALKYRIE object/evidence/signal
3. it is reachable from the relevant object or system action
4. its assumptions are visible
5. sample/live state is labeled
6. a static fallback can reproduce the core demo
