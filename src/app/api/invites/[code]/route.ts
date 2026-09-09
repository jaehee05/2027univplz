import type { NextRequest } from "next/server";

import { apiTeacher } from "@/lib/auth/dal";
import { adminDb } from "@/lib/firebase/admin";

/** 초대 코드 파기 (teacher 전용, 본인이 발급한 코드만) */
export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/invites/[code]">) {
  const auth = await apiTeacher();
  if (!auth.ok) return auth.response;

  const { code } = await ctx.params;
  const ref = adminDb().collection("invites").doc(code.toUpperCase());
  const snap = await ref.get();

  if (!snap.exists) {
    return Response.json({ error: "존재하지 않는 코드입니다." }, { status: 404 });
  }
  if (snap.data()?.createdBy !== auth.user.uid) {
    return Response.json({ error: "본인이 발급한 코드만 파기할 수 있습니다." }, { status: 403 });
  }

  // 이미 사용된 코드를 지워도 그 코드로 가입한 학생 계정은 그대로 남는다.
  await ref.delete();
  return Response.json({ ok: true });
}
