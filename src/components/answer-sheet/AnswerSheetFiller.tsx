"use client";

import { useMemo, useState } from "react";

import {
  FONT_URL,
  SUNGSHIN,
  capacityOf,
  fillGrid,
  type SheetTemplate,
} from "@/lib/answer-sheet/sheet";

const FONT_FAMILY = "AnswerSheetHand";

/**
 * 실제 답안지 PDF 에 손글씨 글꼴로 답안을 채운다.
 * 화면은 답안지 그림 위에 SVG 로 글자를 얹어 보여 주고,
 * 내려받을 때는 같은 자리에 PDF 글자를 한 자씩 찍는다(`fillPdf`).
 */
export function AnswerSheetFiller({ template = SUNGSHIN }: { template?: SheetTemplate }) {
  const [texts, setTexts] = useState<string[]>(() => template.grids.map(() => ""));
  const [literal, setLiteral] = useState<boolean[]>(() => template.grids.map(() => false));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filled = useMemo(
    () => template.grids.map((grid, i) => fillGrid(grid, texts[i], literal[i])),
    [template, texts, literal],
  );

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const [{ fillPdf }, pdf, font] = await Promise.all([
        import("@/lib/answer-sheet/export"),
        fetch(template.pdf).then((r) => r.arrayBuffer()),
        fetch(FONT_URL).then((r) => {
          if (!r.ok) throw new Error("글꼴을 받지 못했습니다.");
          return r.arrayBuffer();
        }),
      ]);
      const bytes = await fillPdf(pdf, font, filled.flatMap((row) => row.glyphs));
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `${template.name}.pdf`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "PDF 를 만들지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const update = <T,>(list: T[], index: number, value: T) =>
    list.map((item, i) => (i === index ? value : item));

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <style>{`@font-face{font-family:"${FONT_FAMILY}";src:url("${FONT_URL}") format("truetype");font-display:swap}`}</style>

      <div className="flex flex-col gap-5">
        {template.grids.map((grid, i) => {
          const row = filled[i];
          const capacity = capacityOf(grid);
          return (
            <label key={grid.number} className="flex flex-col gap-1.5 text-sm">
              <span className="flex items-baseline justify-between gap-3">
                <span className="font-medium">
                  문제 {grid.number}번{" "}
                  <span className="font-normal text-neutral-500">{grid.lengthNote}</span>
                </span>
                <span className={row.overflow > 0 ? "text-red-600" : "text-neutral-500"}>
                  {row.count} / {capacity}칸
                  {row.overflow > 0 ? ` · ${row.overflow}칸 넘침` : ""}
                </span>
              </span>
              <textarea
                value={texts[i]}
                onChange={(event) => setTexts((prev) => update(prev, i, event.target.value))}
                rows={10}
                spellCheck={false}
                placeholder="답안을 입력하세요. 줄바꿈은 문단 나눔, 문단 첫 칸은 자동으로 비웁니다."
                className="w-full resize-y rounded-md border border-neutral-300 p-3 text-base leading-7"
              />
              <span className="flex items-center gap-2 text-neutral-500">
                <input
                  type="checkbox"
                  checked={literal[i]}
                  onChange={(event) => setLiteral((prev) => update(prev, i, event.target.checked))}
                />
                친 그대로 칸에 넣기 (공백 하나 = 빈 칸 하나, <code>|</code> = 줄 바꿈)
              </span>
            </label>
          );
        })}

        <button
          type="button"
          onClick={() => void download()}
          disabled={busy}
          className="rounded-md bg-neutral-900 px-5 py-2.5 font-medium text-white disabled:opacity-40"
        >
          {busy ? "PDF 만드는 중…" : "PDF 내려받기"}
        </button>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <p className="text-xs text-neutral-400">
          답안지 PDF 원본 위에 칸마다 글자를 한 자씩 넣습니다. 손글씨 글꼴을 통째로 싣기 때문에 파일이
          3MB 안팎입니다.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {template.backgrounds.map((src, page) => (
          <svg
            key={src}
            viewBox={`0 0 ${template.width} ${template.height}`}
            className="w-full rounded-md border border-neutral-200 bg-white shadow-sm"
            role="img"
            aria-label={`${template.name} ${page + 1}쪽`}
          >
            <image href={src} x={0} y={0} width={template.width} height={template.height} />
            <g fontFamily={FONT_FAMILY} textAnchor="middle" fill="#000">
              {filled
                .flatMap((row) => row.glyphs)
                .filter((glyph) => glyph.page === page)
                .map((glyph, index) => (
                  <text
                    key={index}
                    x={glyph.cx}
                    y={template.height - glyph.baseline}
                    fontSize={glyph.size}
                  >
                    {glyph.char}
                  </text>
                ))}
            </g>
          </svg>
        ))}
      </div>
    </div>
  );
}
