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

  // 확인용 기출을 찾아 문제지 범위를 1~3쪽으로 정한다 (4쪽은 해설).
  const exams = await db.collection("universities").doc("ajou").collection("exams").get();
  const exam = exams.docs.find((d) => (d.data().title ?? "").includes("[확인용]"));
  if (!exam) throw new Error("확인용 기출이 없습니다. npm run setup:demo 를 먼저 돌리세요.");
  await exam.ref.update({ "questionPdf.pageFrom": 1, "questionPdf.pageTo": 3 });
  console.log(`문제지 범위 1~3쪽으로 설정 (${exam.id})`);

  // 학생으로 문제지를 받아 몇 쪽인지 센다.
  const student = await db.collection("users").where("email", "==", "demo-student@example.com").limit(1).get();
  const uid = student.docs[0].id;
  const token = await getAuth(app).createCustomToken(uid, { role: "student" });
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

  const assignments = await db.collection("assignments").where("studentId", "==", uid).get();
  const assignment = assignments.docs.find((d) => d.data().examId === exam.id)!;

  const response = await fetch(`${BASE}/api/assignments/${assignment.id}/paper`, {
    headers: { cookie },
  });
  const bytes = new Uint8Array(await response.arrayBuffer());
  const { PDFDocument } = await import("pdf-lib");
  const pages = (await PDFDocument.load(bytes, { ignoreEncryption: true })).getPageCount();

  const text = Buffer.from(bytes).toString("latin1");
  console.log(`학생이 받은 문제지: ${pages}쪽 (${Math.round(bytes.length / 1024)}KB)`);
  console.log(`  ${pages === 3 ? "✔ 해설 쪽이 빠졌습니다" : "✖ 쪽 수가 맞지 않습니다"}`);
  console.log(`  쓰기 화면: ${BASE}/write/${assignment.id}`);
  // 안에 채점 기준 글자가 남아 있는지도 본다 (압축돼 있으면 안 보이는 게 정상).
  console.log(`  원문에 '채점 기준' 글자 노출: ${text.includes("채점 기준") ? "있음" : "없음"}`);
}

main().catch((e) => { console.error("✖", e.message); process.exit(1); });
