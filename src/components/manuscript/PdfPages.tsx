"use client";

import { useEffect, useRef, useState } from "react";

/**
 * PDF 를 **쪽마다 그림으로 그려** 위에서 아래로 이어 붙인다.
 *
 * 브라우저 PDF 뷰어(`<object>`)를 쓰지 않는 이유 — 뷰어가 제 도구 모음과 스크롤을
 * 달고 나와 칸 안에 칸이 생긴다. 답안을 쓰는 화면에서는 문제지가 그냥 종이처럼
 * 이어져 있어야 하고, 스크롤도 바깥 칸 하나로 끝나야 한다.
 *
 * 화면 폭에 맞춰 그리고, 폭이 달라지면 다시 그린다. 글자가 흐려지지 않게
 * 화면 배율만큼 크게 구운 뒤 CSS 로 줄인다.
 */
export function PdfPages({ src, className }: { src: string; className?: string }) {
  const holderRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [pages, setPages] = useState(0);

  useEffect(() => {
    const holder = holderRef.current;
    if (!holder) return;

    let alive = true;
    /** 다시 그리는 중에 앞 작업이 겹치지 않게 순번을 센다. */
    let run = 0;
    let doc: { numPages: number; getPage: (n: number) => Promise<PdfPage>; destroy: () => void } | null =
      null;

    async function draw(width: number) {
      if (!doc || !alive || width <= 0) return;
      const mine = ++run;

      // 너무 크게 구우면 느리고 메모리를 많이 쓴다. 두 배까지만.
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const made: HTMLCanvasElement[] = [];

      for (let n = 1; n <= doc.numPages; n += 1) {
        const page = await doc.getPage(n);
        if (!alive || mine !== run) return;

        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: (width / base.width) * dpr });

        const canvas = document.createElement("canvas");
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        canvas.style.width = "100%";
        canvas.style.height = "auto";
        canvas.className = "block bg-white shadow-sm";
        const context = canvas.getContext("2d");
        if (!context) continue;

        await page.render({ canvasContext: context, viewport }).promise;
        if (!alive || mine !== run) return;
        made.push(canvas);
      }

      // 다 그린 뒤에 한꺼번에 갈아 끼운다 — 그리는 동안 칸이 비어 보이지 않게.
      const holderNow = holderRef.current;
      if (!holderNow || !alive || mine !== run) return;
      holderNow.replaceChildren(...made);
      setPages(made.length);
      setStatus("ready");
    }

    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        // 워커는 scripts/copy-pdf-worker.mjs 가 public/ 으로 내놓는다.
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

        const response = await fetch(src);
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error ?? "문제지를 받지 못했습니다.");
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        const loaded = await pdfjs.getDocument({ data: bytes }).promise;
        if (!alive) {
          loaded.destroy();
          return;
        }
        doc = loaded as unknown as typeof doc;
        await draw(holder.clientWidth);
      } catch (caught) {
        if (!alive) return;
        setMessage(caught instanceof Error ? caught.message : "문제지를 열지 못했습니다.");
        setStatus("error");
      }
    })();

    // 칸 폭이 달라지면 그 폭에 맞춰 다시 굽는다. 잦게 부르지 않게 조금 기다린다.
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastWidth = holder.clientWidth;
    const observer = new ResizeObserver(() => {
      const width = holderRef.current?.clientWidth ?? 0;
      // 몇 픽셀 흔들리는 것까지 다시 그리면 화면이 깜빡인다.
      if (Math.abs(width - lastWidth) < 24) return;
      lastWidth = width;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void draw(width), 250);
    });
    observer.observe(holder);

    return () => {
      alive = false;
      observer.disconnect();
      if (timer) clearTimeout(timer);
      doc?.destroy();
    };
  }, [src]);

  return (
    <div className={className}>
      {status === "loading" ? (
        <p className="py-10 text-center text-sm text-neutral-500">문제지를 여는 중…</p>
      ) : null}
      {status === "error" ? (
        <p className="py-10 text-center text-sm text-rose-600">{message}</p>
      ) : null}
      {/* 쪽 사이를 띄워 종이가 여러 장인 것이 보이게 한다. */}
      <div ref={holderRef} className="flex flex-col gap-3" />
      {status === "ready" && pages > 1 ? (
        <p className="py-3 text-center text-xs text-neutral-400">{pages}쪽</p>
      ) : null}
    </div>
  );
}

/** pdfjs 쪽 손잡이. 타입을 통째로 끌어오지 않으려고 쓰는 것만 적는다. */
interface PdfPage {
  getViewport: (o: { scale: number }) => { width: number; height: number };
  render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => {
    promise: Promise<void>;
  };
}
