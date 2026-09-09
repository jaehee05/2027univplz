import { z } from "zod";

import { apiTeacher } from "@/lib/auth/dal";
import { adminAuth } from "@/lib/firebase/admin";
import { assignments, listStudents, users } from "@/lib/work/store";

type Ctx = RouteContext<"/api/students/[uid]">;

const patchSchema = z.object({
  active: z.boolean().optional(),
  displayName: z.string().trim().min(1).max(40).optional(),
});

/** 내 학생인지 확인한다. 남의 학생은 건드릴 수 없다. */
async function assertMine(uid: string, teacherId: string) {
  const snap = await users().doc(uid).get();
  if (!snap.exists) return { ok: false as const, status: 404, error: "없는 학생입니다." };
  const data = snap.data()!;
  if (data.role !== "student" || data.teacherId !== teacherId) {
    return { ok: false as const, status: 403, error: "내 학생이 아닙니다." };
  }
  return { ok: true as const, data };
}

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await apiTeacher();
  if (!auth.ok) return auth.response;

  const { uid } = await ctx.params;
  const found = await assertMine(uid, auth.user.uid);
  if (!found.ok) return Response.json({ error: found.error }, { status: found.status });

  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  await users().doc(uid).update(parsed.data);

  if (parsed.data.displayName) {
    await adminAuth().updateUser(uid, { displayName: parsed.data.displayName });
  }
  if (parsed.data.active === false) {
    // 로그인 상태를 즉시 끊는다.
    await adminAuth().revokeRefreshTokens(uid);
  }

  return Response.json({ students: await listStudents(auth.user.uid) });
}

/** 학생 삭제 — 계정과 과제를 함께 지운다. */
export async function DELETE(_request: Request, ctx: Ctx) {
  const auth = await apiTeacher();
  if (!auth.ok) return auth.response;

  const { uid } = await ctx.params;
  const found = await assertMine(uid, auth.user.uid);
  if (!found.ok) return Response.json({ error: found.error }, { status: found.status });

  const mine = await assignments().where("studentId", "==", uid).limit(500).get();
  const batch = users().firestore.batch();
  mine.docs.forEach((doc) => batch.delete(doc.ref));
  batch.delete(users().doc(uid));
  await batch.commit();

  await adminAuth()
    .deleteUser(uid)
    .catch(() => undefined);

  return Response.json({ students: await listStudents(auth.user.uid) });
}
