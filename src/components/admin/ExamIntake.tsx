"use client";

import { ref as storageRef, uploadBytes } from "firebase/storage";
import { useRef, useState } from "react";

import { clientStorage } from "@/lib/firebase/client";
import { isZip, unzipPdfs } from "@/lib/pdf/zip";
import type { Exam } from "@/lib/types/exam";

type Track = "humanities" | "science" | "unknown";
type Kind = "question" | "solution";

interface Proposal {
  /** 화면에서만 쓰는 행 식별자 */
  key: string;
  storagePath: string;
  fileName: string;
  size: number;
  pageCount: number;
  kind: Kind;
  track: Track;
  pageFrom: number;
  pageTo: number;
  year: number;
  title: string;
  session: string | null;
  confidence: "high" | "medium" | "low";
  /** 등록할지 — 자연계열은 기본으로 꺼 둔다 */
  include: boolean;
}

interface FileState {
  name: string;
  status: "uploading" | "reading" | "done" | "error";
  message?: string;
}

const TRACK_LABEL: Record<Track, string> = {
  humanities: "인문",
  science: "자연",
  unknown: "판단 못 함",
};
const KIND_LABEL: Record<Kind, string> = { question: "문제", solution: "해설" };
const CONFIDENCE_LABEL = { high: "확실", medium: "보통", low: "불확실" } as const;

const cellInput = "w-full rounded border border-neutral-300 px-2 py-1 text-sm";

