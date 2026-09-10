import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import { apiTeacher } from "@/lib/auth/dal";
import { normalizeCorrection } from "@/lib/anthropic/correct";
import { loadCorrectionInput } from "@/lib/work/correction-input";
import { assignmentRef, correctionRef, corrections, toCorrection } from "@/lib/work/store";

/** claude.ai 는 JSON 앞뒤에 말이나 코드 블록을 붙이기도 한다. 거기서 JSON 만 꺼낸다. */
function extractJson(raw: string): unknown {
  const text = raw.trim();

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1], text].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // 앞뒤에 말이 붙은 경우 — 가장 바깥 중괄호만 잘라 본다.
      const start = candidate.indexOf("{");
      const end = candidate.lastIndexOf("}");
      if (start !== -1 && end > start) {
        try {
          return JSON.parse(candidate.slice(start, end + 1));
        } catch {
          // 다음 후보로
        }
      }
    }
  }

  throw new Error("붙여 넣은 글에서 JSON 을 찾지 못했습니다. 중괄호로 시작하는 부분만 넣어 주세요.");
}

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
  assignmentId: z.string().min(1),
  /** claude.ai 에서 받은 답 그대로 */
  pasted: z.string().min(2).max(200_000),
});

/** 선생님이 자기 Claude 로 받은 첨삭 결과를 넣는다. API 를 쓰지 않는다. */
export async function POST(request: Request) {
  const auth = await apiTeacher();
  if (!auth.ok) return auth.response;

  const parsedBody = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsedBody.success) {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const loaded = await loadCorrectionInput(parsedBody.data.assignmentId, auth.user.uid);
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
  const ref = assignment.correctionId ? correctionRef(assignment.correctionId) : corrections().doc();

  await ref.set(
    {
      answerId: loaded.answer.id,
      assignmentId: assignment.id,
      studentId: assignment.studentId,
      univId: assignment.univId,
      examId: assignment.examId,
      questionId: assignment.questionId,
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
  await assignmentRef(assignment.id).update({ status: "corrected", correctionId: ref.id });

  return Response.json({
    correction: toCorrection(await ref.get()),
    matched: result.inlineComments.length,
    asked,
  });
}
