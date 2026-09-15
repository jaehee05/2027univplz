"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { PdfKind } from "@/lib/exam/store";
import type { Exam, PdfMask } from "@/lib/types/exam";

interface Props {
  univId: string;
  examId: string;
  kind: PdfKind;
  /** 학생에게 나가는 쪽 범위 — 그 안에서만 칠하면 된다 */
  pageFrom: number | null;
  pageTo: number | null;
  initial: PdfMask[];
  onExam: (exam: Exam) => void;
  onClose: () => void;
}

/** 드래그 중인 사각형 — 비율(0~1)로만 쥔다. 화면 크기가 바뀌어도 자리가 안 틀어진다. */
interface Drag {
  x: number;
  y: number;
  w: number;
  h: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * 한 쪽 안에 문제와 해설이 같이 실린 기출에서, 학생에게 가릴 자리를 칠한다.
 *
 * 쪽을 그려 놓고 그 위에 사각형을 끌어 그리면, 비율 좌표로 저장해 두었다가
 * 학생에게 내보낼 때 서버가 그 자리를 흰색으로 덮는다.
 *
 * 덮기는 눈에만 걸린다 — 글자는 파일에 남아 있어 긁으면 읽힌다.
 * 화면에도 그렇게 적어 둔다.
 */
export function MaskEditor({
  univId,
  examId,
  kind,
  pageFrom,
  pageTo,
  initial,
  onExam,
  onClose,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  /** pdfjs 문서 손잡이. 타입을 끌어오지 않으려고 최소한만 쓴다. */
  const docRef = useRef<{
    numPages: number;
    getPage: (n: number) => Promise<{
      getViewport: (o: { scale: number }) => { width: number; height: number };
      render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => {
        promise: Promise<void>;
      };
    }>;
  } | null>(null);

  const first = Math.max(1, pageFrom ?? 1);
  const [page, setPage] = useState(first);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [masks, setMasks] = useState<PdfMask[]>(initial);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const last = Math.min(pageTo ?? pageCount ?? first, pageCount ?? Number.MAX_SAFE_INTEGER);

  // ── 원본을 받아 pdfjs 에 물린다 ──────────────────────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        // 워커는 scripts/copy-pdf-worker.mjs 가 public/ 으로 내놓는다.
        // 번들러에 맡기면 next.config 의 serverExternalPackages 에 걸려 밖으로 밀려난다.
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

        const url = `/api/universities/${univId}/exams/${examId}/file?kind=${kind}`;
        const response = await fetch(url);
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error ?? "원본 파일을 받지 못했습니다.");
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        const doc = await pdfjs.getDocument({ data: bytes }).promise;
        if (cancelled) return;

        docRef.current = doc as unknown as typeof docRef.current;
        setPageCount(doc.numPages);
        setLoading(false);
      } catch (caught) {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : "원본을 열지 못했습니다.");
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [examId, kind, univId]);

  // ── 고른 쪽을 그린다 ─────────────────────────────────────
  const draw = useCallback(async () => {
    const doc = docRef.current;
    const canvas = canvasRef.current;
    if (!doc || !canvas || page < 1 || page > doc.numPages) return;

    const target = await doc.getPage(page);
    // 화면 폭에 맞추되 너무 흐려지지 않게 2배로 굽는다.
    const base = target.getViewport({ scale: 1 });
    const width = surfaceRef.current?.clientWidth ?? 600;
    const scale = (width / base.width) * 2;
    const viewport = target.getViewport({ scale });

    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    canvas.style.aspectRatio = `${base.width} / ${base.height}`;

    const context = canvas.getContext("2d");
    if (!context) return;
    await target.render({ canvasContext: context, viewport }).promise;
  }, [page]);

  useEffect(() => {
    if (!loading) void draw();
  }, [draw, loading]);

  // ── 끌어 그리기 ──────────────────────────────────────────
  function pointAt(event: React.PointerEvent): { x: number; y: number } | null {
    const box = surfaceRef.current?.getBoundingClientRect();
    if (!box || box.width === 0 || box.height === 0) return null;
    return {
      x: clamp01((event.clientX - box.left) / box.width),
      y: clamp01((event.clientY - box.top) / box.height),
    };
  }

  const startRef = useRef<{ x: number; y: number } | null>(null);

  function onPointerDown(event: React.PointerEvent) {
    const point = pointAt(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    startRef.current = point;
    setDrag({ x: point.x, y: point.y, w: 0, h: 0 });
  }

  function onPointerMove(event: React.PointerEvent) {
    const start = startRef.current;
    if (!start) return;
    const point = pointAt(event);
    if (!point) return;
    setDrag({
      x: Math.min(start.x, point.x),
      y: Math.min(start.y, point.y),
      w: Math.abs(point.x - start.x),
      h: Math.abs(point.y - start.y),
    });
  }

  function onPointerUp() {
    const box = drag;
    startRef.current = null;
    setDrag(null);
    // 살짝 누른 것은 칠하지 않는다 — 지우려다 잘못 그리는 일을 막는다.
    if (!box || box.w < 0.01 || box.h < 0.01) return;
    setMasks((prev) => [...prev, { page, ...box }]);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/universities/${univId}/exams/${examId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mask: { kind, masks } }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "저장에 실패했습니다.");
      onExam(data.exam);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "저장에 실패했습니다.");
      setSaving(false);
    }
  }

  const here = masks.filter((mask) => mask.page === page);

  return (
    <div className="rounded-xl border border-neutral-300 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-semibold">가림칠</h4>
          <p className="mt-0.5 text-sm text-neutral-500">
            학생에게 보이면 안 되는 자리를 끌어서 칠하세요. 칠한 자리는 흰색으로 덮여 나갑니다.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
        >
          닫기
        </button>
      </div>

      <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
        덮기는 <b>눈에만</b> 걸립니다. 덮인 글자는 파일 안에 남아 있어, 긁어 붙이면 읽힙니다.
        넘겨보다 답이 보이는 것은 막지만 작정하고 파내는 것은 막지 못합니다.
      </p>

      {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}

      {/* 쪽 넘기기 */}
      <div className="mt-3 flex items-center justify-between gap-2 text-sm">
        <button
          type="button"
          disabled={page <= first}
          onClick={() => setPage((value) => value - 1)}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 disabled:opacity-40"
        >
          ‹ 앞 쪽
        </button>
        <span className="text-neutral-500 tabular-nums">
          {pageCount == null ? "여는 중…" : `${page} / ${last} 쪽`}
          {pageFrom || pageTo ? (
            <span className="ml-1.5 text-xs text-neutral-400">
              (학생에게 나가는 범위)
            </span>
          ) : null}
        </span>
        <button
          type="button"
          disabled={pageCount == null || page >= last}
          onClick={() => setPage((value) => value + 1)}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 disabled:opacity-40"
        >
          뒤 쪽 ›
        </button>
      </div>

      {/* 쪽 그림 + 칠한 자리 */}
      <div
        ref={surfaceRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="relative mt-3 w-full cursor-crosshair touch-none overflow-hidden rounded-lg border border-neutral-300 bg-neutral-100 select-none"
      >
        <canvas ref={canvasRef} className="block w-full" />

        {loading ? (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-neutral-500">
            원본을 여는 중…
          </p>
        ) : null}

        {here.map((mask, index) => (
          <span
            key={index}
            className="absolute border-2 border-rose-500 bg-white/85"
            style={{
              left: `${mask.x * 100}%`,
              top: `${mask.y * 100}%`,
              width: `${mask.w * 100}%`,
              height: `${mask.h * 100}%`,
            }}
          />
        ))}

        {drag ? (
          <span
            className="absolute border-2 border-dashed border-rose-500 bg-rose-500/20"
            style={{
              left: `${drag.x * 100}%`,
              top: `${drag.y * 100}%`,
              width: `${drag.w * 100}%`,
              height: `${drag.h * 100}%`,
            }}
          />
        ) : null}
      </div>

      {/* 칠한 목록 */}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-neutral-500">
          이 쪽 {here.length}곳 · 전체 {masks.length}곳
        </span>
        {here.length > 0 ? (
          <button
            type="button"
            onClick={() => setMasks((prev) => prev.filter((mask) => mask.page !== page))}
            className="rounded-lg border border-neutral-300 px-2.5 py-1"
          >
            이 쪽 지우기
          </button>
        ) : null}
        {masks.length > 0 ? (
          <button
            type="button"
            onClick={() => setMasks([])}
            className="rounded-lg border border-neutral-300 px-2.5 py-1"
          >
            전부 지우기
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="ml-auto rounded-lg bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-40"
        >
          {saving ? "저장 중…" : "가림칠 저장"}
        </button>
      </div>
    </div>
  );
}
