# VALKYRIE Architecture

## 1. Product model

VALKYRIE는 여러 분석 앱을 iframe으로 모아 놓는 포털이 아니라, 하나의 **Research Intelligence Operating System**으로 동작하는 것을 목표로 합니다.

핵심 흐름:

```text
DATA
  ↓
OBJECTS
  ↓
ONTOLOGY / RELATIONS
  ↓
EVIDENCE
  ↓
SIGNALS
  ↓
ACTIONS
  ↓
DECISION LOG
  ↓
REPLAY / LEARNING
```

## 2. UX model

```text
                 ┌─ Inspect
                 ├─ Compare
                 ├─ Correlate
Object → Ontology├─ Stress
                 ├─ Simulate
                 ├─ Replay
                 └─ Brief
                       ↓
                    Signal
                       ↓
                    Action
                       ↓
                 Track Record
```

하나의 Object를 선택했을 때 Graph, Inspector, Workspace, Chart, Terminal Signal이 함께 반응하는 구조를 우선합니다.

## 3. Frontend

권장 최종 구조:

```text
apps/valkyrie-web/
├─ app/
├─ components/
│  ├─ intelligence-chain/
│  ├─ inspector/
│  ├─ command/
│  ├─ replay/
│  └─ hud/
├─ modules/
│  ├─ macro/
│  ├─ rates/
│  └─ equity/
├─ lib/
│  ├─ ontology/
│  ├─ signals/
│  ├─ replay/
│  └─ adapters/
└─ public/
```

### Visualization layers

- HTML/CSS: shell / panels / tables
- SVG: ontology / causal edges / signal paths
- Canvas: ambient data field / pulse / lightweight particles
- Chart library: time series / heatmap / curve
- WebGL/3D: 필요할 때만 yield surface 등 의미 있는 분석에 제한적으로 사용

## 4. Quant layer

정희강의 QUANT MACRO TERMINAL PRO에서 계산 로직을 UI와 분리합니다.

```text
quant-core/
├─ macro_clock.py
├─ stress_test.py
├─ monte_carlo.py
├─ correlation.py
├─ yield_curve.py
└─ financial_stress.py
```

Streamlit은 Quant 기능 검증/실험 환경으로 유지할 수 있지만, 최종 VALKYRIE UI에는 Streamlit 화면을 iframe으로 직접 삽입하지 않는 것을 권장합니다.

## 5. Optional API

Python 계산이 브라우저 외부에서 필요할 경우:

```text
quant-api/
└─ FastAPI
```

예상 interface:

```text
POST /scenario/stress
POST /simulation/monte-carlo
POST /analysis/correlation
GET  /macro-clock
GET  /yield-curve
GET  /financial-stress
```

API response는 UI와 독립적인 JSON schema로 유지합니다.

## 6. Shared domain schema

예시:

```json
{
  "asOf": "2026-09-30T09:00:00+09:00",
  "objectId": "rat_ktb",
  "domain": "RATES",
  "label": "KTB 3Y / 10Y",
  "value": {
    "3Y": 2.62,
    "10Y": 2.88
  },
  "state": "ALERT",
  "vintage": "DEMO",
  "evidence": [],
  "source": "sample"
}
```

실제 schema는 구현 과정에서 TypeScript/Pydantic으로 명시합니다.

## 7. Replay snapshots

Replay는 화면 capture가 아니라 상태 snapshot을 저장합니다.

```text
data/snapshots/
├─ 2026-05-04.json
├─ 2026-06-15.json
├─ 2026-07-27.json
├─ 2026-08-17.json
└─ 2026-09-30.json
```

각 snapshot에 최소한 다음을 포함합니다.

- Object values
- Object status
- Terminal signals
- Confidence
- Data vintage
- Decision Log reference
- Conflict state

## 8. Scenario / Stress architecture

Stress Test는 별도 탭에서 끝나는 기능이 아니라 Ontology 전체를 재계산하는 Action으로 설계합니다.

```text
User Shock Input
      ↓
Quant Engine
      ↓
Scenario State
      ↓
Node values / status update
      ↓
Causal propagation
      ↓
Rates + Equity terminal signals
      ↓
Scenario result
```

예:

```text
UST 10Y +50bp
    ↓
KTB / Curve
    ↓
Duration Signal
    ↓
KOSDAQ discount rate
    ↓
IPO selectivity
```

## 9. Command architecture

Command는 Chat UI가 아니라 시스템 Action Router로 사용합니다.

```text
Natural Language
      ↓
Intent
      ↓
Object selection / Action selection
      ↓
Ontology traversal
      ↓
Inspector + Workspace + Signal
```

해커톤 Demo에서는 preset command에 deterministic fallback을 둡니다.

## 10. Motion architecture

Motion은 의미를 갖습니다.

| Motion | Meaning |
|---|---|
| Spark | Information transmission |
| Sweep | State / temporal transition |
| Bracket | Object acquisition |
| Roll | Data change |
| Pulse | Event / signal |
| Dim | Out of context |
| Mask reveal | New information |

상시 Ambient Motion과 사용자의 Action Motion을 분리합니다.

## 11. Reliability

최종 발표 핵심 기능은 외부 연결 없이도 시연 가능해야 합니다.

```text
Live source ───────┐
                  ├─ Data Adapter → VALKYRIE
Local snapshot ───┘
```

Live source 장애 시 자동/수동으로 local sample snapshot으로 전환 가능한 구조를 권장합니다.

## 12. Data boundary

Public GitHub에는 코드와 공개/sample data만 둡니다.

실제 사내 데이터 연결은 Adapter interface 뒤에 두고 저장소와 분리합니다.

자세한 내용은 `DATA_POLICY.md` 참고.
