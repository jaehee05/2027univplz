/** 점검 스크립트가 남긴 기출·과제·계정을 지운다. npm run cleanup:test */
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

process.loadEnvFile(".env.local");

const TEST_TITLE = /점검|스모크|smoke|테스트/i;

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
  const bucket = getStorage(app).bucket();

  for (const univ of (await db.collection("universities").get()).docs) {
    for (const exam of (await univ.ref.collection("exams").get()).docs) {
      const data = exam.data();
      if (!TEST_TITLE.test(data.title ?? "")) continue;
      for (const key of ["questionPdf", "solutionPdf"] as const) {
        const path = data[key]?.storagePath;
        if (path) {
          await bucket.file(path).delete().catch(() => undefined);
          await bucket.file(`${path}.pages.json`).delete().catch(() => undefined);
        }
      }
      await db.recursiveDelete(exam.ref);
      await univ.ref.collection("analyses").doc(exam.id).delete().catch(() => undefined);
      console.log(`기출 지움: ${univ.id} ${data.year} ${data.title}`);
    }
    // 기출이 없어진 채점 기준도 정리한다.
    const live = new Set((await univ.ref.collection("exams").get()).docs.map((d) => d.id));
    for (const doc of (await univ.ref.collection("analyses").get()).docs) {
      if (!live.has(doc.id)) {
        await doc.ref.delete();
        console.log(`채점 기준 지움: ${univ.id}/${doc.id}`);
      }
    }
  }

  for (const user of (await db.collection("users").get()).docs) {
    const data = user.data();
    if (!/^smoke-.*@example\.com$/.test(data.email ?? "")) continue;
    for (const a of (await db.collection("assignments").where("studentId", "==", user.id).get()).docs) {
      await a.ref.delete();
    }
    await user.ref.delete();
    await getAuth(app).deleteUser(user.id).catch(() => undefined);
    console.log(`점검 계정 지움: ${data.email}`);
  }

  // 대학에 붙지 못하고 남은 업로드 파일
  const [staged] = await bucket.getFiles({ prefix: "intake/" });
  const referenced = new Set<string>();
  for (const univ of (await db.collection("universities").get()).docs) {
    for (const exam of (await univ.ref.collection("exams").get()).docs) {
      for (const key of ["questionPdf", "solutionPdf"] as const) {
        const path = exam.data()[key]?.storagePath;
        if (path) referenced.add(path);
      }
    }
  }
  for (const file of staged) {
    if (referenced.has(file.name) || file.name.endsWith(".pages.json")) continue;
    await file.delete().catch(() => undefined);
    await bucket.file(`${file.name}.pages.json`).delete().catch(() => undefined);
    console.log(`남은 업로드 지움: ${file.name}`);
  }

  console.log("끝");
}

main();
