import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import { apiTeacher } from "@/lib/auth/dal";
import { adminAuth } from "@/lib/firebase/admin";
import { assignments, listStudents, users } from "@/lib/work/store";

type Ctx = RouteContext<"/api/students/[uid]">;

const patchSchema = z.object({
  /** 받아 주기 · 되돌리기 */
  approval: z.enum(["approved", "rejected"]).optional(),
  /** 받아들인 뒤 잠시 막아 두기 */
  active: z.boolean().optional(),
  displayName: z.string().trim().min(1).max(40).optional(),
});

/**
 * 내 학생인지 확인한다. 남의 학생은 건드릴 수 없다.
 *
 * 담당이 아직 비어 있는 신청자는 예외로 둔다 — 선생님이 하나뿐이던 때 들어온 신청이나,
 * meta/system 이 비어 있어 담당을 못 붙인 경우가 여기 걸린다. 받아 주면서 담당이 정해진다.
 */
async function assertMine(uid: string, teacherId: string) {
  const snap = await users().doc(uid).get();
  if (!snap.exists) return { ok: false as const, status: 404, error: "없는 학생입니다." };
  const data = snap.data()!;
  const mine = data.teacherId === teacherId || !data.teacherId;
  if (data.role !== "student" || !mine) {
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

  const { approval } = parsed.data;
  await users()
    .doc(uid)
    .update({
      ...parsed.data,
      ...(approval === "approved"
        ? { teacherId: auth.user.uid, approvedAt: FieldValue.serverTimestamp() }
        : {}),
    });

  if (parsed.data.displayName) {
    await adminAuth().updateUser(uid, { displayName: parsed.data.displayName });
  }

  /**
   * 역할 claim 은 쓸 수 있게 된 계정에만 둔다.
   * 이게 곧 `dal.getCurrentUser` 의 빠른 통로라, 받아 주기 전에 심으면 users 문서를
   * 읽지 않고 그냥 지나가 버린다. 거절·중지할 때는 claim 을 걷고 토큰도 끊는다.
   */
  if (approval === "approved") {
    await adminAuth().setCustomUserClaims(uid, { role: "student" });
  } else if (approval === "rejected" || parsed.data.active === false) {
    await adminAuth().setCustomUserClaims(uid, {});
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
