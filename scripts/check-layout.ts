import { fromLiteral, layoutManuscript, toLiteral } from "@/lib/manuscript/layout";
import { checkLiteral, checkManuscript } from "@/lib/manuscript/rules";
import { DEFAULT_SPEC, lengthRange, rowCapacity, type LengthRule } from "@/lib/manuscript/spec";

function render(text: string, spec = DEFAULT_SPEC) {
  const layout = layoutManuscript(text, spec);
  const rows: string[] = [];
  for (let r = 0; r <= (layout.cells.at(-1)?.row ?? 0); r += 1) {
    const cap = rowCapacity(spec, r);
    const line: string[] = [];
    for (let c = 0; c < cap; c += 1) {
      const cell = layout.cells.find((x) => x.row === r && x.col === c);
      line.push(cell ? (cell.text === "" ? "_" : cell.text + cell.appended) : "·");
    }
    rows.push(`${String(r).padStart(2)}|${line.join("")}|${cap}칸`);
  }
  return { layout, rows };
}

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "  ✔" : "  ✘"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
};

console.log("=== 1. 줄 폭: 첫 줄 35칸 / 이후 38칸 ===");
{
  const text = "가".repeat(120);
  const { layout, rows } = render(text);
  rows.slice(0, 3).forEach((r) => console.log(r));
  const row0 = layout.cells.filter((c) => c.row === 0).length;
  const row1 = layout.cells.filter((c) => c.row === 1).length;
  check("첫 줄 35칸", row0 === 35, `${row0}칸`);
  check("둘째 줄 38칸", row1 === 38, `${row1}칸`);
}

console.log("\n=== 2. 문단 첫 칸 비우기 ===");
{
  const { layout, rows } = render("첫째 문단입니다.\n둘째 문단입니다.");
  rows.forEach((r) => console.log(r));
  const first = layout.cells[0];
  const secondParagraph = layout.cells.find((c) => c.row === 1);
  check("첫 문단 들여쓰기", first.kind === "indent", first.kind);
  check("새 문단 들여쓰기", secondParagraph?.kind === "indent", secondParagraph?.kind ?? "없음");
}

console.log("\n=== 3. 숫자·영문 한 칸 두 자 ===");
{
  const { layout } = render("서기 1948년 UN 결의");
  const packed = layout.cells.filter((c) => c.text.length === 2).map((c) => c.text);
  console.log("  두 자 칸:", packed.join(" / "));
  check("1948 → 19|48", packed.includes("19") && packed.includes("48"));
  check("UN 한 칸", packed.includes("UN"));
}

console.log("\n=== 3-1. 소수는 소수점까지 뒤에서부터 두 자 ===");
{
  const cases: [string, string[]][] = [
    ["0.5", ["0", ".5"]],
    ["3.75", ["3.", "75"]],
    ["12.5", ["12", ".5"]],
    ["1.125", ["1", ".1", "25"]],
  ];
  for (const [number, expected] of cases) {
    const texts = layoutManuscript(`약 ${number}배`, DEFAULT_SPEC).cells
      .filter((c) => c.kind === "text").map((c) => c.text).slice(1, -1);
    check(`${number} → ${expected.join("|")}`, texts.join("|") === expected.join("|"), texts.join("|"));
  }
  // ".5" 조각이 줄 첫 칸에 와도 앞 칸에 붙지 않는다
  const { layout } = render("가".repeat(33) + "0.5");
  const head = layout.cells.find((c) => c.row === 1 && c.col === 0);
  check("줄머리 .5 는 제 칸에", head?.text === ".5", head?.text ?? "없음");
}

console.log("\n=== 3-2. <가> 같은 제시문 표지는 한 칸 ===");
{
  const texts = layoutManuscript("<가>와 〈나〉는 다르다", DEFAULT_SPEC).cells
    .filter((c) => c.kind === "text").map((c) => c.text);
  check("<가> 한 칸", texts[0] === "<가>", texts.join("|"));
  check("〈나〉 한 칸", texts.includes("〈나〉"), texts.join("|"));
  const pair = layoutManuscript("<가><나>", DEFAULT_SPEC).cells.filter((c) => c.kind === "text").map((c) => c.text);
  check("<가><나> 붙여 써도 한 칸씩", pair.join("|") === "<가>|<나>", pair.join("|"));
  const tail = layoutManuscript("가".repeat(33) + "<나>", DEFAULT_SPEC).cells.at(-1)!;
  check("줄 끝 칸에 와도 내리지 않는다", tail.row === 0 && tail.text === "<나>", `${tail.row}:${tail.col}`);
}

