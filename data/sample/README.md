# data/sample

Public/demo-safe data only.

Allowed:

- public economic/market data
- synthetic data
- anonymized examples
- deterministic demo fixtures

Not allowed:

- confidential Hanwha Asset Management data
- unpublished research
- client/account/position data
- credentials or internal-system exports

Sample data should be shaped as closely as possible to the normalized VALKYRIE state so the same UI can swap between demo fixtures and approved live adapters.

Recommended pattern:

```text
sample/
  current.json
  stress-rates-up.json
  stress-easing.json
  macro-clock.json
```

Every dataset should include provenance/state metadata such as:

```json
{
  "mode": "SAMPLE",
  "as_of": "2026-09-30",
  "vintage": "REVISION-ADJUSTED"
}
```
