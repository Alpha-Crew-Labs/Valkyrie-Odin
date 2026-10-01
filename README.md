# VALKYRIE — Research Intelligence & Decision System

> **RAVENS × ODIN · Hanwha Asset Management AI PLUSthon 2026**
>
> 시장 데이터를 연결해 판단으로 바꾸고, 그 판단의 결과까지 기억하는 **Market Intelligence Operating System**.

[![Public Repo Guard](https://github.com/Alpha-Crew-Labs/Valkyrie-Odin/actions/workflows/public-repo-guard.yml/badge.svg)](https://github.com/Alpha-Crew-Labs/Valkyrie-Odin/actions/workflows/public-repo-guard.yml)
[![Prototype Validation](https://github.com/Alpha-Crew-Labs/Valkyrie-Odin/actions/workflows/prototype-validation.yml/badge.svg)](https://github.com/Alpha-Crew-Labs/Valkyrie-Odin/actions/workflows/prototype-validation.yml)

VALKYRIE는 매크로·금리·채권·주식/IPO 리서치를 하나의 온톨로지와 의사결정 흐름으로 연결하는 해커톤 프로젝트입니다. 단순히 여러 대시보드를 모아 놓는 대신, **데이터 → 근거 → 시그널 → 액션 → 사후성과**가 한 화면에서 이어지는 경험을 지향합니다.

## Current Build

현재 활성 버전은 **`prototype/valkyrie-v4`** 입니다. 실데이터 파이프라인(ECOS · FRED · NAVER · DART · 38)과 로컬 서버, 담당자 모델(8501 · 8511 · 8512) 결합, AI 어시스턴트가 들어 있습니다.

**온라인 정본: https://alpha-crew-labs.github.io/Valkyrie-Odin/**

GitHub Pages가 공개 데이터로 스냅샷 번들을 다시 계산해 배포합니다 (한국 장중 10분, 그 외 매시간, main 푸시 때). 인텔리전스 체인 · SHOCK 프리셋 What-If · 판단 로그 · 리플레이 · 브리핑 · 소개 페이지(`/intro/`)가 서버 없이 동작합니다. 자연어 AI 어시스턴트와 실시간 시세 폴링, 담당자 Streamlit 앱은 로컬 실행(`run.ps1`)에서만 켜집니다.

| 경로 | 내용 |
|---|---|
| `/` | VALKYRIE v4 — 정본 (공개 스냅샷 번들) |
| `/v4/` | 같은 v4 빌드의 고정 별칭 |
| `/intro/` | v4 소개 페이지 |
| `/v3/` | v3 정적 기준본 |
| `/v2.5/` | v2.5 정적 폴백 |

로컬 실행:

```powershell
git clone https://github.com/Alpha-Crew-Labs/Valkyrie-Odin.git
cd Valkyrie-Odin/prototype/valkyrie-v4
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\run.ps1 -Offline          # http://127.0.0.1:4134/  (수집 생략 · 스냅샷으로 실행)
```

v4 build:

- 17 Objects / 24 Relations (KOSPI 추가) — β마다 데이터 근거 표기
- 질문창으로 시작하는 홈 → 체인 재계산 → 데스크별 액션 플랜
- 담당자 모델(매크로 8501 · 채권 8511 · 주식 8512)을 입력으로 결합
- 노드 수준(1년 백분위) · 스트레스 온도계 · What-If 충격 전파
- 5개 시점 Replay · Decision Log · 보유 기록 · ODIN 발행
- NAVER 실시간 시세 · SITREP · 매시 브리핑 (숫자는 엔진만)
- 외부 호출 실패 시 스냅샷 폴백, 서버 없이 `web/index.html` 오프라인 번들

자세한 실행/구조는 [`prototype/valkyrie-v4/README.md`](./prototype/valkyrie-v4/README.md), 금융 로직 변경 이력은 [`prototype/valkyrie-v4/docs/DECISIONS.md`](./prototype/valkyrie-v4/docs/DECISIONS.md)를 참고하세요.

GitHub Pages의 **정본은 v4(`/`)** 이며 같은 빌드를 `/v4/`에도 고정 배포합니다. 이전 v3(`/v3/`)와 v2.5(`/v2.5/`)는 회귀·비교용으로 보존합니다. v4의 서버 전용 기능(`/api/*`, Claude 자연어 질의, 판단 기록·발간 등)은 로컬 `run.ps1` 실행 시 활성화되고, Pages에서는 CI가 다시 계산한 스냅샷 번들로 WEB 모드로 동작합니다.

```bash
cd Valkyrie-Odin/prototype/valkyrie-v3
python -m http.server 8080      # http://localhost:8080
```

## Why VALKYRIE

기존 리서치 워크플로에서는 매크로, 채권, 주식 데이터와 판단이 서로 다른 파일·도구·보고서에 흩어져 있어 전체 시장의 연결관계를 빠르게 파악하기 어렵습니다.

VALKYRIE는 다음 흐름을 하나의 시스템으로 통합합니다.

```text
SEE → CONNECT → DECIDE → ACT → LEARN

Market Data
    ↓
Evidence / Ontology
    ↓
Cross-Asset Signal
    ↓
Investment Decision
    ↓
Decision Log / Replay
    ↓
Briefing / Communication
```

핵심 컨셉은 **"하나의 금리 충격이 채권과 주식에서 같은 듀레이션 논리로 어떻게 전파되는가"**를 시각적으로 보여주는 것입니다.

## Core Experience

### 1. Intelligence Chain

MACRO → RATES → EQUITY의 고정 인과 체인에서 시장 충격이 어떤 경로를 통해 최종 투자 시그널로 전달되는지 시각화합니다.

- 사전 정의된 금융 온톨로지
- 노드 선택 시 관련 경로 자동 활성화
- Evidence / Confidence / Analyst View 동기화
- 관련 Domain Workspace 자동 전환
- Cross-asset `SHARED DURATION LOGIC`

### 2. Cinematic HUD / Motion System

VALKYRIE는 정적인 금융 대시보드가 아니라 **항상 살아 움직이는 Intelligence System**을 목표로 합니다.

- Ambient data field
- Causal edge flow / signal propagation
- Node acquisition / targeting HUD
- Rolling market values
- Signal lock animation
- Temporal Replay
- System activity / live telemetry

Motion은 장식이 아니라 시스템 의미를 표현합니다.

```text
Spark          = information transmission
Sweep          = state / time transition
Bracket        = selection / acquisition
Rolling number = data change
Pulse          = event / signal
Dim            = out of current context
```

### 3. Macro / Rates / Equity Workspaces

| Domain | Owner | 주요 기능 |
|---|---|---|
| MACRO | 정희강 | CPI·정책금리 모델, Macro regime, 시나리오 분석 |
| RATES | 정훈 | Yield curve, duration signal, Decision Log, 사후성과 |
| EQUITY | 김유찬 | IPO Market Report, CB risk / financing, IPO selectivity |

### 4. Replay & Decision Log

과거 특정 시점의 시장 상태와 당시 판단을 다시 불러와 실제 이후 성과를 추적합니다.

- Snapshot Replay
- D+5 / D+20 / D+60 성과
- Benchmark-relative performance
- Conflict detection
- Data vintage 표시

### 5. Quant Engine Integration

정희강의 **QUANT MACRO TERMINAL PRO** 기능을 VALKYRIE의 별도 탭으로 단순 복제하지 않고, Quant Engine으로 흡수합니다.

우선 통합 후보:

- Stress Test & VaR
- Macro Clock
- 3D Yield Curve
- Financial Stress Monitor
- Correlation / Custom Lab
- Monte Carlo Simulation
- AI CIO / Briefing Engine

목표 구조:

```text
Quant Engine
   ↓ normalized state / JSON
VALKYRIE Canonical State
   ↓
Ontology / Evidence
   ↓
Scenario / Stress / Replay
   ↓
Cross-Asset Signal
   ↓
Action / Decision Log
```

첫 번째 S0 Quant Action은 **Stress Test**입니다. Streamlit 화면을 iframe으로 붙이는 대신, Python 계산 결과가 기존 온톨로지와 Terminal Signal을 다시 resolve하도록 설계합니다.

## Platform Principle

새 기능은 가능하면 독립 탭으로 들어오지 않습니다.

```text
                    ┌─ INSPECT
                    ├─ COMPARE
                    ├─ CORRELATE
OBJECT → ONTOLOGY ──┼─ STRESS
                    ├─ SIMULATE
                    ├─ REPLAY
                    └─ BRIEF
                         ↓
                      SIGNAL
                         ↓
                      ACTION
                         ↓
                   TRACK RECORD
```

하나의 Object를 선택하면 Graph → Inspector → Workspace → Signal이 같은 상태를 공유해야 합니다. 자세한 계약은 [`docs/STATE_MODEL.md`](./docs/STATE_MODEL.md)에 정의되어 있습니다.

## Repository Architecture

```text
Valkyrie-Odin/
├─ prototype/
│  ├─ valkyrie-v2/          # behavior reference (static)
│  ├─ valkyrie-v2.5/        # legacy static build at /v2.5/
│  ├─ valkyrie-v3/          # static baseline at /v3/
│  └─ valkyrie-v4/          # ACTIVE / canonical Pages at / and /v4/ + local server full mode
├─ apps/
│  └─ valkyrie-web/         # target Next.js / TypeScript UI
├─ quant-core/              # Python quant logic
├─ quant-api/               # optional API layer when needed
├─ data/
│  ├─ sample/               # public-safe demo/sample data only
│  └─ snapshots/            # future normalized replay snapshots
├─ scripts/                 # CI validation / public-repo guard
├─ docs/                    # product / ontology / state / demo specs
└─ README.md
```

### Target stack

- **Frontend:** Next.js, TypeScript, SVG, Canvas
- **Motion:** CSS / Framer Motion / GSAP where justified
- **Charts:** Recharts / Plotly / targeted Canvas/SVG visualization
- **Quant:** Python
- **API:** FastAPI only where a service boundary is useful
- **Deployment:** Vercel / Netlify / approved internal hosting

## Development Workflow

팀원이 동시에 작업할 수 있도록 기능별 브랜치를 사용합니다.

```text
main
├─ feat/macro
├─ feat/rates
├─ feat/equity
└─ feat/platform
```

권장 흐름:

1. `main` 최신화
2. 자신의 feature branch 최신화
3. 작은 단위로 commit
4. Pull Request 생성
5. CI 통과 확인
6. 팀원 1명 이상 확인
7. `Squash and merge`

자세한 협업 규칙은 [`CONTRIBUTING.md`](./CONTRIBUTING.md)를 참고하세요.

## Automated Quality Gates

### Public Repo Guard

Public 저장소에 위험한 경로/파일이 추적되는 실수를 줄이기 위한 체크입니다.

### Prototype Validation

zero-dependency validator가 다음을 확인합니다.

- prototype 필수 파일 존재
- JavaScript syntax
- local file reference / CSP
- 16 unique object IDs
- 22 unique valid relations
- edge source/target integrity
- 3 terminal signals
- object/signal metadata completeness
- 5 snapshots completeness
- signal confidence 0–100

해커톤 데모 합격 기준은 [`docs/DEMO_QA.md`](./docs/DEMO_QA.md)를 따릅니다.

## Documentation

전체 문서 색인은 [`docs/README.md`](./docs/README.md)에 있습니다.

특히 먼저 볼 문서:

- [`docs/PRODUCT_SPEC.md`](./docs/PRODUCT_SPEC.md) — 제품 정의 / MVP
- [`docs/STATUS.md`](./docs/STATUS.md) — 현재 상태
- [`docs/ONTOLOGY.md`](./docs/ONTOLOGY.md) — 16 objects / 22 relations
- [`docs/STATE_MODEL.md`](./docs/STATE_MODEL.md) — canonical state / action contract
- [`docs/MOTION_SYSTEM.md`](./docs/MOTION_SYSTEM.md) — always-alive motion grammar
- [`docs/QUANT_INTEGRATION.md`](./docs/QUANT_INTEGRATION.md) — Quant Engine 통합
- [`docs/DEMO_PLAYBOOK.md`](./docs/DEMO_PLAYBOOK.md) — 발표 흐름
- [`docs/DEMO_QA.md`](./docs/DEMO_QA.md) — release gate

## Demo Principles

해커톤 발표에서는 안정성이 기능 수보다 중요합니다.

- 핵심 Demo는 외부 API가 끊겨도 동작 가능해야 함
- Snapshot / Scenario 데이터는 local fallback 보유
- Quant 계산과 LLM 생성 결과를 구분
- 준비된 Demo command는 deterministic하게 동작 가능하도록 구성
- 실제 라이브 데이터가 아닌 경우 `SAMPLE`, `DEMO`, `REVISION-ADJUSTED` 등을 명확히 표시
- `RESET`은 언제나 알려진 상태로 복귀해야 함

## Data & Security — 중요

이 저장소는 **Public Repository**입니다.

따라서 아래 항목은 **절대 commit하지 않습니다.**

- 한화자산운용 비공개 사내 데이터
- 고객정보 / 개인정보 / 계정정보
- 내부 보고서 원문 또는 미공개 리서치
- API Key / Token / Password / Secret
- 사내 시스템 URL·접속정보 등 비공개 인프라 정보
- 라이선스상 외부 공개가 금지된 데이터

Public repo에는 **공개 데이터, 익명화된 sample data, synthetic/demo data만** 저장합니다.

사내 원천데이터가 필요하면 코드와 분리하여 승인된 내부 저장소 또는 사내 환경에서 관리하고, VALKYRIE에는 동일한 canonical state contract로 주입합니다. 자세한 기준은 [`docs/DATA_POLICY.md`](./docs/DATA_POLICY.md)를 참고하세요.

## Team RAVENS

**RAVENS**는 오딘에게 정보를 가져오는 후긴과 무닌처럼, 매크로·채권·주식의 인사이트를 수집하고 연결하는 팀입니다.

**VALKYRIE**는 RAVENS가 수집한 데이터와 리서치 시그널을 하나의 판단 체계로 통합해 ODIN에 전달하는 Research Intelligence System입니다.

- 정희강 — Macro / Team Lead
- 정훈 — Rates / Fixed Income
- 김유찬 — Equity / IPO / Integration

## Design Principle

> **Always Alive · Always Watching · Always Connected · Always Ready to Decide**

화려함은 장식에서 나오지 않습니다. 데이터가 이동하고, 상태가 변하고, 판단이 생성되는 과정을 시각적으로 보여줄 때 미래적인 시스템처럼 보입니다.

---

**RAVENS · Hanwha Asset Management AI PLUSthon 2026**
