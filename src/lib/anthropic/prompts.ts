import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * 프롬프트는 prompts/ 아래 파일로 둔다. 코드 수정 없이 문구만 고칠 수 있게.
 * 서버리스에서도 읽히도록 process.cwd() 기준 경로를 쓴다.
 */
const cache = new Map<string, string>();

export async function loadPrompt(name: string): Promise<string> {
  const hit = cache.get(name);
  if (hit) return hit;

  const file = path.join(process.cwd(), "prompts", `${name}.md`);
  const text = await readFile(file, "utf8");
  cache.set(name, text);
  return text;
}

/** {{key}} 자리를 값으로 바꾼다. 값이 없으면 빈 문자열. */
export function fillPrompt(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? "");
}
