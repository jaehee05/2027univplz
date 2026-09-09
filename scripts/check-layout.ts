import { layoutManuscript } from "@/lib/manuscript/layout";
import { checkManuscript } from "@/lib/manuscript/rules";
import { DEFAULT_SPEC, rowCapacity } from "@/lib/manuscript/spec";

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

console.log(failures === 0 ? "\n전부 통과" : `\n${failures}건 실패`);
process.exit(failures === 0 ? 0 : 1);
