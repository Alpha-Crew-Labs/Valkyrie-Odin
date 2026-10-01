# VALKYRIE v4 — 질문으로 시작하는 운용역 의사결정 오토파일럿

`prototype/valkyrie-v4`는 v3(정적 프로토타입)를 기준으로 **실데이터 파이프라인 + 로컬 서버 + 담당자 모델 결합 + AI 어시스턴트**를 얹은 현재 활성 버전입니다.
해커톤 시연은 이 폴더를 로컬에서 실행합니다.

```text
질문 하나 → MACRO → RATES → EQUITY 체인 재계산 → 데스크별 액션 플랜 (무엇을 · 얼마나 · 왜)
```

## 실행

요구 사항: Python 3.11 이상, Windows PowerShell (macOS/Linux는 `run.ps1`의 단계를 직접 실행).

```powershell
cd prototype/valkyrie-v4
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
copy .env.example .env        # 키를 채운다 (없어도 스냅샷으로 동작)

.\run.ps1                     # 수집 → 모델 → 스냅샷 → 검사 → 서버  http://127.0.0.1:4134/
.\run.ps1 -Offline            # 수집 생략 · 서버 자동 갱신 끔 (시연 당일 / 네트워크 없음)
.\run.ps1 -ServeOnly          # 서버만
.\run.ps1 -Team               # LAN 공개 (팀원이 http://<내부IP>:4134 로 접속)
```

서버 없이 `web/index.html`을 직접 열면 `web/data/bundle.js` 오프라인 번들로 동작합니다.

## 온라인 (GitHub Pages)

정본 주소: **https://alpha-crew-labs.github.io/Valkyrie-Odin/** (소개 페이지 `/intro/`)

- `.github/workflows/pages.yml`이 `web/`을 사이트 루트로 배포합니다. 배포 때마다 GitHub Actions에서 `pipeline/collect_naver.py` → `collect_research.py` → `collect.py` → `model.py` → `snapshot.py` → `check.py`를 다시 돌려 `web/data/bundle.js`를 새로 만듭니다. 어느 단계든 실패하면 커밋된 번들을 그대로 배포합니다 (값을 지어내지 않음).
- 갱신 주기 (Pages 한도를 아끼는 구성): 한국 장중(평일 KST 09–16시) 30분마다 시장 타일만, 장마감 17:07 KST에 전체 갱신, 평일 저녁·밤 3시간마다 전체 갱신, 주말 하루 3회, 그리고 main 푸시 때.
- 일별 시계열은 키 없이도 움직입니다: FRED는 공개 CSV, 국고 3Y/10Y·회사채 AA-·기준금리는 공개 시장금리 최신값을 장마감 후 그날 종가로 이어붙이고, KOSPI/KOSDAQ 종가는 수집한 OHLCV에서 가져옵니다. 장마감 실행이 이 CSV들을 `[skip ci]` 커밋으로 main에 보존하므로 공개 체인이 끊기지 않습니다. 저장소 시크릿 `ECOS_API_KEY` / `FRED_API_KEY`를 넣으면 원천(ECOS·FRED API)으로 대체되고 KR CPI·GDP(월·분기)도 갱신됩니다.
- 화면 상단 Mode가 `WEB · …`이면 웹 스냅샷, `LOCAL SERVER`면 로컬 서버입니다. Mode에 마우스를 올리면 번들 빌드 시각이 보입니다.
- 가볍게: 첫 로딩은 최신 날짜 번들만 받고(`web/data/bundle.js`), 과거 스냅샷 4개(`web/data/snap_<date>.js`)는 타임라인·REPLAY에서 필요할 때 또는 유휴 시간에 불러옵니다. `/v4/`는 리다이렉트, 웹에서는 외부 도구 상태 확인을 5분에 한 번만 합니다.
- 모바일(≤760px, `web/css/mobile.css`): 세로 레이아웃으로 홈 → 판단 시트가 바로 열리고, 체인은 옆으로 넘겨 보며(17개 노드를 축소하지 않음), 노드를 누르면 노드 인사이트, INSPECTOR는 전체 화면 시트로 열립니다. ODIN 바·리서치 레일·호버 툴팁은 폰에서 숨깁니다.

| 웹 스냅샷에서 되는 것 | 로컬 서버(run.ps1)에서만 |
|---|---|
| 인텔리전스 체인 · 노드 인사이트 · 수준 게이지 · 온도계 | 임의 충격 What-If (`/api/state`) |
| SHOCK 프리셋 What-If · 유사 국면 · 판단 로그 · 리플레이 5개 시점 | 판단 기록 · 보유 기록 · ODIN 발간 승인 |
| 준비 질문 3개 · 브리핑 플레이어 · 주목 섹터 · 시장 보드(마지막 수집) | 자연어 AI 어시스턴트(Claude) · 실시간 시세 폴링 · 자산별 뉴스 |
| 담당 모델 판정 (8501 · 8511 · 8512 산출물 반영) | 담당자 Streamlit 앱 링크 · Weekly 보고서 |

담당자 모델(연구 스택)은 별도 Streamlit 앱입니다. v4는 이 앱들의 산출물을 **입력**으로 읽습니다.

| 포트 | 앱 | 담당 | 실행 |
|---|---|---|---|
| 8501 | QUANT MACRO TERMINAL (FRED) · Weekly Updates 보고서 | 정희강 | `.\macro\run_macro.ps1` |
| 8511 | 채권 위기 진단 · 액션 플랜 (Kim filter · 변동성 타깃) | 정훈 | `.\run_bond_app.ps1` |
| 8512 | 주식 시장 진단 · 액션 플랜 | 김유찬 | `.\.venv\Scripts\streamlit.exe run equity\explainer_app.py --server.port 8512` |

