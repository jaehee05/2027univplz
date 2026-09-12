/**
 * 눈으로 확인할 데모 데이터를 만든다. npm run setup:demo
 * 기출(문제지 PDF 포함) → 문항 저장 → 학생 계정 → 과제 배정 까지.
 * 지울 때는 npm run cleanup:test.
 */
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

process.loadEnvFile(".env.local");

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const UNIV = "ajou";
const PDF = process.env.DEMO_PDF ?? "/tmp/dummy/twoq.pdf";
const EMAIL = "demo-student@example.com";
const PASSWORD = "demo-student-1234";

let cookie = "";

async function api(path: string, init: RequestInit = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", cookie, ...(init.headers ?? {}) },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${path} → ${response.status} ${text.slice(0, 200)}`);
  // 확인용 스크립트라 응답 모양은 느슨하게 다룬다.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return JSON.parse(text) as any;
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

  const teachers = await db.collection("users").where("role", "==", "teacher").limit(1).get();
  const teacherUid = teachers.docs[0].id;
  const token = await auth.createCustomToken(teacherUid, { role: "teacher" });
  const exchange = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${KEY}`,
    { method: "POST", body: JSON.stringify({ token, returnSecureToken: true }) },
  );
  const session = await fetch(`${BASE}/api/auth/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: (await exchange.json()).idToken }),
  });
  cookie = (session.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");

  await api("/api/universities", { method: "POST", body: JSON.stringify({ seedDefaults: true }) });

  const exam = await api(`/api/universities/${UNIV}/exams`, {
    method: "POST",
    body: JSON.stringify({ year: 2028, title: "[확인용] 논술고사 (인문)" }),
  });
  const examId = exam.examId;

  const path = `exams/${UNIV}/${examId}/question.pdf`;
  await bucket.upload(PDF, { destination: path, contentType: "application/pdf" });
  const [meta] = await bucket.file(path).getMetadata();
  await api(`/api/universities/${UNIV}/exams/${examId}`, {
    method: "PATCH",
    body: JSON.stringify({
      pdf: { kind: "question", storagePath: path, fileName: "question.pdf", size: Number(meta.size) },
    }),
  });
  await api(`/api/universities/${UNIV}/exams/${examId}/extract`, {
    method: "POST",
    body: JSON.stringify({ kind: "question" }),
  });

  const parsed = await api(`/api/universities/${UNIV}/exams/${examId}/parse-questions`, {
    method: "POST",
  });
  const saved = await api(`/api/universities/${UNIV}/exams/${examId}/questions`, {
    method: "PUT",
    body: JSON.stringify({ questions: parsed.questions }),
  });
  console.log(`문항 ${saved.questions.length}개`);

  // 학생 계정 — 이미 있으면 다시 쓴다.
  let uid: string;
  try {
    uid = (await auth.getUserByEmail(EMAIL)).uid;
    await auth.updateUser(uid, { password: PASSWORD });
  } catch {
    const invite = await api("/api/invites", {
      method: "POST",
      body: JSON.stringify({ label: "확인용", role: "student", validDays: 1 }),
    });
    const signUp = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${KEY}`, {
      method: "POST",
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true }),
    });
    const created = await signUp.json();
    uid = created.localId;
    await fetch(`${BASE}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: created.idToken, displayName: "확인용학생", inviteCode: invite.code }),
    });
  }

  // 과제 단위는 시험지다 — 이 기출의 문항이 전부 나간다.
  await api("/api/assignments", {
    method: "POST",
    body: JSON.stringify({ studentIds: [uid], univId: UNIV, examId }),
  });

  const mine = await api("/api/assignments");
  const assignment = mine.assignments.find(
    (a: { examId: string }) => a.examId === examId,
  );

  console.log(`\n학생 로그인: ${EMAIL} / ${PASSWORD}`);
  console.log(`쓰기 화면: ${BASE}/write/${assignment.id}`);
}

main().catch((error) => {
  console.error(`✖ ${error.message}`);
  process.exit(1);
});
