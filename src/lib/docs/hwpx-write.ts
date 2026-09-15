import { zipSync } from "fflate";

/**
 * 문제지를 HWPX(한글 2014 이후 표준 서식)로 만든다.
 *
 * 왜 HWPX 인가 — 학생에게 나갈 문제지는 선생님이 눈으로 보고 손봐야 한다.
 * OCR 로 뽑은 글자는 오탈자가 남고, 제시문 어디까지가 본문인지도 사람이 판단해야 한다.
 * 앱이 초안을 만들어 주면 선생님은 한글에서 고치고 `PDF 로 저장` 해서 올린다.
 *
 * HWPX 는 OWPML(XML)을 담은 zip 이라 별도 라이브러리 없이 쓸 수 있다. 읽는 쪽은
 * `hwpx.ts` 에 있고, 여기서 만든 것을 그쪽으로 다시 읽어 확인한다(`npm run check:handout`).
 *
 * 비밀값을 다루지 않는 순수 함수라 단위 검증에서 그대로 부른다.
 */

/** 문단에 입히는 모양. header.xml 에 정의해 둔 것과 번호가 맞아야 한다. */
type Style = "title" | "heading" | "body" | "question" | "note";

const CHAR_PR: Record<Style, number> = { title: 1, heading: 2, body: 0, question: 0, note: 3 };
// 논제는 번호를 내어쓰기로 빼서 `[문제 1]` 이 왼쪽으로 튀어나오게 한다.
const PARA_PR: Record<Style, number> = { title: 1, heading: 2, body: 0, question: 3, note: 2 };

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    // 한글이 못 읽는 제어 문자를 걷어낸다. OCR 결과에 섞여 들어오는 일이 있다.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/**
 * 문단 하나. 한글은 빈 문단도 `<hp:run>` 이 있어야 자리를 잡는다.
 * `id` 는 문서 안에서 겹치지만 않으면 된다.
 *
 * `<hp:linesegarray>` 는 **넣지 않는다.** 그것은 한글이 계산해 둔 줄 나눔을 적어 두는
 * 자리라, 글자 폭을 모르는 우리가 지어내면 한 문단이 통째로 한 줄에 겹쳐 찍힌다.
 * 비워 두면 한글이 열면서 스스로 줄을 나눈다.
 */
function paragraph(
  text: string,
  style: Style,
  options: { pageBreak?: boolean } = {},
): string {
  const runs = text
    .split("\n")
    .map((line) => `<hp:t>${escapeXml(line)}</hp:t>`)
    .join("<hp:lineBreak/>");

  return (
    `<hp:p paraPrIDRef="${PARA_PR[style]}" styleIDRef="0" pageBreak="${options.pageBreak ? 1 : 0}" columnBreak="0" merged="0">` +
    `<hp:run charPrIDRef="${CHAR_PR[style]}">${runs}</hp:run>` +
    `</hp:p>`
  );
}

/** 표 안 칸 하나. 칸마다 제 문단을 품는다. */
function cell(text: string, col: number, row: number, width: number, height: number): string {
  return (
    `<hp:tc name="" header="${row === 0 ? 1 : 0}" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="2">` +
    `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">` +
    `<hp:p paraPrIDRef="1" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">` +
    `<hp:run charPrIDRef="0"><hp:t>${escapeXml(text)}</hp:t></hp:run>` +
    `</hp:p>` +
    `</hp:subList>` +
    `<hp:cellAddr colAddr="${col}" rowAddr="${row}"/>` +
    `<hp:cellSpan colSpan="1" rowSpan="1"/>` +
    `<hp:cellSz width="${width}" height="${height}"/>` +
    `<hp:cellMargin left="510" right="510" top="141" bottom="141"/>` +
    `</hp:tc>`
  );
}

/**
 * 표 하나. 실제 대학 기출 문제지의 응시자 정보 칸을 본떴다.
 * 표는 문단 안에 들어간다 — OWPML 이 그렇게 생겼다.
 */
