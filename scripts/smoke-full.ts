/**
 * 전 과정 점검 — 실제 사용 순서 그대로 돌린다.
 *   npm run dev
 *   npm run smoke:full
 *
 * 기출 등록 → 채점 기준 확정 → 학생 초대·가입 → 과제 배정 →
 * 답안 작성·제출 → 첨삭 → 공개 → 학생이 결과 확인.
 * 끝나면 만든 것(기출·과제·학생 계정)을 모두 지운다.
 */
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

process.loadEnvFile(".env.local");

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const UNIV = "hongik";
const KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

const ANSWER = [
  "근대의 공론장은 신분이 아니라 논거의 설득력이 의견의 우열을 가르는 공간이었다.",
  "제시문 가는 커피하우스와 살롱에서 시작된 이 토론의 관행이 대중매체의 발달과 함께",
  "소비의 공간으로 바뀌었다고 지적한다. 시민은 토론의 참여자에서 여론의 수용자로 물러났다.",
  "제시문 나가 말하는 알고리즘은 이 변화를 한층 심화시킨다. 이용자의 과거 선택을 학습한",
  "알고리즘은 기존 신념을 강화하는 정보만을 반복해서 보여 주고, 다른 견해는 시야에서 지운다.",
  "그 결과 개인은 편해지지만 사회는 서로 다른 견해가 부딪히며 조정되는 학습의 기회를 잃는다.",
  "이러한 변화는 민주주의의 기반을 흔든다. 민주주의는 다수의 결정이라는 절차만으로 성립하지",
  "않고, 결정에 앞서 서로의 근거를 검토하는 과정을 전제하기 때문이다. 검토가 사라진 자리에",
  "남는 것은 확신을 확인하는 절차뿐이다. 따라서 공론장의 회복은 정보의 양을 늘리는 것이",
  "아니라, 이질적인 견해와 마주칠 수밖에 없는 자리를 제도적으로 만드는 데서 시작해야 한다.",
].join(" ");

let teacherCookie = "";
let studentCookie = "";

function step(title: string) {
  console.log(`\n▶ ${title}`);
}

async function api(path: string, init: RequestInit & { as?: "teacher" | "student" } = {}) {
  const { as = "teacher", ...rest } = init;
  const response = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      cookie: as === "teacher" ? teacherCookie : studentCookie,
      ...(rest.headers ?? {}),
    },
  });
  const text = await response.text();
  let data: Record<string, string>;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text.slice(0, 200) };
  }
  if (!response.ok) {
    throw new Error(`${rest.method ?? "GET"} ${path} → ${response.status} ${data.error ?? text.slice(0, 200)}`);
  }
  // 점검용이라 응답 모양은 느슨하게 다룬다.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return data as any;
}

