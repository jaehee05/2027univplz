import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import { apiTeacher } from "@/lib/auth/dal";
import { listUniversities, universities } from "@/lib/exam/store";

/** 처음 화면을 열었을 때 넣어 주는 기본 대학 목록 */
const DEFAULTS = [
  { name: "홍익대", slug: "hongik" },
  { name: "단국대", slug: "dankook" },
  { name: "건국대", slug: "konkuk" },
  { name: "동국대", slug: "dongguk" },
  { name: "국민대", slug: "kookmin" },
  { name: "아주대", slug: "ajou" },
];

export async function GET() {
  const auth = await apiTeacher();
  if (!auth.ok) return auth.response;

  return Response.json({ universities: await listUniversities() });
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(30),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]+$/, "영문 소문자·숫자·하이픈만 쓸 수 있습니다.")
    .max(30),
});

const bodySchema = z.union([
  createSchema,
  z.object({ seedDefaults: z.literal(true) }),
]);

export async function POST(request: Request) {
  const auth = await apiTeacher();
  if (!auth.ok) return auth.response;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "잘못된 요청입니다." },
      { status: 400 },
    );
  }

  const col = universities();

  // 기본 6개 대학 한 번에 넣기 — 이미 있는 slug 는 건너뛴다.
  if ("seedDefaults" in parsed.data) {
    const existing = new Set((await listUniversities()).map((u) => u.slug));
    const batch = col.firestore.batch();
    let added = 0;
    DEFAULTS.forEach((item, index) => {
      if (existing.has(item.slug)) return;
      batch.set(col.doc(item.slug), {
        ...item,
        order: index,
        active: true,
        createdAt: FieldValue.serverTimestamp(),
      });
      added += 1;
    });
    if (added > 0) await batch.commit();
    return Response.json({ added, universities: await listUniversities() });
  }

  const { name, slug } = parsed.data;
  const ref = col.doc(slug);
  if ((await ref.get()).exists) {
    return Response.json({ error: `이미 있는 약칭입니다: ${slug}` }, { status: 409 });
  }

  const all = await listUniversities();
  await ref.set({
    name,
    slug,
    order: all.length,
    active: true,
    createdAt: FieldValue.serverTimestamp(),
  });

  return Response.json({ universities: await listUniversities() });
}
