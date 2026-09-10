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
  const range = lengthRange({
    target: question.charTarget,
    tolerance: question.tolerance,
    min: question.charMin,
    max: question.charMax,
  });
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

/**
 * 사람이 claude.ai 에서 받아 붙일 때는 글자 번호를 셀 수 없으므로 원문 조각(quote)을 받는다.
 * 조각을 답안에서 찾아 위치로 바꾼다. 같은 말이 여러 번 나오면 앞에서부터 차례로 집는다.
 */
export function resolveQuotes(
  comments: (Omit<InlineComment, "start" | "end"> & {
    quote?: string;
    start?: number;
    end?: number;
  })[],
  text: string,
): InlineComment[] {
  let cursor = 0;

  /**
   * 공백만 다른 경우를 넘어가려고, 공백을 뺀 글자열에서 찾은 뒤 원래 위치로 되돌린다.
   * 사람이 옮겨 적다 보면 줄바꿈이나 띄어쓰기가 곧잘 달라진다.
   */
  const bare: string[] = [];
  const backIndex: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    if (!/\s/.test(text[i])) {
      bare.push(text[i]);
      backIndex.push(i);
    }
  }
  const bareText = bare.join("");

  function findLoosely(quote: string): { start: number; end: number } | null {
    const needle = quote.replace(/\s+/g, "");
    if (!needle) return null;
    const at = bareText.indexOf(needle);
    if (at === -1) return null;
    return { start: backIndex[at], end: backIndex[at + needle.length - 1] + 1 };
  }

  const resolved = comments.map((comment) => {
    const quote = comment.quote?.trim();
    if (quote) {
      // 앞에서부터 그대로 찾고, 없으면 처음부터, 그래도 없으면 공백을 무시하고 찾는다.
      let at = text.indexOf(quote, cursor);
      if (at === -1) at = text.indexOf(quote);
      if (at !== -1) {
        cursor = at + quote.length;
        return { ...comment, start: at, end: at + quote.length };
      }

      const loose = findLoosely(quote);
      if (loose) {
        cursor = loose.end;
        return { ...comment, ...loose };
      }
    }
    return { ...comment, start: comment.start ?? 0, end: comment.end ?? 0 };
  });

  return sanitizeComments(resolved as InlineComment[], text);
}

export interface CorrectionResult {
  scores: Correction["scores"];
  inlineComments: InlineComment[];
  overall: Correction["overall"];
  revisedExample: string;
  usage: CallUsage;
}

export interface CorrectionInput {
  university: string;
  examTitle: string;
  question: Question;
  analysis: Analysis;
  answer: string;
  charCount: number;
  charCountNoSpace: number;
}

/** 이 문항을 채점할 때 쓸 기준 항목 */
export function rubricItemsFor(input: CorrectionInput): RubricItem[] {
  const items = rubricFor(input.analysis.rubric.items, input.question.number);
  if (items.length === 0) {
    throw new Error(
      `${input.question.number}번 문항의 채점 기준이 없습니다. 기출 화면에서 채점 기준을 확인하세요.`,
    );
  }
  return items;
}

/**
 * 첨삭 프롬프트를 만든다.
 * `manual` 이면 claude.ai 에 그대로 붙여 넣을 수 있게 JSON 형식 안내를 뒤에 붙인다.
 */
export async function buildCorrectionPrompt(
  input: CorrectionInput,
  options: { manual?: boolean } = {},
): Promise<string> {
  const items = rubricItemsFor(input);
  const template = await loadPrompt("correct");

  /**
   * 코멘트 위치를 어떻게 표시할지는 경로마다 다르다.
   * API 는 글자 번호를 세게 하고, 사람이 옮겨 붙일 때는 셀 수 없으니 원문 조각을 받는다.
   */
  const positionRule = options.manual
    ? "- `quote` 는 답안에서 **글자 그대로 옮긴 짧은 대목**이다. 10~40자가 알맞다.\n" +
      "  한 글자라도 다르면 프로그램이 그 자리를 찾지 못한다. 줄임표나 따옴표를 덧붙이지 마라.\n" +
      "  글자 번호는 세지 않아도 된다."
    : "- `start` · `end` 는 **답안 원문의 문자 위치**다. 0 부터 세고 `end` 는 포함하지 않는다.\n" +
      "  아래 답안은 줄 번호나 칸 번호가 아니라 글자를 이어 붙인 것이고, 위치는 그 글자 기준이다.\n" +
      "- 반드시 그 구간의 글자를 다시 확인하고 위치를 정확히 잡아라. 어긋나면 학생이 엉뚱한 곳을 본다.";

  const prompt = fillPrompt(template, {
    positionRule,
    university: input.university,
    examTitle: input.examTitle,
    questionNumber: input.question.number,
    prompt: input.question.prompt,
    passages: renderPassages(input.question),
    lengthNote: renderLength(input.question),
    rubric: renderRubric(input.analysis, items),
    answerStyle:
      `구성: ${input.analysis.answerStyle.structure}\n문체: ${input.analysis.answerStyle.tone}\n` +
      `피할 것: ${input.analysis.answerStyle.avoid.join(" / ") || "(없음)"}`,
    patterns: input.analysis.modelAnswerPatterns.map((line) => `- ${line}`).join("\n") || "(없음)",
    answer: input.answer,
    charCount: String(input.charCount),
    charCountNoSpace: String(input.charCountNoSpace),
  });

  if (!options.manual) return prompt;

  const tail = await loadPrompt("correct-manual");
  return `${prompt}\n\n${fillPrompt(tail, {
    ids: items.map((item) => `"${item.id}"(${item.name}, ${item.points}점)`).join(", "),
  })}`;
}

/** 모델이 돌려준 결과를 확정 기준에 맞춰 다듬는다. API 로 받든 사람이 붙이든 같다. */
export function normalizeCorrection(
  parsed: {
    scores: {
      items: { id: string; name: string; points: number; awarded: number; reason: string }[];
      deductions: { name: string; points: number; reason: string }[];
    };
    inlineComments: (Omit<InlineComment, "start" | "end"> & {
      quote?: string;
      start?: number;
      end?: number;
    })[];
    overall: Correction["overall"];
    revisedExample: string;
  },
  input: CorrectionInput,
): Omit<CorrectionResult, "usage"> {
  // 배점은 확정 기준을 정본으로 삼는다. 모델이 바꿔 왔으면 되돌린다.
  const byId = new Map(rubricItemsFor(input).map((item) => [item.id, item]));

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
    inlineComments: resolveQuotes(parsed.inlineComments, input.answer),
    overall: parsed.overall,
    revisedExample: parsed.revisedExample,
  };
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
  input: CorrectionInput,
  options: CorrectionOptions = {},
): Promise<CorrectionResult> {
  const prompt = await buildCorrectionPrompt(input);

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

  return {
    ...normalizeCorrection(parsed, input),
    usage: {
      model,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    },
  };
}
