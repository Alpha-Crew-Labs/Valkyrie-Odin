# VALKYRIE v3 Prototype

**Market Ontology Command Center** — an object-first evolution of VALKYRIE v2.5.

## What changed from v2.5

- Full-screen ontology becomes the primary workspace.
- Left rail controls Data Layers, Scenario, View Mode, and Object Search.
- Right-side **Object Dossier** combines evidence, relations, provenance, and actions.
- Objects now have semantic types: Observation / Model / Market / Concept / Signal / Decision / Outcome.
- Relations use verbs such as `FORECASTS`, `PRICES`, `DISCOUNTS`, `SUPPORTS`, and `RESOLVES_TO`.
- 정희강 Macro Forecast, 정훈 Rates Decision, and 김유찬 IPO/CB functions are modeled inside one cross-asset graph.
- TRACE, STRESS, COMPARE, REPLAY, and deterministic Graph Operator interactions manipulate the same ontology state.
- Domain analytics open as a Workspace Drawer instead of persistent dashboard tabs.

## Demo interactions

1. Select **BOK POLICY PATH** and press `TRACE`.
2. Switch TRACE between `DOWNSTREAM`, `UPSTREAM`, and `1-HOP`.
3. Click **HAWKISH** scenario: impacted objects propagate through Rates → Duration → KOSDAQ → IPO.
4. Click a temporal point such as **MAY 04** to restore the historical graph state.
5. Select **IPO DECISION SCORE** and open `WORKSPACE`.
6. Press `⌘ ASK VALKYRIE` and run `CPI +0.4%p → IPO`.

## Important prototype disclosure

`ASK VALKYRIE` is currently a **deterministic Graph Operator**, not a general-purpose LLM. It is deliberately labeled as such. The intended next layer is LLM tool-calling over explicit graph actions (`focus_object`, `trace_relation`, `run_stress`, etc.).

All bundled values are sample / demo states until connected to approved data and `quant-core`.
