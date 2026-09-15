# Team Workstreams

## Platform / Integration — 김유찬

Primary responsibilities:

- VALKYRIE shell
- Intelligence Chain integration
- EQUITY workspace
- state synchronization
- motion/visual integration
- deployment/demo integration

Typical branches:

```text
feat/platform-*
feat/equity-*
feat/motion-*
```

## MACRO / Quant — 정희강

Primary responsibilities:

- CPI / policy-rate model
- macro regime / Macro Clock
- stress-test logic
- financial-stress inputs
- Quant Engine outputs/contracts

Typical branches:

```text
feat/macro-*
feat/quant-*
```

## RATES — 정훈

Primary responsibilities:

- yield curve / duration logic
- rates signal
- Decision Log
- benchmark-relative post-performance
- 3D/2D curve analytics

Typical branches:

```text
feat/rates-*
feat/decision-log-*
```

## Shared ownership

The following require cross-review because they affect product logic:

- ontology edge changes
- terminal-signal rules
- confidence methodology
- Replay assumptions
- performance calculations
- shared data schema
- demo narrative

## Integration rule

A domain feature is not complete when its standalone panel works.

It is complete when it participates in the VALKYRIE loop:

```text
OBJECT
→ EVIDENCE
→ RELATION
→ SIGNAL
→ WORKSPACE
→ REPLAY / TRACK RECORD
```
