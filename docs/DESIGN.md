# 인문 논술 첨삭 웹 서비스 — 설계

대학별 인문 논술 기출·모범답안을 분석해 채점 기준을 만들고, 학생이 웹 원고지에 쓴 답안을
Claude API로 첨삭하는 서비스. 문제지·답안지·첨삭 결과는 모두 A4 인쇄 가능.

- 대상 대학: 홍익대, 단국대, 건국대, 동국대, 국민대, 아주대 (관리 화면에서 추가·삭제)
- 인문 논술만 다룬다. 문항에 `원고지 / 자유 서식` 타입 필드만 두고 수리 서식은 구현하지 않는다.

## 단위 — 시험지와 문항

논술 기출 하나에는 보통 제시문 (가)~(라)와 문항 두셋이 함께 있다. 그래서 **다루는 단위를 나눈다.**

| 무엇 | 단위 | 왜 |
|---|---|---|
| 배정 · 제출 · 공개 | **시험지** | 실제 시험처럼 문항을 다 쓰고 한꺼번에 낸다 |
| 답안(원고지) · 채점 · 첨삭 | **문항** | 채점 기준이 문항마다 100점이라 섞을 수 없다 |
| 제시문 | 시험지에 한 벌 | 여러 문항이 같은 (가)~(라)를 함께 쓴다 |

- 과제 하나 = 시험지 하나. `assignments/{id}.questions[]` 에 문항을 통째로 베껴 둔다.
- 답안과 첨삭은 `questionId` 로 자기 문항을 가리키고 `assignmentId` 로 묶인다.
- 제시문은 문항마다 복사해 두되(그 문항에 무엇이 딸렸는지 알아야 첨삭이 된다),
  화면과 인쇄물에서는 `mergePassages` 로 한 번만 싣는다.

## 기술 스택

| 영역 | 선택 |
|---|---|
| 프레임워크 | Next.js 16 (App Router) + TypeScript + Tailwind v4, Vercel Pro 배포 |
| 인증 | Firebase Auth (이메일/비밀번호 + Google) → 서버는 httpOnly 세션 쿠키 |
| DB | Firestore |
| 파일 | Firebase Storage (기출·해설 PDF) |
| LLM | Claude API — 첨삭·분석 `claude-opus-5`, 파일 분류 `claude-haiku-4-5` (환경변수 교체 가능) |
| PDF 글자 | 네이버 CLOVA OCR — 텍스트 PDF·스캔본을 가리지 않고 한 번에 읽는다. **Claude 는 쓰지 않는다.** 없거나 실패하면 pdfjs 로 내려가고, 스캔본이면 실패시킨다 |
| 한글(HWPX) | zip 안 OWPML 을 직접 읽는다. 외부 호출 없음 |

> CLOVA 는 **API Gateway 연동 후의 공개 Invoke URL**(`https://<id>.apigw.ntruss.com/custom/v1/...`)이
> 필요하다. `clovaocr-api-kr.ncloud.com` 주소는 사설 IP(10.x)로 풀리는 NCP 내부 전용이라
> 바깥에서 닿지 않는다. 내부 전용 주소는 부르기 전에 걸러 내고 사유를 관리 화면에 남긴다.

- Claude 호출은 Route Handler(서버)에서만. `ANTHROPIC_API_KEY`는 클라이언트에 노출하지 않는다.
- 서비스 계정은 `FIREBASE_SERVICE_ACCOUNT_KEY`(JSON 한 줄 문자열) 환경변수. 코드·문서에 값이 들어가지 않는다.

## 원고지 규격

첨부된 연세대 2027 인문계열 답안지(`docs/reference/yonsei-2027-answer-sheet.pdf`)를 실측한 기본값.

| 항목 | 값 |
|---|---|
| 첫 줄 | 35칸 (왼쪽 3칸은 `문제 1-1` 라벨) |
| 둘째 줄부터 | 38칸 |
| 누적 글자 수 눈금 | 우측 여백, 4줄마다 |
| 최대 글자 수 표시선 | **문항의 "○○자 내외" 조건에서 계산** (고정값 아님) |

- `charTarget`(문항이 요구하는 글자 수) + `tolerance`(기본 ±10%)로 허용 범위를 잡는다.
  예) 600자 내외 → 540~660자. 표시선은 목표 위치에 진하게, 상·하한에 옅게.
