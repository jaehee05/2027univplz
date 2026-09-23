"use client";

import { useState } from "react";

import { AnswerWriter } from "@/components/manuscript/AnswerWriter";
import { PaperPane, type PaperQuestion } from "@/components/manuscript/PaperPane";
import type { Passage } from "@/lib/types/exam";
import type { Answer, Assignment } from "@/lib/types/work";

/**
 * 넓은 화면은 왼쪽 문제지 · 오른쪽 원고지로 나란히 둔다.
 * 좁은 화면은 둘을 나란히 놓을 폭이 없어 위 단추로 오간다 — 원고지가 38칸이라
 * 반으로 쪼개면 칸이 읽히지 않는다.
 *
 * 문항을 옮겨 다니면 왼쪽 논제도 따라 움직이게, 고른 문항을 여기서 쥔다.
 */
export function WriteWorkspace({
  assignment,
  answers,
  paper,
  passages,
  canTranscribe = false,
}: {
  assignment: Assignment;
  /** 선생님 — 학생 원고지를 칸 그대로 옮겨 넣을 수 있다 */
  canTranscribe?: boolean;
  answers: Answer[];
  paper: { hasPdf: boolean; pageFrom: number | null; pageTo: number | null; version: string };
  passages: Passage[];
}) {
  const [activeId, setActiveId] = useState(assignment.questions[0]?.questionId ?? null);
  const [pane, setPane] = useState<"paper" | "write">("write");

  const questions: PaperQuestion[] = assignment.questions.map((question) => ({
    questionId: question.questionId,
    number: question.number,
    prompt: question.prompt,
  }));

  return (
    <div className="flex min-h-0 flex-1 flex-col pt-3">
      {/* 좁은 화면 전용 — 문제지와 답안을 오간다 */}
      <div className="mb-3 flex rounded-lg border border-neutral-300 bg-white p-0.5 text-sm xl:hidden">
        {(
          [
            ["paper", "문제지"],
            ["write", "답안 쓰기"],
          ] as const
        ).map(([value, text]) => (
          <button
            key={value}
            type="button"
            onClick={() => setPane(value)}
            className={[
              "flex-1 rounded-md py-2 font-medium transition",
              pane === value ? "bg-neutral-900 text-white" : "text-neutral-600",
            ].join(" ")}
          >
            {text}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 gap-5 xl:grid-cols-[minmax(440px,1fr)_minmax(0,auto)]">
        <div className={pane === "paper" ? "min-h-0" : "hidden min-h-0 xl:block"}>
          <PaperPane
            assignmentId={assignment.id}
            questions={questions}
            activeQuestionId={activeId}
            passages={passages}
            hasPdf={paper.hasPdf}
            pageFrom={paper.pageFrom}
            pageTo={paper.pageTo}
            version={paper.version}
          />
        </div>

        <div
          className={[
            "min-h-0 overflow-y-auto xl:pr-1",
            pane === "write" ? "" : "hidden xl:block",
          ].join(" ")}
        >
          <AnswerWriter
            assignment={assignment}
            initial={answers}
            canTranscribe={canTranscribe}
            onQuestionChange={setActiveId}
          />
        </div>
      </div>
    </div>
  );
}
