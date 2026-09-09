/**
 * PDF 자동 분류 점검 — 인문·자연, 문제·해설이 한 파일에 섞인 PDF 를 제대로 나누는지 본다.
 *   npm run dev
 *   npm run smoke:intake
 */
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

process.loadEnvFile(".env.local");

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const FILES = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      "/tmp/dummy/combined.pdf",
      "/tmp/dummy/exam.pdf",
      "/tmp/dummy/solution.pdf",
      "/tmp/dummy/exam.hwpx",
    ];

const TRACK = { humanities: "인문", science: "자연", unknown: "?" } as const;
const KIND = { question: "문제", solution: "해설" } as const;

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

  const users = await db.collection("users").where("role", "==", "teacher").limit(1).get();
  const token = await getAuth(app).createCustomToken(users.docs[0].id, { role: "teacher" });
  const exchange = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
    { method: "POST", body: JSON.stringify({ token, returnSecureToken: true }) },
  );
  const { idToken } = await exchange.json();
  const session = await fetch(`${BASE}/api/auth/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  const cookie = (session.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");

  const committed: {
    univId: string;
    storagePath: string;
    fileName: string;
    size: number;
    kind: string;
    pageFrom: number | null;
    pageTo: number | null;
    year: number;
    title: string;
    session: string | null;
  }[] = [];

  // 대학을 안 고르고 올렸을 때 알아서 붙는지 보려고, 못 알아내면 홍익대로 둔다.
  const FALLBACK_UNIV = "hongik";
  const started = Date.now();

  for (const file of FILES) {
    const name = file.split("/").pop()!;
    const path = `intake/${Date.now()}-${name}`;
    await bucket.upload(file, {
      destination: path,
      contentType: name.endsWith(".hwpx") ? "application/hwpx" : "application/pdf",
    });
    const [meta] = await bucket.file(path).getMetadata();

    const response = await fetch(`${BASE}/api/intake`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ storagePath: path, fileName: name, size: Number(meta.size) }),
    });
    const data = await response.json();
    if (!response.ok) {
      console.log(`\n✖ ${name}: ${data.error}`);
      continue;
    }

    console.log(
      `\n▶ ${name} — ${data.file.pageCount}쪽 · ${data.extraction.method} · ${data.year ?? "연도?"}학년도 · 대학 ${data.univId ?? `못 알아냄(읽은 이름: ${data.universityText ?? "없음"})`}`,
    );
    for (const part of data.parts) {
      const flag = part.track === "science" ? "  (자연 → 제외)" : "";
      console.log(
        `   ${part.pageFrom}~${part.pageTo}쪽  ${TRACK[part.track as keyof typeof TRACK]} ${KIND[part.kind as keyof typeof KIND]}  "${part.title}"  [${part.confidence}]${flag}`,
      );
      if (part.track !== "science") {
        committed.push({
          univId: data.univId ?? FALLBACK_UNIV,
          storagePath: path,
          fileName: name,
          size: Number(meta.size),
          kind: part.kind,
          pageFrom: part.pageFrom,
          pageTo: part.pageTo,
          year: data.year ?? 2027,
          title: part.title || "논술",
          session: part.session,
        });
      }
    }
    if (data.note) console.log(`   메모: ${data.note}`);
  }

  console.log(`\n  (읽기까지 ${Math.round((Date.now() - started) / 1000)}초)`);
  console.log(`\n▶ 등록 — 인문 자료 ${committed.length}개`);
  const commit = await fetch(`${BASE}/api/intake/commit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ items: committed }),
  });
  const commitData = await commit.json();
  if (!commit.ok) throw new Error(commitData.error);
  console.log(`   기출 ${commitData.created}건`);
  for (const warning of commitData.warnings ?? []) console.log(`   ⚠ ${warning}`);

  // 점검용이라 응답 모양은 느슨하게 다룬다.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const made: any[] = Object.values(commitData.examsByUniv ?? {}).flat();
  const slot = (pdf: { pageFrom: number | null; pageTo: number | null; extraction: { chars: number; pages: number } | null } | null) => {
    if (!pdf) return "없음";
    const range = `${pdf.pageFrom ?? "처음"}~${pdf.pageTo ?? "끝"}쪽`;
    return pdf.extraction ? `${range} · ${pdf.extraction.chars}자 추출됨` : `${range} · 추출 안 됨`;
  };
  for (const exam of made) {
    console.log(
      `   ${exam.year} ${exam.title}${exam.session ? ` · ${exam.session}` : ""}\n      문제 ${slot(exam.questionPdf)}\n      해설 ${slot(exam.solutionPdf)}`,
    );
  }

  console.log("\n▶ 정리");
  for (const exam of made) {
    await fetch(`${BASE}/api/universities/${exam.univId}/exams/${exam.id}`, {
      method: "DELETE",
      headers: { cookie },
    });
  }
  await bucket.deleteFiles({ prefix: "intake/" }).catch(() => undefined);
  console.log("   지웠습니다.");
}

main().catch((error) => {
  console.error(`\n✖ ${error.message}`);
  process.exit(1);
});