console.log("\n=== 4. 문장부호는 줄 첫 칸에 오지 않는다 ===");
{
  // 첫 줄 35칸을 정확히 채우고 다음이 마침표가 되도록 만든다
  const text = "가".repeat(34) + ".";
  const { layout, rows } = render(text);
  rows.forEach((r) => console.log(r));
  const lineStarts = layout.cells.filter((c) => c.col === 0 && c.kind === "text");
  const startsWithPunct = lineStarts.some((c) => ".,!?".includes(c.text[0]));
  const lastCell = layout.cells.at(-1)!;
  check("줄 첫 칸에 문장부호 없음", !startsWithPunct);
  check(
    "앞 칸에 병기됨 (본 글자와 부호를 분리)",
    lastCell.text === "가" && lastCell.appended === ".",
    `text="${lastCell.text}" appended="${lastCell.appended}"`,
  );
}

console.log("\n=== 5. 줄 첫 칸 띄어쓰기는 칸을 쓰지 않는다 ===");
{
  const text = "가".repeat(34) + " 나";
  const { layout } = render(text);
  const firstOfRow1 = layout.cells.find((c) => c.row === 1 && c.col === 0)!;
  check("줄머리 공백 무시", firstOfRow1.kind === "text" && firstOfRow1.text === "나", firstOfRow1.text);
}

console.log("\n=== 6. 글자 수와 작성법 검사 ===");
{
  const text = "  두 칸 들여쓴  문단 입니다 .";
  const layout = layoutManuscript(text, DEFAULT_SPEC);
  const issues = checkManuscript(text, layout, { target: 600, tolerance: 0.1 });
  console.log(`  칸(공백 포함) ${layout.countWithSpace} / 공백 제외 ${layout.countWithoutSpace}`);
  for (const issue of issues) console.log(`  [${issue.severity}] ${issue.rule}: ${issue.message}`);
  const ids = issues.map((i) => i.rule);
  check("수동 들여쓰기 경고", ids.includes("INDENT_MANUAL"));
  check("연속 띄어쓰기 경고", ids.includes("SPACE_DOUBLE"));
  check("문장부호 앞 공백 경고", ids.includes("SPACE_BEFORE_PUNCT"));
  check("분량 미달 경고", ids.includes("LENGTH_UNDER"));
}

console.log("\n=== 7. 분량 초과 ===");
{
  const text = "가".repeat(700);
  const layout = layoutManuscript(text, DEFAULT_SPEC);
  const issues = checkManuscript(text, layout, { target: 600, tolerance: 0.1 });
  const over = issues.find((i) => i.rule === "LENGTH_OVER");
  console.log(`  ${over?.message ?? "없음"}`);
  check("초과 경고 (상한 660)", over != null && over.severity === "error");
}

console.log("\n=== 8. 마침표·쉼표 뒤는 칸을 비우지 않는다 ===");
{
  const text = "가나, 다라. 마바";
  const { layout, rows } = render(text);
  rows.forEach((r) => console.log(r));
  const spaceCells = layout.cells.filter((c) => c.kind === "space").length;
  check("쉼표·마침표 뒤 공백 칸 없음", spaceCells === 0, `공백 칸 ${spaceCells}개`);
  // 들여쓰기1 + 가나,(3) + 다라.(3) + 마바(2) = 9칸
  check("칸 수 9", layout.countWithSpace === 9, `${layout.countWithSpace}칸`);
}

console.log("\n=== 9. 물음표·느낌표 뒤는 한 칸 비운다 ===");
{
  const text = "그런가? 그렇다";
  const { layout, rows } = render(text);
  rows.forEach((r) => console.log(r));
  const spaceCells = layout.cells.filter((c) => c.kind === "space").length;
  check("물음표 뒤 공백 칸 유지", spaceCells === 1, `공백 칸 ${spaceCells}개`);
}

console.log("\n=== 10. 분량 허용 범위 ===");
{
  const cases: [string, LengthRule, number, number][] = [
    ["400자 내외 ±10%", { target: 400, tolerance: 0.1 }, 360, 440],
    ["800자 내외 ±10%", { target: 800, tolerance: 0.1 }, 720, 880],
    ["900자 내외 ±10%", { target: 900, tolerance: 0.1 }, 810, 990],
    ["600자 내외 ±5%", { target: 600, tolerance: 0.05 }, 570, 630],
    // 문제지가 범위를 못 박은 경우 — 비율로 환산하지 않는다
    ["(800±100자)", { target: 800, tolerance: 0.1, min: 700, max: 900 }, 700, 900],
    ["500자 이상 600자 이하", { target: 550, tolerance: 0.1, min: 500, max: 600 }, 500, 600],
  ];

  for (const [label, rule, min, max] of cases) {
    const range = lengthRange(rule);
    check(
      `${label} → ${min}~${max}자`,
      range.min === min && range.max === max,
      `${range.min}~${range.max}자`,
    );
  }
}

