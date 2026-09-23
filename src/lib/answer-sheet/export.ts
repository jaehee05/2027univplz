import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";

import type { Glyph } from "@/lib/answer-sheet/sheet";

/**
 * 빈 답안지 PDF 위에 글자를 한 자씩 찍는다.
 * 그림으로 덮지 않고 칸마다 글자를 따로 넣어, 손으로 한 칸씩 채운 답안지와 같은 PDF 가 된다.
 * 글꼴은 쓴 글자만 추려(subset) 넣는다 — 한글 글꼴 통째로는 수 MB 다.
 */
export async function fillPdf(
  templateBytes: ArrayBuffer | Uint8Array,
  fontBytes: ArrayBuffer | Uint8Array,
  glyphs: Glyph[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(templateBytes);
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes, { subset: false });
  const pages = doc.getPages();

  for (const glyph of glyphs) {
    const page = pages[glyph.page];
    if (!page) continue;
    const width = font.widthOfTextAtSize(glyph.char, glyph.size);
    page.drawText(glyph.char, {
      x: glyph.cx - width / 2,
      y: glyph.baseline,
      size: glyph.size,
      font,
      color: rgb(0, 0, 0),
    });
  }

  return doc.save();
}
