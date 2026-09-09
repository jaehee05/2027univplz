import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { serverEnv } from "@/lib/env";

let cached: Anthropic | null = null;

/** API 키는 서버에서만 읽는다. 첫 호출 때 만들고 재사용한다. */
export function anthropic(): Anthropic {
  if (!cached) {
    cached = new Anthropic({ apiKey: serverEnv.anthropicApiKey });
  }
  return cached;
}

export interface CallUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
}
