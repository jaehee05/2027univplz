import "server-only";

import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { anthropic, type CallUsage } from "@/lib/anthropic/client";
import { fillPrompt, loadPrompt } from "@/lib/anthropic/prompts";
import { serverEnv } from "@/lib/env";
import type { Analysis, Question } from "@/lib/types/exam";

/** 프롬프트에 통째로 넣기엔 너무 긴 PDF 를 잘라 낸다. */
const MAX_TEXT_CHARS = 120_000;

function clip(text: string, limit = MAX_TEXT_CHARS): string {
  return text.length <= limit ? text : `${text.slice(0, limit)}\n\n…(이하 생략)`;
}

/* ── 문항 파싱 ───────────────────────────────────────────── */

const passageSchema = z.object({
  label: z.string().describe("제시문 기호. 가, 나, [A] 처럼 문제지 표기 그대로"),
  text: z.string().describe("제시문 전문"),
});

const parsedQuestionSchema = z.object({
  number: z.string().describe("문항 번호. 문제지 표기 그대로"),
  prompt: z.string().describe("논제 문장 전문"),
  passages: z.array(passageSchema),
  charTarget: z.number().int().nullable().describe("분량 조건의 글자 수. 없으면 null"),
  lengthNote: z.string().nullable().describe("분량 조건 문구 그대로. 없으면 null"),
  points: z.number().nullable().describe("배점. 적혀 있지 않으면 null"),
  answerFormat: z.enum(["manuscript", "free"]),
});

const parseResultSchema = z.object({
  questions: z.array(parsedQuestionSchema),
  note: z.string().describe("파싱하며 걸린 점. 없으면 빈 문자열"),
});

export type ParsedQuestion = z.infer<typeof parsedQuestionSchema>;

export interface ParseQuestionsResult {
  questions: Question[];
  note: string;
  usage: CallUsage;
}

export async function parseQuestions(input: {
  university: string;
  year: number;
  examText: string;
}): Promise<ParseQuestionsResult> {
  const template = await loadPrompt("parse-questions");
  const prompt = fillPrompt(template, {
    university: input.university,
    year: String(input.year),
    examText: clip(input.examText),
  });

  const model = serverEnv.correctionModel;
  const stream = anthropic().messages.stream({
    model,
    max_tokens: 32000,
    thinking: { type: "adaptive" },
    messages: [{ role: "user", content: prompt }],
    output_config: { format: zodOutputFormat(parseResultSchema) },
  });

  const message = await stream.finalMessage();
  const parsed = message.parsed_output;
  if (!parsed) {
    throw new Error("문항 파싱 결과를 읽지 못했습니다. 다시 시도해 주세요.");
  }

  return {
    questions: parsed.questions.map((q, index) => ({
      id: slugifyNumber(q.number, index),
      number: q.number,
      prompt: q.prompt,
      passages: q.passages,
      charTarget: q.charTarget,
      tolerance: 0.1,
      lengthNote: q.lengthNote,
      points: q.points,
      answerFormat: q.answerFormat,
      modelAnswer: null,
      source: "parsed",
    })),
    note: parsed.note,
    usage: {
      model,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    },
  };
}

/** 문항 번호를 문서 id 로 쓸 수 있게 다듬는다. */
export function slugifyNumber(number: string, index: number): string {
  const cleaned = number.replace(/[^0-9a-zA-Z가-힣-]/g, "");
  return cleaned ? `q${cleaned}` : `q${index + 1}`;
}

/* ── 채점 기준 분석 ──────────────────────────────────────── */

const rubricItemSchema = z.object({
  name: z.string(),
  points: z.number().describe("100점 만점 기준 배점"),
  description: z.string(),
  criteria: z.array(z.string()).describe("만점 조건 2~4개"),
  inferred: z.boolean().describe("해설에 없어 모범답안에서 추론했으면 true"),
});

const deductionSchema = z.object({
  name: z.string(),
  points: z.number().describe("깎이는 점수(양수)"),
  description: z.string(),
  inferred: z.boolean(),
});

const analysisSchema = z.object({
  questionTypes: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      cues: z.array(z.string()),
    }),
  ),
  rubric: z.object({
    items: z.array(rubricItemSchema).describe("배점 합계가 정확히 100"),
    deductions: z.array(deductionSchema),
  }),
  answerStyle: z.object({
    structure: z.string(),
    tone: z.string(),
    avoid: z.array(z.string()),
  }),
  modelAnswerPatterns: z.array(z.string()),
});

export type AnalysisPayload = Pick<
  Analysis,
  "questionTypes" | "rubric" | "answerStyle" | "modelAnswerPatterns"
>;

export async function analyzeRubric(input: {
  university: string;
  year: number;
  examText: string;
  solutionText: string;
}): Promise<{ analysis: AnalysisPayload; usage: CallUsage }> {
  const template = await loadPrompt("analyze-rubric");
  const prompt = fillPrompt(template, {
    university: input.university,
    year: String(input.year),
    examText: clip(input.examText),
    solutionText: input.solutionText ? clip(input.solutionText) : "(해설 PDF 가 아직 없습니다.)",
  });

  const model = serverEnv.correctionModel;
  const stream = anthropic().messages.stream({
    model,
    max_tokens: 32000,
    thinking: { type: "adaptive" },
    messages: [{ role: "user", content: prompt }],
    output_config: { format: zodOutputFormat(analysisSchema) },
  });

  const message = await stream.finalMessage();
  const parsed = message.parsed_output;
  if (!parsed) {
    throw new Error("채점 기준 분석 결과를 읽지 못했습니다. 다시 시도해 주세요.");
  }

  return {
    analysis: {
      questionTypes: parsed.questionTypes,
      rubric: {
        items: parsed.rubric.items.map((item, index) => ({
          id: `r${index + 1}`,
          ...item,
        })),
        deductions: parsed.rubric.deductions,
      },
      answerStyle: parsed.answerStyle,
      modelAnswerPatterns: parsed.modelAnswerPatterns,
    },
    usage: {
      model,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    },
  };
}
