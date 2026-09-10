import { z } from "zod";

import { apiTeacher } from "@/lib/auth/dal";
import { normalizeQuestions, type ParsedQuestion } from "@/lib/anthropic/exam-analysis";
import { extractJson } from "@/lib/anthropic/paste";
import { loadExamInput } from "@/lib/exam/manual-input";

type Ctx = RouteContext<"/api/universities/[univId]/exams/[examId]/parse-questions/manual">;

const pastedSchema = z.object({
  questions: z.array(
    z.object({
      number: z.string(),
      prompt: z.string(),
      passages: z.array(z.object({ label: z.string(), text: z.string() })).default([]),
      charTarget: z.number().int().nullable().default(null),
      charMin: z.number().int().nullable().default(null),
      charMax: z.number().int().nullable().default(null),
      lengthNote: z.string().nullable().default(null),
      points: z.number().nullable().default(null),
      answerFormat: z.enum(["manuscript", "free"]).default("manuscript"),
    }),
  ),
  note: z.string().default(""),
});

const bodySchema = z.object({ pasted: z.string().min(2).max(400_000) });

/**
 * 선생님이 자기 Claude 로 받은 문항 결과를 읽어 화면에 돌려준다.
 * 저장하지는 않는다 — 확인·수정한 뒤 PUT /questions 로 확정하는 흐름은 그대로다.
 */
export async function POST(request: Request, ctx: Ctx) {
  const auth = await apiTeacher();
  if (!auth.ok) return auth.response;

  const { univId, examId } = await ctx.params;
  const loaded = await loadExamInput(univId, examId);
  if (!loaded.ok) return Response.json({ error: loaded.error }, { status: loaded.status });

  const body = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });

  try {
    const parsed = pastedSchema.safeParse(extractJson(body.data.pasted));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new Error(`형식이 맞지 않습니다 — ${issue.path.join(".") || "최상위"}: ${issue.message}`);
    }
    return Response.json(
      normalizeQuestions({
        questions: parsed.data.questions as ParsedQuestion[],
        note: parsed.data.note,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "결과를 읽지 못했습니다.";
    return Response.json({ error: message }, { status: 400 });
  }
}
