/** 직접 첨삭에 쓰는 프롬프트를 그대로 뽑아 본다. npm run show:prompt */
import { writeFileSync } from "node:fs";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

process.loadEnvFile(".env.local");

const BASE = process.env.SMOKE_BASE_URL ?? "https://2027univplz.vercel.app";

async function main() {
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  sa.private_key = sa.private_key.replace(/\\n/g, "\n");
  const app = getApps()[0] ?? initializeApp({ credential: cert(sa) });
  const db = getFirestore(app);

  const uid = (await db.collection("users").where("role", "==", "teacher").limit(1).get()).docs[0].id;
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

  const list = await (await fetch(`${BASE}/api/assignments`, { headers: { cookie } })).json();
  const assignment = list.assignments.find(
    (a: { status: string }) => a.status === "submitted" || a.status === "corrected",
  );
  if (!assignment) throw new Error("제출된 답안이 있는 과제가 없습니다.");

  const started = Date.now();
  const question = assignment.questions[0];
  const response = await fetch(
    `${BASE}/api/corrections/prompt?assignmentId=${assignment.id}&questionId=${question.questionId}`,
    { headers: { cookie } },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);

  writeFileSync("/tmp/dummy/prompt.txt", data.prompt);
  console.log(`받는 데 ${Date.now() - started}ms · ${data.prompt.length.toLocaleString()}자`);
  console.log(`/tmp/dummy/prompt.txt 에 저장했습니다.\n`);
  console.log("─── 뼈대 ───");
  for (const line of data.prompt.split("\n")) {
    if (/^#{1,3} |^---$/.test(line)) console.log(`  ${line}`);
  }
}

main().catch((e) => {
  console.error(`✖ ${e.message}`);
  process.exit(1);
});
