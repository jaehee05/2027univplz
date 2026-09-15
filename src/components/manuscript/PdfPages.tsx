"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** 확대 한도. 1 이 칸에 꽉 찬 크기다. */
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

/**
 * PDF 를 **쪽마다 그림으로 그려** 위에서 아래로 이어 붙인다.
 *
 * 브라우저 PDF 뷰어(`<object>`)를 쓰지 않는 이유 — 뷰어가 제 도구 모음과 스크롤을
 * 달고 나와 칸 안에 칸이 생긴다. 답안을 쓰는 화면에서는 문제지가 그냥 종이처럼
 * 이어져 있어야 하고, 스크롤도 바깥 칸 하나로 끝나야 한다.
 *
 * 손가락 두 개로 벌리면 확대된다(트랙패드는 두 손가락 벌리기, 마우스는 Ctrl+휠).
 * 단추는 두지 않는다 — 문제지를 읽는 중에 누를 것이 늘어나면 거슬린다.
 *
 * 확대하면 그림을 **그 크기로 다시 굽는다.** 늘리기만 하면 글자가 뭉개진다.
 * 손을 떼기 전까지는 늘려서 보여 주고, 멈추면 다시 구워 또렷하게 만든다.
 */
export function PdfPages({ src, className }: { src: string; className?: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const holderRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [pages, setPages] = useState(0);
  const [zoom, setZoom] = useState(1);

  /** 확대 중에 붙잡아 둘 자리 — 손가락 사이가 제자리에 있어야 어지럽지 않다. */
  const anchor = useRef<{ x: number; y: number; zoom: number } | null>(null);

  // ── 문서를 받아 쪽마다 그린다 ────────────────────────────
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

    /**
     * 칸 폭이나 확대 배율이 달라지면 그 폭에 맞춰 다시 굽는다.
     * 손가락을 움직이는 동안 매번 구우면 버벅이므로 잠깐 멈춘 뒤에 한 번만 굽는다.
     */
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastWidth = holder.clientWidth;
    const observer = new ResizeObserver(() => {
      const width = holderRef.current?.clientWidth ?? 0;
      // 몇 픽셀 흔들리는 것까지 다시 그리면 화면이 깜빡인다.
      if (Math.abs(width - lastWidth) < 24) return;
      lastWidth = width;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void draw(width), 200);
    });
    observer.observe(holder);

    return () => {
      alive = false;
      observer.disconnect();
      if (timer) clearTimeout(timer);
      doc?.destroy();
    };
  }, [src]);

  // ── 손가락 두 개로 벌려 확대 ─────────────────────────────
  useEffect(() => {
    const box = scrollRef.current;
    if (!box) return;

    /** 잡아 둘 자리를 적어 두고 배율만 바꾼다. 스크롤은 그린 뒤에 맞춘다. */
    const zoomAt = (next: number, clientX: number, clientY: number) => {
      setZoom((current) => {
        const wanted = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
        if (Math.abs(wanted - current) < 0.001) return current;
        const rect = box.getBoundingClientRect();
        anchor.current = { x: clientX - rect.left, y: clientY - rect.top, zoom: current };
        return wanted;
      });
    };

    // 트랙패드 두 손가락 벌리기와 Ctrl+휠은 브라우저가 둘 다 이 모양으로 알려 준다.
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      setZoom((current) => {
        const wanted = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current * Math.exp(-event.deltaY / 180)));
        if (Math.abs(wanted - current) < 0.001) return current;
        const rect = box.getBoundingClientRect();
        anchor.current = { x: event.clientX - rect.left, y: event.clientY - rect.top, zoom: current };
        return wanted;
      });
    };

    /** 손가락 두 개 사이의 거리와 가운데 */
    let start: { gap: number; zoom: number } | null = null;
    const spread = (touches: TouchList) => {
      const [a, b] = [touches[0], touches[1]];
      return {
        gap: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        x: (a.clientX + b.clientX) / 2,
        y: (a.clientY + b.clientY) / 2,
      };
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) return;
      start = { gap: spread(event.touches).gap, zoom };
    };
    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length !== 2 || !start || start.gap === 0) return;
      // 손가락 두 개는 우리가 처리한다 — 브라우저가 화면 전체를 확대하지 않게 막는다.
      event.preventDefault();
      const now = spread(event.touches);
      zoomAt(start.zoom * (now.gap / start.gap), now.x, now.y);
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length < 2) start = null;
    };

    box.addEventListener("wheel", onWheel, { passive: false });
    box.addEventListener("touchstart", onTouchStart, { passive: false });
    box.addEventListener("touchmove", onTouchMove, { passive: false });
    box.addEventListener("touchend", onTouchEnd);
    box.addEventListener("touchcancel", onTouchEnd);
    return () => {
      box.removeEventListener("wheel", onWheel);
      box.removeEventListener("touchstart", onTouchStart);
      box.removeEventListener("touchmove", onTouchMove);
      box.removeEventListener("touchend", onTouchEnd);
      box.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [zoom]);

  // 배율이 바뀌어 폭이 달라진 **뒤에** 스크롤을 옮겨, 잡아 둔 자리가 제자리에 있게 한다.
  useLayoutEffect(() => {
    const box = scrollRef.current;
    const held = anchor.current;
    if (!box || !held) return;
    anchor.current = null;

    const ratio = zoom / held.zoom;
    box.scrollLeft = (box.scrollLeft + held.x) * ratio - held.x;
    box.scrollTop = (box.scrollTop + held.y) * ratio - held.y;
  }, [zoom]);

  return (
    <div
      ref={scrollRef}
      className={className}
      // 손가락 두 개는 우리가 받는다. 한 손가락 밀기는 그대로 스크롤이다.
      style={{ touchAction: "pan-x pan-y" }}
    >
      {status === "loading" ? (
        <p className="py-10 text-center text-sm text-neutral-500">문제지를 여는 중…</p>
      ) : null}
      {status === "error" ? (
        <p className="py-10 text-center text-sm text-rose-600">{message}</p>
      ) : null}

      {/* 쪽 사이를 띄워 종이가 여러 장인 것이 보이게 한다. */}
      <div
        ref={holderRef}
        className="flex flex-col gap-3"
        style={{ width: `${zoom * 100}%` }}
      />

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
