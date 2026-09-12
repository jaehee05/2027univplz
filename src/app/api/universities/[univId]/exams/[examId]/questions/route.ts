import { z } from "zod";

import { apiTeacher } from "@/lib/auth/dal";
import { examRef, listQuestions, questions } from "@/lib/exam/store";
import { slugifyNumber } from "@/lib/anthropic/exam-analysis";

type Ctx = RouteContext<"/api/universities/[univId]/exams/[examId]/questions">;

export async function GET(_request: Request, ctx: Ctx) {
  const auth = await apiTeacher();
  if (!auth.ok) return auth.response;

  const { univId, examId } = await ctx.params;
  return Response.json({ questions: await listQuestions(univId, examId) });
}

const questionSchema = z.object({
  id: z.string().optional(),
  number: z.string().trim().min(1).max(20),
  prompt: z.string().trim().max(20000),
  passages: z
    .array(z.object({ label: z.string().trim().max(20), text: z.string().max(50000) }))
    .max(20),
  charTarget: z.number().int().min(50).max(5000).nullable(),
  tolerance: z.number().min(0).max(0.5),
  charMin: z.number().int().min(0).max(20000).nullable().default(null),
  charMax: z.number().int().min(0).max(20000).nullable().default(null),
  lengthNote: z.string().trim().max(200).nullable(),
  points: z.number().min(0).max(1000).nullable(),
  answerFormat: z.enum(["manuscript", "free"]),
  modelAnswer: z.string().max(50000).nullable(),
  source: z.enum(["parsed", "manual"]).default("manual"),
});

const bodySchema = z.object({ questions: z.array(questionSchema).max(30) });

/** 문항 전체를 통째로 덮어쓴다. 선생님이 화면에서 고친 결과가 정본이다. */
export async function PUT(request: Request, ctx: Ctx) {
  const auth = await apiTeacher();
  if (!auth.ok) return auth.response;

  const { univId, examId } = await ctx.params;
  const ref = examRef(univId, examId);
  if (!(await ref.get()).exists) {
    return Response.json({ error: "없는 기출입니다." }, { status: 404 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "잘못된 요청입니다." },
      { status: 400 },
    );
  }

  const col = questions(univId, examId);
  const existing = await col.get();
  const batch = col.firestore.batch();

  const keep = new Set<string>();
  parsed.data.questions.forEach(({ id: givenId, ...rest }, index) => {
    // id 는 문서 이름으로 쓰므로 문서 본문에는 넣지 않는다.
    let id = givenId ?? slugifyNumber(rest.number, index);
    // 같은 id 가 두 번 오면 뒤엣것이 앞엣것을 덮어써 문항이 소리 없이 사라진다.
    // 번호가 겹치는 일은 있을 수 있으니 막지 말고 비켜 준다.
    if (keep.has(id)) {
      let n = 2;
      while (keep.has(`${id}-${n}`)) n += 1;
      id = `${id}-${n}`;
    }
    keep.add(id);
    batch.set(col.doc(id), rest);
  });
  existing.docs.forEach((doc) => {
    if (!keep.has(doc.id)) batch.delete(doc.ref);
  });
  batch.update(ref, { questionCount: parsed.data.questions.length });

  await batch.commit();
  return Response.json({ questions: await listQuestions(univId, examId) });
}
