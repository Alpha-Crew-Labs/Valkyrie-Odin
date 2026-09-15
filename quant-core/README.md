# quant-core

Deterministic quantitative logic used by VALKYRIE.

## Responsibilities

Candidate modules:

```text
macro_clock.py
stress_test.py
financial_stress.py
yield_curve.py
correlation.py
monte_carlo.py
```

## Principle

Quant code produces calculations and normalized outputs. It does not own the final UI.

```text
model / calculation
      ↓
normalized result
      ↓
VALKYRIE state
```

## Requirements

- deterministic where possible
- explicit assumptions
- stable input/output contracts
- testable without the UI
- sample/demo fixtures available
- no secrets in source code
- no confidential raw internal datasets in this public repository

## Integration

For the hackathon, JSON export is acceptable and often preferred for reliability.

Later, the same functions may be exposed through an API adapter.

See `../docs/QUANT_INTEGRATION.md`.