console.log("\n=== 11. 옮겨 쓰기 — 친 그대로 칸에 넣고 어긴 자리를 찾는다 ===");
{
  const literal = (text: string) => layoutManuscript(text, DEFAULT_SPEC, { literal: true });
  const rulesOf = (text: string) => checkLiteral(literal(text)).map((issue) => issue.rule);

  check("바르게 쓴 글은 위반 없음", rulesOf(" 첫 문단이다.둘째 문장이다.\n 둘째 문단.").length === 0,
    rulesOf(" 첫 문단이다.둘째 문장이다.\n 둘째 문단.").join(","));
  check("문단 첫 칸 안 비움", rulesOf("들여쓰기 없이.").join() === "MISSING_INDENT");
  const missing = checkLiteral(literal("들여쓰기 없이."))[0];
  check("  첫 어절을 짚는다", missing.start === 0 && missing.end === 4, `${missing.start}~${missing.end}`);
  check("두 칸 들여씀", rulesOf("  두 칸.").join() === "EXTRA_INDENT");
  check("마침표 뒤 빈칸", rulesOf(" 가나. 다라.").join() === "BLANK_AFTER_PUNCT");

  // 첫 줄 35칸: 들여쓰기 1 + 34자로 꽉 채운다
  const full = " " + "가".repeat(34);
  const blank = literal(full + " 나");
  check("줄 첫 칸 빈칸은 칸을 쓴다", blank.cells.find((c) => c.row === 1 && c.col === 0)?.kind === "space");
  check("  위반으로 잡힌다", rulesOf(full + " 나").join() === "BLANK_AT_LINE_START");

  const wrapped = literal(full + ".");
  check("꽉 차 넘어간 마침표는 앞 칸에 함께", wrapped.cells.at(-1)?.appended === "." && rulesOf(full + ".").length === 0);
  const forced = literal(full + "|.");
  check("| 뒤 마침표는 줄 첫 칸에", forced.cells.at(-1)?.row === 1 && forced.cells.at(-1)?.text === ".");
  check("  위반으로 잡힌다", rulesOf(full + "|.").join() === "PUNCT_AT_LINE_START");

  const bracket = " " + "가".repeat(33) + "(나)";
  check("줄 끝 여는 괄호는 내리지 않는다", literal(bracket).cells.find((c) => c.text === "(")?.row === 0);
  check("  위반으로 잡힌다", rulesOf(bracket).join() === "BRACKET_AT_LINE_END");
  check("| 로 내리면 위반 아님", rulesOf(" " + "가".repeat(33) + "|(나)").length === 0);

  const manualIssues = checkManuscript("들여쓰기 없이.", literal("들여쓰기 없이."), null, { literal: true });
  check("checkManuscript 도 옮겨 쓰기 규칙을 쓴다", manualIssues.some((i) => i.rule === "MISSING_INDENT"));
}

console.log("\n=== 12. 자동 배치 글 ↔ 옮겨 쓰기 글 — 원고지 모양이 같다 ===");
{
  const shape = (cells: { row: number; col: number; text: string; appended: string }[]) =>
    cells.map((c) => `${c.row}:${c.col}:${c.text}${c.appended}`).join(" ");
  const samples = [
    "첫 문단입니다. 그리고 둘째 문장, 셋째.\n둘째 문단은 0.5와 3.75를 씁니다!  끝",
    "가".repeat(34) + " 나",
    "가".repeat(34) + "." + "다",
    "가".repeat(33) + "(나)라",
  ];
  for (const text of samples) {
    const auto = layoutManuscript(text, DEFAULT_SPEC);
    const literalText = toLiteral(text, DEFAULT_SPEC);
    const literal = layoutManuscript(literalText, DEFAULT_SPEC, { literal: true });
    check(`모양 같음: ${text.slice(0, 12)}…`, shape(auto.cells) === shape(literal.cells), JSON.stringify(literalText.slice(0, 50)));
  }
  check("되돌리기", fromLiteral(" 가나.다\n 라|(마)") === "가나.다\n라(마)");
}

console.log(failures === 0 ? "\n전부 통과" : `\n${failures}건 실패`);
process.exit(failures === 0 ? 0 : 1);
