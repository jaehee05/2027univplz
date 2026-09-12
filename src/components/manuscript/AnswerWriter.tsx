"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { ManuscriptEditor } from "@/components/manuscript/ManuscriptEditor";
import { layoutManuscript } from "@/lib/manuscript/layout";
import { DEFAULT_SPEC, type LengthRule } from "@/lib/manuscript/spec";
import type { Answer, Assignment, AssignmentQuestion } from "@/lib/types/work";

const SAVE_DELAY = 1500;

/** 문항 하나의 지금 상태. 저장은 문항마다, 제출은 시험지 통째로 한다. */
interface Draft {
  question: AssignmentQuestion;
  answerId: string;
  text: string;
  savedText: string;
  savedAt: string | null;
  locked: boolean;
}

function lengthRuleOf(question: AssignmentQuestion): LengthRule | null {
  return question.charTarget
    ? {
        target: question.charTarget,
        tolerance: question.tolerance,
        min: question.charMin,
        max: question.charMax,
      }
    : null;
}

function countOf(text: string): number {
  return layoutManuscript(text, DEFAULT_SPEC).countWithSpace;
}

export function AnswerWriter({
  assignment,
  initial,
  onQuestionChange,
}: {
  assignment: Assignment;
  /** 문항 차례대로. 과제를 낼 때 문항마다 하나씩 만들어 둔다. */
  initial: Answer[];
  /** 왼쪽 문제지 칸이 같은 문항을 비추게 한다 */
  onQuestionChange?: (questionId: string) => void;
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    assignment.questions.map((question) => {
      const answer = initial.find((row) => row.questionId === question.questionId);
      return {
        question,
        answerId: answer?.id ?? "",
        text: answer?.text ?? "",
        savedText: answer?.text ?? "",
        savedAt: answer?.updatedAt ?? null,
        locked: answer?.status === "submitted",
      };
    }),
  );
  const [at, setAt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const current = drafts[at];
  const allLocked = drafts.every((draft) => draft.locked);
  const dirty = drafts.some((draft) => draft.text !== draft.savedText);
  const unwritten = drafts.filter((draft) => draft.text.trim().length === 0);

  const save = useCallback(async (draft: Draft, value: string) => {
    const layout = layoutManuscript(value, DEFAULT_SPEC);
    setSaving(true);
    try {
      const response = await fetch(`/api/answers/${draft.answerId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: value,
          charCount: layout.countWithSpace,
          charCountNoSpace: layout.countWithoutSpace,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "저장에 실패했습니다.");
      setDrafts((prev) =>
        prev.map((row) =>
          row.answerId === draft.answerId
            ? { ...row, savedText: value, savedAt: data.savedAt }
            : row,
        ),
      );
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }, []);

  // 글을 멈추면 잠시 뒤 자동 저장한다. 보고 있는 문항만.
  useEffect(() => {
    if (!current || current.locked || current.text === current.savedText) return;
    if (timer.current) clearTimeout(timer.current);
    const draft = current;
    const value = current.text;
    timer.current = setTimeout(() => void save(draft, value), SAVE_DELAY);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [current, save]);

  // 저장되지 않은 채로 나가려 하면 붙잡는다.
  useEffect(() => {
    if (allLocked) return;
    function warn(event: BeforeUnloadEvent) {
      if (dirty) event.preventDefault();
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [allLocked, dirty]);

  function move(index: number) {
    setAt(index);
    onQuestionChange?.(drafts[index].question.questionId);
  }

  /** 제출은 시험지 단위다. 아직 안 쓴 문항이 있으면 그 문항으로 데려간다. */
  async function submit() {
    if (unwritten.length > 0) {
      setError(
        `${unwritten.map((draft) => `${draft.question.number}번`).join(", ")} 을 아직 쓰지 않았습니다. ` +
          "시험지는 문항을 모두 쓴 뒤에 한꺼번에 냅니다.",
      );
      const first = drafts.findIndex((draft) => draft.text.trim().length === 0);
      if (first >= 0) move(first);
      return;
    }

    const lines = drafts.map(
      (draft) => `  ${draft.question.number}번 ${countOf(draft.text)}자`,
    );
    if (
      !confirm(
        `시험지를 제출할까요?\n${lines.join("\n")}\n\n` +
          "제출한 뒤에는 고칠 수 없고, 선생님이 첨삭한 뒤 결과가 공개됩니다.",
      )
    ) {
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      // 안 넘어간 글자가 남지 않게 먼저 모두 저장한다.
      for (const draft of drafts) {
        if (draft.text !== draft.savedText) await save(draft, draft.text);
      }
      const response = await fetch(`/api/assignments/${assignment.id}/submit`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "제출에 실패했습니다.");
      router.push(assignment.selfPractice ? "/admin/assignments" : "/dashboard");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "제출에 실패했습니다.");
      setSubmitting(false);
    }
  }

  if (!current) {
    return <p className="text-sm text-neutral-500">이 과제에 문항이 없습니다.</p>;
  }

  return (
    <div>
      {/* 문항 고르기 — 시험지에 문항이 여럿이면 여기서 오간다. */}
      {drafts.length > 1 ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {drafts.map((draft, index) => {
            const count = countOf(draft.text);
            return (
              <button
                key={draft.question.questionId}
                type="button"
                onClick={() => move(index)}
                className={[
                  "rounded-md border px-3 py-1.5 text-sm",
                  index === at
                    ? "border-neutral-900 bg-neutral-900 text-white"
                    : "border-neutral-300",
                ].join(" ")}
              >
                {draft.question.number}번
                <span className={index === at ? "ml-1.5 text-neutral-300" : "ml-1.5 text-neutral-400"}>
                  {count > 0 ? `${count}자` : "시작 전"}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      <ManuscriptEditor
        key={current.question.questionId}
        value={current.text}
        onChange={(value) =>
          setDrafts((prev) => prev.map((row, i) => (i === at ? { ...row, text: value } : row)))
        }
        spec={DEFAULT_SPEC}
        lengthRule={lengthRuleOf(current.question)}
        label={`문제 ${current.question.number}`}
        readOnly={current.locked}
      />

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 pt-4">
        <p className="text-sm text-neutral-500">
          {allLocked ? (
            "제출을 마쳤습니다. 선생님이 첨삭하면 결과가 보입니다."
          ) : saving ? (
            "저장 중…"
          ) : current.text !== current.savedText ? (
            "저장하지 않은 내용이 있습니다"
          ) : current.savedAt ? (
            `저장됨 · ${new Date(current.savedAt).toLocaleTimeString("ko-KR", {
              hour: "numeric",
              minute: "2-digit",
            })}`
          ) : (
            "아직 저장한 내용이 없습니다"
          )}
        </p>

        {!allLocked ? (
          <div className="flex items-center gap-3">
            {unwritten.length > 0 ? (
              <span className="text-sm text-neutral-500">
                남은 문항 {unwritten.map((draft) => `${draft.question.number}번`).join(", ")}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => void submit()}
              disabled={submitting}
              className="rounded-md bg-neutral-900 px-5 py-2.5 font-medium text-white disabled:opacity-40"
            >
              {submitting ? "제출 중…" : "시험지 제출하기"}
            </button>
          </div>
        ) : null}
      </div>

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
