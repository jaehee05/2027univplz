/**
 * 앱이 만든 문제지 HWPX 가 제대로 짜였는지 잰다. npm run check:handout
 * 외부 호출이 없어 요금이 들지 않는다.
 *
 * 잴 수 있는 것 — zip 구조, XML 이 닫히는지, 넣은 글이 도로 나오는지.
 * **잴 수 없는 것 — 한글이 실제로 여는지.** 그것은 사람이 한 번 열어 봐야 한다.
 */
import { unzipSync } from "fflate";

import { extractHwpx } from "../src/lib/docs/hwpx";
import { buildHandoutHwpx } from "../src/lib/docs/hwpx-write";

let failed = 0;

function check(name: string, ok: boolean, detail = "") {
  if (!ok) failed += 1;
  console.log(`  ${ok ? "✔" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const input = {
  univName: "홍익대학교",
  examTitle: "2027 모의논술",
  passages: [
    {
      label: "(가)",
      text: "집중과 분산은 어느 하나가 절대적으로 옳은 원리가 아니다.\n\n힘이 흩어진 상태는 '만인의 만인에 대한 투쟁'이라는 무질서를 낳는다.",
    },
    // 기호에 괄호가 없는 경우 — 논제가 (나) 꼴로 부르므로 문제지도 맞춰야 한다.
    { label: "나", text: "표준어와 방언은 <집중>과 \"분산\"의 관계로 볼 수 있다. 5 < 7 & 3 > 1" },
  ],
  questions: [
    {
      number: "1",
      prompt: "제시문 (가)와 (나)를 활용하여 집중과 분산의 관계를 논하시오.",
      lengthNote: "800자 내외",
      charTarget: 800,
      points: 40,
    },
    // 원문 문구에 이미 괄호가 씌워진 경우 — 그대로 두면 `((800±100자))` 가 된다.
    { number: "2", prompt: "제시문 (나)의 관점에서 (가)를 비판하시오.", lengthNote: "(800±100자)", charTarget: 600, points: 35 },
    { number: "3", prompt: "위 논의를 종합하시오.", lengthNote: null, charTarget: 600, points: 25 },
  ],
};

console.log("문제지 HWPX 를 만들어 도로 읽어 본다\n");

const bytes = buildHandoutHwpx(input);
console.log(`  만든 크기 ${bytes.length.toLocaleString()}바이트\n`);

// ── zip 구조 ──────────────────────────────────────────────
console.log("zip 구조");
const entries = unzipSync(bytes);
const names = Object.keys(entries);
for (const required of [
  "mimetype",
  "version.xml",
  "META-INF/container.xml",
  "META-INF/manifest.xml",
  "Contents/content.hpf",
  "Contents/header.xml",
  "Contents/section0.xml",
  "settings.xml",
]) {
  check(required, names.includes(required));
}

const decoder = new TextDecoder("utf-8");
check("mimetype 내용", decoder.decode(entries["mimetype"]) === "application/hwp+zip");

// OCF 규약 — mimetype 은 맨 앞에, 압축하지 않고. 로컬 헤더를 직접 읽어 확인한다.
const head = decoder.decode(bytes.slice(0, 64));
check("mimetype 이 첫 항목", head.includes("mimetype"), head.slice(30, 38));
// 로컬 파일 헤더의 압축 방식(offset 8, 2바이트) — 0 이면 저장(무압축)
check("mimetype 무압축 저장", bytes[8] === 0 && bytes[9] === 0);

// ── XML 이 닫히는지 ───────────────────────────────────────
/**
 * 태그를 차례로 훑으며 여닫이가 맞는지 본다.
 * 정규식으로 개수만 세면 자기닫힘 태그(`<x/>`)와 선언(`<?xml?>`)이 섞여 못 가린다.
 */
function malformed(xml: string): string | null {
  if (!xml.startsWith("<?xml")) return "선언이 없다";
  const stack: string[] = [];
  const TAG = /<(\/?)([A-Za-z_][\w.:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;

  let at = 0;
  for (const m of xml.matchAll(TAG)) {
    // 선언·주석은 건너뛴다.
    if (xml[m.index! + 1] === "?" || xml[m.index! + 1] === "!") continue;
    at = m.index! + m[0].length;
    const [, closing, name, , selfClosing] = m;
    if (selfClosing) continue;
    if (closing) {
      const open = stack.pop();
      if (open !== name) return `</${name}> 앞에 <${open ?? "없음"}> 이 열려 있다`;
    } else {
      stack.push(name);
    }
  }
  if (stack.length > 0) return `닫히지 않음: <${stack.join(">, <")}>`;
  // 태그 뒤에 남은 글이 있으면 잘린 것이다.
  if (xml.slice(at).trim().length > 0) return "끝이 잘렸다";
  return null;
}

console.log("\nXML");
for (const name of names.filter((n) => n.endsWith(".xml") || n.endsWith(".hpf"))) {
  const problem = malformed(decoder.decode(entries[name]));
  check(name, problem === null, problem ?? "");
}

// section0 이 가리키는 모양 번호가 header 에 다 있는지 —
// 없는 번호를 가리키면 한글이 파일을 깨진 것으로 본다.
console.log("\n모양 번호가 서로 맞는지");
const header = decoder.decode(entries["Contents/header.xml"]);
const section = decoder.decode(entries["Contents/section0.xml"]);

const defined = (xml: string, tag: string) =>
  new Set([...xml.matchAll(new RegExp(`<hh:${tag} id="(\\d+)"`, "g"))].map((m) => m[1]));
const used = (xml: string, attr: string) =>
  new Set([...xml.matchAll(new RegExp(`${attr}="(\\d+)"`, "g"))].map((m) => m[1]));

for (const [label, have, want] of [
  ["글자 모양", defined(header, "charPr"), used(section, "charPrIDRef")],
  ["문단 모양", defined(header, "paraPr"), used(section, "paraPrIDRef")],
  ["스타일", defined(header, "style"), used(section, "styleIDRef")],
] as const) {
  const missing = [...want].filter((id) => !have.has(id));
  check(label, missing.length === 0, `정의 ${[...have].join(",")} · 쓰임 ${[...want].join(",")}`);
}

// ── 넣은 글이 도로 나오는지 ───────────────────────────────
console.log("\n넣은 글이 도로 나오는지");
const read = extractHwpx(bytes);
const text = read.pageTexts.join("\n");

check("대학 이름", text.includes("홍익대학교"));
check("시험 이름", text.includes("2027 모의논술"));
check("제시문 (가) 머리", text.includes("제시문 (가)"));
check("괄호 없는 기호도 (나) 로", text.includes("제시문 (나)"));
check("제시문 (가) 본문", text.includes("집중과 분산은 어느 하나가"));
check("빈 줄로 나뉜 뒷 문단", text.includes("만인의 만인에 대한 투쟁"));
// 실제 문제지 꼴 — 번호와 논제가 한 문단, 끝 괄호에 분량과 배점.
check(
  "문제 1 — 번호·논제·조건이 한 줄",
  text.includes("[문제 1] 제시문 (가)와 (나)를 활용하여 집중과 분산의 관계를 논하시오. (800자 내외, 40점)"),
);
check(
  "문제 2 — 괄호 겹치지 않음",
  text.includes("[문제 2]") && text.includes("(800±100자, 35점)") && !text.includes("(("),
);
check("문제 3 — 분량 조건 없으면 목표로", text.includes("(600자 안팎, 25점)"));
check("논제 본문", text.includes("집중과 분산의 관계를 논하시오"));
check("검수 안내", text.includes("PDF 로 저장해 올려 주세요"));

// ── 문제지 머리 ───────────────────────────────────────────
console.log("\n문제지 머리");
check("응시자 칸 — 모집단위", text.includes("모집단위"));
check("응시자 칸 — 수험번호", text.includes("수험번호"));
check("응시자 칸 — 성명", text.includes("성명"));
check("안내 줄 · 총점", text.includes("※ 아래 제시문을 읽고 문제에 답하시오. (총 100점)"));

const sectionXmlText = decoder.decode(entries["Contents/section0.xml"]);
const headerXmlText = decoder.decode(entries["Contents/header.xml"]);
check("표가 들어갔는가", /<hp:tbl\b/.test(sectionXmlText),
  `${(sectionXmlText.match(/<hp:tc\b/g) ?? []).length}칸`);
check("표는 실선 테두리(borderFill 2)", /<hp:tbl[^>]*borderFillIDRef="2"/.test(sectionXmlText));
// 라벨 칸만 바탕을 칠한다 — 연세대 문제지에서 재 온 베이지.
check(
  "라벨 칸 3개만 바탕색(borderFill 3)",
  (sectionXmlText.match(/<hp:tc[^>]*borderFillIDRef="3"/g) ?? []).length === 3,
);
check("표는 오른쪽 끝에 붙는다", /<hp:pos[^>]*horzAlign="RIGHT"/.test(sectionXmlText));

check("라벨 바탕색 #e3dcc1", headerXmlText.includes('faceColor="#e3dcc1"'));
check("제목 글꼴 연세제목체", headerXmlText.includes("연세제목체"));

// 라벨은 좁은 칸에서 한 자씩 감긴다. `모집단위` 네 줄이 칸 높이 안에 들어와야 한다.
const labelSize = Number(headerXmlText.match(/<hh:charPr id="5" height="(\d+)"/)?.[1] ?? 0);
const rowHeight = Number(sectionXmlText.match(/<hp:cellSz width="\d+" height="(\d+)"/)?.[1] ?? 0);
check(
  "표 라벨 네 줄이 칸 안에 들어온다",
  labelSize > 0 && rowHeight > 0 && labelSize * 1.2 * 4 < rowHeight,
  `${labelSize / 100}pt × 4줄 = ${(labelSize * 1.2 * 4) / 100}pt / 칸 ${rowHeight / 100}pt`,
);
check("라벨 줄 간격을 붙였다", /<hh:paraPr id="6"[\s\S]*?value="100"/.test(headerXmlText));

// 여백 — 좁게. 머리말·꼬리말 자리까지 더해 위아래가 벌어지지 않게 한다.
const margin = sectionXmlText.match(/<hp:margin ([^/]*)\/>/)?.[1] ?? "";
const mm = (name: string) => Number(margin.match(new RegExp(`${name}="(\\d+)"`))?.[1] ?? 0);
check(
  "쪽 여백이 좁다",
  mm("left") <= 4000 && mm("right") <= 4000 && mm("top") + mm("header") <= 5000,
  `좌 ${mm("left") / 100}pt · 우 ${mm("right") / 100}pt · 위 ${(mm("top") + mm("header")) / 100}pt`,
);
check(
  "제목만 그 글꼴을 쓴다",
  /<hh:charPr id="1"[\s\S]*?<hh:fontRef hangul="2"/.test(headerXmlText),
);
// 한글이 계산할 자리다. 우리가 지어 넣으면 한 문단이 한 줄에 겹쳐 찍힌다.
check("linesegarray 를 넣지 않았는가", !sectionXmlText.includes("linesegarray"));

// ── 제시문 상자 · 굵은 조각 ───────────────────────────────
console.log("\n제시문 상자와 굵기");
// 제시문 머리(4)와 본문(5)이 잇따라야 테두리가 하나로 이어진다.
check("제시문은 테두리 문단 모양을 쓴다", /paraPrIDRef="[45]"/.test(sectionXmlText));
check(
  "제시문 테두리가 이어 붙는다(connect)",
  /<hh:paraPr id="4"[\s\S]*?connect="1"/.test(headerXmlText) &&
    /<hh:paraPr id="5"[\s\S]*?connect="1"/.test(headerXmlText),
);
check("제시문 상자는 얇은 실선", headerXmlText.includes('<hh:borderFill id="4"') &&
  /<hh:borderFill id="4"[\s\S]*?<hh:leftBorder type="SOLID" width="0.1 mm"/.test(headerXmlText));
// 문제 번호와 끝 조건만 굵다.
check("문제 번호가 굵다", sectionXmlText.includes('<hp:run charPrIDRef="4"><hp:t>[문제 1] </hp:t>'));
check(
  "끝 조건이 굵다",
  sectionXmlText.includes('<hp:run charPrIDRef="4"><hp:t> (800자 내외, 40점)</hp:t>'),
);
check("논제 본문은 굵지 않다", sectionXmlText.includes('<hp:run charPrIDRef="0"><hp:t>제시문 (가)와 (나)를'));

// XML 특수문자가 살아 돌아오는지 — 이스케이프가 어긋나면 파일이 깨진다.
check("꺾쇠 · 따옴표 · 앰퍼샌드", text.includes('<집중>과 "분산"') && text.includes("5 < 7 & 3 > 1"));

console.log(`\n  문단 ${read.paragraphs}개 · 쪽 ${read.pageTexts.length}개`);

// 유의사항은 기본으로 넣지 않되, 필요하면 덧붙일 수 있어야 한다.
check("기본은 유의사항 없음", !text.includes("<유의사항>") && !text.includes("1. 답안에 제목을"));
const custom = extractHwpx(buildHandoutHwpx({ ...input, notes: ["시험 시간은 120분입니다."] }))
  .pageTexts.join("\n");
check("덧붙이면 나온다", custom.includes("1. 시험 시간은 120분입니다."));

if (failed > 0) {
  console.log(`\n✗ ${failed}개 어긋남`);
  process.exit(1);
}
console.log("\n✔ 짜임새 이상 없음");
console.log("  ※ 한글이 실제로 여는지는 여기서 못 잰다. 받아서 한 번 열어 봐야 한다.");
