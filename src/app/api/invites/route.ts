import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";

import { apiTeacher } from "@/lib/auth/dal";
import { adminDb } from "@/lib/firebase/admin";

// 헷갈리는 글자(0/O, 1/I)를 뺀 코드 문자셋
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeCode(length = 8): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

const bodySchema = z.object({
  label: z.string().trim().max(40).optional(),
  role: z.enum(["student", "teacher"]).default("student"),
  validDays: z.number().int().min(1).max(90).default(30),
});

/** 초대 코드 발급 (teacher 전용) */
export async function POST(request: Request) {
  const auth = await apiTeacher();
  if (!auth.ok) return auth.response;

  const parsed = bodySchema.safeParse((await request.json().catch(() => ({}))) ?? {});
  if (!parsed.success) {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const { label, role, validDays } = parsed.data;

  const db = adminDb();
  const expiresAt = Timestamp.fromMillis(Date.now() + validDays * 24 * 60 * 60 * 1000);

  // 충돌 가능성은 낮지만, 중복이면 다시 뽑는다.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = makeCode();
    const ref = db.collection("invites").doc(code);
    const created = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) return false;
      tx.set(ref, {
        code,
        role,
        label: label ?? null,
        createdBy: auth.user.uid,
        createdAt: FieldValue.serverTimestamp(),
        expiresAt,
      });
      return true;
    });
    if (created) {
      return Response.json({ code, role, expiresAt: expiresAt.toDate().toISOString() });
    }
  }

  return Response.json({ error: "코드 발급에 실패했습니다. 다시 시도해 주세요." }, { status: 500 });
}

/** 발급한 초대 코드 목록 (teacher 전용) */
export async function GET() {
  const auth = await apiTeacher();
  if (!auth.ok) return auth.response;

  const snap = await adminDb()
    .collection("invites")
    .where("createdBy", "==", auth.user.uid)
    .orderBy("createdAt", "desc")
    .limit(100)
    .get();

  const invites = snap.docs.map((doc) => {
    const data = doc.data();
    return {
      code: doc.id,
      role: data.role,
      label: data.label ?? null,
      usedBy: data.usedBy ?? null,
      createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
      expiresAt: data.expiresAt?.toDate?.()?.toISOString() ?? null,
    };
  });

  return Response.json({ invites });
}
