/** 원문 조각으로 코멘트 자리를 찾는지 확인한다. npm run check:quote */
import { resolveQuotes } from "../src/lib/anthropic/correct";

const TEXT = "제시문 (가)는 도시를 낯선 사람들이 서로를 견디며\n살아가는 장소로 규정한다. 익명성은 부담이자 자유다.";

const base = { severity: "warning" as const, category: "문장", message: "m", suggestion: null };

let failed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`  ${ok ? "✔" : "✖"} ${label}${ok ? "" : ` — 받음 ${JSON.stringify(actual)}, 기대 ${JSON.stringify(expected)}`}`);
  if (!ok) failed += 1;
}

const exact = resolveQuotes([{ ...base, quote: "익명성은 부담이자 자유다" }], TEXT)[0];
check("그대로 있는 조각", TEXT.slice(exact.start, exact.end), "익명성은 부담이자 자유다");

// 줄바꿈이 공백으로 바뀐 경우 — 사람이 옮기면 흔하다
const across = resolveQuotes([{ ...base, quote: "서로를 견디며 살아가는 장소로" }], TEXT)[0];
check("줄바꿈이 달라진 조각", TEXT.slice(across.start, across.end).replace(/\s+/g, " "), "서로를 견디며 살아가는 장소로");

// 띄어쓰기가 사라진 경우
const spaced = resolveQuotes([{ ...base, quote: "도시를낯선사람들이" }], TEXT)[0];
check("띄어쓰기가 사라진 조각", TEXT.slice(spaced.start, spaced.end), "도시를 낯선 사람들이");

// 아예 없는 말은 버린다
check("답안에 없는 조각은 버린다", resolveQuotes([{ ...base, quote: "있지도 않은 문장" }], TEXT).length, 0);

// 같은 말이 두 번 나오면 앞에서부터 차례로
const twice = "가나다 라마바 가나다";
const both = resolveQuotes(
  [{ ...base, quote: "가나다" }, { ...base, quote: "가나다" }],
  twice,
);
check("같은 말은 차례로 집는다", both.map((c) => c.start), [0, 8]);

console.log(failed === 0 ? "\n전부 통과" : `\n${failed}건 실패`);
if (failed) process.exit(1);
