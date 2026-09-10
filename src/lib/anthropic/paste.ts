/**
 * claude.ai 에서 받아 붙인 글에서 JSON 만 꺼낸다.
 * 사람이 옮기면 코드 블록이나 인사말이 앞뒤에 붙기 마련이다.
 */
export function extractJson(raw: string): unknown {
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