- 총 줄 수는 `ceil((허용 상한 + 라벨 칸) / 38) + 여유 2줄`로 문항마다 생성한다.
- 대학별 `manuscriptSpec`으로 칸 수·줄 수·눈금 간격을 덮어쓸 수 있다.

## 디렉터리 구조

```
src/
├─ app/
│  ├─ (auth)/login · signup
│  ├─ (student)/dashboard · write/[assignmentId] · results/[correctionId]
│  ├─ (teacher)/admin/…  (universities · exams · analysis · students · answers · corrections)
│  ├─ print/exam · sheet · answer · correction
│  └─ api/…
├─ components/  manuscript/ · correction/ · admin/ · auth/
├─ lib/
│  ├─ firebase/client.ts · admin.ts
│  ├─ auth/session.ts · dal.ts · client.ts
│  ├─ anthropic/  · manuscript/  · pdf/  · types/
│  └─ env.ts
└─ proxy.ts            # 낙관적 리다이렉트 (Next 16에서 middleware → proxy)
prompts/               # 프롬프트를 파일로 분리해 수정 가능하게
```

## Firestore 스키마

```
users/{uid}              role, email, displayName, teacherId?, active, createdAt
invites/{code}           role, label, createdBy, createdAt, expiresAt, usedBy?, usedAt?
meta/system              teacherBootstrapped, firstTeacherUid

universities/{univId}    name, slug, order, active, manuscriptSpec
  exams/{examId}         year, title, session, questionPdf{storagePath,extraction{method,pages,chars}},
                         solutionPdf{…}, questionCount, analysisStatus
    questions/{qId}      number, prompt, passages[], charTarget, tolerance, lengthNote,
                         points, answerFormat, modelAnswer, source('parsed'|'manual')
    extractions/{kind}   text    # 추출 원문. exam 문서 1MB 제한을 피해 따로 둔다
  analyses/{analysisId}  scope('exam'|'aggregate'), questionTypes[], rubric{items[],deductions[]},
                         answerStyle{}, modelAnswerPatterns[], status('draft'|'confirmed'), version
                         # rubric.items[].questionNumber — 채점은 문항 단위이고 문항마다 100점이다

assignments/{id}         studentId, studentName, univId/univName, examId/examTitle,
                         questions[]{questionId,number,prompt,charTarget,tolerance,charMin,charMax,points},
                         assignedBy, dueAt, status, submittedAt
                         # 단위는 시험지. 문항 조건을 복사해 둔다 —
                         # 기출을 나중에 고쳐도 이미 낸 과제는 그대로여야 한다
answers/{id}             assignmentId, questionId, studentId, assignedBy,
                         text, charCount, charCountNoSpace, status('draft'|'submitted')
  versions/{vid}         text, charCount, savedAt, reason   # 불변
corrections/{id}         assignmentId, questionId, answerId, studentId, assignedBy,
                         status, scores{items,deductions,total},
                         inlineComments[], overall{}, revisedExample, teacherEdited, published, usage{}

# answers · corrections 는 문항마다 하나씩이고, assignmentId 로 한 시험지에 묶인다.
# assignedBy 를 복사해 두어 선생님 목록 화면이 한 번에 읽는다(복합 인덱스 없이).
```

인라인 코멘트 위치는 **원문 문자 오프셋**으로 저장한다. 원고지 칸 좌표는 렌더 시 계산하므로
규격이 바뀌어도 코멘트가 깨지지 않는다.

## 보안 규칙 요지 (`firestore.rules`)

- `role`은 `users/{uid}.role`에만 있고 클라이언트는 쓰지 못한다. 서버가 custom claim에도 동기화한다.
- 학생은 자기 답안만 읽고 쓰며, `submitted` 이후에는 수정할 수 없다.
- 첨삭 결과는 teacher가 `published: true`로 바꾸기 전에는 학생이 읽을 수 없다 (규칙 레벨 차단).
- 채점 기준 확정본·첨삭 결과·사용자 문서는 Admin SDK만 쓴다.
- Storage의 기출 PDF는 teacher만 읽고 쓴다 (40MB, `application/pdf` 제한).

## API 라우트

