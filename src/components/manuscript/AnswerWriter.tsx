"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { ManuscriptEditor } from "@/components/manuscript/ManuscriptEditor";
import { layoutManuscript } from "@/lib/manuscript/layout";
import { DEFAULT_SPEC, type LengthRule } from "@/lib/manuscript/spec";
import type { Answer, Assignment } from "@/lib/types/work";

const SAVE_DELAY = 1500;

export function AnswerWriter({
  assignment,
  initial,
}: {
  assignment: Assignment;
  initial: Answer;
}) {
  const router = useRouter();
  const [text, setText] = useState(initial.text);
  const [savedText, setSavedText] = useState(initial.text);
  const [savedAt, setSavedAt] = useState<string | null>(initial.updatedAt);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const locked = initial.status === "submitted";
  const lengthRule: LengthRule | null = assignment.charTarget
    ? {
        target: assignment.charTarget,
        tolerance: assignment.tolerance,
        min: assignment.charMin,
        max: assignment.charMax,
      }
    : null;

  const save = useCallback(
    async (value: string) => {
      const layout = layoutManuscript(value, DEFAULT_SPEC);
      setSaving(true);
      try {
        const response = await fetch(`/api/answers/${initial.id}`, {
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
        setSavedText(value);
        setSavedAt(data.savedAt);
        setError(null);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "저장에 실패했습니다.");
      } finally {
        setSaving(false);
      }
    },
    [initial.id],
  );

  // 글을 멈추면 잠시 뒤 자동 저장한다.
  useEffect(() => {
    if (locked || text === savedText) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(text), SAVE_DELAY);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [locked, save, savedText, text]);

  // 저장되지 않은 채로 나가려 하면 붙잡는다.
  useEffect(() => {
    if (locked) return;
    function warn(event: BeforeUnloadEvent) {
      if (text !== savedText) event.preventDefault();
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [locked, savedText, text]);

  async function submit() {
    const layout = layoutManuscript(text, DEFAULT_SPEC);
    const count = layout.countWithSpace;
    if (count === 0) {
      setError("답안이 비어 있습니다.");
      return;
    }
    if (
      !confirm(
        `${count}자로 제출할까요?\n제출한 뒤에는 고칠 수 없고, 선생님이 첨삭한 뒤 결과가 공개됩니다.`,
      )
    ) {
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      if (text !== savedText) await save(text);
      const response = await fetch(`/api/answers/${initial.id}/submit`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "제출에 실패했습니다.");
      router.push("/dashboard");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "제출에 실패했습니다.");
      setSubmitting(false);
    }
  }

  return (
    <div>
      <ManuscriptEditor
        value={text}
        onChange={setText}
        spec={DEFAULT_SPEC}
        lengthRule={lengthRule}
        label={`문제 ${assignment.questionNumber}`}
        readOnly={locked}
      />

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 pt-4">
        <p className="text-sm text-neutral-500">
          {locked ? (
            "제출을 마쳤습니다. 선생님이 첨삭하면 결과가 보입니다."
          ) : saving ? (
            "저장 중…"
          ) : text !== savedText ? (
            "저장하지 않은 내용이 있습니다"
          ) : savedAt ? (
            `저장됨 · ${new Date(savedAt).toLocaleTimeString("ko-KR", {
              hour: "numeric",
              minute: "2-digit",
            })}`
          ) : (
            "아직 저장한 내용이 없습니다"
          )}
        </p>

        {!locked ? (
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting}
            className="rounded-md bg-neutral-900 px-5 py-2.5 font-medium text-white disabled:opacity-40"
          >
            {submitting ? "제출 중…" : "제출하기"}
          </button>
        ) : null}
      </div>

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
