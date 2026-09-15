import { apiTeacher } from "@/lib/auth/dal";
import { adminBucket } from "@/lib/firebase/admin";
import { examRef, toExam } from "@/lib/exam/store";

type Ctx = RouteContext<"/api/universities/[univId]/exams/[examId]/file">;

/**
 * 올려 둔 원본 파일을 **자르지도 덮지도 않고** 그대로 내려 준다.
 *
 * Storage 규칙은 teacher 만 읽게 막아 두었고, 여기도 teacher 만 지난다.
 * 가림칠을 그리려면 가리기 전 모습을 봐야 하므로 이 통로가 따로 필요하다 —
 * 학생이 보는 통로(`/api/assignments/[id]/paper`)와 섞지 않는다.
 */
export async function GET(request: Request, ctx: Ctx) {
  const auth = await apiTeacher();
  if (!auth.ok) return auth.response;

  const { univId, examId } = await ctx.params;
  const kind =
    new URL(request.url).searchParams.get("kind") === "solution" ? "solution" : "question";

  const snap = await examRef(univId, examId).get();
  if (!snap.exists) {
    return Response.json({ error: "없는 기출입니다." }, { status: 404 });
  }

  const exam = toExam(snap, univId);
  const file = kind === "question" ? exam.questionPdf : exam.solutionPdf;
  if (!file) {
    return Response.json({ error: "올려 둔 파일이 없습니다." }, { status: 404 });
  }
  if (!file.fileName.toLowerCase().endsWith(".pdf")) {
    return Response.json({ error: "PDF 가 아닙니다." }, { status: 415 });
  }

  try {
    const [buffer] = await adminBucket().file(file.storagePath).download();
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": `inline; filename="source.pdf"`,
      },
    });
  } catch {
    return Response.json({ error: "파일을 읽지 못했습니다." }, { status: 502 });
  }
}
