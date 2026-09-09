"use client";

import Link from "next/link";
import { useState } from "react";

import type { Exam } from "@/lib/types/exam";

const STATUS_LABEL = {
  none: "분석 전",
  draft: "초안",
  confirmed: "확정",
} as const;

export function ExamList({ univId, initial }: { univId: string; initial: Exam[] }) {
  const [exams, setExams] = useState<Exam[]>(initial);
  const [year, setYear] = useState(String(new Date().getFullYear() + 1));
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const base = `/api/universities/${univId}/exams`;

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: Number(year), title: title.trim() || "논술" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "추가에 실패했습니다.");
      setTitle("");
      setExams(data.exams ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "추가에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4">
      {exams.length > 0 ? (
        <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
          {exams.map((exam) => (
            <li key={exam.id} className="flex items-center justify-between px-4 py-3">
              <Link
                href={`/admin/universities/${univId}/exams/${exam.id}`}
                className="font-medium underline-offset-4 hover:underline"
              >
                {exam.year}학년도 {exam.title}
                {exam.session ? ` · ${exam.session}` : ""}
              </Link>
              <div className="flex items-center gap-3 text-xs text-neutral-500">
                <span>{exam.questionPdf ? "문제 ✓" : "문제 —"}</span>
                <span>{exam.solutionPdf ? "해설 ✓" : "해설 —"}</span>
                <span>문항 {exam.questionCount}</span>
                <span
                  className={
                    exam.analysisStatus === "confirmed"
                      ? "rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-700"
                      : exam.analysisStatus === "draft"
                        ? "rounded bg-amber-100 px-1.5 py-0.5 text-amber-700"
                        : "rounded bg-neutral-100 px-1.5 py-0.5"
                  }
                >
                  {STATUS_LABEL[exam.analysisStatus]}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
          등록된 기출이 없습니다. 아래에서 연도를 추가한 뒤 PDF 를 올리세요.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="block text-xs text-neutral-500">학년도</span>
          <input
            value={year}
            onChange={(event) => setYear(event.target.value)}
            inputMode="numeric"
            className="mt-1 w-24 rounded-md border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="block text-xs text-neutral-500">이름</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="수시 논술 (인문)"
            className="mt-1 w-56 rounded-md border border-neutral-300 px-3 py-2"
          />
        </label>
        <button
          type="button"
          onClick={() => void create()}
          disabled={busy}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          기출 추가
        </button>
      </div>

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