## 구조

```text
valkyrie-v4/
├─ run.ps1                 원클릭 실행 (collect → model → snapshot → check → server)
├─ server.py               로컬 HTTP 서버 (표준 라이브러리) · /api/* · 1시간마다 EOD 재수집
├─ valkyrie/               엔진 (결정론적 계산)
│  ├─ ontology.py          17 객체 / 24 관계 · β와 근거(basis) · 의사결정 의미(meaning)
│  ├─ engine.py            체인 상태 · What-If 충격 전파 · 5개 시점 스냅샷
│  ├─ risk.py              노드 수준(1년 백분위, 전망 아님) · 스트레스 온도계
│  ├─ tools.py             8501 / 8511 / 8512 담당자 모델 읽기 → anchors (입력, 충돌 없음)
│  ├─ plan.py              데스크별 액션 플랜 (듀레이션 · 선물 계약 · 주식 비중 · CB/IPO 스탠스)
│  ├─ briefing.py          매시 브리핑 (템플릿 · 숫자는 엔진만)
│  ├─ live.py  news.py     NAVER 실시간 시세 · 수급 · 일정 / Google News RSS
│  ├─ watch.py             주목 섹터 · 테마 · 종목 자동 선정 (규칙 기반)
│  ├─ ai.py                AI 어시스턴트 (Claude) — 해석 · 시나리오 선택 · 설명만, 숫자는 도구 결과만
│  ├─ command.py           키워드 라우터 (API 키 없을 때 폴백)
│  ├─ decisions.py book.py 의사결정 로그 · 보유 기록
│  └─ paths.py             경로 · .env 로딩
├─ pipeline/
│  ├─ collect.py           ECOS · FRED → data/00_RAW
│  ├─ collect_naver.py     NAVER 증권 (시세 · 수급 · 업종 · 일정 · 뉴스)
│  ├─ collect_research.py  CB Zero Finder · 38커뮤니케이션 · NAVER 재무
│  ├─ model.py             data/10_MODEL (daily · ipo · cb · macro_model)
│  ├─ snapshot.py          data/20_SNAPSHOT + web/data/bundle.js (오프라인 번들)
│  └─ check.py             수용 검사
├─ web/                    UI (순수 JS · SVG · CSS) — 홈(질문창) · 체인 · 판단 · 브리핑 · ODIN 레일 · SITREP
├─ macro/  bond/  equity/  담당자 모델 앱 (8501 · 8511 · 8512)
├─ data/
│  ├─ 00_RAW/              공개 원천 (ECOS · FRED · NAVER · DART CB · 38)
│  ├─ 10_MODEL/            모델 테이블
│  ├─ 20_SNAPSHOT/         리플레이 스냅샷 5개 · 의사결정 로그 샘플
│  ├─ 30_BOND/             채권 파이프라인 산출물
│  └─ state/               (gitignore) 런타임 기록 — 의사결정 · 보유 · AI 질문 로그
├─ demo/                   시연 영상 파이프라인 (record → compose) · SCRIPT.md 발표 스크립트
├─ intro/                  소개 페이지 (단일 HTML)
└─ docs/DECISIONS.md       금융 로직 · 온톨로지 · 데이터 출처 변경 이력 (D-001 ~)
```

## 핵심 원칙 (CLAUDE.md 준수)

- **결정론적 계산.** 모든 숫자는 `valkyrie/*.py`가 만든다. LLM은 질문 해석 · 시나리오 선택 · 설명만 한다 (`docs/DECISIONS.md` D-008).
- **담당자 모델은 입력.** 8501 · 8511 · 8512의 판단은 `Tools.anchors()`로 엔진에 들어간다. 비교 대상이 아니므로 "충돌"이 없다 (D-011, D-013).
- **수준 ≠ 전망.** 노드 게이지는 최근 1년 백분위(현재 수준)이고, 대응은 액션 플랜이 말한다 (D-010).
- **β는 데이터 근거.** 관계마다 회귀 결과 또는 전문가 사전값을 `basis`로 표기한다 (D-012).
- **스냅샷 폴백.** 모든 외부 호출은 실패 시 디스크 스냅샷으로 떨어지고 LIVE / FILE / SNAPSHOT / STALE로 표시된다 (D-007).

## 데이터와 비밀값

- 이 폴더의 데이터는 모두 **공개 출처**입니다: 한국은행 ECOS, FRED, NAVER 증권, DART(CB Zero Finder), 38커뮤니케이션.
- 키는 `.env`에만 둡니다 (`.env.example` 참고). 서버만 읽고 브라우저에는 전달되지 않습니다.
- `data/state/`, `demo/_work/`, `demo/_vendor/`, `demo/out/`, `macro/reports/`는 로컬 전용이며 커밋하지 않습니다.
- 자세한 기준은 저장소 루트의 [`docs/DATA_POLICY.md`](../../docs/DATA_POLICY.md).

## 관련 문서

- [`docs/DECISIONS.md`](./docs/DECISIONS.md) — 금융 로직 변경 이력
- [`demo/SCRIPT.md`](./demo/SCRIPT.md) — 시연 영상 · 발표 스크립트
- [`bond/README.md`](./bond/README.md) — 채권 위기 진단 파이프라인
