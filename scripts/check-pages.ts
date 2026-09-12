/**
 * 화면이 실제로 뜨는지만 빠르게 훑는다. npm run check:pages
 * Claude 를 부르지 않으므로 요금이 들지 않는다. dev 서버를 켜 둔 채 돌린다.
 */
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

process.loadEnvFile(".env.local");

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";

async function main() {
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  sa.private_key = sa.private_key.replace(/\\n/g, "\n");
  const app = getApps()[0] ?? initializeApp({ credential: cert(sa) });
  const db = getFirestore(app);

  const uid = (await db.collection("users").where("role", "==", "teacher").limit(1).get()).docs[0]
    .id;
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
  const cookie = (session.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");

  // 문항이 가장 많은 과제를 고른다 — 여러 문항 쪽이 새로 바뀐 자리라 여기서 걸려야 한다.
  const assignments = await db.collection("assignments").limit(50).get();
  const target = assignments.docs
    .filter((doc) => (doc.data().questions ?? []).length > 0)
    .sort((a, b) => (b.data().questions?.length ?? 0) - (a.data().questions?.length ?? 0))[0];
  if (!target) throw new Error("문항이 있는 과제가 없습니다.");

  const univ = (await db.collection("universities").get()).docs[0];
  const exam = (await univ.ref.collection("exams").get()).docs.find(
    async (doc) => (await doc.ref.collection("questions").get()).size > 0,
  );

  const pages: [string, string][] = [
    ["관리 홈", "/admin"],
    ["과제 · 첨삭", "/admin/assignments"],
    ["학생", "/admin/students"],
    ["대학 목록", "/admin/universities"],
    ...(exam
      ? ([["기출 작업대", `/admin/universities/${univ.id}/exams/${exam.id}`]] as [string, string][])
      : []),
    ["내 과제(학생 화면)", "/dashboard"],
    ["쓰기", `/write/${target.id}`],
    ["결과", `/results/${target.id}`],
    ["첨삭 확인", `/admin/corrections/${target.id}`],
    ["인쇄 · 문제지", `/print/exam/${target.id}`],
    ["인쇄 · 빈 답안지", `/print/sheet/${target.id}`],
    ["인쇄 · 작성된 답안지", `/print/answer/${target.id}`],
    ["인쇄 · 첨삭 결과지", `/print/correction/${target.id}`],
    ["API · 과제 목록", "/api/assignments"],
    ["API · 이 시험지의 첨삭", `/api/assignments/${target.id}/corrections`],
  ];

  console.log(`과제 ${target.id} · 문항 ${(target.data().questions ?? []).length}개\n`);
  let bad = 0;
  for (const [label, path] of pages) {
    const response = await fetch(`${BASE}${path}`, { headers: { cookie }, redirect: "manual" });
    const ok = response.ok || response.status === 307 || response.status === 308;
    if (!ok) bad += 1;
    console.log(`  ${ok ? "✔" : "✖"} ${response.status} ${label} — ${path}`);
  }
  console.log(bad === 0 ? "\n✔ 모두 뜸" : `\n✖ ${bad}개 실패`);
  if (bad > 0) process.exit(1);
}

main().catch((error) => {
  console.error(`✖ ${error.message}`);
  process.exit(1);
});
