"use client";

import { useState } from "react";

import { PdfPanel } from "@/components/admin/PdfPanel";
import { QuestionEditor } from "@/components/admin/QuestionEditor";
import { RubricEditor } from "@/components/admin/RubricEditor";
import type { Analysis, Exam, Question } from "@/lib/types/exam";

interface Props {
  exam: Exam;
  questions: Question[];
  analysis: Analysis | null;
}

export function ExamWorkbench({ exam: initialExam, questions, analysis }: Props) {
  const [exam, setExam] = useState(initialExam);

  return (
    <div className="mt-6 space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <PdfPanel
          univId={exam.univId}
          examId={exam.id}
          kind="question"
          pdf={exam.questionPdf}
          onExam={setExam}
        />
        <PdfPanel
          univId={exam.univId}
          examId={exam.id}
          kind="solution"
          pdf={exam.solutionPdf}
          onExam={setExam}
        />
      </div>

      <QuestionEditor
        univId={exam.univId}
        examId={exam.id}
        initial={questions}
        onSaved={(saved) => setExam((prev) => ({ ...prev, questionCount: saved.length }))}
      />

      <RubricEditor
        univId={exam.univId}
        examId={exam.id}
        initial={analysis}
        onStatus={(status) => setExam((prev) => ({ ...prev, analysisStatus: status }))}
      />
    </div>
  );
}
