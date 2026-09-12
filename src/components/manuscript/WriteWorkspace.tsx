"use client";

import { useState } from "react";

import { AnswerWriter } from "@/components/manuscript/AnswerWriter";
import { PaperPane, type PaperQuestion } from "@/components/manuscript/PaperPane";
import type { Passage } from "@/lib/types/exam";
import type { Answer, Assignment } from "@/lib/types/work";

/**
 * 왼쪽 문제지 · 오른쪽 원고지.
 * 문항을 옮겨 다니면 왼쪽 논제도 따라 움직이게, 고른 문항을 여기서 쥔다.
 */
export function WriteWorkspace({
  assignment,
  answers,
  paper,
  passages,
}: {
  assignment: Assignment;
  answers: Answer[];
  paper: { hasPdf: boolean; pageFrom: number | null; pageTo: number | null; version: string };
  passages: Passage[];
}) {
  const [activeId, setActiveId] = useState(
    assignment.questions[0]?.questionId ?? null,
  );

  const questions: PaperQuestion[] = assignment.questions.map((question) => ({
    questionId: question.questionId,
    number: question.number,
    prompt: question.prompt,
  }));

  return (
    <div className="grid min-h-0 flex-1 gap-5 pt-4 xl:grid-cols-[minmax(440px,1fr)_minmax(0,auto)]">
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

      <div className="min-h-0 overflow-y-auto xl:pr-1">
        <AnswerWriter
          assignment={assignment}
          initial={answers}
          onQuestionChange={setActiveId}
        />
      </div>
    </div>
  );
}
