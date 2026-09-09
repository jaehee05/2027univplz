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
  univId: z.string().nullable().describe("등록된 대학 목록의 id. 모르면 null"),
  universityText: z.string().nullable().describe("파일에서 읽어 낸 대학 이름 그대로"),
  year: z.number().int().nullable(),
  parts: z.array(partSchema),
  note: z.string().describe("판단이 애매했던 점. 없으면 빈 문자열"),
});

export type ClassifiedPart = z.infer<typeof partSchema>;

export interface ClassifyResult {
  univId: string | null;
  universityText: string | null;
  year: number | null;
  parts: ClassifiedPart[];
  note: string;
  usage: CallUsage;
}

/** 파일 한 개에 무엇이 들어 있는지, 어느 대학 것인지 갈래별로 나눈다. */
export async function classifyDocument(input: {
  fileName: string;
  pageCount: number;
  digest: string;
  universities: { id: string; name: string }[];
}): Promise<ClassifyResult> {
  const template = await loadPrompt("classify-pdf");
  const prompt = fillPrompt(template, {
    fileName: input.fileName,
    pageCount: String(input.pageCount),
    digest: input.digest,
    universities:
      input.universities.map((univ) => `- id \`${univ.id}\` — ${univ.name}`).join("\n") ||
      "(등록된 대학이 없습니다. univId 는 null 로 두세요.)",
  });

  // 쪽별 요약만 보고 가려내는 일이라 가벼운 모델로 충분하다.
  // 묶음 업로드에서 파일마다 한 번씩 부르므로 속도가 중요하다.
  const model = serverEnv.classifyModel;
  const stream = anthropic().messages.stream({
    model,
    max_tokens: 8000,
    messages: [{ role: "user", content: prompt }],
    output_config: { format: zodOutputFormat(classifySchema) },
  });

  const message = await stream.finalMessage();
  const parsed = message.parsed_output;
  if (!parsed) throw new Error("PDF 분류 결과를 읽지 못했습니다.");

  // 목록에 없는 id 를 만들어 왔으면 버린다.
  const known = new Set(input.universities.map((univ) => univ.id));

  return {
    univId: parsed.univId && known.has(parsed.univId) ? parsed.univId : null,
    universityText: parsed.universityText,
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
