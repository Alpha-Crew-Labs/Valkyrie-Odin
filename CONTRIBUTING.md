# Contributing to VALKYRIE

RAVENS 팀 3인이 동시에 작업하면서 충돌을 줄이고, 해커톤 당일에도 안정적으로 합칠 수 있도록 최소 규칙만 유지합니다.

## 1. 기본 원칙

- `main`은 항상 실행 가능한 상태를 유지합니다.
- 기능 개발은 `feat/*` 브랜치에서 진행합니다.
- 한 PR에는 가능한 한 하나의 기능/목적만 담습니다.
- 대규모 UI 변경과 데이터/모델 변경을 같은 PR에 섞지 않습니다.
- 해커톤 데모 직전에는 기능 추가보다 안정화와 fallback을 우선합니다.

## 2. 권장 담당 영역

| 영역 | 담당 |
|---|---|
| `MACRO`, Quant model, scenario | 정희강 |
| `RATES`, curve, duration, Decision Log | 정훈 |
| `EQUITY`, IPO/CB, shell/integration, UX | 김유찬 |

담당 영역은 ownership을 의미하며, 다른 팀원의 수정/리뷰를 제한하지 않습니다.

## 3. Branch naming

```text
feat/ui-shell
feat/macro
feat/rates
feat/equity
feat/quant-integration
feat/replay-motion
fix/<short-description>
docs/<short-description>
```

## 4. 작업 시작

```bash
git checkout main
git pull origin main
git checkout -b feat/<feature-name>
```

## 5. Commit

작고 의미 있는 단위로 commit합니다.

```text
feat: add stress scenario propagation
fix: sync replay timeline with decision log
docs: update architecture notes
refactor: separate quant calculations from UI
chore: update sample snapshots
```

## 6. Pull Request

PR 본문에는 최소한 아래를 적습니다.

```markdown
## What changed
- 변경 내용

## Why
- 필요한 이유

## Demo / Test
- 확인한 동작

## Risk
- 깨질 수 있는 부분 / fallback
```

가능하면 다른 팀원 1명이 확인한 후 merge합니다.

해커톤 당일 긴급 수정은 예외적으로 직접 `main`에 반영할 수 있으나, 무엇을 바꿨는지 팀 채널에 공유합니다.

## 7. Merge strategy

기본 권장:

**Squash and merge**

이유:

- 해커톤 중 작은 WIP commit이 많이 생겨도 main history가 깔끔함
- 기능 단위 rollback이 쉬움

## 8. File ownership / 충돌 최소화

가능하면 기능별 디렉터리를 분리합니다.

```text
apps/valkyrie-web/
  components/intelligence-chain/
  modules/macro/
  modules/rates/
  modules/equity/
  lib/ontology/
  lib/replay/

data/sample/
quant-core/
```

공통 shell, ontology schema, global style을 수정할 때는 팀 채널에 먼저 알립니다.

## 9. Data rule

이 repo는 public입니다.

**사내 비공개 데이터, 개인정보, API key, 미공개 보고서, 내부 시스템 정보는 commit하지 않습니다.**

공개 repo에서 사용할 데이터는 아래 중 하나여야 합니다.

- public data
- synthetic data
- sufficiently anonymized demo data
- 공개가 명확히 허용된 자료

자세한 내용은 `docs/DATA_POLICY.md`를 확인합니다.

## 10. Demo stability checklist

PR merge 전 가능하면 확인합니다.

- [ ] 첫 화면 정상 로딩
- [ ] RUN SIGNATURE 동작
- [ ] Node → Inspector → Workspace sync
- [ ] Replay 동작
- [ ] Command preset 동작
- [ ] 1920×1080에서 layout 깨짐 없음
- [ ] 외부 API 실패 시 핵심 화면 사용 가능
- [ ] Console에 치명적 error 없음
- [ ] secret / internal data 포함 없음

## 11. Before final demo

최종 데모 전에는 `main`을 동결하고 별도 안정화 브랜치에서만 수정하는 방식을 권장합니다.

예:

```text
release/plusthon-demo
```

필요하면 이 브랜치를 발표용 배포의 고정 source로 사용합니다.