function table(rows: string[][], widths: number[], rowHeight: number): string {
  const total = widths.reduce((sum, width) => sum + width, 0);
  const body = rows
    .map(
      (cells, row) =>
        `<hp:tr>` +
        cells.map((text, col) => cell(text, col, row, widths[col], rowHeight)).join("") +
        `</hp:tr>`,
    )
    .join("");

  return (
    `<hp:tbl id="" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="1" rowCnt="${rows.length}" colCnt="${widths.length}" cellSpacing="0" borderFillIDRef="2" noAdjust="0">` +
    `<hp:sz width="${total}" widthRelTo="ABSOLUTE" height="${rowHeight * rows.length}" heightRelTo="ABSOLUTE" protect="0"/>` +
    `<hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="CENTER" vertOffset="0" horzOffset="0"/>` +
    `<hp:outMargin left="0" right="0" top="0" bottom="1417"/>` +
    `<hp:inMargin left="510" right="510" top="141" bottom="141"/>` +
    body +
    `</hp:tbl>`
  );
}

/**
 * 글꼴 · 글자 모양 · 문단 모양을 정의한다.
 * section0.xml 이 가리키는 번호(`charPrIDRef` · `paraPrIDRef`)가 여기 다 있어야
 * 한글이 문서를 연다. 없는 번호를 가리키면 파일이 깨진 것으로 본다.
 */
function borderFill(id: number, type: "NONE" | "SOLID"): string {
  const side = `type="${type}" width="0.12 mm" color="#000000"`;
  return (
    `<hh:borderFill id="${id}" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">` +
    `<hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/>` +
    `<hh:leftBorder ${side}/><hh:rightBorder ${side}/>` +
    `<hh:topBorder ${side}/><hh:bottomBorder ${side}/>` +
    `<hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/>` +
    `</hh:borderFill>`
  );
}

function headerXml(): string {
  const fonts = ["함초롬바탕", "함초롬돋움"]
    .map(
      (name, index) =>
        `<hh:font id="${index}" face="${name}" type="TTF" isEmbedded="0">` +
        `<hh:typeInfo familyType="FCAT_GOTHIC" weight="0" proportion="0" contrast="0" strokeVariation="0" armStyle="0" letterform="0" midline="0" xHeight="0"/>` +
        `</hh:font>`,
    )
    .join("");

  // 한글 · 라틴 · 한자 … 일곱 갈래 모두에 같은 글꼴을 물린다.
  const LANGS = ["hangul", "latin", "hanja", "japanese", "other", "symbol", "user"];
  const fontfaces = LANGS.map(
    (lang) => `<hh:fontface lang="${lang.toUpperCase()}" fontCnt="2">${fonts}</hh:fontface>`,
  ).join("");

  /** 글자 모양 — 0 본문, 1 제목, 2 소제목, 3 덧붙임 */
  const charShapes = [
    { id: 0, size: 1000, bold: 0, color: "#000000" },
    { id: 1, size: 1600, bold: 1, color: "#000000" },
    { id: 2, size: 1200, bold: 1, color: "#000000" },
    { id: 3, size: 900, bold: 0, color: "#666666" },
  ]
    .map(
      (shape) =>
        `<hh:charPr id="${shape.id}" height="${shape.size}" textColor="${shape.color}" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="1">` +
        `<hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>` +
        `<hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>` +
        `<hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>` +
        `<hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>` +
        `<hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>` +
        (shape.bold ? `<hh:bold/>` : "") +
        `</hh:charPr>`,
    )
    .join("");

  /** 문단 모양 — 0 본문(들여쓰기), 1 제목(가운데), 2 소제목 */
  const paraShapes = [
    { id: 0, align: "JUSTIFY", indent: 1000, prev: 0, next: 300 },
    { id: 1, align: "CENTER", indent: 0, prev: 0, next: 900 },
    { id: 2, align: "LEFT", indent: 0, prev: 900, next: 300 },
    // 논제 — 번호가 왼쪽으로 튀어나오게 내어쓴다(음수 들여쓰기).
    { id: 3, align: "JUSTIFY", indent: -1600, prev: 800, next: 300 },
  ]
    .map(
      (shape) =>
        `<hh:paraPr id="${shape.id}" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0">` +
        `<hh:align horizontal="${shape.align}" vertical="BASELINE"/>` +
        `<hh:heading type="NONE" idRef="0" level="0"/>` +
        `<hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="KEEP_WORD" widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/>` +
        `<hh:autoSpacing eAsianEng="0" eAsianNum="0"/>` +
        `<hh:margin>` +
        `<hc:intent value="${shape.indent}" unit="HWPUNIT"/>` +
        `<hc:left value="0" unit="HWPUNIT"/><hc:right value="0" unit="HWPUNIT"/>` +
        `<hc:prev value="${shape.prev}" unit="HWPUNIT"/><hc:next value="${shape.next}" unit="HWPUNIT"/>` +
        `</hh:margin>` +
        `<hh:lineSpacing type="PERCENT" value="160" unit="HWPUNIT"/>` +
        `<hh:border borderFillIDRef="1" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/>` +
        `</hh:paraPr>`,
    )
    .join("");

  return (
    XML_HEAD +
    `<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" version="1.4" secCnt="1">` +
    `<hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/>` +
    `<hh:refList>` +
    `<hh:fontfaces itemCnt="${LANGS.length}">${fontfaces}</hh:fontfaces>` +
    // 1 = 테두리 없음(글자·문단이 가리킨다), 2 = 실선(표가 가리킨다).
    `<hh:borderFills itemCnt="2">` +
    borderFill(1, "NONE") +
    borderFill(2, "SOLID") +
    `</hh:borderFills>` +
    `<hh:charProperties itemCnt="4">${charShapes}</hh:charProperties>` +
    `<hh:tabProperties itemCnt="1"><hh:tabPr id="0" autoTabLeft="0" autoTabRight="0"/></hh:tabProperties>` +
    `<hh:numberings itemCnt="0"/>` +
    `<hh:paraProperties itemCnt="4">${paraShapes}</hh:paraProperties>` +
    `<hh:styles itemCnt="1">` +
    `<hh:style id="0" type="PARA" name="바탕글" engName="Normal" paraPrIDRef="0" charPrIDRef="0" nextStyleIDRef="0" langID="1042" lockForm="0"/>` +
    `</hh:styles>` +
    `</hh:refList>` +
    `<hh:compatibleDocument targetProgram="HWP201X"><hh:layoutCompatibility/></hh:compatibleDocument>` +
    `</hh:head>`
  );
}

