import "server-only";

import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { anthropic, type CallUsage } from "@/lib/anthropic/client";
import { fillPrompt, loadPrompt } from "@/lib/anthropic/prompts";
import { serverEnv } from "@/lib/env";
import { lengthRange } from "@/lib/manuscript/spec";
import { rubricFor, type Analysis, type Question, type RubricItem } from "@/lib/types/exam";
import type { Correction, InlineComment } from "@/lib/types/work";

const commentSchema = z.object({
  start: z.number().int().min(0),
  end: z.number().int().min(0),
  severity: z.enum(["good", "info", "warning", "error"]),
  category: z.string(),
  message: z.string(),
  suggestion: z.string().nullable(),
});

const correctionSchema = z.object({
  scores: z.object({
    items: z.array(
      z.object({
        id: z.string().describe("채점 기준 항목의 id 를 그대로"),
        name: z.string(),
        points: z.number().describe("배점 (기준 그대로)"),
        awarded: z.number().describe("실제로 준 점수"),
        reason: z.string(),
      }),
    ),
    deductions: z.array(
      z.object({ name: z.string(), points: z.number(), reason: z.string() }),
    ),
  }),
  inlineComments: z.array(commentSchema),
  overall: z.object({
    summary: z.string(),
    strengths: z.array(z.string()),
    improvements: z.array(z.string()),
    nextSteps: z.array(z.string()),
  }),
  revisedExample: z.string(),
});

function renderRubric(analysis: Analysis, items_: RubricItem[]): string {
  const items = items_
    .map(
      (item) =>
        `- [${item.id}] ${item.name} — ${item.points}점${item.inferred ? " (해설에 없어 추론한 항목)" : ""}\n` +
        `  ${item.description}\n` +
        item.criteria.map((line) => `  · ${line}`).join("\n"),
    )
    .join("\n");

  const deductions = analysis.rubric.deductions.length
    ? analysis.rubric.deductions
        .map((item) => `- ${item.name} — 최대 ${item.points}점 감점. ${item.description}`)
        .join("\n")
    : "- (정해진 감점 항목 없음)";

  return `### 배점 항목 (합계 100점)\n${items}\n\n### 감점\n${deductions}`;
}

function renderPassages(question: Question): string {
  if (question.passages.length === 0) return "(제시문 없음)";
  return question.passages.map((p) => `**제시문 ${p.label}**\n${p.text}`).join("\n\n");
}

function renderLength(question: Question): string {
  if (!question.charTarget) return question.lengthNote ?? "분량 조건 없음";
  const range = lengthRange({ target: question.charTarget, tolerance: question.tolerance });
  return `${question.lengthNote ?? `${question.charTarget}자 내외`} → 허용 ${range.min}~${range.max}자`;
}

/** 위치가 답안 밖으로 나가거나 뒤집힌 코멘트는 버린다. */
function sanitizeComments(comments: InlineComment[], text: string): InlineComment[] {
  return comments
    .map((comment) => ({
      ...comment,
      start: Math.max(0, Math.min(comment.start, text.length)),
      end: Math.max(0, Math.min(comment.end, text.length)),
    }))
    .filter((comment) => comment.end > comment.start)
    .sort((a, b) => a.start - b.start);
}

export interface CorrectionResult {
  scores: Correction["scores"];
  inlineComments: InlineComment[];
  overall: Correction["overall"];
  revisedExample: string;
  usage: CallUsage;
}

export interface CorrectionOptions {
  /** 기본은 환경변수의 첨삭 모델 */
  model?: string;
  /**
   * 생각에 얼마나 힘을 쓸지. 출력 토큰이 여기서 크게 갈린다.
   * 없으면 환경변수 값을 쓰고, 그것도 없으면 모델이 알아서 정한다.
   */
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
}

export async function correctAnswer(
  input: {
    university: string;
    examTitle: string;
    question: Question;
    analysis: Analysis;
    answer: string;
    charCount: number;
    charCountNoSpace: number;
  },
  options: CorrectionOptions = {},
): Promise<CorrectionResult> {
  // 학생은 문항 하나만 썼으므로 그 문항의 채점 기준만 쓴다.
  const rubricItems = rubricFor(input.analysis.rubric.items, input.question.number);
  if (rubricItems.length === 0) {
    throw new Error(
      `${input.question.number}번 문항의 채점 기준이 없습니다. 기출 화면에서 채점 기준을 확인하세요.`,
    );
  }

  const template = await loadPrompt("correct");
  const prompt = fillPrompt(template, {
    university: input.university,
    examTitle: input.examTitle,
    questionNumber: input.question.number,
    prompt: input.question.prompt,
    passages: renderPassages(input.question),
    lengthNote: renderLength(input.question),
    rubric: renderRubric(input.analysis, rubricItems),
    answerStyle:
      `구성: ${input.analysis.answerStyle.structure}\n문체: ${input.analysis.answerStyle.tone}\n` +
      `피할 것: ${input.analysis.answerStyle.avoid.join(" / ") || "(없음)"}`,
    patterns: input.analysis.modelAnswerPatterns.map((line) => `- ${line}`).join("\n") || "(없음)",
    answer: input.answer,
    charCount: String(input.charCount),
    charCountNoSpace: String(input.charCountNoSpace),
  });

  const model = options.model ?? serverEnv.correctionModel;
  const effort = options.effort ?? serverEnv.correctionEffort;

  const stream = anthropic().messages.stream({
    model,
    max_tokens: 32000,
    thinking: { type: "adaptive" },
    messages: [{ role: "user", content: prompt }],
    output_config: {
      format: zodOutputFormat(correctionSchema),
      ...(effort ? { effort } : {}),
    },
  });

  const message = await stream.finalMessage();
  const parsed = message.parsed_output;
  if (!parsed) throw new Error("첨삭 결과를 읽지 못했습니다.");

  // 배점은 확정 기준을 정본으로 삼는다. 모델이 바꿔 왔으면 되돌린다.
  const byId = new Map(rubricItems.map((item) => [item.id, item]));
  const items = parsed.scores.items.map((item) => {
    const source = byId.get(item.id);
    const points = source?.points ?? item.points;
    return {
      id: item.id,
      name: source?.name ?? item.name,
      points,
      awarded: Math.max(0, Math.min(item.awarded, points)),
      reason: item.reason,
    };
  });

  const deductions = parsed.scores.deductions.map((item) => ({
    name: item.name,
    points: Math.max(0, item.points),
    reason: item.reason,
  }));

  const earned = items.reduce((sum, item) => sum + item.awarded, 0);
  const lost = deductions.reduce((sum, item) => sum + item.points, 0);

  return {
    scores: { items, deductions, total: Math.max(0, Math.round(earned - lost)) },
    inlineComments: sanitizeComments(parsed.inlineComments, input.answer),
    overall: parsed.overall,
    revisedExample: parsed.revisedExample,
    usage: {
      model,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    },
  };
}
