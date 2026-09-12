/**
 * 선생님이 직접 풀어 보는 흐름 점검. npm run smoke:practice
 * 자기에게 과제를 내고 → 쓰고 → 제출하고 → 첨삭까지 돌려 본다.
 */
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

process.loadEnvFile(".env.local");

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const ANSWER =
  "도시는 낯선 사람들이 서로를 견디며 살아가는 법을 익히는 장소다. 제시문 가는 익명성이 " +
  "부담이자 자유라는 두 얼굴을 지닌다고 본다. 부담은 평판의 압력에서 벗어나게 하고, " +
  "자유는 그 대가로 서로를 향한 최소한의 예의를 스스로 지키게 만든다. 이 둘은 분리되지 않는다. " +
  "따라서 익명성을 없애는 방향이 아니라, 익명 속에서도 마주침이 일어나도록 공간을 설계하는 " +
  "일이 도시의 과제다.";

let cookie = "";

async function api(path: string, init: RequestInit = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", cookie, ...(init.headers ?? {}) },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${path} → ${response.status} ${text.slice(0, 200)}`);
  // 점검용이라 응답 모양은 느슨하게 다룬다.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return JSON.parse(text) as any;
}

async function main() {
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  sa.private_key = sa.private_key.replace(/\\n/g, "\n");
  const app = getApps()[0] ?? initializeApp({ credential: cert(sa) });
  const db = getFirestore(app);

  const teachers = await db.collection("users").where("role", "==", "teacher").limit(1).get();
  const uid = teachers.docs[0].id;
  const token = await getAuth(app).createCustomToken(uid, { role: "teacher" });
  const exchange = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
    { method: "POST", body: JSON.stringify({ token, returnSecureToken: true }) },
  );
  const session = await fetch(`${BASE}/api/auth/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: (await exchange.json()).idToken }),
  });
  cookie = (session.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  console.log(`▶ 선생님 ${uid}`);

  // 확인용 기출을 통째로 쓴다 — 과제 단위가 시험지이기 때문이다.
  const exams = await db.collection("universities").doc("ajou").collection("exams").get();
  const exam = exams.docs.find((d) => (d.data().title ?? "").includes("[확인용]"));
  if (!exam) throw new Error("확인용 기출이 없습니다. npm run setup:demo 를 먼저 돌리세요.");

  // 첨삭은 확정된 채점 기준이 있어야 돈다.
  const analysis = await exam.ref.parent.parent!.collection("analyses").doc(exam.id).get();
  if (analysis.data()?.status !== "confirmed") {
    console.log("▶ 채점 기준 분석 · 확정 (아직 없어서)");
    if (!analysis.exists) {
      await api(`/api/universities/ajou/exams/${exam.id}/analyze`, { method: "POST" });
    }
    const confirmed = await api(`/api/universities/ajou/analyses/${exam.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "confirmed" }),
    });
    console.log(`  ${confirmed.analysis.status} · 항목 ${confirmed.analysis.rubric.items.length}개`);
  }

  // 지난 점검이 남긴 것이 있으면 지우고 시작한다.
  const existing = await api("/api/assignments");
  for (const row of existing.assignments as { id: string; selfPractice: boolean; examId: string }[]) {
    if (row.selfPractice && row.examId === exam.id) {
      await api(`/api/assignments/${row.id}`, { method: "DELETE" });
      console.log(`▶ 지난 연습 과제 지움 (${row.id})`);
    }
  }

  console.log("▶ 나에게 과제 내기");
  const assigned = await api("/api/assignments", {
    method: "POST",
    body: JSON.stringify({ studentIds: [uid], univId: "ajou", examId: exam.id }),
  });
  const mine = assigned.assignments.filter(
    (a: { selfPractice: boolean; examId: string }) => a.selfPractice && a.examId === exam.id,
  );
  console.log(`  내 연습 과제 ${mine.length}건 (selfPractice=${mine[0]?.selfPractice})`);
  const assignment = mine[0];
  console.log(`  문항 ${assignment.questions.length}개가 한 과제로 나감`);

  console.log("▶ 문제지 받기");
  const paper = await fetch(`${BASE}/api/assignments/${assignment.id}/paper`, {
    headers: { cookie },
  });
  console.log(`  ${paper.status} · ${paper.headers.get("content-type")} · ${Math.round(Number(paper.headers.get("content-length") ?? 0) / 1024)}KB`);

  console.log("▶ 문항마다 쓰고, 시험지째 제출");
  for (const question of assignment.questions as { questionId: string; number: string }[]) {
    const opened = await api("/api/answers", {
      method: "POST",
      body: JSON.stringify({ assignmentId: assignment.id, questionId: question.questionId }),
    });
    await api(`/api/answers/${opened.answer.id}`, {
      method: "PUT",
      body: JSON.stringify({
        text: ANSWER,
        charCount: ANSWER.length,
        charCountNoSpace: ANSWER.replace(/\s/g, "").length,
      }),
    });
  }
  await api(`/api/assignments/${assignment.id}/submit`, { method: "POST" });
  console.log(`  문항 ${assignment.questions.length}개 · 각 ${ANSWER.length}자 제출`);

  console.log("▶ 첨삭");
  await api("/api/corrections", {
    method: "POST",
    body: JSON.stringify({ assignmentId: assignment.id }),
  });
  const beganAt = Date.now();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let corrections: any[] = [];
  for (;;) {
    corrections = (await api(`/api/assignments/${assignment.id}/corrections`)).corrections;
    const failed = corrections.find((one) => one.status === "error");
    if (failed) throw new Error(`첨삭 실패: ${failed.error}`);
    if (
      corrections.length === assignment.questions.length &&
      corrections.every((one) => one.status === "done")
    ) {
      break;
    }
    if (Date.now() - beganAt > 20 * 60 * 1000) throw new Error("20분 안에 안 끝났습니다.");
    await new Promise((r) => setTimeout(r, 5000));
  }
  console.log(
    `  ${Math.round((Date.now() - beganAt) / 1000)}초 · ` +
      corrections
        .map((one) => `${one.scores.total}점(코멘트 ${one.inlineComments.length})`)
        .join(" · "),
  );

  console.log("\n✔ 선생님 직접 풀이 통과");

  // KEEP=1 로 돌리면 눈으로 보려고 남겨 둔다.
  if (process.env.KEEP) {
    console.log(`  결과 화면: ${BASE}/admin/corrections/${assignment.id}`);
    return;
  }
  console.log("▶ 정리");
  await api(`/api/assignments/${assignment.id}`, { method: "DELETE" });
  console.log("  지웠습니다.");
}

main().catch((e) => {
  console.error(`\n✖ ${e.message}`);
  process.exit(1);
});
