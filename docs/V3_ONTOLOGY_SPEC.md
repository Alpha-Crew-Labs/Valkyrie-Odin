# VALKYRIE v3 — Market Ontology Specification

> **Goal:** transform separate macro, rates, IPO, and CB tools into one queryable market object model.

VALKYRIE v3 is not a collection of dashboards. It is a **Market Intelligence Ontology** where observations, models, markets, concepts, signals, decisions, and outcomes are first-class objects connected by typed relations.

## 1. Core product grammar

```text
OBSERVATION
    ↓ informs
MODEL
    ↓ forecasts / prices
MARKET
    ↓ supports / constrains
SIGNAL
    ↓ resolves_to
DECISION
    ↓ resulted_in
OUTCOME
```

Cross-asset concepts such as **Shared Duration Logic** may connect otherwise separate domains.

## 2. Object types

| Type | Meaning | Example |
| --- | --- | --- |
| `OBSERVATION` | Measured or externally observed state | KR CPI, growth nowcast |
| `MODEL` | RAVENS model output | CPI Forecast Engine, BOK Policy Path, IPO Decision Score |
| `MARKET` | Tradable / financing market state | KTB 3Y, credit spread, IPO demand |
| `CONCEPT` | Cross-asset reasoning object | Shared Duration Logic |
| `SIGNAL` | Machine / analyst decision signal | Short Duration, IPO Selective |
| `DECISION` | Human action recorded by the system | Long ↓ / Short ↑, selective IPO participation |
| `OUTCOME` | Post-decision performance / review | BM-relative outcome, D+20 review |

Node color is not the primary classifier. **Border grammar, typography, glyphs, and dossier metadata** carry type semantics.

## 3. Relation types

Relations are semantic and directional. They should explain **why an edge exists**, not merely whether two time series correlate.

Current v3 relation verbs:

- `INFORMS`
- `EXTERNALIZES`
- `PASSES_THROUGH`
- `FORECASTS`
- `CONSTRAINS`
- `PRICES`
- `TRANSMITS`
- `SHAPES`
- `DISCOUNTS`
- `SUPPORTS`
- `RESOLVES_TO`
- `RESULTED_IN`
- `DEFINES`
- `FUNDS`
- `AMPLIFIES`
- `PENALIZES`

Future relation metadata should support:

```ts
{
  type: 'PRICES',
  sign: 'POS',
  lag: '0–20D',
  confidence: 0.81,
  source: 'RAVENS MODEL',
  evidenceIds: ['...']
}
```

## 4. 정희강 — Macro Forecast Ontology

정희강의 Streamlit 기능은 별도 Macro page가 아니라 **Macro Model Objects**로 흡수한다.

```text
KR CPI ───────────────┐
US CPI ───────────────┼→ CPI FORECAST ENGINE
USD/KRW ──────────────┘          │
                                 ↓ FORECASTS
KR GROWTH ─────────────────→ BOK POLICY PATH
                                 │
                    ┌────────────┴────────────┐
                    ↓                         ↓
                  KTB 3Y                    KTB 10Y
```

### v3 objects

- `kr_cpi` — Observation
- `us_cpi` — Observation
- `growth` — Observation
- `usdkrw` — Market observation
- `cpi_model` — **CPI Forecast Engine**
- `bok_path` — **BOK Policy Path**

### Streamlit features to absorb later

- Stress Test & VaR → `STRESS` action
- Macro Clock → Temporal layer / regime object
- 3D Yield Curve → Rates Workspace drawer
- Financial Stress → Credit / market-risk objects
- Correlation Heatmap → Relation Lens
- Custom Lab → `COMPARE` action
- AI CIO Report → `BRIEF` / briefing action
- Monte Carlo → optional simulation action after scenario resolution

The Streamlit UI itself should not be embedded. Python model functions should ultimately be exposed through `quant-core` / API and return JSON to the ontology UI.

## 5. 정훈 — Rates Decision Ontology

Rates is represented as a **decision chain**, not a rates dashboard.

