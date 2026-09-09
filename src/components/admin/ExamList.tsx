"use client";

import Link from "next/link";
import { useState } from "react";

import { ExamIntake } from "@/components/admin/ExamIntake";
import type { Exam, University } from "@/lib/types/exam";

const STATUS_LABEL = {
  none: "분석 전",
  draft: "초안",
  confirmed: "확정",
} as const;

const STATUS_CLASS = {
  none: "bg-neutral-100 text-neutral-600",
  draft: "bg-amber-100 text-amber-700",
  confirmed: "bg-emerald-100 text-emerald-700",
} as const;

interface Draft {
  year: string;
  title: string;
  session: string;
}

export function ExamList({
  univId,
  initial,
  universities,
}: {
  univId: string;
  initial: Exam[];
  universities: University[];
}) {
  const [exams, setExams] = useState<Exam[]>(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ year: "", title: "", session: "" });
  const [manual, setManual] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const base = `/api/universities/${univId}/exams`;

  async function send(url: string, method: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "처리에 실패했습니다.");
      if (data.exams) setExams(data.exams);
      return data;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "처리에 실패했습니다.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  function startEdit(exam: Exam) {
    setEditing(exam.id);
    setDraft({ year: String(exam.year), title: exam.title, session: exam.session ?? "" });
  }

  async function saveEdit(examId: string) {
    const year = Number(draft.year);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      setError("학년도를 2000~2100 사이로 넣어 주세요.");
      return;
    }
    if (!draft.title.trim()) {
      setError("이름을 넣어 주세요.");
      return;
    }
    const data = await send(`${base}/${examId}`, "PATCH", {
      year,
      title: draft.title.trim(),
      session: draft.session.trim() || null,
    });
    if (data) setEditing(null);
  }

  async function remove(exam: Exam) {
    if (
      !confirm(
        `${exam.year}학년도 ${exam.title} 을 삭제할까요? 올린 PDF · 문항 · 채점 기준이 함께 지워집니다.`,
      )
    ) {
      return;
    }
    await send(`${base}/${exam.id}`, "DELETE");
  }

  async function addManually() {
    const year = Number(draft.year) || new Date().getFullYear() + 1;
    const data = await send(base, "POST", {
      year,
      title: draft.title.trim() || "논술",
      session: draft.session.trim() || undefined,
    });
    if (data) {
      setManual(false);
      setDraft({ year: "", title: "", session: "" });
    }
  }

  return (
    <div className="mt-4 space-y-6">
      <ExamIntake universities={universities} fixedUnivId={univId} onExams={setExams} />

      {exams.length > 0 ? (
        <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
          {exams.map((exam) => (
            <li key={exam.id} className="px-4 py-3">
              {editing === exam.id ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={draft.year}
                    onChange={(event) => setDraft({ ...draft, year: event.target.value })}
                    className="w-20 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
                  />
                  <input
                    value={draft.title}
                    onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                    className="w-56 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
                  />
                  <input
                    value={draft.session}
                    onChange={(event) => setDraft({ ...draft, session: event.target.value })}
                    placeholder="차수 (없으면 비움)"
                    className="w-32 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => void saveEdit(exam.id)}
                    disabled={busy}
                    className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                  >
                    저장
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(null)}
                    className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
                  >
                    취소
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/admin/universities/${univId}/exams/${exam.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {exam.year}학년도 {exam.title}
                    {exam.session ? ` · ${exam.session}` : ""}
                  </Link>

                  <div className="flex items-center gap-3 text-xs text-neutral-500">
                    <span title={exam.questionPdf?.fileName ?? undefined}>
                      {exam.questionPdf ? "문제 ✓" : "문제 —"}
                    </span>
                    <span title={exam.solutionPdf?.fileName ?? undefined}>
                      {exam.solutionPdf ? "해설 ✓" : "해설 —"}
                    </span>
                    <span>문항 {exam.questionCount}</span>
                    <span className={`rounded px-1.5 py-0.5 ${STATUS_CLASS[exam.analysisStatus]}`}>
                      {STATUS_LABEL[exam.analysisStatus]}
                    </span>
                    <button
                      type="button"
                      onClick={() => startEdit(exam)}
                      className="rounded border border-neutral-300 px-2 py-1"
                    >
                      이름 수정
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(exam)}
                      disabled={busy}
                      className="rounded border border-red-200 px-2 py-1 text-red-600 disabled:opacity-50"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      <div>
        {manual ? (
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm">
              <span className="block text-xs text-neutral-500">학년도</span>
              <input
                value={draft.year}
                onChange={(event) => setDraft({ ...draft, year: event.target.value })}
                placeholder={String(new Date().getFullYear() + 1)}
                inputMode="numeric"
                className="mt-1 w-24 rounded-md border border-neutral-300 px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="block text-xs text-neutral-500">이름</span>
              <input
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                placeholder="수시 논술 (인문)"
                className="mt-1 w-56 rounded-md border border-neutral-300 px-3 py-2"
              />
            </label>
            <button
              type="button"
              onClick={() => void addManually()}
              disabled={busy}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              추가
            </button>
            <button
              type="button"
              onClick={() => setManual(false)}
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm"
            >
              취소
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setManual(true)}
            className="text-sm text-neutral-500 underline-offset-4 hover:underline"
          >
            PDF 없이 빈 기출부터 만들기
          </button>
        )}
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