/** A4 세로, 여백 20mm. 단위는 HWPUNIT(1mm ≈ 283.465). */
function sectionXml(paragraphs: string[]): string {
  const secPr =
    `<hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" tabStopVal="4000" tabStopUnit="HWPUNIT" outlineShapeIDRef="0" memoShapeIDRef="0" textVerticalWidthHead="0" masterPageCnt="0">` +
    `<hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0" strtnum="0"/>` +
    `<hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/>` +
    `<hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="SHOW_ALL" fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/>` +
    // 실제 대학 기출 파일을 열어 보니 세로 A4 도 landscape="WIDELY" 였다.
    // 이름과 달리 가로/세로를 뜻하는 값이 아니다 — 크기(width < height)가 방향을 정한다.
    `<hp:pagePr landscape="WIDELY" width="59528" height="84188" gutterType="LEFT_ONLY">` +
    `<hp:margin header="4252" footer="4252" gutter="0" left="5669" right="5669" top="5669" bottom="5669"/>` +
    `</hp:pagePr>` +
    `<hp:footNotePr>` +
    `<hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/>` +
    `<hp:noteLine length="-1" type="SOLID" width="0.12 mm" color="#000000"/>` +
    `<hp:noteSpacing betweenNotes="850" belowLine="567" aboveLine="850"/>` +
    `<hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="EACH_COLUMN" beneathText="0"/>` +
    `</hp:footNotePr>` +
    `<hp:endNotePr>` +
    `<hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/>` +
    `<hp:noteLine length="14692344" type="SOLID" width="0.12 mm" color="#000000"/>` +
    `<hp:noteSpacing betweenNotes="0" belowLine="567" aboveLine="850"/>` +
    `<hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="END_OF_DOCUMENT" beneathText="0"/>` +
    `</hp:endNotePr>` +
    ["BOTH", "EVEN", "ODD"]
      .map(
        (type) =>
          `<hp:pageBorderFill type="${type}" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER">` +
          `<hp:offset left="1417" right="1417" top="1417" bottom="1417"/>` +
          `</hp:pageBorderFill>`,
      )
      .join("") +
    `</hp:secPr>`;

  // 구역 설정은 첫 문단 안에 실린다 — OWPML 이 그렇게 생겼다.
  const first = paragraphs[0] ?? paragraph("", "body");
  const withSecPr = first.replace(
    /(<hp:run charPrIDRef="\d+">)/,
    `$1${secPr}`,
  );

  return (
    XML_HEAD +
    `<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core">` +
    withSecPr +
    paragraphs.slice(1).join("") +
    `</hs:sec>`
  );
}

