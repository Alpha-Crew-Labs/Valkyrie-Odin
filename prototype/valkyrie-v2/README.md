# VALKYRIE v2 Reference Prototype

This directory contains the current **runnable interaction reference** for VALKYRIE.

It is intentionally framework-light. The purpose is to preserve the product behavior, motion language, and deterministic demo flow while the production app evolves under `apps/valkyrie-web/`.

## Run locally

From the repository root:

```bash
cd prototype/valkyrie-v2
python -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

Opening `index.html` directly may work in some browsers, but a local HTTP server is the supported development path because the prototype loads local JS modules as separate files under a restrictive Content Security Policy.

## File map

```text
prototype/valkyrie-v2/
├─ index.html     # semantic shell / DOM structure
├─ styles.css     # visual system + motion primitives
├─ data.js        # ontology, evidence, snapshots, Decision Log
├─ system.js      # graph renderer, Inspector, workspace renderer
├─ runtime.js     # Replay, Command, Signature, input/event behavior
└─ README.md
```

### Ownership guidance

- **Macro / 정희강**: macro objects, macro evidence, scenario matrix, macro model outputs
- **Rates / 정훈**: rates objects, curve/credit evidence, terminal signal, Decision Log
- **Equity / 김유찬**: equity objects, IPO/CB logic, integration shell and product interaction
- **Platform / shared**: causal propagation, Replay, Command, motion grammar, state synchronization

Do not make large unrelated edits across all files in one commit unless the change is a deliberate platform refactor.

## Current reference behavior

The prototype currently demonstrates:

- cinematic boot sequence
- 16-object / 22-relation fixed ontology
- MACRO → RATES → EQUITY causal propagation
- terminal signals
- ambient Canvas data field
- cursor telemetry and target acquisition brackets
- rolling market values
- Evidence / Confidence / Analyst View Inspector
- automatic domain workspace switching
- deterministic Command examples
- RUN SIGNATURE showcase
- 5-snapshot temporal Replay
- Decision Log / benchmark-relative post-performance
- sample-data and revision-adjusted vintage disclosure

## Demo / debugging API

For reproducible demos and future browser tests, the prototype exports a small global API:

```js
VALKYRIE.state()
VALKYRIE.select('mac_uscpi')
VALKYRIE.goSnap(0, true)
VALKYRIE.switchTab('RATES')
VALKYRIE.runSignature()
VALKYRIE.reset()
```

The production implementation should preserve the **behavioral contract**, not necessarily these exact global functions.

## Data warning

Everything committed in this public repository must remain public-safe.

This reference prototype uses **sample / synthetic / presentation-safe data**. Do not replace `data.js` with confidential Hanwha Asset Management data, unpublished internal research, customer information, credentials, or licensed restricted datasets.

Internal adapters should normalize approved data into the same state contract outside the public repository.

## Reference vs production

This prototype is the product-behavior baseline, not the final architecture.

When moving functionality into `apps/valkyrie-web/`:

1. preserve the ontology and interaction semantics;
2. preserve deterministic demo fallback;
3. keep Quant calculations separate from UI rendering;
4. keep one shared state model across Graph / Inspector / Workspace / Signal / Replay;
5. validate against `docs/DEMO_QA.md` before replacing reference behavior.

Do not delete this reference implementation until the production app has feature parity for the core demo path.
