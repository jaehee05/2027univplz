import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import { apiUser } from "@/lib/auth/dal";
import { assignmentRef, correctionRef, toCorrection } from "@/lib/work/store";
import { totalScore } from "@/lib/types/work";

type Ctx = RouteContext<"/api/corrections/[id]">;

/** 학생은 공개된 것만, 선생님은 언제나 볼 수 있다. */
export async function GET(_request: Request, ctx: Ctx) {
  const auth = await apiUser();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const snap = await correctionRef(id).get();
  if (!snap.exists) {
    return Response.json({ error: "없는 첨삭입니다." }, { status: 404 });
  }

  const correction = toCorrection(snap);
  const isTeacher = auth.user.role === "teacher";
  if (!isTeacher && (correction.studentId !== auth.user.uid || !correction.published)) {
    return Response.json({ error: "아직 볼 수 없습니다." }, { status: 403 });
  }

  return Response.json({ correction });
}

const scoreItemSchema = z.object({
  id: z.string(),
  name: z.string().max(100),
  points: z.number().min(0).max(100),
  awarded: z.number().min(0).max(100),
  reason: z.string().max(3000),
});

const patchSchema = z.object({
  scores: z
    .object({
      items: z.array(scoreItemSchema).max(20),
      deductions: z
        .array(
          z.object({
            name: z.string().max(100),
            points: z.number().min(0).max(100),
            reason: z.string().max(2000),
          }),
        )
        .max(20),
    })
    .optional(),
  inlineComments: z
    .array(
      z.object({
        start: z.number().int().min(0),
        end: z.number().int().min(0),
        severity: z.enum(["good", "info", "warning", "error"]),
        category: z.string().max(40),
        message: z.string().max(2000),
        suggestion: z.string().max(2000).nullable(),
      }),
    )
    .max(60)
    .optional(),
  overall: z
    .object({
      summary: z.string().max(5000),
      strengths: z.array(z.string().max(500)).max(10),
      improvements: z.array(z.string().max(500)).max(10),
      nextSteps: z.array(z.string().max(500)).max(10),
    })
    .optional(),
  revisedExample: z.string().max(20000).optional(),
  published: z.boolean().optional(),
});

/** 점수 · 코멘트 수정, 학생 공개 (teacher 전용) */
export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await apiUser();
  if (!auth.ok) return auth.response;
  if (auth.user.role !== "teacher") {
    return Response.json({ error: "선생님 계정만 고칠 수 있습니다." }, { status: 403 });
  }

  const { id } = await ctx.params;
  const snap = await correctionRef(id).get();
  if (!snap.exists) {
    return Response.json({ error: "없는 첨삭입니다." }, { status: 404 });
  }

  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return Response.json(
      { error: parsed.error?.issues[0]?.message ?? "잘못된 요청입니다." },
      { status: 400 },
    );
  }

  const current = toCorrection(snap);
  const { published, ...edits } = parsed.data;

  const update: Record<string, unknown> = { ...edits, updatedAt: FieldValue.serverTimestamp() };
  if (Object.keys(edits).length > 0) update.teacherEdited = true;

  if (edits.scores) {
    update.scores = { ...edits.scores, total: totalScore({ ...edits.scores, total: 0 }) };
  }
  if (published !== undefined) {
    update.published = published;
    update.publishedAt = published ? FieldValue.serverTimestamp() : null;
  }

  await correctionRef(id).update(update);

  if (published !== undefined) {
    await assignmentRef(current.assignmentId)
      .update({ status: published ? "published" : "corrected" })
      .catch(() => undefined);
  }

  return Response.json({ correction: toCorrection(await correctionRef(id).get()) });
}