function contentHpf(title: string): string {
  return (
    XML_HEAD +
    `<opf:package xmlns:opf="http://www.idpf.org/2007/opf/" xmlns:dc="http://purl.org/dc/elements/1.1/" version="" unique-identifier="" id="">` +
    `<opf:metadata>` +
    `<opf:title>${escapeXml(title)}</opf:title>` +
    `<opf:language>ko</opf:language>` +
    `<opf:meta name="creator" content="KJHEDU"/>` +
    `</opf:metadata>` +
    `<opf:manifest>` +
    `<opf:item id="header" href="Contents/header.xml" media-type="application/xml"/>` +
    `<opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/>` +
    `<opf:item id="settings" href="settings.xml" media-type="application/xml"/>` +
    `</opf:manifest>` +
    `<opf:spine>` +
    `<opf:itemref idref="header" linear="yes"/>` +
    `<opf:itemref idref="section0" linear="yes"/>` +
    `</opf:spine>` +
    `</opf:package>`
  );
}

const VERSION_XML =
  XML_HEAD +
  `<hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" tagetApplication="WORDPROCESSOR" major="5" minor="1" micro="0" buildNumber="0" os="1" xmlVersion="1.5" application="KJHEDU" appVersion="1.0"/>`;

const CONTAINER_XML =
  XML_HEAD +
  `<ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf">` +
  `<ocf:rootfiles><ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/></ocf:rootfiles>` +
  `</ocf:container>`;

const MANIFEST_XML =
  XML_HEAD +
  `<odf:manifest xmlns:odf="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" version="1.2">` +
  `<odf:file-entry odf:full-path="/" odf:media-type="application/hwp+zip"/>` +
  `<odf:file-entry odf:full-path="Contents/content.hpf" odf:media-type="application/hwpml-package+xml"/>` +
  `<odf:file-entry odf:full-path="Contents/header.xml" odf:media-type="application/xml"/>` +
  `<odf:file-entry odf:full-path="Contents/section0.xml" odf:media-type="application/xml"/>` +
  `<odf:file-entry odf:full-path="settings.xml" odf:media-type="application/xml"/>` +
  `</odf:manifest>`;

const SETTINGS_XML =
  XML_HEAD +
  `<ha:HWPApplicationSetting xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:config="http://www.hancom.co.kr/hwpml/2011/configItemSet">` +
  `<ha:CaretPosition listIDRef="0" paraIDRef="0" pos="0"/>` +
  `</ha:HWPApplicationSetting>`;

/* ── 문제지 짜기 ──────────────────────────────────────────── */

export interface HandoutQuestion {
  number: string;
  prompt: string;
  /** 원문에 적힌 분량 조건 문구. 없으면 charTarget 으로 만든다 */
  lengthNote: string | null;
  charTarget: number | null;
  /** 배점. 문제 끝 괄호에 함께 적는다 */
  points?: number | null;
}

export interface HandoutInput {
  univName: string;
  examTitle: string;
  /** 여러 문항이 함께 쓰는 것은 미리 한 번씩만 남겨서 넘긴다 (`mergePassages`) */
  passages: { label: string; text: string }[];
  questions: HandoutQuestion[];
  /**
   * 제목 아래 `※` 줄 다음에 덧붙일 유의사항.
   * 실제 대학 문제지에는 없는 경우가 많아 기본은 비워 둔다.
   */
  notes?: string[];
}

/** 분량 조건 · 배점을 문제 끝 괄호에 함께 적는다. "(600자 안팎, 25점)" */
function condition(question: HandoutQuestion): string {
  const parts: string[] = [];
  // 원문 문구에 이미 괄호가 씌워져 있으면 벗긴다 — 안 그러면 괄호가 겹친다.
  const note = question.lengthNote?.trim().replace(/^[(（](.*)[)）]$/, "$1");
  if (note) parts.push(note);
  else if (question.charTarget) parts.push(`${question.charTarget}자 안팎`);
  if (question.points) parts.push(`${question.points}점`);
  return parts.length > 0 ? ` (${parts.join(", ")})` : "";
}

