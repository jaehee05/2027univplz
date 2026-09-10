"use client";

import { useState } from "react";

import type { Assignment, Correction } from "@/lib/types/work";

/**
 * 선생님이 자기 Claude 구독으로 직접 첨삭하는 화면.
 * 앱이 프롬프트를 만들어 주고, 받아 온 답을 그대로 받아 저장한다. API 를 쓰지 않으니 비용이 0 이다.
 */
export function ManualCorrection({
  assignment,
  onDone,
  onClose,
}: {
  assignment: Assignment;
  onDone: (correction: Correction) => void;
  onClose: () => void;
}) {
  const [prompt, setPrompt] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadPrompt() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/corrections/prompt?assignmentId=${assignment.id}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "프롬프트를 만들지 못했습니다.");
      setPrompt(data.prompt);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "프롬프트를 만들지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!prompt) return;
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function save() {
    if (!pasted.trim()) {
      setError("Claude 가 준 답을 붙여 넣어 주세요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/corrections/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId: assignment.id, pasted }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "저장하지 못했습니다.");
      onDone(data.correction);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-neutral-300 bg-neutral-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="font-semibold">
            직접 첨삭 — {assignment.selfPractice ? "나 (연습)" : assignment.studentName}
          </h4>
          <p className="mt-0.5 text-sm text-neutral-600">
            프롬프트를 복사해 claude.ai 에 붙여 넣고, 받은 답을 아래에 그대로 붙이세요.
            API 를 쓰지 않으니 비용이 들지 않습니다.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-md border border-neutral-300 px-2 py-1 text-xs"
        >
          닫기
        </button>
      </div>

      <ol className="mt-4 space-y-3 text-sm">
        <li>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">1. 프롬프트 만들기</span>
            {prompt ? (
              <>
                <button
                  type="button"
                  onClick={() => void copy()}
                  className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white"
                >
                  {copied ? "복사했습니다" : "복사"}
                </button>
                <span className="text-xs text-neutral-500">
                  {prompt.length.toLocaleString()}자
                </span>
                <a
                  href="https://claude.ai/new"
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs"
                >
                  claude.ai 열기
                </a>
              </>
            ) : (
              <button
                type="button"
                onClick={() => void loadPrompt()}
                disabled={busy}
                className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              >
                {busy ? "만드는 중…" : "프롬프트 만들기"}
              </button>
            )}
          </div>

          {prompt ? (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-neutral-500">
                프롬프트 내용 보기
              </summary>
              <pre className="mt-2 max-h-64 overflow-auto rounded-md border border-neutral-200 bg-white p-3 text-xs whitespace-pre-wrap">
                {prompt}
              </pre>
            </details>
          ) : null}
        </li>

        <li>
          <span className="font-medium">2. Claude 가 준 답 붙여 넣기</span>
          <textarea
            value={pasted}
            onChange={(event) => setPasted(event.target.value)}
            rows={6}
            placeholder='{ "scores": { … } } — 코드 블록째 붙여 넣어도 됩니다.'
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 font-mono text-xs"
          />
        </li>

        <li>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy || !pasted.trim()}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {busy ? "저장 중…" : "3. 첨삭 결과로 저장"}
          </button>
        </li>
      </ol>

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
