import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import { apiTeacher } from "@/lib/auth/dal";
import { normalizeAnalysis } from "@/lib/anthropic/exam-analysis";
import { extractJson } from "@/lib/anthropic/paste";
import { loadExamInput } from "@/lib/exam/manual-input";
import { analysisRef, examRef, toAnalysis } from "@/lib/exam/store";

type Ctx = RouteContext<"/api/universities/[univId]/exams/[examId]/analyze/manual">;

const pastedSchema = z.object({
  questionTypes: z
    .array(
      z.object({
        name: z.string(),
        description: z.string().default(""),
        cues: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  rubric: z.object({
    items: z
      .array(
        z.object({
          questionNumber: z.string().nullable().default(null),
          name: z.string(),
          points: z.number(),
          description: z.string().default(""),
          criteria: z.array(z.string()).default([]),
          inferred: z.boolean().default(false),
        }),
      )
      .min(1),
    deductions: z
      .array(
        z.object({
          name: z.string(),
          points: z.number(),
          description: z.string().default(""),
          inferred: z.boolean().default(false),
        }),
      )
      .default([]),
  }),
  answerStyle: z
    .object({
      structure: z.string().default(""),
      tone: z.string().default(""),
      avoid: z.array(z.string()).default([]),
    })
    .default({ structure: "", tone: "", avoid: [] }),
  modelAnswerPatterns: z.array(z.string()).default([]),
});

const bodySchema = z.object({ pasted: z.string().min(2).max(400_000) });

/** 선생님이 자기 Claude 로 받은 채점 기준을 초안으로 저장한다. 확정은 따로 누른다. */
export async function POST(request: Request, ctx: Ctx) {
  const auth = await apiTeacher();
  if (!auth.ok) return auth.response;

  const { univId, examId } = await ctx.params;
  const loaded = await loadExamInput(univId, examId);
  if (!loaded.ok) return Response.json({ error: loaded.error }, { status: loaded.status });

  const body = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });

  const ref = analysisRef(univId, examId);
  const previous = await ref.get();
  if (previous.exists && previous.data()?.status === "confirmed") {
    return Response.json(
      { error: "이미 확정된 채점 기준입니다. 확정을 푼 뒤 다시 넣으세요." },
      { status: 409 },
    );
  }

  let analysis;
  try {
    const parsed = pastedSchema.safeParse(extractJson(body.data.pasted));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new Error(`형식이 맞지 않습니다 — ${issue.path.join(".") || "최상위"}: ${issue.message}`);
    }
    analysis = normalizeAnalysis(parsed.data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "결과를 읽지 못했습니다.";
    return Response.json({ error: message }, { status: 400 });
  }

  await ref.set({
    scope: "exam",
    ...analysis,
    status: "draft",
    version: (previous.data()?.version ?? 0) + 1,
    // API 를 쓰지 않았으므로 토큰 기록은 없다.
    usage: null,
    source: "manual",
    updatedAt: FieldValue.serverTimestamp(),
    confirmedAt: null,
  });
  await examRef(univId, examId).update({ analysisStatus: "draft" });

  return Response.json({ analysis: toAnalysis(await ref.get(), univId) });
}
