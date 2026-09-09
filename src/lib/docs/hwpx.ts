import "server-only";

import { unzipSync } from "fflate";

/**
 * HWPX(한글 2014 이후 표준 서식)에서 글자를 뽑는다.
 * HWPX 는 OWPML(XML)을 담은 zip 이라 별도 라이브러리 없이 읽을 수 있다.
 *
 * 구조: Contents/section0.xml, section1.xml … 안에
 *   <hp:p ... pageBreak="1"> 문단
 *     <hp:run><hp:t>글자</hp:t></hp:run>
 */

const TEXT_TAG = /<hp:t(?:\s[^>]*)?>([\s\S]*?)<\/hp:t>/g;
const PARAGRAPH_TAG = /<hp:p(\s[^>]*)?>([\s\S]*?)<\/hp:p>/g;
/** 표 칸 · 각주처럼 문단 안에 끼는 줄바꿈 표시 */
const LINE_BREAK = /<hp:lineBreak\s*\/>|<hp:t\s*\/>/g;

/** 쪽 구분이 없을 때 한 쪽으로 볼 글자 수 (A4 한 쪽 분량) */
const CHARS_PER_PSEUDO_PAGE = 1800;

function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, "&");
}

interface Paragraph {
  text: string;
  /** 이 문단부터 새 쪽이 시작되는지 */
  startsPage: boolean;
}

function readParagraphs(xml: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  for (const match of xml.matchAll(PARAGRAPH_TAG)) {
    const attributes = match[1] ?? "";
    const body = match[2] ?? "";

    let text = "";
    for (const run of body.replace(LINE_BREAK, "\n").matchAll(TEXT_TAG)) {
      text += decodeEntities(run[1] ?? "");
    }

    paragraphs.push({
      text: text.trim(),
      startsPage: /pageBreak\s*=\s*"(?:1|true)"/.test(attributes),
    });
  }

  return paragraphs;
}

/** 파일 이름을 section0, section1 … 순서로 정렬한다. */
function sectionOrder(path: string): number {
  const match = path.match(/section(\d+)\.xml$/i);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

export interface HwpxResult {
  pageTexts: string[];
  /** 문서에 쪽 나눔 표시가 있었는지 — 없으면 글자 수로 나눈 것이라 대략적이다 */
  hadPageBreaks: boolean;
  paragraphs: number;
}

export function extractHwpx(data: Uint8Array): HwpxResult {
  const entries = unzipSync(data, {
    filter: (file) => /^Contents\/section\d+\.xml$/i.test(file.name),
  });

  const sections = Object.keys(entries).sort((a, b) => sectionOrder(a) - sectionOrder(b));
  if (sections.length === 0) {
    throw new Error("HWPX 안에서 본문(Contents/section0.xml)을 찾지 못했습니다.");
  }

  const decoder = new TextDecoder("utf-8");
  const paragraphs: Paragraph[] = [];
  sections.forEach((name, index) => {
    const found = readParagraphs(decoder.decode(entries[name]));
    // 구역이 바뀌면 새 쪽으로 본다.
    if (index > 0 && found.length > 0) found[0].startsPage = true;
    paragraphs.push(...found);
  });

  const hadPageBreaks = paragraphs.some((paragraph) => paragraph.startsPage);

  const pages: string[] = [];
  let current: string[] = [];
  let length = 0;

  const flush = () => {
    if (current.length > 0) pages.push(current.join("\n").trim());
    current = [];
    length = 0;
  };

  for (const paragraph of paragraphs) {
    // 쪽 나눔 표시가 있으면 그대로 따르고, 없으면 분량으로 끊는다.
    const shouldBreak = hadPageBreaks
      ? paragraph.startsPage
      : length + paragraph.text.length > CHARS_PER_PSEUDO_PAGE;
    if (shouldBreak && current.length > 0) flush();

    current.push(paragraph.text);
    length += paragraph.text.length + 1;
  }
  flush();

  return {
    pageTexts: pages.length > 0 ? pages : [""],
    hadPageBreaks,
    paragraphs: paragraphs.length,
  };
}