export function ExamIntake({
  univId,
  onExams,
}: {
  univId: string;
  onExams: (exams: Exam[]) => void;
}) {
  const [files, setFiles] = useState<FileState[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [busy, setBusy] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function mark(name: string, patch: Partial<FileState>) {
    setFiles((prev) => prev.map((f) => (f.name === name ? { ...f, ...patch } : f)));
  }

  /** PDF 한 개를 올리고 무엇인지 판단받는다. */
  async function ingest(name: string, data: Blob, size: number) {
    mark(name, { status: "uploading" });
    const safe = name.replace(/[^\w.\-가-힣]/g, "_");
    const path = `exams/${univId}/_intake/${Date.now()}-${safe}`;
    await uploadBytes(storageRef(clientStorage, path), data, { contentType: "application/pdf" });

    mark(name, { status: "reading" });
    const response = await fetch(`/api/universities/${univId}/intake`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storagePath: path, fileName: name, size }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "판단에 실패했습니다.");

    const fallbackYear = payload.year ?? new Date().getFullYear() + 1;
    const rows: Proposal[] = (payload.parts ?? []).map((part: Proposal, index: number) => ({
      key: `${path}#${index}`,
      storagePath: path,
      fileName: name,
      size,
      pageCount: payload.file.pageCount,
      kind: part.kind,
      track: part.track,
      pageFrom: part.pageFrom,
      pageTo: part.pageTo,
      year: fallbackYear,
      title: part.title || "논술",
      session: part.session,
      confidence: part.confidence,
      // 이 서비스는 인문 논술만 다룬다. 자연계열은 꺼 둔 채로 보여 준다.
      include: part.track !== "science",
    }));

    setProposals((prev) => [...prev, ...rows]);
    mark(name, {
      status: "done",
      message: `${payload.file.pageCount}쪽 · ${rows.length}개로 나눔${
        payload.extraction.method === "claude" ? " · 스캔본" : ""
      }`,
    });
  }

  async function handleFiles(picked: File[]) {
    if (picked.length === 0) return;
    setBusy(true);
    setError(null);
    setResult(null);

    // zip 은 브라우저에서 풀어 안의 PDF 만 올린다.
    const jobs: { name: string; blob: Blob; size: number }[] = [];
    for (const file of picked) {
      if (isZip(file)) {
        try {
          for (const entry of await unzipPdfs(file)) {
            const blob = new Blob([entry.data as BlobPart], { type: "application/pdf" });
            jobs.push({ name: entry.name, blob, size: blob.size });
          }
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : `${file.name} 을 풀지 못했습니다.`);
        }
      } else if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        jobs.push({ name: file.name, blob: file, size: file.size });
      } else {
        setError(`${file.name} 은 PDF 도 zip 도 아니라 건너뜁니다.`);
      }
    }

    setFiles(jobs.map((job) => ({ name: job.name, status: "uploading" as const })));

    for (const job of jobs) {
      try {
        await ingest(job.name, job.blob, job.size);
      } catch (caught) {
        mark(job.name, {
          status: "error",
          message: caught instanceof Error ? caught.message : "실패",
        });
      }
    }

    setBusy(false);
  }

  function patch(key: string, next: Partial<Proposal>) {
    setProposals((prev) => prev.map((row) => (row.key === key ? { ...row, ...next } : row)));
  }

  async function commit() {
    const items = proposals.filter((row) => row.include);
    if (items.length === 0) {
      setError("등록할 자료를 하나 이상 선택하세요.");
      return;
    }
    setCommitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/universities/${univId}/intake/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((row) => ({
            storagePath: row.storagePath,
            fileName: row.fileName,
            size: row.size,
            kind: row.kind,
            // 파일 전체를 쓰는 경우엔 범위를 두지 않는다.
            pageFrom: row.pageFrom === 1 && row.pageTo === row.pageCount ? null : row.pageFrom,
            pageTo: row.pageFrom === 1 && row.pageTo === row.pageCount ? null : row.pageTo,
            year: row.year,
            title: row.title,
            session: row.session || null,
            examId: null,
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "등록에 실패했습니다.");

      onExams(data.exams ?? []);
      setProposals([]);
      setFiles([]);
      setResult(
        [`기출 ${data.created}건에 자료 ${items.length}개를 붙였습니다.`, ...(data.warnings ?? [])].join(
          " ",
        ),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "등록에 실패했습니다.");
    } finally {
      setCommitting(false);
    }
  }

  const selected = proposals.filter((row) => row.include).length;

  return (
    <div>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void handleFiles(Array.from(event.dataTransfer.files));
        }}
        onClick={() => inputRef.current?.click()}
        className={[
          "cursor-pointer rounded-lg border-2 border-dashed px-6 py-10 text-center transition",
          dragging ? "border-sky-400 bg-sky-50" : "border-neutral-300",
        ].join(" ")}
      >
        <p className="font-medium">기출 PDF 를 여기에 끌어다 놓으세요</p>
        <p className="mt-1 text-sm text-neutral-500">
          여러 개를 한꺼번에 올려도 되고, zip 으로 묶어서 올려도 됩니다.
          <br />
          연도 · 인문/자연 · 문제/해설을 읽어서 알아서 나눕니다. 등록 전에 확인하실 수 있습니다.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="application/pdf,.pdf,.zip,application/zip"
          className="hidden"
          onChange={(event) => {
            const picked = Array.from(event.target.files ?? []);
            event.target.value = "";
            void handleFiles(picked);
          }}
        />
      </div>

      {files.length > 0 ? (
        <ul className="mt-3 space-y-1 text-sm">
          {files.map((file) => (
            <li key={file.name} className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-xs">
                {file.status === "uploading" ? (
                  <span className="text-neutral-500">올리는 중</span>
                ) : file.status === "reading" ? (
                  <span className="text-sky-600">읽는 중</span>
                ) : file.status === "error" ? (
                  <span className="text-red-600">실패</span>
                ) : (
                  <span className="text-emerald-600">완료</span>
                )}
              </span>
              <span className="truncate">{file.name}</span>
              {file.message ? (
                <span
                  className={
                    file.status === "error" ? "text-xs text-red-600" : "text-xs text-neutral-400"
                  }
                >
                  {file.message}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {proposals.length > 0 ? (
        <div className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">
              읽은 결과 {proposals.length}개 · 등록할 것 {selected}개
            </h3>
            <button
              type="button"
              onClick={() => void commit()}
              disabled={committing || busy || selected === 0}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {committing ? "등록 중…" : "이대로 등록"}
            </button>
          </div>
          <p className="mt-1 text-sm text-neutral-500">
            자연계열은 자동으로 꺼 두었습니다. 연도 · 이름 · 차수가 같으면 하나의 기출로 묶입니다.
          </p>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="border-b border-neutral-200 text-left text-xs text-neutral-500">
                <tr>
                  <th className="w-10 py-2">등록</th>
                  <th className="py-2">파일 · 쪽</th>
                  <th className="py-2">계열</th>
                  <th className="py-2">종류</th>
                  <th className="w-20 py-2">학년도</th>
                  <th className="py-2">이름</th>
                  <th className="w-24 py-2">차수</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {proposals.map((row) => (
                  <tr key={row.key} className={row.include ? "" : "opacity-45"}>
                    <td className="py-2">
                      <input
                        type="checkbox"
                        checked={row.include}
                        onChange={(event) => patch(row.key, { include: event.target.checked })}
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <div className="max-w-56 truncate" title={row.fileName}>
                        {row.fileName}
                      </div>
                      <div className="mt-1 flex items-center gap-1 text-xs text-neutral-500">
                        <input
                          value={row.pageFrom}
                          onChange={(event) =>
                            patch(row.key, { pageFrom: Number(event.target.value) || 1 })
                          }
                          className="w-12 rounded border border-neutral-300 px-1 py-0.5 text-center"
                        />
                        <span>~</span>
                        <input
                          value={row.pageTo}
                          onChange={(event) =>
                            patch(row.key, { pageTo: Number(event.target.value) || 1 })
                          }
                          className="w-12 rounded border border-neutral-300 px-1 py-0.5 text-center"
                        />
                        <span>/ {row.pageCount}쪽</span>
                        {row.confidence !== "high" ? (
                          <span className="rounded bg-amber-100 px-1 text-amber-700">
                            {CONFIDENCE_LABEL[row.confidence]}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="py-2 pr-2">
                      <select
                        value={row.track}
                        onChange={(event) =>
                          patch(row.key, { track: event.target.value as Track })
                        }
                        className={cellInput}
                      >
                        {(Object.keys(TRACK_LABEL) as Track[]).map((track) => (
                          <option key={track} value={track}>
                            {TRACK_LABEL[track]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-2">
                      <select
                        value={row.kind}
                        onChange={(event) => patch(row.key, { kind: event.target.value as Kind })}
                        className={cellInput}
                      >
                        {(Object.keys(KIND_LABEL) as Kind[]).map((kind) => (
                          <option key={kind} value={kind}>
                            {KIND_LABEL[kind]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        value={row.year}
                        onChange={(event) =>
                          patch(row.key, { year: Number(event.target.value) || row.year })
                        }
                        className={cellInput}
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        value={row.title}
                        onChange={(event) => patch(row.key, { title: event.target.value })}
                        className={cellInput}
                      />
                    </td>
                    <td className="py-2">
                      <input
                        value={row.session ?? ""}
                        onChange={(event) => patch(row.key, { session: event.target.value || null })}
                        placeholder="—"
                        className={cellInput}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {result ? <p className="mt-3 text-sm text-emerald-700">{result}</p> : null}
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
