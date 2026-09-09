import "server-only";

import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { anthropic, type CallUsage } from "@/lib/anthropic/client";
import { fillPrompt, loadPrompt } from "@/lib/anthropic/prompts";
import { serverEnv } from "@/lib/env";

export type Track = "humanities" | "science" | "unknown";
export type DocKind = "question" | "solution";

const partSchema = z.object({
  kind: z.enum(["question", "solution"]),
  track: z.enum(["humanities", "science", "unknown"]),
  pageFrom: z.number().int().min(1),
  pageTo: z.number().int().min(1),
  title: z.string(),
  session: z.string().nullable(),
  confidence: z.enum(["high", "medium", "low"]),
});

const classifySchema = z.object({
  university: z.string().nullable(),
  year: z.number().int().nullable(),
  parts: z.array(partSchema),
  note: z.string().describe("판단이 애매했던 점. 없으면 빈 문자열"),
});

export type ClassifiedPart = z.infer<typeof partSchema>;

export interface ClassifyResult {
  university: string | null;
  year: number | null;
  parts: ClassifiedPart[];
  note: string;
  usage: CallUsage;
}

/** PDF 한 개에 무엇이 들어 있는지 갈래별로 나눈다. */
export async function classifyPdf(input: {
  fileName: string;
  pageCount: number;
  digest: string;
}): Promise<ClassifyResult> {
  const template = await loadPrompt("classify-pdf");
  const prompt = fillPrompt(template, {
    fileName: input.fileName,
    pageCount: String(input.pageCount),
    digest: input.digest,
  });

  const model = serverEnv.correctionModel;
  const stream = anthropic().messages.stream({
    model,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    messages: [{ role: "user", content: prompt }],
    output_config: { format: zodOutputFormat(classifySchema) },
  });

  const message = await stream.finalMessage();
  const parsed = message.parsed_output;
  if (!parsed) throw new Error("PDF 분류 결과를 읽지 못했습니다.");

  return {
    university: parsed.university,
    year: parsed.year,
    // 쪽 범위가 뒤집혀 오면 바로잡는다.
    parts: parsed.parts.map((part) => ({
      ...part,
      pageFrom: Math.min(part.pageFrom, part.pageTo),
      pageTo: Math.max(part.pageFrom, part.pageTo),
    })),
    note: parsed.note,
    usage: {
      model,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    },
  };
}
