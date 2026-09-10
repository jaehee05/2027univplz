import { apiTeacher } from "@/lib/auth/dal";
import { buildCorrectionPrompt } from "@/lib/anthropic/correct";
import { loadCorrectionInput } from "@/lib/work/correction-input";

/**
 * 첨삭 프롬프트를 글자로 돌려준다.
 * 선생님이 자기 Claude 구독으로 직접 돌리고 결과만 붙여 넣을 때 쓴다.
 */
export async function GET(request: Request) {
  const auth = await apiTeacher();
  if (!auth.ok) return auth.response;

  const assignmentId = new URL(request.url).searchParams.get("assignmentId");
  if (!assignmentId) {
    return Response.json({ error: "과제를 지정해 주세요." }, { status: 400 });
  }

  const loaded = await loadCorrectionInput(assignmentId, auth.user.uid);
  if (!loaded.ok) return Response.json({ error: loaded.error }, { status: loaded.status });

  try {
    const prompt = await buildCorrectionPrompt(loaded.input, { manual: true });
    return Response.json({
      prompt,
      studentName: loaded.assignment.studentName,
      questionNumber: loaded.assignment.questionNumber,
      charCount: loaded.input.charCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "프롬프트를 만들지 못했습니다.";
    return Response.json({ error: message }, { status: 400 });
  }
}