```text
BOK POLICY PATH ──PRICES──→ KTB 3Y
UST10Y ──TRANSMITS────────→ KTB 10Y
KTB 3Y + KTB 10Y ──SHAPES→ CURVE
KTB 3Y ──DISCOUNTS────────→ CREDIT
CURVE + CREDIT ──SUPPORTS→ SHORT DURATION
SHORT DURATION ──RESOLVES_TO→ RATES DECISION
RATES DECISION ──RESULTED_IN→ OUTCOME
```

The Decision Log is therefore not a detached table: selecting a past decision can restore the market ontology as-of that date.

## 6. 김유찬 — Equity / IPO / CB Ontology

The current IPO Market Report and CB Zero Finder become first-class market/model objects.

```text
KTB / CURVE
    ↓ DEFINES
SHARED DURATION LOGIC
    ↓ DISCOUNTS
KOSDAQ VALUATION ─────────────┐
                              │
IPO DEMAND ───── SUPPORTS ────┼→ IPO DECISION SCORE
FUNDING QUALITY ─ PENALIZES ──┤
CB REFIXING / PUT ─ PENALIZES ┘
                              ↓
                         IPO SELECTIVE
                              ↓
                         IPO DECISION
                              ↓
                            OUTCOME
```

### v3 objects

- `kosdaq_val` — equity duration / valuation market object
- `funding_quality` — loss-making / debt-dependence observation
- `cb_refix` — **CB Zero Finder** market-risk object
- `ipo_demand` — **IPO Market Report** demand object
- `ipo_score` — IPO Decision Score model object
- `ipo_signal` — IPO Selective signal
- `ipo_decision` — analyst action
- `ipo_outcome` — post-listing outcome tracking

## 7. Cross-asset ontology

The key differentiator is that team domains are **not separated by pages**.

Current cross-asset concept:

```text
KTB 10Y / CURVE
       ↓
SHARED DURATION LOGIC
       ↓
KOSDAQ VALUATION
       ↓
IPO SCORE
```

Future concept candidates:

- Liquidity
- Risk Appetite
- Funding Conditions
- Earnings Quality
- Refinancing Wall

Only introduce a concept if it genuinely connects multiple domains and has evidence.

## 8. Main shell

```text
┌───────────────┬───────────────────────────────────────┬────────────────────┐
│ DATA LAYERS   │            MARKET ONTOLOGY            │ OBJECT DOSSIER     │
│ SCENARIO      │                                       │ Evidence           │
│ VIEW          │             Object Graph              │ Relations          │
│ SEARCH        │                                       │ Model / Vintage    │
│               │                                       │ Actions            │
├───────────────┴───────────────────────────────────────┴────────────────────┤
│ TEMPORAL LAYER                                      ACTIVITY STREAM        │
└────────────────────────────────────────────────────────────────────────────┘
```

- **Left = what exists / what is visible**
- **Center = how everything is connected**
- **Right = what the selected object means and what the user can do**
- **Bottom = how the system changed through time**

## 9. Action semantics

### TRACE
Focus upstream, downstream, or one-hop relations. Non-relevant objects recede.

### STRESS
Apply a scenario patch and propagate visual / decision changes through impacted objects.

### COMPARE
Compare current object state with a previous temporal snapshot.

### REPLAY
Restore historical snapshots and Decision Objects across time.

### ASK VALKYRIE
Future state: LLM tool-calling over graph actions. Current prototype is explicitly labeled as a deterministic Graph Operator.

Proposed tools:

```text
focus_object
trace_relation
run_stress
set_scenario
compare_snapshot
open_workspace
show_evidence
open_decision_log
```

## 10. v3 acceptance criteria

A judge should understand the system without a verbal explanation:

1. Objects are visibly different from charts/cards.
2. Relations have semantic verbs.
3. Selecting an object changes the dossier.
4. TRACE makes causality inspectable.
5. STRESS changes multiple domains together.
6. Temporal replay restores historical market state.
7. Macro → Rates → Equity is one connected decision graph.
8. Team members' models/tools appear as ontology objects, not embedded websites.
9. Motion represents state, propagation, or time — not decoration.
10. The deterministic prototype never pretends to be a general LLM.
