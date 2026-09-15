import { apiTeacher } from "@/lib/auth/dal";
import { buildHandoutHwpx } from "@/lib/docs/hwpx-write";
import { examRef, listQuestions, toExam, universityRef } from "@/lib/exam/store";
import { mergePassages } from "@/lib/exam/passages";

type Ctx = RouteContext<"/api/universities/[univId]/exams/[examId]/handout">;

/**
 * 학생에게 나갈 문제지의 **초안**을 HWPX 로 내려 준다.
 *
 * 흐름 — CLOVA 가 뽑은 글자로 문항을 만들어 두면, 여기서 그것을 문제지 꼴로 엮는다.
 * 선생님이 한글에서 열어 오탈자와 제시문 범위를 손보고 `PDF 로 저장` 해서 올린다.
 * 그 PDF(`studentPdf`)가 학생에게 그대로 나간다.
 *
 * 앱이 PDF 로 바로 만들지 않는 이유는 **사람이 검수해야 하기 때문**이다.
 * OCR 은 오탈자를 남기고, 제시문이 어디서 끝나는지는 사람이 판단해야 한다.
 * 한글에서 손본 서식 그대로 나가려면 변환도 한글에 맡기는 편이 확실하다.
 */
export async function GET(_request: Request, ctx: Ctx) {
  const auth = await apiTeacher();
  if (!auth.ok) return auth.response;

  const { univId, examId } = await ctx.params;
  const [snap, questions, univSnap] = await Promise.all([
    examRef(univId, examId).get(),
    listQuestions(univId, examId),
    universityRef(univId).get(),
  ]);

  if (!snap.exists) {
    return Response.json({ error: "없는 기출입니다." }, { status: 404 });
  }
  if (questions.length === 0) {
    return Response.json(
      { error: "문항이 없습니다. 먼저 글자를 뽑고 문항을 저장해 주세요." },
      { status: 400 },
    );
  }

  const exam = toExam(snap, univId);

  const bytes = buildHandoutHwpx({
    univName: (univSnap.data()?.name as string | undefined) ?? univId,
    examTitle: exam.title,
    // 여러 문항이 함께 쓰는 제시문은 한 번만 싣는다.
    passages: mergePassages(questions.map((question) => question.passages)),
    questions: questions.map((question) => ({
      number: question.number,
      prompt: question.prompt,
      lengthNote: question.lengthNote,
      charTarget: question.charTarget,
      points: question.points,
    })),
  });

  // 파일 이름에 한글이 들어가므로 RFC 5987 로 적는다 — 그냥 넣으면 브라우저가 깨뜨린다.
  const name = `${exam.title} 문제지.hwpx`;

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/hwp+zip",
      "Content-Disposition": `attachment; filename="handout.hwpx"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
}
