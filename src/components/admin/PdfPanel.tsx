"use client";

import { ref as storageRef, uploadBytesResumable } from "firebase/storage";
import { useState } from "react";

import { clientStorage } from "@/lib/firebase/client";
import type { Exam, PdfFile } from "@/lib/types/exam";

const KIND_LABEL = { question: "문제 파일", solution: "해설 · 모범답안 파일" } as const;

interface Props {
  univId: string;
  examId: string;
  kind: "question" | "solution";
  pdf: PdfFile | null;
  onExam: (exam: Exam) => void;
}

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)}MB`
    : `${Math.round(bytes / 1024)}KB`;
}

export function PdfPanel({ univId, examId, kind, pdf, onExam }: Props) {
  const [range, setRange] = useState({ from: "", to: "" });
  const [editingRange, setEditingRange] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const base = `/api/universities/${univId}/exams/${examId}`;

  async function upload(file: File) {
    setError(null);
    setPreview(null);

    const isHwpx = file.name.toLowerCase().endsWith(".hwpx");
    if (!isHwpx && file.type !== "application/pdf") {
      setError("PDF 또는 한글(HWPX) 파일만 올릴 수 있습니다.");
      return;
    }
    if (file.size > 40 * 1024 * 1024) {
      setError("40MB 를 넘는 파일은 올릴 수 없습니다.");
      return;
    }

    // 같은 자리에 덮어쓰면 이전 추출 결과와 헷갈리므로 시각을 붙인다.
    const path = `exams/${univId}/${examId}/${kind}-${Date.now()}.${isHwpx ? "hwpx" : "pdf"}`;
    setProgress(0);

    try {
      const task = uploadBytesResumable(storageRef(clientStorage, path), file, {
        contentType: isHwpx ? "application/hwpx" : "application/pdf",
      });
      await new Promise<void>((resolve, reject) => {
        task.on(
          "state_changed",
          (snap) => setProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
          reject,
          () => resolve(),
        );
      });

      const response = await fetch(base, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pdf: { kind, storagePath: path, fileName: file.name, size: file.size },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "업로드 기록에 실패했습니다.");
      onExam(data.exam);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? `업로드에 실패했습니다: ${caught.message}`
          : "업로드에 실패했습니다.",
      );
    } finally {
      setProgress(null);
    }
  }

  async function saveRange() {
    setError(null);
    const from = range.from.trim() ? Number(range.from) : null;
    const to = range.to.trim() ? Number(range.to) : null;
    if ((from !== null && !Number.isInteger(from)) || (to !== null && !Number.isInteger(to))) {
      setError("쪽 번호는 숫자로 넣어 주세요. 전체를 쓰려면 비워 두세요.");
      return;
    }
    try {
      const response = await fetch(base, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ range: { kind, pageFrom: from, pageTo: to } }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "쪽 범위를 저장하지 못했습니다.");
      onExam(data.exam);
      setEditingRange(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "쪽 범위를 저장하지 못했습니다.");
    }
  }

  async function extract() {
    setExtracting(true);
    setError(null);
    setPreview(null);
    try {
      const response = await fetch(`${base}/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "추출에 실패했습니다.");
      setPreview(data.preview ?? "");

      const examResponse = await fetch(base);
      if (examResponse.ok) onExam((await examResponse.json()).exam);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "추출에 실패했습니다.");
    } finally {
      setExtracting(false);
    }
  }

  const extraction = pdf?.extraction ?? null;

  return (
    <section className="rounded-lg border border-neutral-200 p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="font-semibold">{KIND_LABEL[kind]}</h3>
        {pdf ? (
          <span className="text-xs text-neutral-500">
            {pdf.fileName} · {formatSize(pdf.size)}
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="cursor-pointer rounded-md border border-neutral-300 px-3 py-2 text-sm">
          {pdf ? "다시 올리기" : "파일 올리기"}
          <input
            type="file"
            accept=".pdf,.hwpx,application/pdf"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void upload(file);
            }}
          />
        </label>

        <button
          type="button"
          onClick={() => void extract()}
          disabled={!pdf || extracting || progress !== null}
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {extracting ? "추출 중…" : extraction ? "다시 추출" : "텍스트 추출"}
        </button>

        {progress !== null ? (
          <span className="text-sm text-neutral-500">올리는 중 {progress}%</span>
        ) : null}
      </div>

      {pdf ? (
        <div className="mt-3 text-sm">
          {editingRange ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-neutral-500">쓰는 쪽</span>
              <input
                value={range.from}
                onChange={(event) => setRange({ ...range, from: event.target.value })}
                placeholder="처음"
                className="w-16 rounded border border-neutral-300 px-2 py-1 text-center text-sm"
              />
              <span>~</span>
              <input
                value={range.to}
                onChange={(event) => setRange({ ...range, to: event.target.value })}
                placeholder="끝"
                className="w-16 rounded border border-neutral-300 px-2 py-1 text-center text-sm"
              />
              <button
                type="button"
                onClick={() => void saveRange()}
                className="rounded-md bg-neutral-900 px-3 py-1 text-xs text-white"
              >
                저장
              </button>
              <button
                type="button"
                onClick={() => setEditingRange(false)}
                className="rounded-md border border-neutral-300 px-3 py-1 text-xs"
              >
                취소
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-neutral-500">
                {pdf.pageFrom || pdf.pageTo
                  ? `${pdf.pageFrom ?? "처음"}~${pdf.pageTo ?? "끝"}쪽만 사용`
                  : "파일 전체 사용"}
              </span>
              <button
                type="button"
                onClick={() => {
                  setRange({
                    from: pdf.pageFrom ? String(pdf.pageFrom) : "",
                    to: pdf.pageTo ? String(pdf.pageTo) : "",
                  });
                  setEditingRange(true);
                }}
                className="rounded border border-neutral-300 px-2 py-0.5 text-xs"
              >
                범위 바꾸기
              </button>
            </div>
          )}
        </div>
      ) : null}

      {extraction ? (
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-neutral-500">방식</dt>
          <dd>
            {extraction.method === "pdfjs" ? (
              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-700">
                텍스트 레이어
              </span>
            ) : extraction.method === "hwpx" ? (
              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-700">
                한글 문서
              </span>
            ) : extraction.method === "clova" ? (
              <span className="rounded bg-sky-100 px-1.5 py-0.5 text-xs text-sky-700">
                스캔본 → CLOVA OCR
              </span>
            ) : (
              <span className="rounded bg-sky-100 px-1.5 py-0.5 text-xs text-sky-700">
                스캔본 → Claude
              </span>
            )}
          </dd>
          <dt className="text-neutral-500">분량</dt>
          <dd>
            {extraction.pages}쪽 · {extraction.chars.toLocaleString()}자
          </dd>
          {extraction.note ? (
            <>
              <dt className="text-neutral-500">메모</dt>
              <dd className="text-neutral-600">{extraction.note}</dd>
            </>
          ) : null}
        </dl>
      ) : pdf ? (
        <p className="mt-3 text-sm text-neutral-500">아직 텍스트를 뽑지 않았습니다.</p>
      ) : null}

      {preview !== null ? (
        <details className="mt-3" open>
          <summary className="cursor-pointer text-sm text-neutral-600">추출 결과 앞부분</summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-neutral-50 p-3 text-xs whitespace-pre-wrap">
            {preview || "(빈 결과)"}
          </pre>
        </details>
      ) : null}

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </section>
  );
}