async function sessionFor(idToken: string): Promise<string> {
  const response = await fetch(`${BASE}/api/auth/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!response.ok) throw new Error(`세션 생성 실패: ${await response.text()}`);
  return (response.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
}

async function main() {
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  sa.private_key = sa.private_key.replace(/\\n/g, "\n");
  const app =
    getApps()[0] ??
    initializeApp({
      credential: cert(sa),
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    });
  const db = getFirestore(app);
  const auth = getAuth(app);
  const bucket = getStorage(app).bucket();

  step("선생님 로그인");
  const teachers = await db.collection("users").where("role", "==", "teacher").limit(1).get();
  if (teachers.empty) throw new Error("teacher 계정이 없습니다.");
  const teacherUid = teachers.docs[0].id;
  const teacherToken = await auth.createCustomToken(teacherUid, { role: "teacher" });
  const teacherExchange = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${KEY}`,
    { method: "POST", body: JSON.stringify({ token: teacherToken, returnSecureToken: true }) },
  );
  teacherCookie = await sessionFor((await teacherExchange.json()).idToken);
  console.log(`  ${teacherUid}`);

  step("기출 등록 · 추출");
  await api("/api/universities", { method: "POST", body: JSON.stringify({ seedDefaults: true }) });
  const exam = await api(`/api/universities/${UNIV}/exams`, {
    method: "POST",
    body: JSON.stringify({ year: 2027, title: "[전체점검] 모의 논술" }),
  });
  const examId: string = exam.examId;

  let studentUid: string | null = null;
  try {
    for (const [kind, file] of [
      ["question", "/tmp/dummy/exam.pdf"],
      ["solution", "/tmp/dummy/solution.pdf"],
    ] as const) {
      const path = `exams/${UNIV}/${examId}/${kind}.pdf`;
      await bucket.upload(file, { destination: path, contentType: "application/pdf" });
      const [meta] = await bucket.file(path).getMetadata();
      await api(`/api/universities/${UNIV}/exams/${examId}`, {
        method: "PATCH",
        body: JSON.stringify({
          pdf: { kind, storagePath: path, fileName: `${kind}.pdf`, size: Number(meta.size) },
        }),
      });
      const extracted = await api(`/api/universities/${UNIV}/exams/${examId}/extract`, {
        method: "POST",
        body: JSON.stringify({ kind }),
      });
      console.log(`  ${kind}: ${extracted.extraction.method} · ${extracted.extraction.chars}자`);
    }

    step("문항 파싱 · 저장");
    const parsed = await api(`/api/universities/${UNIV}/exams/${examId}/parse-questions`, {
      method: "POST",
    });
    const saved = await api(`/api/universities/${UNIV}/exams/${examId}/questions`, {
      method: "PUT",
      body: JSON.stringify({ questions: parsed.questions }),
    });
    const question = saved.questions[0];
    console.log(`  문항 ${saved.questions.length}개 · 첫 문항 ${question.number}번 ${question.charTarget}자`);

    step("채점 기준 분석 · 확정");
    await api(`/api/universities/${UNIV}/exams/${examId}/analyze`, { method: "POST" });
    const confirmed = await api(`/api/universities/${UNIV}/analyses/${examId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "confirmed" }),
    });
    console.log(`  ${confirmed.analysis.status} · 항목 ${confirmed.analysis.rubric.items.length}개`);

    step("학생 초대 · 가입");
    const invite = await api("/api/invites", {
      method: "POST",
      body: JSON.stringify({ label: "점검용", role: "student", validDays: 1 }),
    });
    const email = `smoke-${Date.now()}@example.com`;
    const signUp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${KEY}`,
      {
        method: "POST",
        body: JSON.stringify({ email, password: "smoke-test-1234", returnSecureToken: true }),
      },
    );
    const created = await signUp.json();
    if (!signUp.ok) throw new Error(`학생 가입 실패: ${JSON.stringify(created)}`);
    studentUid = created.localId;

    const register = await fetch(`${BASE}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idToken: created.idToken,
        displayName: "점검학생",
        inviteCode: invite.code,
      }),
    });
    const registered = await register.json();
    if (!register.ok) throw new Error(`학생 등록 실패: ${registered.error}`);
    console.log(`  ${email} · ${registered.role}`);

    // claim 이 붙은 토큰으로 다시 받아 세션을 만든다.
    const studentToken = await auth.createCustomToken(studentUid!, { role: "student" });
    const studentExchange = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${KEY}`,
      { method: "POST", body: JSON.stringify({ token: studentToken, returnSecureToken: true }) },
    );
    studentCookie = await sessionFor((await studentExchange.json()).idToken);

    step("과제 배정");
    const assigned = await api("/api/assignments", {
      method: "POST",
      body: JSON.stringify({
        studentIds: [studentUid],
        univId: UNIV,
        examId,
        questionId: question.id,
      }),
    });
    console.log(`  ${assigned.created}명에게 배정`);

    step("학생이 답안 작성 · 제출");
    const mine = await api("/api/assignments", { as: "student" });
    const assignment = mine.assignments[0];
    const opened = await api("/api/answers", {
      as: "student",
      method: "POST",
      body: JSON.stringify({ assignmentId: assignment.id }),
    });
    await api(`/api/answers/${opened.answer.id}`, {
      as: "student",
      method: "PUT",
      body: JSON.stringify({
        text: ANSWER,
        charCount: ANSWER.length,
        charCountNoSpace: ANSWER.replace(/\s/g, "").length,
      }),
    });
    await api(`/api/answers/${opened.answer.id}/submit`, { as: "student", method: "POST" });
    console.log(`  ${ANSWER.length}자 제출`);

    step("첨삭");
    const started = await api("/api/corrections", {
      method: "POST",
      body: JSON.stringify({ assignmentId: assignment.id }),
    });
    // 첨삭은 응답을 보낸 뒤에 이어서 돌아간다. 끝날 때까지 상태를 물어 본다.
    const beganAt = Date.now();
    let correction = started.correction;
    while (correction.status === "queued" || correction.status === "running") {
      if (Date.now() - beganAt > 12 * 60 * 1000) throw new Error("첨삭이 12분 안에 안 끝났습니다.");
      await new Promise((resolve) => setTimeout(resolve, 5000));
      correction = (await api(`/api/corrections/${started.correction.id}`)).correction;
    }
    if (correction.status !== "done") throw new Error(`첨삭 실패: ${correction.error}`);
    console.log(`  ${Math.round((Date.now() - beganAt) / 1000)}초 걸림`);
    const total = correction.scores.items.reduce(
      (sum: number, item: { awarded: number }) => sum + item.awarded,
      0,
    );
    console.log(`  ${total}점 · 코멘트 ${correction.inlineComments.length}개 · ${correction.usage.model}`);
    for (const item of correction.scores.items) {
      console.log(`    ${item.awarded}/${item.points} ${item.name}`);
    }
    const bad = correction.inlineComments.filter(
      (c: { start: number; end: number }) => c.end > ANSWER.length || c.end <= c.start,
    );
    console.log(`  코멘트 위치 ${bad.length === 0 ? "모두 답안 안쪽 ✓" : `${bad.length}개 벗어남 ✖`}`);
    console.log(`  고쳐 쓴 예시 ${correction.revisedExample.length}자`);

    step("학생 화면 — 공개 전");
    const blocked = await fetch(`${BASE}/api/corrections/${correction.id}`, {
      headers: { cookie: studentCookie },
    });
    console.log(`  ${blocked.status === 403 ? "막힘 ✓ (403)" : `열림 ✖ (${blocked.status})`}`);

    step("공개");
    await api(`/api/corrections/${correction.id}`, {
      method: "PATCH",
      body: JSON.stringify({ published: true }),
    });
    const visible = await api(`/api/corrections/${correction.id}`, { as: "student" });
    console.log(`  학생이 ${visible.correction.scores.total}점 결과를 봄 ✓`);

    step("인쇄 화면");
    for (const [label, path] of [
      ["문제지", `/print/exam/${assignment.id}`],
      ["빈 답안지", `/print/sheet/${assignment.id}`],
      ["작성된 답안지", `/print/answer/${opened.answer.id}`],
      ["첨삭 결과지", `/print/correction/${correction.id}`],
    ] as const) {
      const response = await fetch(`${BASE}${path}`, { headers: { cookie: studentCookie } });
      console.log(`  ${label} ${response.ok ? "✓" : `✖ ${response.status}`}`);
    }

    console.log("\n✔ 전 과정 통과");
  } finally {
    step("정리");
    await api(`/api/universities/${UNIV}/exams/${examId}`, { method: "DELETE" }).catch(() => {});
    if (studentUid) {
      await api(`/api/students/${studentUid}`, { method: "DELETE" }).catch(() => {});
    }
    console.log("  지웠습니다.");
  }
}

main().catch((error) => {
  console.error(`\n✖ ${error.message}`);
  process.exit(1);
});
