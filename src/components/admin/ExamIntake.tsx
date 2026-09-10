"use client";

import { ref as storageRef, uploadBytes } from "firebase/storage";
import { useRef, useState } from "react";

import { clientStorage } from "@/lib/firebase/client";
import { isZip, unzipDocuments } from "@/lib/docs/zip";
import type { Exam, University } from "@/lib/types/exam";

/** 파일 여러 개를 동시에 처리한다. 너무 많이 한꺼번에 보내면 서버가 막힌다. */
const CONCURRENCY = 4;

type Track = "humanities" | "science" | "unknown";
type Kind = "question" | "solution";

interface Proposal {
  key: string;
  univId: string | null;
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
  include: boolean;
}

interface FileState {
  name: string;
  status: "waiting" | "uploading" | "reading" | "done" | "error";
  message?: string;
}

const TRACK_LABEL: Record<Track, string> = {
  humanities: "인문",
  science: "자연",
  unknown: "판단 못 함",
};
const KIND_LABEL: Record<Kind, string> = { question: "문제", solution: "해설" };
const CONFIDENCE_LABEL = { high: "확실", medium: "보통", low: "불확실" } as const;
const STATUS_LABEL = {
  waiting: "대기",
  uploading: "올리는 중",
  reading: "읽는 중",
  done: "완료",
  error: "실패",
} as const;
const STATUS_CLASS = {
  waiting: "text-neutral-400",
  uploading: "text-neutral-500",
  reading: "text-sky-600",
  done: "text-emerald-600",
  error: "text-red-600",
} as const;

const cellInput = "w-full rounded border border-neutral-300 px-2 py-1 text-sm";

/**
 * 하나로 묶일 자료들의 이름을 통일한다.
 * 문제 쪽 이름을 기준으로 삼는다 — 해설은 "…해설", "…채점 기준"처럼 길어지기 쉽다.
 */
function normalizeTitles(rows: Proposal[]): Proposal[] {
  const chosen = new Map<string, string>();
  for (const row of rows) {
    const key = `${row.univId ?? ""}|${row.year}|${row.session ?? ""}`;
    const current = chosen.get(key);
    if (!current || (row.kind === "question" && row.title.length <= current.length)) {
      chosen.set(key, row.title);
    }
  }
  return rows.map((row) => ({
    ...row,
    title: chosen.get(`${row.univId ?? ""}|${row.year}|${row.session ?? ""}`) ?? row.title,
  }));
}

interface Props {
  universities: University[];
  /** 특정 대학 화면에서 열었으면 그 대학으로 미리 정해 둔다 */
  fixedUnivId?: string;
  onExams?: (exams: Exam[]) => void;
  onDone?: () => void;
}

