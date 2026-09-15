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
 * 학생용 문제지(`studentPdf`)가 올라와 있으면 그것을 그대로 내보낸다.
 * 원본 기출은 문제와 해설이 한 파일에, 때로는 한 쪽 안에 같이 실려 있어
 * 잘라도 가려도 답이 새어 나갈 구석이 남는다. 선생님이 따로 만들어 올린 것을 쓰면
 * 새어 나갈 것이 애초에 없다.
 *
 * 없으면 원본을 배정된 쪽만 잘라서 내보낸다.
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
  // 학생이 문제지를 달라고 하면 학생용부터 찾는다. 해설은 선생님만 보고 늘 원본이다.
  const file =
    kind === "solution"
      ? exam.solutionPdf
      : (exam.studentPdf ?? exam.questionPdf);
  if (!file) {
    return Response.json({ error: "올려 둔 파일이 없습니다." }, { status: 404 });
  }
  // 한글 문서는 브라우저가 못 여니 글로 보여 주게 한다.
  if (!file.fileName.toLowerCase().endsWith(".pdf")) {
    return Response.json({ error: "PDF 가 아니라 화면에 띄울 수 없습니다." }, { status: 415 });
  }

  try {
    // 선생님이 봐도 학생이 받는 것과 똑같이 내보낸다 — 그래야 확인이 된다.
    // 원본 전체는 관리 화면에서 본다.
    const bytes = await cropPdfPages(file.storagePath, file.pageFrom, file.pageTo);

    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        // 쪽 범위가 바뀌면 주소의 v 값이 달라져 새로 받는다.
        // 그 장치가 없으면 범위를 좁혀도 학생 브라우저가 예전 파일을 계속 쓴다.
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": `inline; filename="exam.pdf"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "파일을 읽지 못했습니다.";
    return Response.json({ error: message }, { status: 502 });
  }
}
