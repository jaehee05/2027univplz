/**
 * 인쇄 결과를 실제 종이 크기로 확인한다. npm run check:print
 * 로그인한 상태로 인쇄 화면을 받아 HTML 로 저장하면, Chrome 으로 PDF 를 뽑아 볼 수 있다.
 */
import { writeFileSync } from "node:fs";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

process.loadEnvFile(".env.local");

const BASE = process.env.SMOKE_BASE_URL ?? "https://2027univplz.vercel.app";
const OUT = process.env.PRINT_OUT ?? "/tmp/dummy/print";

async function main() {
  const assignmentId = process.argv[2];
  if (!assignmentId) throw new Error("과제 id 를 넘겨 주세요.");

  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  sa.private_key = sa.private_key.replace(/\\n/g, "\n");
  const app = getApps()[0] ?? initializeApp({ credential: cert(sa) });
  const db = getFirestore(app);

  const teacher = (await db.collection("users").where("role", "==", "teacher").limit(1).get())
    .docs[0].id;
  const token = await getAuth(app).createCustomToken(teacher, { role: "teacher" });
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

  if (!(await db.collection("assignments").doc(assignmentId).get()).exists) {
    throw new Error("없는 과제입니다.");
  }

  // 인쇄는 넷 다 시험지 한 벌이 단위다 — 문항 수만큼 장이 늘어난다.
  const pages: [string, string][] = [
    ["exam", `/print/exam/${assignmentId}`],
    ["sheet", `/print/sheet/${assignmentId}`],
    ["answer", `/print/answer/${assignmentId}`],
    ["correction", `/print/correction/${assignmentId}`],
  ];

  for (const [name, path] of pages) {
    const response = await fetch(`${BASE}${path}`, { headers: { cookie } });
    let html = await response.text();
    // 상대 경로 자원을 절대 주소로 바꿔 파일에서 열어도 스타일이 살아 있게 한다.
    html = html.replace(/(href|src)="\/(?!\/)/g, `$1="${BASE}/`);
    writeFileSync(`${OUT}-${name}.html`, html);
    console.log(`  ${response.ok ? "✔" : "✖"} ${path} → ${OUT}-${name}.html`);
  }

  console.log("\n이제 Chrome 으로 PDF 를 뽑아 쪽 수와 방향을 확인하세요.");
}

main().catch((e) => {
  console.error(`✖ ${e.message}`);
  process.exit(1);
});