export function ExamIntake({ universities, fixedUnivId, onExams, onDone }: Props) {
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

  async function ingest(name: string, data: Blob, size: number) {
    mark(name, { status: "uploading" });
    const safe = name.replace(/[^\w.\-가-힣]/g, "_");
    const extension = name.toLowerCase().endsWith(".hwpx") ? "hwpx" : "pdf";
    const path = `intake/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
    await uploadBytes(storageRef(clientStorage, path), data, {
      contentType: extension === "hwpx" ? "application/hwpx" : "application/pdf",
    });

    mark(name, { status: "reading" });
    const response = await fetch("/api/intake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storagePath: path, fileName: name, size }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "판단에 실패했습니다.");

    const fallbackYear = payload.year ?? new Date().getFullYear() + 1;
    const univId = fixedUnivId ?? payload.univId ?? null;

    const rows: Proposal[] = (payload.parts ?? []).map((part: Proposal, index: number) => ({
      key: `${path}#${index}`,
      univId,
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

    // 같은 (대학 · 연도 · 차수)면 하나의 기출로 묶이므로, 이름도 하나로 맞춰 보여 준다.
    // 문제와 해설이 다른 파일로 오면 읽어 낸 이름이 조금씩 달라서 그대로 두면 헷갈린다.
    setProposals((prev) => normalizeTitles([...prev, ...rows]));
    mark(name, {
      status: "done",
      message: [
        `${payload.file.pageCount}쪽 · ${rows.length}개로 나눔`,
        univId ? null : "대학 못 알아냄",
        payload.extraction.method === "clova" ? "OCR" : null,
      ]
        .filter(Boolean)
        .join(" · "),
    });
  }

  async function handleFiles(picked: File[]) {
    if (picked.length === 0) return;
    setBusy(true);
    setError(null);
    setResult(null);

    // zip 은 브라우저에서 풀어 안의 기출 파일만 올린다.
    const jobs: { name: string; blob: Blob; size: number }[] = [];
    for (const file of picked) {
      if (isZip(file)) {
        try {
          for (const entry of await unzipDocuments(file)) {
            const blob = new Blob([entry.data as BlobPart]);
            jobs.push({ name: entry.name, blob, size: blob.size });
          }
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : `${file.name} 을 풀지 못했습니다.`);
        }
      } else if (/\.(pdf|hwpx)$/i.test(file.name)) {
        jobs.push({ name: file.name, blob: file, size: file.size });
      } else {
        setError(`${file.name} 은 PDF · HWPX · zip 이 아니라 건너뜁니다.`);
      }
    }

    setFiles(jobs.map((job) => ({ name: job.name, status: "waiting" as const })));

    // 순서대로 하면 파일 수만큼 기다려야 해서 몇 개씩 동시에 돌린다.
    const queue = [...jobs];
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
        for (;;) {
          const job = queue.shift();
          if (!job) return;
          try {
            await ingest(job.name, job.blob, job.size);
          } catch (caught) {
            mark(job.name, {
              status: "error",
              message: caught instanceof Error ? caught.message : "실패",
            });
          }
        }
      }),
    );

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
    const missing = items.filter((row) => !row.univId);
    if (missing.length > 0) {
      setError(`대학을 고르지 않은 자료가 ${missing.length}개 있습니다.`);
      return;
    }

    setCommitting(true);
    setError(null);
    try {
      const response = await fetch("/api/intake/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((row) => ({
            univId: row.univId,
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
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "등록에 실패했습니다.");

      if (fixedUnivId && onExams) onExams(data.examsByUniv?.[fixedUnivId] ?? []);
      setProposals([]);
      setFiles([]);
      setResult(
        [`기출 ${data.created}건에 자료 ${items.length}개를 붙였습니다.`, ...(data.warnings ?? [])].join(
          " ",
        ),
      );
      onDone?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "등록에 실패했습니다.");
    } finally {
      setCommitting(false);
    }
  }

  const selected = proposals.filter((row) => row.include).length;
  const done = files.filter((f) => f.status === "done" || f.status === "error").length;

  /**
   * 한 시험에 문제지는 하나, 해설도 하나다.
   * 같은 자리를 두 자료가 노리면 등록하기 전에 알려 준다 — 그대로 두면 한쪽이 사라진다.
   */
  const clashes = new Map<string, Proposal[]>();
  for (const row of proposals.filter((r) => r.include)) {
    const slot = `${row.univId ?? ""}|${row.year}|${row.session ?? ""}|${row.kind}`;
    clashes.set(slot, [...(clashes.get(slot) ?? []), row]);
  }
  const clashing = new Set(
    [...clashes.values()]
      .filter((rows) => rows.length > 1)
      // 같은 파일에서 나뉘어 온 것은 등록할 때 한 덩어리로 합쳐지므로 문제가 아니다.
      .filter((rows) => new Set(rows.map((r) => r.storagePath)).size > 1)
      .flat()
      .map((row) => row.key),
  );

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
        <p className="font-medium">기출 파일을 여기에 끌어다 놓으세요</p>
        <p className="mt-1 text-sm text-neutral-500">
          PDF · 한글(HWPX) · zip · 여러 개 한꺼번에
          <br />
          {fixedUnivId ? "" : "어느 대학인지, "}연도 · 인문/자연 · 문제/해설을 읽어서 알아서
          나눕니다. 등록 전에 확인하실 수 있습니다.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.hwpx,.zip,application/pdf,application/zip"
          className="hidden"
          onChange={(event) => {
            const picked = Array.from(event.target.files ?? []);
            event.target.value = "";
            void handleFiles(picked);
          }}
        />
      </div>

      {files.length > 0 ? (
        <div className="mt-3">
          {busy ? (
            <p className="mb-2 text-sm text-neutral-500">
              {done} / {files.length} 처리함 · {CONCURRENCY}개씩 동시에 읽는 중…
            </p>
          ) : null}
          <ul className="space-y-1 text-sm">
            {files.map((file) => (
              <li key={file.name} className="flex items-center gap-2">
                <span className={`w-16 shrink-0 text-xs ${STATUS_CLASS[file.status]}`}>
                  {STATUS_LABEL[file.status]}
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
        </div>
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
            자연계열은 자동으로 꺼 두었습니다. 대학 · 연도 · 차수가 같으면 하나의 기출로 묶이고,
            한 시험에는 문제지 하나 · 해설 하나가 들어갑니다.
          </p>

          {clashing.size > 0 ? (
            <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
              같은 시험의 같은 자리를 노리는 자료가 {clashing.size}개 있습니다(아래 노란 줄).
              한 시험에 문제지는 하나뿐이라 이대로 등록하면 뒤엣것이 들어가지 않습니다.
              정말 다른 시험이면 <b>차수</b>를 오전 · 오후처럼 다르게 적어 주시고,
              같은 시험이면 하나만 남기고 체크를 풀어 주세요.
            </p>
          ) : null}

          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="border-b border-neutral-200 text-left text-xs text-neutral-500">
                <tr>
                  <th className="w-10 py-2">등록</th>
                  <th className="py-2">파일 · 쪽</th>
                  {fixedUnivId ? null : <th className="py-2">대학</th>}
                  <th className="py-2">계열</th>
                  <th className="py-2">종류</th>
                  <th className="w-20 py-2">학년도</th>
                  <th className="py-2">이름</th>
                  <th className="w-24 py-2">차수</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {proposals.map((row) => (
                  <tr
                    key={row.key}
                    className={[
                      row.include ? "" : "opacity-45",
                      clashing.has(row.key) ? "bg-amber-50" : "",
                    ].join(" ")}
                  >
                    <td className="py-2">
                      <input
                        type="checkbox"
                        checked={row.include}
                        onChange={(event) => patch(row.key, { include: event.target.checked })}
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <div className="max-w-52 truncate" title={row.fileName}>
                        {row.fileName}
                      </div>
                      <div className="mt-1 flex items-center gap-1 text-xs text-neutral-500">
                        <input
                          value={row.pageFrom}
                          onChange={(event) =>
                            patch(row.key, { pageFrom: Number(event.target.value) || 1 })
                          }
                          className="w-11 rounded border border-neutral-300 px-1 py-0.5 text-center"
                        />
                        <span>~</span>
                        <input
                          value={row.pageTo}
                          onChange={(event) =>
                            patch(row.key, { pageTo: Number(event.target.value) || 1 })
                          }
                          className="w-11 rounded border border-neutral-300 px-1 py-0.5 text-center"
                        />
                        <span>/ {row.pageCount}쪽</span>
                        {row.confidence !== "high" ? (
                          <span className="rounded bg-amber-100 px-1 text-amber-700">
                            {CONFIDENCE_LABEL[row.confidence]}
                          </span>
                        ) : null}
                      </div>
                    </td>

                    {fixedUnivId ? null : (
                      <td className="py-2 pr-2">
                        <select
                          value={row.univId ?? ""}
                          onChange={(event) => patch(row.key, { univId: event.target.value || null })}
                          className={[
                            cellInput,
                            row.univId ? "" : "border-amber-400 bg-amber-50",
                          ].join(" ")}
                        >
                          <option value="">— 고르세요 —</option>
                          {universities.map((univ) => (
                            <option key={univ.id} value={univ.id}>
                              {univ.name}
                            </option>
                          ))}
                        </select>
                      </td>
                    )}

                    <td className="py-2 pr-2">
                      <select
                        value={row.track}
                        onChange={(event) => patch(row.key, { track: event.target.value as Track })}
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
                        placeholder={clashing.has(row.key) ? "오전 / 오후" : "—"}
                        className={[
                          cellInput,
                          clashing.has(row.key) ? "border-amber-400" : "",
                        ].join(" ")}
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
