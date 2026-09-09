/**
 * 3단계 파이프라인 점검 — 로컬 dev 서버를 켠 채로 돌린다.
 *   npm run dev
 *   npm run smoke:stage3
 *
 * 선생님 계정으로 세션을 만들고, 더미 기출 PDF 를 올려
 * 추출 → 문항 파싱 → 채점 기준 분석 → 확정 까지 실제로 통과하는지 본다.
 * 끝나면 만든 기출을 지운다.
 */

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

process.loadEnvFile(".env.local");

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const UNIV = "hongik";
const EXAM_PDF = process.env.SMOKE_EXAM_PDF ?? "/tmp/dummy/exam.pdf";
const SOLUTION_PDF = process.env.SMOKE_SOLUTION_PDF ?? "/tmp/dummy/solution.pdf";

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");

const app = getApps()[0] ?? initializeApp({
  credential: cert(serviceAccount),
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
});
const auth = getAuth(app);
const db = getFirestore(app);
const bucket = getStorage(app).bucket();

/** 점검용이라 응답 필드는 느슨하게 받는다. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiValue = any;

let cookie = "";

function step(title: string) {
  console.log(`\n▶ ${title}`);
}

async function api(path: string, init: RequestInit = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", cookie, ...(init.headers ?? {}) },
  });
  const text = await response.text();
  let data: Record<string, never> | Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text.slice(0, 300) };
  }
  if (!response.ok) {
    throw new Error(
      `${init.method ?? "GET"} ${path} → ${response.status} ${data.error ?? text.slice(0, 200)}`,
    );
  }
  // 점검용 스크립트라 응답 모양은 느슨하게 다룬다.
  return data as Record<string, ApiValue>;
}

async function signInAsTeacher() {
  step("선생님 계정으로 로그인");
  const snap = await db.collection("users").where("role", "==", "teacher").limit(1).get();
  if (snap.empty) throw new Error("teacher 계정이 없습니다. 먼저 가입하세요.");
  const uid = snap.docs[0].id;

  const customToken = await auth.createCustomToken(uid, { role: "teacher" });
  const key = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const exchange = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  const tokenData = await exchange.json();
  if (!exchange.ok) throw new Error(`토큰 교환 실패: ${JSON.stringify(tokenData)}`);

  const session = await fetch(`${BASE}/api/auth/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: tokenData.idToken }),
  });
  if (!session.ok) throw new Error(`세션 생성 실패: ${session.status} ${await session.text()}`);

  cookie = (session.headers.getSetCookie?.() ?? [])
    .map((entry) => entry.split(";")[0])
    .join("; ");
  if (!cookie) throw new Error("세션 쿠키를 받지 못했습니다.");
  console.log(`  uid ${uid} 로 로그인`);
}

async function uploadPdf(examId: string, kind: "question" | "solution", file: string) {
  const path = `exams/${UNIV}/${examId}/${kind}-${Date.now()}.pdf`;
  await bucket.upload(file, { destination: path, contentType: "application/pdf" });
  const [meta] = await bucket.file(path).getMetadata();
  await api(`/api/universities/${UNIV}/exams/${examId}`, {
    method: "PATCH",
    body: JSON.stringify({
      pdf: { kind, storagePath: path, fileName: file.split("/").pop(), size: Number(meta.size) },
    }),
  });
  console.log(`  ${kind} 업로드 완료 (${Math.round(Number(meta.size) / 1024)}KB)`);
}

async function main() {
  await signInAsTeacher();

  step("대학 기본값 넣기");
  const seeded = await api("/api/universities", {
    method: "POST",
    body: JSON.stringify({ seedDefaults: true }),
  });
  console.log(`  대학 ${seeded.universities.length}개 (새로 추가 ${seeded.added})`);

  step("기출 만들기");
  const created = await api(`/api/universities/${UNIV}/exams`, {
    method: "POST",
    body: JSON.stringify({ year: 2027, title: "[스모크] 모의 논술", session: "테스트" }),
  });
  const examId: string = created.examId;
  console.log(`  examId ${examId}`);

  try {
    step("PDF 올리기");
    await uploadPdf(examId, "question", EXAM_PDF);
    await uploadPdf(examId, "solution", SOLUTION_PDF);

    step("텍스트 추출");
    for (const kind of ["question", "solution"] as const) {
      const result = await api(`/api/universities/${UNIV}/exams/${examId}/extract`, {
        method: "POST",
        body: JSON.stringify({ kind }),
      });
      const { method, pages, chars } = result.extraction;
      console.log(`  ${kind}: ${method} · ${pages}쪽 · ${chars}자`);
      if (method !== "pdfjs") console.log(`    ↳ ${result.extraction.note}`);
    }

    step("문항 파싱");
    const parsed = await api(`/api/universities/${UNIV}/exams/${examId}/parse-questions`, {
      method: "POST",
    });
    console.log(`  문항 ${parsed.questions.length}개 · ${parsed.usage.model}`);
    for (const q of parsed.questions) {
      console.log(
        `    ${q.number}번 · ${q.charTarget ?? "-"}자 · ${q.points ?? "-"}점 · 제시문 ${q.passages.length}개`,
      );
      console.log(`      ${q.prompt.slice(0, 60)}…`);
    }
    if (parsed.note) console.log(`  메모: ${parsed.note}`);

    step("문항 저장");
    const saved = await api(`/api/universities/${UNIV}/exams/${examId}/questions`, {
      method: "PUT",
      body: JSON.stringify({ questions: parsed.questions }),
    });
    console.log(`  저장된 문항 ${saved.questions.length}개`);

    step("채점 기준 분석");
    const analyzed = await api(`/api/universities/${UNIV}/exams/${examId}/analyze`, {
      method: "POST",
    });
    const analysis = analyzed.analysis;
    const total = analysis.rubric.items.reduce(
      (sum: number, item: { points: number }) => sum + item.points,
      0,
    );
    console.log(`  배점 항목 ${analysis.rubric.items.length}개 · 합계 ${total}점`);
    for (const item of analysis.rubric.items) {
      console.log(`    ${item.points}점 ${item.name}${item.inferred ? " (추론)" : ""}`);
    }
    console.log(`  감점 ${analysis.rubric.deductions.length}개 · 유형 ${analysis.questionTypes.length}개`);
    console.log(`  구성: ${analysis.answerStyle.structure.slice(0, 80)}…`);

    step("확정");
    if (total !== 100) {
      console.log(`  ⚠ 합계가 ${total}점이라 확정 단계는 400 을 받아야 정상입니다.`);
    }
    const confirmed = await api(`/api/universities/${UNIV}/analyses/${examId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "confirmed" }),
    }).catch((error) => {
      console.log(`  확정 거부: ${error.message}`);
      return null;
    });
    if (confirmed) console.log(`  상태 ${confirmed.analysis.status} · v${confirmed.analysis.version}`);

    console.log("\n✔ 3단계 파이프라인 통과");
  } finally {
    step("정리 — 스모크용 기출 삭제");
    await api(`/api/universities/${UNIV}/exams/${examId}`, { method: "DELETE" }).catch((error) =>
      console.log(`  삭제 실패: ${error.message}`),
    );
  }
}

main().catch((error) => {
  console.error(`\n✖ ${error.message}`);
  process.exit(1);
});
