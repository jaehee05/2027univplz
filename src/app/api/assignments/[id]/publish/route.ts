import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import { apiTeacher } from "@/lib/auth/dal";
import {
  assignmentRef,
  correctionRef,
  listCorrectionsOf,
  toAssignment,
} from "@/lib/work/store";

type Ctx = RouteContext<"/api/assignments/[id]/publish">;

const bodySchema = z.object({ published: z.boolean() });

/**
 * 학생에게 공개 · 공개 내리기 — 시험지 단위다.
 * 결과지가 시험지 한 장이라 문항마다 따로 공개하면 반쪽짜리가 나간다.
 */
export async function POST(request: Request, ctx: Ctx) {
  const auth = await apiTeacher();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const snap = await assignmentRef(id).get();
  if (!snap.exists) {
    return Response.json({ error: "없는 과제입니다." }, { status: 404 });
  }

  const assignment = toAssignment(snap);
  if (assignment.assignedBy !== auth.user.uid) {
    return Response.json({ error: "내가 낸 과제가 아닙니다." }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const { published } = parsed.data;

  const rows = await listCorrectionsOf(id);
  const done = rows.filter((row) => row.status === "done");

  if (published) {
    const missing = assignment.questions.filter(
      (question) => !done.some((row) => row.questionId === question.questionId),
    );
    if (missing.length > 0) {
      return Response.json(
        {
          error: `아직 첨삭이 끝나지 않은 문항이 있습니다 — ${missing
            .map((question) => `${question.number}번`)
            .join(", ")}.`,
        },
        { status: 400 },
      );
    }
  }

  const batch = assignmentRef(id).firestore.batch();
  for (const row of done) {
    batch.update(correctionRef(row.id), {
      published,
      publishedAt: published ? FieldValue.serverTimestamp() : null,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  batch.update(assignmentRef(id), { status: published ? "published" : "corrected" });
  await batch.commit();

  return Response.json({ corrections: await listCorrectionsOf(id) });
}
