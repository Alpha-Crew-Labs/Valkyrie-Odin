# VALKYRIE — Research Intelligence & Decision System

> **RAVENS × ODIN · Hanwha Asset Management AI PLUSthon 2026**
>
> 시장 데이터를 연결해 판단으로 바꾸고, 그 판단의 결과까지 기억하는 **Market Intelligence Operating System**.

VALKYRIE는 매크로·금리·채권·주식/IPO 리서치를 하나의 온톨로지와 의사결정 흐름으로 연결하는 해커톤 프로젝트입니다. 단순히 여러 대시보드를 모아 놓는 대신, **데이터 → 근거 → 시그널 → 액션 → 사후성과**가 한 화면에서 이어지는 경험을 지향합니다.

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
- Temporal replay
- System activity / live telemetry

### 3. Macro / Rates / Equity Workspaces

| Domain | Owner | 주요 기능 |
|---|---|---|
| MACRO | 정희강 | CPI·정책금리 모델, Macro regime, 시나리오 분석 |
| RATES | 정훈 | Yield curve, duration signal, Decision Log, 사후성과 |
| EQUITY | 김유찬 | IPO Market Report, CB risk / financing, IPO selectivity |

### 4. Replay & Decision Log

과거 특정 시점의 시장 상태와 당시 판단을 다시 불러와 실제 이후 성과를 추적합니다.

- Snapshot replay
- D+5 / D+20 / D+60 성과
- Benchmark-relative performance
- Conflict detection
- Data vintage 표시

### 5. Quant Engine Integration

정희강의 **QUANT MACRO TERMINAL PRO** 기능을 VALKYRIE의 별도 탭으로 단순 복제하지 않고, Quant Engine으로 흡수하는 방향을 지향합니다.

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
   ↓ JSON / API
VALKYRIE Ontology
   ↓
Scenario / Stress / Replay
   ↓
Cross-Asset Signal
   ↓
Action / Decision Log
```

## Architecture

현재 프로토타입은 빠른 UX 검증을 위해 HTML / CSS / JavaScript 중심으로 개발하고, 최종 통합 단계에서는 아래 구조를 목표로 합니다.

```text
Valkyrie-Odin/
├─ apps/
│  └─ valkyrie-web/          # Next.js / TypeScript UI
├─ quant-core/               # Python quant logic
├─ quant-api/                # Optional FastAPI layer
├─ data/
│  ├─ sample/                # 공개 가능한 demo/sample data only
│  └─ snapshots/             # replay snapshots
├─ docs/
│  ├─ ARCHITECTURE.md
│  └─ DATA_POLICY.md
└─ README.md
```

### Target stack

- **Frontend:** Next.js, TypeScript, SVG, Canvas
- **Motion:** CSS / Framer Motion / GSAP as needed
- **Charts:** Chart.js / Recharts / Plotly where appropriate
- **Quant:** Python
- **API:** FastAPI (optional)
- **Deployment:** Vercel / Netlify / internal hosting

## Development Workflow

세 명이 동시에 작업할 수 있도록 기능별 브랜치를 사용합니다.

```text
main
├─ feat/ui-shell
├─ feat/macro
├─ feat/rates
├─ feat/equity
├─ feat/quant-integration
└─ feat/replay-motion
```

권장 흐름:

1. `main` 최신화
2. `feat/<feature>` 브랜치 생성
3. 작은 단위로 commit
4. Pull Request 생성
5. 팀원 1명 이상 확인
6. `Squash and merge`

자세한 협업 규칙은 [`CONTRIBUTING.md`](./CONTRIBUTING.md)를 참고하세요.

## Local Development

프로젝트 구조가 Next.js로 전환된 이후 기준:

```bash
git clone https://github.com/Alpha-Crew-Labs/Valkyrie-Odin.git
cd Valkyrie-Odin
npm install
npm run dev
```

Python Quant Engine이 추가될 경우 별도 가상환경을 사용합니다.

```bash
python -m venv .venv
source .venv/bin/activate   # macOS / Linux
# .venv\Scripts\activate    # Windows
pip install -r requirements.txt
```

## Demo Principles

해커톤 발표에서는 안정성이 기능 수보다 중요합니다.

- 핵심 Demo는 외부 API가 끊겨도 동작 가능해야 함
- Snapshot / Scenario 데이터는 local fallback 보유
- Quant 계산과 LLM 생성 결과를 구분
- 준비된 Demo command는 deterministic하게 동작 가능하도록 구성
- 실제 라이브 데이터가 아닌 경우 `SAMPLE`, `DEMO`, `REVISION-ADJUSTED` 등을 명확히 표시

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

사내 원천데이터가 필요하면 코드와 분리하여 내부 저장소 또는 승인된 사내 환경에서 관리합니다. 자세한 기준은 [`docs/DATA_POLICY.md`](./docs/DATA_POLICY.md)를 참고하세요.

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
