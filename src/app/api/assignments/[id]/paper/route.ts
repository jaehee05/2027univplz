import { apiUser } from "@/lib/auth/dal";
import { cropPdfPages } from "@/lib/docs/crop";
import { examRef, toExam } from "@/lib/exam/store";
import { assignmentRef, toAssignment } from "@/lib/work/store";

type Ctx = RouteContext<"/api/assignments/[id]/paper">;

/**
 * 과제의 문제지 원본을 내려 준다.
 *
 * Storage 규칙은 teacher 만 읽게 막아 두었으므로(학생에게 전 대학 기출을 열 수는 없다),
 * 여기서 "이 과제의 학생인가"만 확인하고 서버가 대신 읽어 넘긴다.
 *
 * 한 파일에 문제지와 해설이 같이 든 경우가 많아, 파일을 통째로 내보내면
 * 학생이 뒤로 넘겨 답을 볼 수 있다. 그래서 배정된 쪽만 잘라서 내보낸다.
 */
export async function GET(request: Request, ctx: Ctx) {
  const auth = await apiUser();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const kind = new URL(request.url).searchParams.get("kind") === "solution" ? "solution" : "question";

  // 해설은 선생님만 본다.
  if (kind === "solution" && auth.user.role !== "teacher") {
    return Response.json({ error: "볼 수 없습니다." }, { status: 403 });
  }

  const snap = await assignmentRef(id).get();
  if (!snap.exists) {
    return Response.json({ error: "없는 과제입니다." }, { status: 404 });
  }

  const assignment = toAssignment(snap);
  const mine = assignment.studentId === auth.user.uid || auth.user.role === "teacher";
  if (!mine) {
    return Response.json({ error: "내 과제가 아닙니다." }, { status: 403 });
  }

  const examSnap = await examRef(assignment.univId, assignment.examId).get();
  if (!examSnap.exists) {
    return Response.json({ error: "기출을 찾지 못했습니다." }, { status: 404 });
  }

  const exam = toExam(examSnap, assignment.univId);
  const file = kind === "question" ? exam.questionPdf : exam.solutionPdf;
  if (!file) {
    return Response.json({ error: "올려 둔 파일이 없습니다." }, { status: 404 });
  }
  // 한글 문서는 브라우저가 못 여니 글로 보여 주게 한다.
  if (!file.fileName.toLowerCase().endsWith(".pdf")) {
    return Response.json({ error: "PDF 가 아니라 화면에 띄울 수 없습니다." }, { status: 415 });
  }

  try {
    // 선생님은 원본 전체를, 학생은 배정된 쪽만 본다.
    const bytes =
      auth.user.role === "teacher"
        ? await cropPdfPages(file.storagePath, null, null)
        : await cropPdfPages(file.storagePath, file.pageFrom, file.pageTo);

    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        // 새로 올리기 전까지는 바뀌지 않는다.
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": `inline; filename="exam.pdf"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "파일을 읽지 못했습니다.";
    return Response.json({ error: message }, { status: 502 });
  }
}
