# VALKYRIE Data Policy

이 문서는 Public GitHub 저장소에서 VALKYRIE를 공동개발할 때 데이터와 비밀정보를 어떻게 다룰지 정리합니다.

## 1. Public repository 원칙

`Alpha-Crew-Labs/Valkyrie-Odin`은 public repository입니다.

Public repo에 올라간 파일은 URL을 아는 사람만 보는 것이 아닙니다. 검색엔진, GitHub 검색, 크롤러, fork/clone 등을 통해 누구나 접근할 수 있다고 가정합니다.

따라서 **사내 데이터 사용 가능 여부와 public GitHub 업로드 가능 여부는 별개**입니다.

## 2. Public repo에 넣어도 되는 것

- 공공데이터 / 공개 시장데이터
- 공개 API로 취득한 데이터 중 재배포가 허용된 범위
- synthetic/demo data
- 충분히 익명화된 예제 데이터
- 팀이 직접 작성한 UI/UX 코드
- 공개 가능한 모델 로직과 테스트 코드
- 해커톤 발표용 sample snapshot

## 3. Public repo에 넣으면 안 되는 것

- 한화자산운용 비공개 사내 데이터
- 미공개 운용정보 / 포지션 / 주문 / 거래내역
- 내부 리서치 보고서 원문 또는 사내 전용 코멘트
- 고객/임직원 개인정보
- 계정 ID, 비밀번호, 인증서
- API key, OAuth token, cookie, secret
- 사내 시스템 주소, 내부 IP, VPN/접속정보
- 라이선스나 계약상 외부 공개가 금지된 데이터
- 외부에 공개되지 않은 회사 문서/첨부파일

## 4. 권장 디렉터리 규칙

Public demo data:

```text
data/sample/
data/snapshots/
```

로컬 전용 데이터는 아래 경로를 사용할 수 있으나 `.gitignore`로 차단합니다.

```text
data/internal/
data/private/
data/raw-internal/
internal-data/
confidential/
private/
```

## 5. Secret 관리

Secret은 코드에 하드코딩하지 않습니다.

```text
.env
.env.local
.streamlit/secrets.toml
```

등 로컬 환경 파일 또는 배포 플랫폼의 Environment Variables를 사용합니다.

Public repo에는 값이 비어 있는 `.env.example`만 올릴 수 있습니다.

예:

```bash
FRED_API_KEY=
OPENAI_API_KEY=
```

## 6. Commit 전 체크

아래를 확인합니다.

- 파일명에 `internal`, `confidential`, 고객명 등이 들어간 원본 파일이 없는가
- CSV/XLSX/Parquet에 실데이터가 섞이지 않았는가
- 코드에 API key가 문자열로 들어가지 않았는가
- Screenshot에 개인정보/내부 시스템 정보가 찍히지 않았는가
- Git history에 이미 secret이 올라간 적이 없는가

## 7. 실수로 민감정보를 올렸다면

단순히 다음 commit에서 파일을 삭제하는 것으로 충분하지 않을 수 있습니다. Git history에는 내용이 남을 수 있습니다.

즉시:

1. 해당 secret/key 폐기 또는 rotate
2. 팀에 알림
3. repository history에서 민감정보 제거
4. 필요 시 repository를 private로 전환하거나 보안 담당 정책에 따라 조치

## 8. 해커톤 권장 운영

가장 안전한 구조:

```text
Public GitHub
  ├─ application code
  ├─ sample/synthetic data
  └─ public documentation

Internal / approved storage
  └─ actual company data
```

VALKYRIE는 동일한 schema/interface를 사용해 local/internal data source와 public demo source를 교체할 수 있도록 설계합니다.

예:

```text
Data Adapter
   ├─ DemoAdapter      → public snapshots
   └─ InternalAdapter  → approved internal source
```

이 구조를 사용하면 public 협업성과 내부 데이터 보안을 동시에 유지할 수 있습니다.
