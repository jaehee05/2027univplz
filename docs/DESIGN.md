# 인문 논술 첨삭 웹 서비스 — 설계

대학별 인문 논술 기출·모범답안을 분석해 채점 기준을 만들고, 학생이 웹 원고지에 쓴 답안을
Claude API로 첨삭하는 서비스. 문제지·답안지·첨삭 결과는 모두 A4 인쇄 가능.

- 대상 대학: 홍익대, 단국대, 건국대, 동국대, 국민대, 아주대 (관리 화면에서 추가·삭제)
- 인문 논술만 다룬다. 문항에 `원고지 / 자유 서식` 타입 필드만 두고 수리 서식은 구현하지 않는다.

## 기술 스택

| 영역 | 선택 |
|---|---|
| 프레임워크 | Next.js 16 (App Router) + TypeScript + Tailwind v4, Vercel Pro 배포 |
| 인증 | Firebase Auth (이메일/비밀번호 + Google) → 서버는 httpOnly 세션 쿠키 |
| DB | Firestore |
| 파일 | Firebase Storage (기출·해설 PDF) |
| LLM | Claude API — 첨삭·분석 `claude-opus-5`, 파일 분류·텍스트화 `claude-haiku-4-5` (환경변수 교체 가능) |
| PDF 글자 | 네이버 CLOVA OCR — 텍스트 PDF·스캔본을 가리지 않고 한 번에 읽는다. 없거나 실패하면 pdfjs → Claude |
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
                         questionId/questionNumber/questionPrompt, charTarget, tolerance,
                         assignedBy, dueAt, status, answerId, correctionId
                         # 문항 조건을 복사해 둔다 — 기출을 나중에 고쳐도 낸 과제는 그대로여야 한다
answers/{id}             studentId, assignmentId, text, charCount, status('draft'|'submitted')
  versions/{vid}         text, charCount, savedAt, reason   # 불변
corrections/{id}         answerId, assignmentId, studentId, status, scores{items,deductions,total},
                         inlineComments[], overall{}, revisedExample, teacherEdited, published, usage{}
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

POST   /api/assignments                  과제 배정
PUT    /api/answers/[id]                 자동 저장
POST   /api/answers/[id]/submit          제출 (버전 스냅샷)

POST   /api/corrections                  첨삭 잡 생성
GET    /api/corrections/[id]             폴링
GET    /api/corrections/[id]/stream      SSE 진행
PATCH  /api/corrections/[id]             점수·코멘트 수정 · 공개 (teacher)
```

## Claude 호출 설계

| 용도 | 입력 | 출력 |
|---|---|---|
| 파일 분류 | 쪽별 앞부분 요약 + 등록된 대학 목록 | 대학 · 연도 · (계열 · 종류 · 쪽 범위)[] |
| PDF 텍스트화 | `document`(base64 PDF) — CLOVA OCR 이 없거나 실패했을 때만 | 텍스트 |
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
| `npm run check:clova` | CLOVA OCR 연동 확인. 내부 전용 주소면 먼저 걸러 준다. 실제 호출이라 요금이 든다 |
| `npm run smoke:stage3` | dev 서버를 켠 채 추출 → 문항 파싱 → 채점 기준 분석 → 확정까지 |
| `npm run smoke:intake` | 인문·자연, 문제·해설이 섞인 PDF·HWPX 를 대학까지 알아내 기출로 묶는지 |
| `npm run smoke:full` | **전 과정** — 기출 등록 → 기준 확정 → 학생 가입 → 배정 → 작성·제출 → 첨삭 → 공개 → 학생 확인 → 인쇄 4종 |
| `npm run time:pages` | 로그인한 상태에서 관리 화면 응답 시간 측정 |

smoke 계열은 Claude API 를 실제로 호출하고, 만든 데이터는 끝나고 지운다.
