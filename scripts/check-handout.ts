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
    { label: "(나)", text: "표준어와 방언은 <집중>과 \"분산\"의 관계로 볼 수 있다. 5 < 7 & 3 > 1" },
  ],
  questions: [
    {
      number: "1",
      prompt: "제시문 (가)와 (나)를 활용하여 집중과 분산의 관계를 논하시오.",
      lengthNote: "800자 내외",
      charTarget: 800,
    },
    { number: "2", prompt: "제시문 (나)의 관점에서 (가)를 비판하시오.", lengthNote: null, charTarget: 600 },
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

check("제목", text.includes("홍익대학교 2027 모의논술"));
for (const passage of input.passages) {
  check(`제시문 ${passage.label} 머리`, text.includes(`제시문 ${passage.label}`));
}
check("제시문 (가) 본문", text.includes("집중과 분산은 어느 하나가"));
check("빈 줄로 나뉜 뒷 문단", text.includes("만인의 만인에 대한 투쟁"));
check("문제 1 머리 · 분량", text.includes("문제 1 (800자 내외)"));
check("문제 2 머리 · 분량", text.includes("문제 2 (600자 내외)"));
check("논제 본문", text.includes("집중과 분산의 관계를 논하시오"));
check("검수 안내", text.includes("PDF 로 저장해 올려 주세요"));

// XML 특수문자가 살아 돌아오는지 — 이스케이프가 어긋나면 파일이 깨진다.
check("꺾쇠 · 따옴표 · 앰퍼샌드", text.includes('<집중>과 "분산"') && text.includes("5 < 7 & 3 > 1"));

console.log(`\n  문단 ${read.paragraphs}개 · 쪽 ${read.pageTexts.length}개`);

if (failed > 0) {
  console.log(`\n✗ ${failed}개 어긋남`);
  process.exit(1);
}
console.log("\n✔ 짜임새 이상 없음");
console.log("  ※ 한글이 실제로 여는지는 여기서 못 잰다. 받아서 한 번 열어 봐야 한다.");
