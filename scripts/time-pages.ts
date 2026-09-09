/** 로그인한 상태에서 관리 화면이 얼마나 걸리는지 잰다. npm run time:pages */
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

process.loadEnvFile(".env.local");

const BASE = process.env.TIME_BASE_URL ?? "https://2027univplz.vercel.app";
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
const app = getApps()[0] ?? initializeApp({ credential: cert(serviceAccount) });

async function main() {
  const snap = await getFirestore(app).collection("users").where("role", "==", "teacher").limit(1).get();
  const uid = snap.docs[0].id;
  const customToken = await getAuth(app).createCustomToken(uid, { role: "teacher" });
  const exchange = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
    { method: "POST", body: JSON.stringify({ token: customToken, returnSecureToken: true }) },
  );
  const { idToken } = await exchange.json();
  const session = await fetch(`${BASE}/api/auth/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  const cookie = (session.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");

  const paths = process.argv.slice(2).length
    ? process.argv.slice(2)
    : ["/admin", "/admin/universities", "/admin/universities/hongik", "/admin/manuscript"];

  console.log(`\n${BASE}`);
  for (const path of paths) {
    const times: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const started = performance.now();
      const response = await fetch(`${BASE}${path}`, { headers: { cookie }, redirect: "manual" });
      await response.text();
      times.push(performance.now() - started);
    }
    // 첫 번째는 콜드 스타트라 따로 본다.
    const [cold, ...warm] = times;
    const avg = warm.reduce((a, b) => a + b, 0) / warm.length;
    console.log(`  ${path.padEnd(34)} 첫 ${Math.round(cold)}ms · 이후 평균 ${Math.round(avg)}ms`);
  }
}

main();
