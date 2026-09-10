import { apiTeacher } from "@/lib/auth/dal";
import { buildParsePrompt } from "@/lib/anthropic/exam-analysis";
import { loadExamInput } from "@/lib/exam/manual-input";

type Ctx = RouteContext<"/api/universities/[univId]/exams/[examId]/parse-questions/prompt">;

/** 문항 뽑기 프롬프트. 선생님이 자기 Claude 로 직접 돌릴 때 쓴다. */
export async function GET(_request: Request, ctx: Ctx) {
  const auth = await apiTeacher();
  if (!auth.ok) return auth.response;

  const { univId, examId } = await ctx.params;
  const loaded = await loadExamInput(univId, examId);
  if (!loaded.ok) return Response.json({ error: loaded.error }, { status: loaded.status });

  return Response.json({ prompt: await buildParsePrompt(loaded.input, { manual: true }) });
}
