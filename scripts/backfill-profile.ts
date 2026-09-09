/** 이미 가입한 계정의 Auth 프로필 이름을 Firestore 값으로 채운다. 한 번만 돌리면 된다. */
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

process.loadEnvFile(".env.local");

async function main() {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
  const app = getApps()[0] ?? initializeApp({ credential: cert(serviceAccount) });

  const snap = await getFirestore(app).collection("users").get();
  for (const doc of snap.docs) {
    const { displayName, role } = doc.data();
    const user = await getAuth(app).getUser(doc.id);
    const needsName = displayName && user.displayName !== displayName;
    const needsRole = role && user.customClaims?.role !== role;
    if (!needsName && !needsRole) {
      console.log(`  ${doc.id} 그대로`);
      continue;
    }
    if (needsName) await getAuth(app).updateUser(doc.id, { displayName });
    if (needsRole) await getAuth(app).setCustomUserClaims(doc.id, { role });
    console.log(`  ${doc.id} → ${displayName} / ${role}`);
  }
}

main();
