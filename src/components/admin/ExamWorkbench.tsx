"use client";

import { useState } from "react";

import { AssignPanel } from "@/components/admin/AssignPanel";
import { PdfPanel } from "@/components/admin/PdfPanel";
import { QuestionEditor } from "@/components/admin/QuestionEditor";
import { RubricEditor } from "@/components/admin/RubricEditor";
import type { Analysis, Exam, Question } from "@/lib/types/exam";
import type { StudentRow } from "@/lib/types/work";

interface Props {
  exam: Exam;
  questions: Question[];
  analysis: Analysis | null;
  students: StudentRow[];
  teacherUid: string;
}

export function ExamWorkbench({
  exam: initialExam,
  questions,
  analysis,
  students,
  teacherUid,
}: Props) {
  const [exam, setExam] = useState(initialExam);
  const [saved, setSaved] = useState(questions);
  const [confirmed, setConfirmed] = useState(analysis?.status === "confirmed");

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
        onSaved={(next) => {
          setSaved(next);
          setExam((prev) => ({ ...prev, questionCount: next.length }));
        }}
      />

      <RubricEditor
        univId={exam.univId}
        examId={exam.id}
        initial={analysis}
        onStatus={(status) => {
          setConfirmed(status === "confirmed");
          setExam((prev) => ({ ...prev, analysisStatus: status }));
        }}
      />

      <AssignPanel
        univId={exam.univId}
        examId={exam.id}
        questions={saved}
        students={students}
        analysisConfirmed={confirmed}
        teacherUid={teacherUid}
      />
    </div>
  );
}
