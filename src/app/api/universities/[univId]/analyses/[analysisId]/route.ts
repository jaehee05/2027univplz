import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import { apiTeacher } from "@/lib/auth/dal";
import { analysisRef, examRef, toAnalysis } from "@/lib/exam/store";
import { RUBRIC_TOTAL, rubricTotalsByQuestion } from "@/lib/types/exam";

type Ctx = RouteContext<"/api/universities/[univId]/analyses/[analysisId]">;

export async function GET(_request: Request, ctx: Ctx) {
  const auth = await apiTeacher();
  if (!auth.ok) return auth.response;

  const { univId, analysisId } = await ctx.params;
  const snap = await analysisRef(univId, analysisId).get();
  if (!snap.exists) {
    return Response.json({ analysis: null });
  }
  return Response.json({ analysis: toAnalysis(snap, univId) });
}

const rubricItemSchema = z.object({
  id: z.string(),
  questionNumber: z.string().trim().max(20).nullable(),
  name: z.string().trim().min(1).max(60),
  points: z.number().min(0).max(100),
  description: z.string().max(2000),
  criteria: z.array(z.string().max(500)).max(10),
  inferred: z.boolean(),
});

const patchSchema = z.object({
  questionTypes: z
    .array(
      z.object({
        name: z.string().trim().max(60),
        description: z.string().max(2000),
        cues: z.array(z.string().max(100)).max(20),
      }),
    )
    .max(20)
    .optional(),
  rubric: z
    .object({
      items: z.array(rubricItemSchema).min(1).max(15),
      deductions: z
        .array(
          z.object({
            name: z.string().trim().max(60),
            points: z.number().min(0).max(100),
            description: z.string().max(2000),
            inferred: z.boolean(),
          }),
        )
        .max(15),
    })
    .optional(),
  answerStyle: z
    .object({
      structure: z.string().max(3000),
      tone: z.string().max(3000),
      avoid: z.array(z.string().max(300)).max(20),
    })
    .optional(),
  modelAnswerPatterns: z.array(z.string().max(500)).max(20).optional(),
  status: z.enum(["draft", "confirmed"]).optional(),
});

/** 채점 기준 수정 · 확정. 확정본만 첨삭에 쓰인다. */
export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await apiTeacher();
  if (!auth.ok) return auth.response;

  const { univId, analysisId } = await ctx.params;
  const ref = analysisRef(univId, analysisId);
  const snap = await ref.get();
  if (!snap.exists) {
    return Response.json({ error: "분석 결과가 없습니다. 먼저 분석을 돌리세요." }, { status: 404 });
  }

  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "잘못된 요청입니다." },
      { status: 400 },
    );
  }

  const current = toAnalysis(snap, univId);
  const nextItems = parsed.data.rubric?.items ?? current.rubric.items;

  // 학생은 문항 하나씩 답안을 쓰므로, 확정하려면 문항마다 배점이 100 이어야 한다.
  if (parsed.data.status === "confirmed") {
    const wrong = [...rubricTotalsByQuestion(nextItems)].filter(
      ([, total]) => total !== RUBRIC_TOTAL,
    );
    if (wrong.length > 0) {
      const detail = wrong
        .map(([number, total]) => `${number ? `${number}번` : "전체"} ${total}점`)
        .join(", ");
      return Response.json(
        { error: `문항마다 배점이 ${RUBRIC_TOTAL}점이어야 합니다. 지금은 ${detail} 입니다.` },
        { status: 400 },
      );
    }
  }

  const update: Record<string, unknown> = {
    ...parsed.data,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (parsed.data.status === "confirmed") {
    update.confirmedAt = FieldValue.serverTimestamp();
  } else if (parsed.data.status === "draft") {
    update.confirmedAt = null;
  }

  await ref.update(update);

  if (parsed.data.status) {
    // exam 문서에도 상태를 비춰 목록에서 바로 보이게 한다.
    await examRef(univId, analysisId)
      .update({ analysisStatus: parsed.data.status })
      .catch(() => undefined);
  }

  return Response.json({ analysis: toAnalysis(await ref.get(), univId) });
}