```
POST   /api/auth/session            로그인 (ID 토큰 → 세션 쿠키)
DELETE /api/auth/session            로그아웃
POST   /api/auth/register           가입 확정 (첫 사용자=teacher, 이후=초대 코드)
GET    POST /api/invites            초대 코드 목록 · 발급 (teacher)

GET  POST   /api/universities                       목록 · 추가(기본 6개 넣기 포함)
PATCH DELETE /api/universities/[univId]              이름 · 활성 · 삭제
GET  POST   /api/universities/[univId]/exams         연도별 기출 목록 · 생성
GET PATCH DELETE  …/exams/[examId]                   조회 · PDF 등록 · 삭제
POST        …/exams/[examId]/extract                 PDF 텍스트 추출 (pdfjs → Claude 폴백)
POST        …/exams/[examId]/parse-questions         문항 파싱 (저장하지 않고 결과만)
GET  PUT    …/exams/[examId]/questions               문항 조회 · 통째로 저장
POST        …/exams/[examId]/analyze                 채점 기준 초안 생성
GET PATCH   /api/universities/[univId]/analyses/[id] 수정 · 확정 (id = examId)

POST   /api/assignments                  시험지 배정 (그 기출의 문항 전부 + 빈 답안까지)
DELETE /api/assignments/[id]             회수 (답안·첨삭까지)
POST   /api/assignments/[id]/submit      제출 — 시험지 단위, 문항마다 버전 스냅샷
POST   /api/assignments/[id]/publish     공개 · 공개 내리기 — 시험지 단위
GET    /api/assignments/[id]/corrections 이 시험지의 첨삭 (진행 상황 폴링)

POST   /api/answers                      문항 하나의 답안 열기 (없으면 만든다)
PUT    /api/answers/[id]                 자동 저장 (문항마다)

POST   /api/corrections                  첨삭 실행 { assignmentId, questionId? }
                                         — 문항을 하나씩 차례로 돌린다
GET    /api/corrections/[id]             문항 하나 폴링
PATCH  /api/corrections/[id]             점수·코멘트 수정 (teacher)
```

## 비용

`npm run report:tokens` 로 실제로 쓴 토큰을 용도별로 본다. 재 보면 이렇다.

| 언제 | 무엇 | 1회 비용 |
|---|---|---|
| 기출 등록할 때 (한 번) | 파일 분류 (haiku) | $0.004 / 파일 |
| 기출 등록할 때 (한 번) | 문항 파싱 | $0.02~0.05 |
| 기출 등록할 때 (한 번) | 채점 기준 분석 | $0.19~0.30 |
| **답안마다** | **첨삭** | **$0.10~0.47** |

첨삭은 **문항마다** 한 번씩이다. 문항 2개짜리 시험지를 30명에게 내면 첨삭 60회다.

문제지 쪽은 기출 하나에 한 번만 들고 합쳐도 $0.3 이 안 된다.
비용은 사실상 **첨삭 하나뿐**이다 — 학생 30명 × 문항 2개면 첨삭만 60회다.

첨삭 비용의 90%는 **출력 토큰**이고, 그 대부분이 모델이 생각하는 데 쓰인다.
입력은 $0.06 정도라 프롬프트 캐싱으로 줄일 것이 없다. 줄이려면 생각을 줄여야 한다.

### API 없이 돌리기

Claude 구독을 이미 쓰고 있으면 **API 요금 없이** 같은 일을 할 수 있다.
앱이 프롬프트를 만들어 주고, claude.ai 에서 받은 답을 그대로 붙여 넣으면 읽어 들인다.
첨삭 · 문항 뽑기 · 채점 기준 분석 세 가지 모두 화면에 `직접 …` 버튼이 있다.

- 첨삭 프롬프트에는 답안 한 편이 들어가므로 **문항 하나가 단위**다. 문항이 둘이면 두 번 돌린다.
  화면이 남은 문항을 표시하고, 하나를 넣으면 다음 문항으로 넘어간다.
- 프롬프트를 만드는 데는 API 를 부르지 않는다 — 파일에서 틀을 읽어 값을 끼워 넣는 문자열 조립이다.
- 사람이 옮길 때는 글자 번호를 셀 수 없으므로, 첨삭 코멘트 위치를 **원문 조각(quote)** 으로 받아
  앱이 답안에서 찾아 붙인다. 공백이 달라져도 찾고, 못 찾은 것은 몇 개인지 알려 준다.
