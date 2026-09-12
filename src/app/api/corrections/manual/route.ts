import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import { apiTeacher } from "@/lib/auth/dal";
import { normalizeCorrection } from "@/lib/anthropic/correct";
import { extractJson } from "@/lib/anthropic/paste";
import { loadCorrectionInput } from "@/lib/work/correction-input";
import { correctionOf, correctionRef, corrections, refreshStatus, toCorrection } from "@/lib/work/store";

const pastedSchema = z.object({
  scores: z.object({
    items: z
      .array(
        z.object({
          id: z.string(),
          name: z.string().optional(),
          points: z.number().optional(),
          awarded: z.number(),
          reason: z.string(),
        }),
      )
      .min(1),
    deductions: z
      .array(z.object({ name: z.string(), points: z.number(), reason: z.string() }))
      .default([]),
  }),
  inlineComments: z
    .array(
      z.object({
        quote: z.string().optional(),
        start: z.number().int().optional(),
        end: z.number().int().optional(),
        severity: z.enum(["good", "info", "warning", "error"]),
        category: z.string(),
        message: z.string(),
        suggestion: z.string().nullable().default(null),
      }),
    )
    .default([]),
  overall: z.object({
    summary: z.string(),
    strengths: z.array(z.string()).default([]),
    improvements: z.array(z.string()).default([]),
    nextSteps: z.array(z.string()).default([]),
  }),
  revisedExample: z.string().default(""),
});

const bodySchema = z.object({
  assignmentId: z.string().min(1).optional(),
  questionId: z.string().min(1).optional(),
  /** claude.ai 에서 받은 답 그대로 */
  pasted: z.string().min(2).max(200_000),
});

/**
 * 선생님이 자기 Claude 로 받은 첨삭 결과를 넣는다. API 를 쓰지 않는다.
 * 답안 한 편이 단위이므로 문항을 지정해야 한다.
 */
export async function POST(request: Request) {
  const auth = await apiTeacher();
  if (!auth.ok) return auth.response;

  const parsedBody = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsedBody.success) {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  // 공용 화면은 { pasted } 만 보내므로 과제 · 문항은 주소에서도 받는다.
  const params = new URL(request.url).searchParams;
  const assignmentId = parsedBody.data.assignmentId ?? params.get("assignmentId");
  const questionId = parsedBody.data.questionId ?? params.get("questionId");
  if (!assignmentId || !questionId) {
    return Response.json({ error: "과제와 문항을 지정해 주세요." }, { status: 400 });
  }

  const loaded = await loadCorrectionInput(assignmentId, questionId, auth.user.uid);
  if (!loaded.ok) return Response.json({ error: loaded.error }, { status: loaded.status });

  let result;
  try {
    const json = extractJson(parsedBody.data.pasted);
    const parsed = pastedSchema.safeParse(json);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new Error(
        `형식이 맞지 않습니다 — ${issue.path.join(".") || "최상위"}: ${issue.message}`,
      );
    }
    result = normalizeCorrection(
      {
        scores: {
          items: parsed.data.scores.items.map((item) => ({
            id: item.id,
            name: item.name ?? "",
            points: item.points ?? 0,
            awarded: item.awarded,
            reason: item.reason,
          })),
          deductions: parsed.data.scores.deductions,
        },
        inlineComments: parsed.data.inlineComments,
        overall: parsed.data.overall,
        revisedExample: parsed.data.revisedExample,
      },
      loaded.input,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "결과를 읽지 못했습니다.";
    return Response.json({ error: message }, { status: 400 });
  }

  // 코멘트 위치를 하나도 못 찾았으면 원문 조각이 어긋난 것이다 — 그대로 저장하면 헛것이 된다.
  const asked = (() => {
    try {
      const json = extractJson(parsedBody.data.pasted) as { inlineComments?: unknown[] };
      return json.inlineComments?.length ?? 0;
    } catch {
      return 0;
    }
  })();
  if (asked > 0 && result.inlineComments.length === 0) {
    return Response.json(
      {
        error:
          "코멘트의 원문 조각(quote)을 답안에서 하나도 찾지 못했습니다. " +
          "답안 글자를 그대로 옮겼는지 확인해 주세요.",
      },
      { status: 400 },
    );
  }

  const { assignment } = loaded;
  const existing = await correctionOf(assignment.id, questionId);
  const ref = existing ? correctionRef(existing.id) : corrections().doc();

  await ref.set(
    {
      answerId: loaded.answer.id,
      assignmentId: assignment.id,
      questionId,
      studentId: assignment.studentId,
      // 선생님 목록 화면이 첨삭을 한 번에 읽을 수 있게 복사해 둔다.
      assignedBy: assignment.assignedBy,
      univId: assignment.univId,
      examId: assignment.examId,
      status: "done",
      ...result,
      // API 를 쓰지 않았으므로 토큰 기록은 없다.
      usage: null,
      source: "manual",
      published: false,
      teacherEdited: false,
      error: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      publishedAt: null,
    },
    { merge: true },
  );
  await refreshStatus(assignment.id);

  return Response.json({
    correction: toCorrection(await ref.get()),
    matched: result.inlineComments.length,
    asked,
  });
}
