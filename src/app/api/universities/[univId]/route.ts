import { z } from "zod";

import { apiTeacher } from "@/lib/auth/dal";
import { adminBucket } from "@/lib/firebase/admin";
import { exams, listUniversities, universityRef } from "@/lib/exam/store";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(30).optional(),
  order: z.number().int().min(0).max(999).optional(),
  active: z.boolean().optional(),
});

export async function PATCH(request: Request, ctx: RouteContext<"/api/universities/[univId]">) {
  const auth = await apiTeacher();
  if (!auth.ok) return auth.response;

  const { univId } = await ctx.params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const ref = universityRef(univId);
  if (!(await ref.get()).exists) {
    return Response.json({ error: "없는 대학입니다." }, { status: 404 });
  }

  await ref.update(parsed.data);
  return Response.json({ universities: await listUniversities() });
}

/** 대학 삭제 — 기출이 남아 있으면 막는다. */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/universities/[univId]">) {
  const auth = await apiTeacher();
  if (!auth.ok) return auth.response;

  const { univId } = await ctx.params;
  const ref = universityRef(univId);
  if (!(await ref.get()).exists) {
    return Response.json({ error: "없는 대학입니다." }, { status: 404 });
  }

  const examSnap = await exams(univId).limit(1).get();
  if (!examSnap.empty) {
    return Response.json(
      { error: "기출이 등록된 대학은 지울 수 없습니다. 기출을 먼저 지우거나 비활성화하세요." },
      { status: 409 },
    );
  }

  // 남아 있을 수 있는 업로드 파일도 함께 지운다.
  await adminBucket()
    .deleteFiles({ prefix: `exams/${univId}/` })
    .catch(() => undefined);
  await ref.delete();

  return Response.json({ universities: await listUniversities() });
}