- 배점은 확정 기준을 정본으로 삼는 처리를 API 경로와 함께 쓴다.
- `npm run smoke:manual` — 앱이 만든 프롬프트를 모델에 넣고 받은 답을 앞뒤 인사말까지 붙여
  다시 앱에 넣어 본다. 세 가지 모두 확인한다.

`npm run bench:correction` — 같은 답안·같은 기준으로 설정을 바꿔 가며 견준다.
문항에 맞는 답안을 그때그때 만들어 쓰므로 어느 기출이 걸려도 뜻 있는 비교가 된다.
홍익대 2027 모의논술 1번(800자) 답안 한 편으로 잰 결과:

| 설정 | 출력 토큰 | 비용 | 점수 | 코멘트 | 걸린 시간 |
|---|---|---|---|---|---|
| opus-5 기본 | 16,556 | $0.474 | 47 | 14 | 190초 |
| **opus-5 · low** | **5,449** | **$0.196** | **49** | 13 | 73초 |
| sonnet-5 · medium | 18,728 | $0.211 | 55 | 13 | 168초 |
| sonnet-5 · low | 7,729 | $0.101 | 52 | 12 | 77초 |

네 설정이 47~55점으로 모였고, **답안의 핵심 결함(제시문 (가)의 방법을 셋이 아닌 둘로 축소)을 넷 다 잡아냈다.**
그래서 기본값을 `opus-5 · low` 로 둔다 — 판단은 그대로 두고 군더더기 생각만 줄여 60% 아낀다.
더 아끼려면 `ANTHROPIC_MODEL_CORRECTION=claude-sonnet-5` 로 바꾼다(추가로 절반).

단, 이건 **답안 한 편으로 잰 것**이다. 실제 학생 답안 몇 편으로 다시 견줘 보고 정하는 편이 낫다.

## Claude 호출 설계

| 용도 | 입력 | 출력 |
|---|---|---|
| 파일 분류 | 쪽별 앞부분 요약 + 등록된 대학 목록 | 대학 · 연도 · (계열 · 종류 · 쪽 범위)[] |
| 문항 파싱 | 문제 PDF 텍스트 | 문항 배열 |
| 채점 기준 분석 | 문제 + 해설 텍스트 | `question_types` / `rubric` / `answer_style` / `model_answer_patterns` |
| 첨삭 | 답안 + 논제 + 제시문 + 확정 rubric + 모범답안 | `scores` / `inline_comments` / `overall` / `revised_example` |

- JSON은 structured outputs(`output_config.format`)로 스키마를 강제하고, 실패 시 1회 재시도 후 오류 상태 저장.
- 논제·제시문·rubric은 prompt caching 대상으로 앞쪽에 고정 배치 (같은 문항 여러 학생 첨삭 시 비용 절감).
- 긴 출력이므로 streaming 사용. Vercel Pro의 `maxDuration`을 넉넉히 잡고, 연결이 끊겨도 폴링으로 복구한다.
- 해설에 명시된 기준은 그대로 쓰고, 없으면 모범답안에서 추론한 뒤 `inferred: true`로 표시한다.

## 원고지 작성법 검사

`lib/manuscript/rules.ts`에서 순수 함수로 구현하고, 위반은 첨삭 인라인 코멘트와 **같은 자료 구조**
(`{ offset, length, rule, message, severity }`)로 반환해 화면에서 함께 표시한다.

`INDENT_FIRST` 문단 첫 칸 비우기 · `PUNCT_LINE_START` 문장부호 줄 첫 칸 금지(앞 줄 마지막 칸 병기) ·
`SPACE_AT_LINE_START` 줄 첫 칸 띄어쓰기 무시 · `ALNUM_TWO_PER_CELL` 숫자·영문 한 칸 두 자 ·
`QUOTE_BRACKET` 따옴표·괄호 위치 · `LENGTH` 분량 초과·미달

## 인쇄

`@media print` + 인쇄 전용 페이지로 A4 출력 4종 — ① 문제지 ② 빈 답안지 ③ 작성된 답안지 ④ 첨삭 결과지.

원고지 38칸을 세로 A4 에 넣으면 칸이 16px 까지 작아진다. 그래서 **답안지·첨삭지는 가로로** 낸다
(폭 277mm, 칸 25px). 문제지 본문만 세로로 읽고, 뒤에 붙는 답안지는 이름 붙인 `@page` 로 가로로 넘긴다.

