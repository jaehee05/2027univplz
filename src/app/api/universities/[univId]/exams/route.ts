import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import { apiTeacher } from "@/lib/auth/dal";
import { exams, listExams, universityRef } from "@/lib/exam/store";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/universities/[univId]/exams">,
) {
  const auth = await apiTeacher();
  if (!auth.ok) return auth.response;

  const { univId } = await ctx.params;
  return Response.json({ exams: await listExams(univId) });
}

const createSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  title: z.string().trim().min(1).max(60),
  session: z.string().trim().max(30).optional(),
});

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/universities/[univId]/exams">,
) {
  const auth = await apiTeacher();
  if (!auth.ok) return auth.response;

  const { univId } = await ctx.params;
  if (!(await universityRef(univId).get()).exists) {
    return Response.json({ error: "없는 대학입니다." }, { status: 404 });
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "잘못된 요청입니다." },
      { status: 400 },
    );
  }

  const ref = await exams(univId).add({
    ...parsed.data,
    session: parsed.data.session ?? null,
    questionPdf: null,
    solutionPdf: null,
    questionCount: 0,
    analysisStatus: "none",
    createdAt: FieldValue.serverTimestamp(),
  });

  return Response.json({ examId: ref.id, exams: await listExams(univId) });
}
