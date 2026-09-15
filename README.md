# VALKYRIE — Research Intelligence & Decision System

> **RAVENS × ODIN · Hanwha Asset Management AI PLUSthon 2026**
>
> 시장 데이터를 연결해 판단으로 바꾸고, 그 판단의 결과까지 기억하는 **Market Intelligence Operating System**.

VALKYRIE는 매크로·금리·채권·주식/IPO 리서치를 하나의 온톨로지와 의사결정 흐름으로 연결하는 해커톤 프로젝트입니다. 여러 대시보드를 모아 놓는 대신, **데이터 → 근거 → 시그널 → 액션 → 사후성과**가 하나의 시스템에서 이어지는 경험을 지향합니다.

## Product Loop

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

핵심 컨셉은 **“하나의 금리 충격이 채권과 주식에서 같은 듀레이션 논리로 어떻게 전파되는가”**를 시각적으로 보여주는 것입니다.

## Current Status

Repository foundation and product operating documents are in place. The next S0 task is importing the working VALKYRIE v2 HTML prototype into the repository and evolving it without breaking the current demo behavior.

Current priorities:

1. **Import v2 prototype / stable app shell** — [Issue #1](../../issues/1)
2. **Motion System v3 / always-alive UI** — [Issue #2](../../issues/2)
3. **Quant Stress as ontology action** — [Issue #3](../../issues/3)
4. **Replay + Decision Log** — [Issue #4](../../issues/4)
5. **Demo hardening / fallback** — [Issue #5](../../issues/5)

See [`docs/STATUS.md`](./docs/STATUS.md) and [`docs/ROADMAP.md`](./docs/ROADMAP.md).

## Core Experience

### 1. Intelligence Chain

MACRO → RATES → EQUITY의 고정 인과 체인에서 시장 충격이 어떤 경로를 통해 최종 투자 시그널로 전달되는지 시각화합니다.

- 사전 정의된 금융 온톨로지
- 노드 선택 시 관련 경로 자동 활성화
- Evidence / Confidence / Analyst View 동기화
- 관련 Domain Workspace 자동 전환
- Cross-asset `SHARED DURATION LOGIC`

현재 v2 기준 온톨로지는 [`docs/ONTOLOGY.md`](./docs/ONTOLOGY.md)에 기록합니다.

### 2. Cinematic HUD / Motion System

VALKYRIE는 정적인 금융 대시보드가 아니라 **항상 살아 움직이는 Intelligence System**을 목표로 합니다.

- Ambient data field
- Causal edge flow / signal propagation
- Cursor telemetry / node acquisition
- Rolling market values
- Signal lock animation
- Temporal replay
- System activity / live heartbeat

Motion은 장식이 아니라 시스템 상태를 설명해야 합니다. 상세 지침은 [`docs/MOTION_SYSTEM.md`](./docs/MOTION_SYSTEM.md)를 참고합니다.

### 3. Macro / Rates / Equity Workspaces

| Domain | Owner | 주요 기능 |
|---|---|---|
| MACRO | 정희강 | CPI·정책금리 모델, Macro Clock, 시나리오·Stress |
| RATES | 정훈 | Yield curve, duration signal, Decision Log, 사후성과 |
| EQUITY | 김유찬 | IPO Market Report, CB financing/risk, IPO selectivity |

세 영역은 독립 앱처럼 보이면 안 됩니다. 하나의 Object를 선택하면 **Ontology → Inspector → Workspace → Terminal Signal**이 함께 반응해야 합니다.

### 4. Replay & Decision Log

과거 특정 시점의 시장 상태와 당시 판단을 다시 불러와 실제 이후 성과를 추적합니다.

- Snapshot replay
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
Python Quant Logic
      ↓
Normalized JSON / API / Snapshot
      ↓
VALKYRIE Object State
      ↓
Ontology / Inspector / Workspace
      ↓
Signal / Action / Replay
```

자세한 계약은 [`docs/QUANT_INTEGRATION.md`](./docs/QUANT_INTEGRATION.md)를 참고합니다.

## Platform Direction

기능은 가능하면 새로운 독립 탭이 아니라 **Object Action**으로 연결합니다.

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

이 구조가 VALKYRIE를 Dashboard가 아니라 **Decision Platform**으로 만듭니다.

## Repository Architecture

```text
Valkyrie-Odin/
├─ apps/
│  └─ valkyrie-web/          # UI / ontology / interaction
├─ quant-core/               # deterministic Python quant logic
├─ quant-api/                # optional FastAPI adapter (future)
├─ data/
│  ├─ sample/                # public-safe demo/sample data only
│  └─ snapshots/             # replay snapshots (future)
├─ docs/
│  ├─ README.md
│  ├─ PRODUCT_SPEC.md
│  ├─ ARCHITECTURE.md
│  ├─ ONTOLOGY.md
│  ├─ QUANT_INTEGRATION.md
│  ├─ MOTION_SYSTEM.md
│  ├─ DEMO_PLAYBOOK.md
│  ├─ ROADMAP.md
│  ├─ STATUS.md
│  ├─ WORKSTREAMS.md
│  ├─ DECISIONS.md
│  └─ DATA_POLICY.md
├─ CLAUDE.md                 # AI coding-agent working contract
├─ CONTRIBUTING.md
├─ SECURITY.md
└─ README.md
```

### Target stack

- **Frontend:** Next.js, TypeScript, SVG, Canvas
- **Motion:** CSS / Framer Motion / GSAP as needed
- **Charts:** Chart.js / Recharts / Plotly where appropriate
- **Quant:** Python
- **API:** FastAPI when runtime integration is justified
- **Deployment:** Vercel / Netlify / approved internal hosting

The current single-file HTML prototype remains a valid reference implementation. **Do not rewrite a working prototype merely to satisfy framework preference.**

## Development Workflow

```text
main
└─ feat/<feature>
```

Recommended examples:

```text
feat/platform-shell
feat/macro-clock
feat/rates-curve
feat/equity-ipo
feat/quant-stress
feat/replay-motion
```

Flow:

1. update from `main`
2. create `feat/<feature>` or `fix/<feature>`
3. commit in small units
4. open Pull Request
5. review financial-logic changes explicitly
6. prefer Squash and Merge

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) and [`docs/WORKSTREAMS.md`](./docs/WORKSTREAMS.md).

## AI-assisted Development

Claude/Codex/ChatGPT 등 AI coding agent를 사용할 때는 먼저 [`CLAUDE.md`](./CLAUDE.md)를 읽도록 합니다.

핵심 원칙:

- 일반 SaaS Dashboard로 재설계하지 않기
- 고정 금융 온톨로지 보존
- Quant 계산과 LLM 설명 역할 분리
- Motion에 의미 부여
- Node / Inspector / Workspace / Signal 상태 동기화
- Demo fallback 보존
- Public repo 데이터 정책 준수

## Demo Principles

해커톤 발표에서는 안정성이 기능 수보다 중요합니다.

- 핵심 Demo는 외부 API가 끊겨도 동작 가능해야 함
- Snapshot / Scenario 데이터는 local fallback 보유
- Quant 계산과 LLM 생성 결과를 구분
- 준비된 Demo command는 deterministic하게 동작 가능하도록 구성
- 실제 라이브 데이터가 아닌 경우 `SAMPLE`, `DEMO`, `REVISION-ADJUSTED` 등을 명확히 표시

60초 Demo Flow와 fallback은 [`docs/DEMO_PLAYBOOK.md`](./docs/DEMO_PLAYBOOK.md)에 관리합니다.

## Data & Security — 중요

이 저장소는 **Public Repository**입니다.

Public은 “주소를 아는 사람만 볼 수 있음”을 의미하지 않습니다. 누구나 검색·clone·fork할 수 있습니다.

따라서 아래 항목은 **절대 commit하지 않습니다.**

- 한화자산운용 비공개 사내 데이터
- 고객정보 / 개인정보 / 계정정보
- 내부 보고서 원문 또는 미공개 리서치
- API Key / Token / Password / Secret
- 비공개 사내 시스템 URL·접속정보
- 라이선스상 외부 공개가 금지된 데이터

Public repo에는 **공개 데이터, 익명화된 sample data, synthetic/demo data만** 저장합니다.

사내 원천데이터가 필요하면 코드와 분리하여 승인된 private/internal 환경에서 관리합니다.

See [`docs/DATA_POLICY.md`](./docs/DATA_POLICY.md) and [`SECURITY.md`](./SECURITY.md).

## Documentation

전체 문서 인덱스: **[`docs/README.md`](./docs/README.md)**

Recommended reading:

1. [`CLAUDE.md`](./CLAUDE.md)
2. [`docs/PRODUCT_SPEC.md`](./docs/PRODUCT_SPEC.md)
3. [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)
4. [`docs/ONTOLOGY.md`](./docs/ONTOLOGY.md)
5. [`docs/MOTION_SYSTEM.md`](./docs/MOTION_SYSTEM.md)
6. [`docs/QUANT_INTEGRATION.md`](./docs/QUANT_INTEGRATION.md)
7. [`docs/DEMO_PLAYBOOK.md`](./docs/DEMO_PLAYBOOK.md)

## Team RAVENS

**RAVENS**는 오딘에게 정보를 가져오는 후긴과 무닌처럼, 매크로·채권·주식의 인사이트를 수집하고 연결하는 팀입니다.

**VALKYRIE**는 RAVENS가 수집한 데이터와 리서치 시그널을 하나의 판단 체계로 통합해 ODIN에 전달하는 Research Intelligence System입니다.

- **정희강** — Macro / Team Lead / Quant
- **정훈** — Rates / Fixed Income
- **김유찬** — Equity / IPO / Platform Integration

## Design Principle

> **Always Alive · Always Watching · Always Connected · Always Ready to Decide**

화려함은 장식에서 나오지 않습니다. **데이터가 이동하고, 상태가 변하고, 판단이 생성되는 과정**을 시각적으로 보여줄 때 미래적인 시스템처럼 보입니다.

---

**RAVENS · Hanwha Asset Management AI PLUSthon 2026**