인쇄는 넷 다 **시험지 한 벌**이 단위다(`/print/…/[assignmentId]`). 문항 수만큼 장이 늘어난다.

| 출력 | 방향 | 구성 |
|---|---|---|
| 문제지 | 세로 + 가로 | 1쪽 제시문·논제 전부(세로), 뒤에 문항마다 빈 답안지(가로) |
| 빈 답안지 | 가로 | 문항마다 한 장 — 머리글 + 원고지 |
| 작성된 답안지 | 가로 | 문항마다 한 장 — 머리글 + 답안이 놓인 원고지 |
| 첨삭 결과지 | 가로 3쪽 × 문항 수 | 1쪽 채점·답안(번호 표시), 2쪽 코멘트(두 단), 3쪽 총평·고쳐 쓴 예시 |

서버 PDF 생성은 Vercel 환경 제약을 고려해 2차 과제로 둔다.

## 구현 순서

1. **프로젝트 셋업 + Firebase Auth·역할·보안 규칙** ← 완료
2. 원고지 컴포넌트 + 작성법 검사 ← 완료
3. PDF 업로드·파싱 + 대학별 채점 기준 분석 ← 완료
4. 첨삭 API + 결과 화면 ← 완료
5. 인쇄 ← 완료
6. 관리 화면 다듬기 ← 완료

기출 PDF가 아직 없으므로 3단계는 더미 기출로 파이프라인을 검증하고, 실제 PDF는 그대로 투입한다.

## 점검 스크립트

| 명령 | 내용 |
|---|---|
| `npm run check:manuscript` | 원고지 배치·작성법 규칙 단위 검증 (외부 호출 없음) |
| `npm run check:zip` | zip 에서 기출 파일만 골라내는지 (외부 호출 없음) |
| `npm run check:hwpx` | 한글(HWPX) 글자·쪽 추출 (외부 호출 없음) |
| `npm run check:pdfbuf` | pdfjs 가 원본 버퍼를 가져가지 않는지 — 같은 파일을 OCR 로 다시 보낼 수 있어야 한다 |
| `npm run check:pdfjs` | 폴백 경로(pdfjs)가 브라우저 전역 없이도 뜨는지 |
| `npm run check:pagecount` | 원본 바이트로 PDF 쪽 수를 세는지 — OCR 응답이 잘렸는지 가리는 데 쓴다 |
| `npm run check:crop` | 학생에게 배정된 쪽만 나가는지 — 같은 파일의 해설 쪽이 딸려 나가면 안 된다 |
| `npm run check:pages <없음>` | 화면 · 인쇄 15종이 뜨는지만 훑는다. Claude 를 부르지 않아 요금이 없다 |
| `npm run check:print <과제id>` + `check:printfit` | 인쇄 화면을 받아 PDF 로 만든 뒤, 글자가 종이 안에 들어오는지 잰다 |
| `npm run check:clova` | CLOVA OCR 연동 확인. 내부 전용 주소면 먼저 걸러 준다. 실제 호출이라 요금이 든다 |
| `npm run smoke:stage3` | dev 서버를 켠 채 추출 → 문항 파싱 → 채점 기준 분석 → 확정까지 |
| `npm run smoke:intake` | 인문·자연, 문제·해설이 섞인 PDF·HWPX 를 대학까지 알아내 기출로 묶는지 |
| `npm run smoke:full` | **전 과정** — 기출 등록 → 기준 확정 → 학생 가입 → 배정 → 작성·제출 → 첨삭 → 공개 → 학생 확인 → 인쇄 4종 |
| `npm run smoke:practice` | 선생님이 자기에게 과제를 내서 직접 풀고 첨삭까지 돌리는 흐름 |
| `npm run setup:demo` · `npm run cleanup:test` | 눈으로 확인할 데이터 만들기 · 점검 데이터 정리 |
| `npm run migrate:assignments` | 과제 단위를 문항 → 시험지로 옮긴 일회성 이사 (`DRY=1` 로 미리 보기) |
| `npm run time:pages` | 로그인한 상태에서 관리 화면 응답 시간 측정 |

smoke 계열은 Claude API 를 실제로 호출하고, 만든 데이터는 끝나고 지운다.
