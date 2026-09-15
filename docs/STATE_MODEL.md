# VALKYRIE State & Interaction Contract

This document defines the shared state model that keeps VALKYRIE behaving like one operating system rather than several independent dashboards.

## Core rule

A user action should resolve through one canonical state before the UI reacts.

```text
USER / COMMAND / REPLAY / QUANT ACTION
            ↓
       CANONICAL STATE
            ↓
 ┌──────────┼───────────┬───────────┐
 GRAPH    INSPECTOR   WORKSPACE   SIGNAL
            ↓
        DECISION LOG
```

No domain module should maintain a contradictory private copy of the current snapshot, selected object, or market mode.

## Canonical state

Target shape:

```ts
type Domain = 'MACRO' | 'RATES' | 'EQUITY'
type Mode = 'LIVE' | 'REPLAY' | 'SCENARIO'
type ObjectState = 'OK' | 'ALERT' | 'RISK'

interface ValkyrieState {
  asOf: string
  dataVintage: string
  mode: Mode
  selectedObjectId: string | null
  activeDomain: Domain
  activePathIds: string[]
  snapshotId: string
  replaying: boolean
  scenarioId: string | null
  marketStatus: 'NEUTRAL' | 'CAUTION' | 'RISK-OFF'
  conflict: boolean
  objects: Record<string, MarketObject>
  signals: Record<string, TerminalSignal>
}
```

The current vanilla-JS prototype implements a smaller version through `cur`, `sel`, `curTab`, `replaying`, `SNAPS`, and derived graph state. Migration to React/Next.js should normalize these into one store rather than reproducing them independently in components.

## Market object contract

Each object should eventually normalize to:

```ts
interface MarketObject {
  id: string
  domain: Domain
  label: string
  value: number | string
  unit?: string
  change?: string
  state: ObjectState
  owner: string
  confidence?: number
  evidence: EvidenceItem[]
  analystView?: string
  source?: DataSourceMeta
}
```

## Evidence contract

```ts
interface EvidenceItem {
  id: string
  label: string
  value: string
  importance: 'HIGH' | 'MED' | 'LOW'
  sourceObjectId?: string
  source?: DataSourceMeta
}
```

Evidence should explain a signal. It should not be decorative metadata.

## Terminal signal contract

```ts
interface TerminalSignal {
  id: string
  domain: Domain
  title: string
  direction: string
  confidence: number
  state: ObjectState
  evidenceIds: string[]
  generatedAt: string
}
```

Terminal Signals are conclusions. They should never be updated independently from the evidence/state that produced them.

## Action model

All future interactions should map to explicit system actions.

### `SELECT_OBJECT`

Input:

```ts
{ type: 'SELECT_OBJECT', objectId: 'rat_ktb' }
```

Expected reaction:

1. acquire object;
2. compute related causal path;
3. dim unrelated objects;
4. update Inspector;
5. switch/focus owner workspace;
6. focus related chart/table evidence;
7. preserve terminal signal context.

### `SET_SNAPSHOT`

Input:

```ts
{ type: 'SET_SNAPSHOT', snapshotId: '2026-05-04' }
```

Expected reaction:

- Mode → `REPLAY`
- AS-OF changes
- all object values/states resolve from the selected snapshot
- signals resolve from the same snapshot
- Decision Log focuses the matching date
- Inspector re-resolves for the selected object
- visible values transition rather than hard reload

### `RUN_SIGNATURE`

Purpose: deterministic product showcase.

This is an orchestration action over canonical state, not a separate animation-only mode.

Expected sequence:

```text
MACRO SHOCK
→ RATES TRANSMISSION
→ CROSS-ASSET TRANSMISSION
→ EQUITY DECISION
→ SHARED DURATION LOGIC
→ DECISION GRAPH RESOLVED
```

### `RUN_STRESS`

Target input:

```ts
{
  type: 'RUN_STRESS',
  shocks: {
    ust10yBp: 50,
    vix: 8,
    hySpreadBp: 40
  }
}
```

Expected reaction:

```text
Quant Engine
→ normalized scenario state
→ affected objects
→ evidence
→ terminal signals
→ Inspector / workspace
```

Scenario values must not overwrite the base LIVE snapshot.

### `RESET`

Reset must always return the product to a known deterministic state.

Recommended default:

- latest bundled snapshot
- mode `LIVE`
- RATES terminal signal selected
- no scenario override
- no stale animation timers

## Derived state, not duplicated state

The following should be derived whenever possible:

- active causal edges from `selectedObjectId + ontology`
- market status from object alert/risk rules
- conflict flag from signal rules
- domain focus from selected object owner/domain
- Inspector evidence from selected object
- confidence bar from terminal/object confidence

Avoid storing separate booleans for every visual highlight.

## Quant Engine boundary

Python/Quant functions should return normalized values, not HTML or presentation-specific chart objects.

Example response:

```json
{
  "scenario_id": "stress_ust50_vix8_hy40",
  "as_of": "2026-09-30",
  "changes": {
    "rat_ust10": {"value": 4.55, "state": "RISK"},
    "rat_curve": {"value": 12, "state": "ALERT"},
    "eq_val": {"value": 862, "state": "RISK"}
  },
  "signals": {
    "sig_rates": {
      "title": "SHORT DURATION",
      "confidence": 87,
      "state": "RISK"
    }
  }
}
```

The web layer owns animation and presentation.

## Replay integrity

Replay must preserve a visible distinction between:

- `LIVE`
- `REPLAY · REVISION-ADJUSTED`
- future true Point-in-Time data
- `SCENARIO`

Never present revised historical values as if they were known at the original date without disclosure.

## Interaction invariant

The product should pass this test:

> If a user clicks one object, can they immediately see **what changed, why it matters, where the effect propagates, what the resulting decision is, and what happened historically?**

If not, the feature is probably still behaving like a dashboard widget rather than a VALKYRIE system action.