/** 제시문 기호를 `(가)` 꼴로 맞춘다. 논제가 그 꼴로 부르므로 문제지도 같아야 한다. */
function passageLabel(label: string): string {
  const bare = label.trim().replace(/^[(（]|[)）]$/g, "");
  return `(${bare})`;
}

/** 표지 · 본문을 이루는 한 덩어리 */
type Block =
  | { kind: "text"; text: string; style: Style }
  | { kind: "table"; rows: string[][]; widths: number[]; rowHeight: number };

function render(block: Block): string {
  if (block.kind === "table") {
    return (
      `<hp:p paraPrIDRef="1" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">` +
      `<hp:run charPrIDRef="0">${table(block.rows, block.widths, block.rowHeight)}</hp:run>` +
      `</hp:p>`
    );
  }
  return paragraph(block.text, block.style);
}

/**
 * 문제지 초안을 HWPX 로 만든다.
 *
 * 짜임새는 실제 대학 문제지(연세대 논술시험 문제)를 그대로 본떴다 —
 * 제목 한 줄, 응시자 칸, `※` 안내, 제시문, 그리고 `[문제 N] … (분량, 배점)`.
 * 표지를 따로 두거나 유의사항을 늘어놓지 않는다. 실제 문제지가 그렇지 않다.
 *
 * 답안지는 넣지 않는다 — 앱이 원고지 규격대로 따로 인쇄한다.
 * 대학 로고와 쪽 번호도 넣지 못한다. 그림 파일이 없고, 쪽 번호는 한글에서
 * `쪽 번호 넣기` 로 한 번에 붙는다.
 */
export function buildHandoutHwpx(input: HandoutInput): Uint8Array {
  const total = input.questions.reduce((sum, q) => sum + (q.points ?? 0), 0);

  const blocks: Block[] = [
    { kind: "text", text: `${input.univName} ${input.examTitle}`, style: "title" },
    // 응시자가 손으로 적는 칸.
    {
      kind: "table",
      rows: [
        ["모 집 단 위", "수 험 번 호", "성 명"],
        ["", "", ""],
      ],
      widths: [17000, 15000, 13000],
      rowHeight: 1400,
    },
    {
      kind: "text",
      text: `※ 아래 제시문을 읽고 문제에 답하시오.${total > 0 ? ` (총 ${total}점)` : ""}`,
      style: "note",
    },
    ...(input.notes ?? []).map((note, index) => ({
      kind: "text" as const,
      text: `${index + 1}. ${note}`,
      style: "body" as const,
    })),
  ];

  for (const passage of input.passages) {
    blocks.push({
      kind: "text",
      text: `제시문 ${passageLabel(passage.label)}`,
      style: "heading",
    });
    // 빈 줄로 나뉜 덩어리를 문단 하나씩으로 옮긴다. 문단 첫 칸은 문단 모양이 들여 준다.
    for (const chunk of passage.text.split(/\n\s*\n/)) {
      const text = chunk.trim();
      if (text) blocks.push({ kind: "text", text, style: "body" });
    }
  }

  for (const question of input.questions) {
    // 번호와 논제가 한 문단으로 이어진다 — 실제 문제지가 그 꼴이다.
    blocks.push({
      kind: "text",
      text: `[문제 ${question.number}] ${question.prompt.trim()}${condition(question)}`,
      style: "question",
    });
  }

  blocks.push({
    kind: "text",
    text: "※ OCR 로 뽑은 글을 옮긴 초안입니다. 오탈자와 제시문 범위를 확인한 뒤 PDF 로 저장해 올려 주세요.",
    style: "note",
  });

  const section = sectionXml(blocks.map(render));
  const encoder = new TextEncoder();

  return zipSync(
    {
      // mimetype 은 맨 앞에, 압축하지 않고 넣어야 한다 — OCF 규약이다.
      mimetype: [encoder.encode("application/hwp+zip"), { level: 0 }],
      "version.xml": encoder.encode(VERSION_XML),
      "META-INF/container.xml": encoder.encode(CONTAINER_XML),
      "META-INF/manifest.xml": encoder.encode(MANIFEST_XML),
      "Contents/content.hpf": encoder.encode(contentHpf(`${input.univName} ${input.examTitle}`)),
      "Contents/header.xml": encoder.encode(headerXml()),
      "Contents/section0.xml": encoder.encode(section),
      "settings.xml": encoder.encode(SETTINGS_XML),
    },
    { level: 6 },
  );
}
