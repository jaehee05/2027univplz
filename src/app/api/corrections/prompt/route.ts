import { apiTeacher } from "@/lib/auth/dal";
import { buildCorrectionPrompt } from "@/lib/anthropic/correct";
import { loadCorrectionInput } from "@/lib/work/correction-input";

/**
 * 첨삭 프롬프트를 글자로 돌려준다.
 * 선생님이 자기 Claude 구독으로 직접 돌리고 결과만 붙여 넣을 때 쓴다.
 *
 * 프롬프트에는 답안 한 편이 들어가므로 **문항 하나**가 단위다.
 * 시험지에 문항이 여럿이면 문항마다 한 번씩 돌린다.
 */
export async function GET(request: Request) {
  const auth = await apiTeacher();
  if (!auth.ok) return auth.response;

  const params = new URL(request.url).searchParams;
  const assignmentId = params.get("assignmentId");
  const questionId = params.get("questionId");
  if (!assignmentId || !questionId) {
    return Response.json({ error: "과제와 문항을 지정해 주세요." }, { status: 400 });
  }

  const loaded = await loadCorrectionInput(assignmentId, questionId, auth.user.uid);
  if (!loaded.ok) return Response.json({ error: loaded.error }, { status: loaded.status });

  try {
    const prompt = await buildCorrectionPrompt(loaded.input, { manual: true });
    return Response.json({
      prompt,
      studentName: loaded.assignment.studentName,
      questionNumber: loaded.question.number,
      charCount: loaded.input.charCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "프롬프트를 만들지 못했습니다.";
    return Response.json({ error: message }, { status: 400 });
  }
}
