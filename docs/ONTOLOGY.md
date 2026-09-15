# VALKYRIE Ontology — Current v2 Reference

This document records the current v2 prototype ontology so UI refactors do not accidentally change financial logic.

## Objects

### MACRO

| ID | Label | Owner |
|---|---|---|
| `mac_bei` | 기대인플레·WTI | 정희강 |
| `mac_uscpi` | US CPI | 정희강 |
| `mac_fed` | FED 인하경로 | 정희강 |
| `mac_krcpi` | KR CPI · 자체모델 | 정희강 |
| `mac_bok` | BOK 기준금리 | 정희강 |
| `sig_macro` | Macro Terminal Signal | 정희강 |

### RATES

| ID | Label | Owner |
|---|---|---|
| `rat_ust10` | UST 10Y | 정훈 |
| `rat_ktb` | 국고 3Y / 10Y | 정훈 |
| `rat_curve` | 2s10s 커브 | 정훈 |
| `rat_credit` | 크레딧 AA- 3Y | 정훈 |
| `sig_rates` | Rates Terminal Signal | 정훈 |

### EQUITY

| ID | Label | Owner |
|---|---|---|
| `eq_fin` | 적자·차입 구조 | 김유찬 |
| `eq_val` | 코스닥 밸류·할인율 | 김유찬 |
| `eq_cb` | CB 조달 · 풋 | 김유찬 |
| `eq_demand` | IPO 수요예측 | 김유찬 |
| `sig_equity` | Equity Terminal Signal | 김유찬 |

Total current objects: **16**.

## Current v2 explicit relations

| Edge | From | To | Sign |
|---|---|---|---|
| e01 | 기대인플레·WTI | US CPI | POS |
| e02 | US CPI | FED 인하경로 | POS |
| e03 | FED 인하경로 | UST 10Y | POS |
| e04 | FED 인하경로 | BOK 기준금리 | POS |
| e05 | KR CPI · 자체모델 | BOK 기준금리 | POS |
| e06 | BOK 기준금리 | Macro Signal | POS |
| e07 | KR CPI · 자체모델 | Macro Signal | POS |
| e08 | BOK 기준금리 | 국고 3Y / 10Y | POS |
| e09 | BOK 기준금리 | 2s10s 커브 | POS |
| e10 | UST 10Y | 국고 3Y / 10Y | POS |
| e11 | 국고 3Y / 10Y | 2s10s 커브 | POS |
| e12 | 국고 3Y / 10Y | 크레딧 AA- 3Y | POS |
| e13 | 2s10s 커브 | Rates Signal | POS |
| e14 | 국고 3Y / 10Y | Rates Signal | POS |
| e15 | 크레딧 AA- 3Y | Rates Signal | POS |
| e16 | 국고 3Y / 10Y | 코스닥 밸류·할인율 | NEG |
| e17 | 크레딧 AA- 3Y | CB 조달 · 풋 | POS |
| e18 | 적자·차입 구조 | 코스닥 밸류·할인율 | POS |
| e19 | 코스닥 밸류·할인율 | CB 조달 · 풋 | POS |
| e20 | CB 조달 · 풋 | Equity Signal | POS |
| e21 | 적자·차입 구조 | IPO 수요예측 | POS |
| e22 | IPO 수요예측 | Equity Signal | POS |

Current v2 explicit edge count: **22**.

## Important unresolved point

Earlier planning material referenced **23 ontology relations**, while the current v2 build implements **22 explicit edges**.

Do not silently add or remove an edge only to make the counts match.

Before changing this ontology:

1. identify the intended missing/removed relationship
2. confirm the financial rationale with the relevant domain owner
3. document the change in the PR
4. update this file and affected sample snapshots

## Shared Duration Logic

`SHARED DURATION LOGIC` is a conceptual cross-asset link between the RATES and EQUITY terminal areas.

It is **not automatically equivalent to another causal edge**.

Its role is to communicate the shared thesis:

> Higher discount rates pressure long-duration bond exposure and long-duration equity/IPO valuations through related but distinct mechanisms.

Do not count this visual/conceptual bridge as a causal edge unless the team explicitly decides to model it as one.

## Ontology vs Correlation

Future Correlation Lens functionality must not overwrite ontology semantics.

Use a clear distinction:

```text
ONTOLOGY = team-defined causal/reasoning relationship
CORRELATION LENS = observed statistical co-movement
```

Correlation may change edge emphasis/overlay, but should not create causal claims.

## Change control

Any ontology change should include:

- old relationship
- new relationship
- rationale
- affected signals
- affected snapshots/replay
- domain-owner review

This document should remain the canonical human-readable reference until the ontology is moved into a typed schema/code definition.