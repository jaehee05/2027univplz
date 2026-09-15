/**
 * 학생 화면이 쓰는 집계. 서버 컴포넌트에서 한 번 계산해 내려보낸다.
 * 채점은 문항마다 100점이라 문항 점수를 그대로 평균 낸다 — 시험지 점수를 합치지 않는다.
 */

import { totalScore, type Answer, type Assignment, type Correction } from "@/lib/types/work";

export interface QuestionProgress {
  questionId: string;
  number: string;
  charTarget: number | null;
  charCount: number;
  submitted: boolean;
  /** 목표 분량 대비 얼마나 썼는지 (0~1). 분량 조건이 없으면 null */
  ratio: number | null;
}

export function questionProgress(
  assignment: Assignment,
  answerRows: Answer[],
): QuestionProgress[] {
  return assignment.questions.map((question) => {
    const answer = answerRows.find((row) => row.questionId === question.questionId) ?? null;
    const charCount = answer?.charCount ?? 0;
    return {
      questionId: question.questionId,
      number: question.number,
      charTarget: question.charTarget,
      charCount,
      submitted: answer?.status === "submitted",
      ratio: question.charTarget ? Math.min(1, charCount / question.charTarget) : null,
    };
  });
}

/** 시험지 하나를 얼마나 썼는지 (0~1). 분량 조건이 없는 문항은 쓰기 시작했으면 1로 본다. */
export function assignmentProgress(rows: QuestionProgress[]): number {
  if (rows.length === 0) return 0;
  const sum = rows.reduce(
    (acc, row) => acc + (row.ratio ?? (row.charCount > 0 ? 1 : 0)),
    0,
  );
  return sum / rows.length;
}

export interface StudentStats {
  /** 공개된 첨삭의 문항 평균 점수. 아직 없으면 null */
  average: number | null;
  /** 첨삭이 끝난 문항 수 — "몇 편 썼는지" */
  gradedCount: number;
  /**
   * 최근 시험지 평균이 그 앞 시험지 평균보다 얼마나 올랐는지.
   * 견줄 시험지가 둘 미만이면 null.
   */
  delta: number | null;
}

export function studentStats(
  assignments: Assignment[],
  corrections: Map<string, Correction[]>,
): StudentStats {
  /** 공개된 첨삭만 학생 통계에 넣는다 — 학생이 못 본 점수를 평균에 섞지 않는다. */
  const graded = assignments
    .map((assignment) => ({
      assignment,
      scores: (corrections.get(assignment.id) ?? [])
        .filter((row) => row.status === "done" && row.published)
        .map((row) => totalScore(row.scores)),
    }))
    .filter((row) => row.scores.length > 0);

  const all = graded.flatMap((row) => row.scores);
  if (all.length === 0) return { average: null, gradedCount: 0, delta: null };

  const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

  // 오래된 것부터 늘어놓아 마지막 둘을 견준다.
  const ordered = [...graded].sort((a, b) =>
    (a.assignment.submittedAt ?? a.assignment.createdAt ?? "").localeCompare(
      b.assignment.submittedAt ?? b.assignment.createdAt ?? "",
    ),
  );

  const delta =
    ordered.length >= 2
      ? Math.round(
          mean(ordered[ordered.length - 1].scores) - mean(ordered[ordered.length - 2].scores),
        )
      : null;

  return { average: Math.round(mean(all)), gradedCount: all.length, delta };
}

/** 마감까지 남은 날. 지났으면 음수. 마감이 없으면 null */
export function daysLeft(iso: string | null): number | null {
  if (!iso) return null;
  const due = new Date(iso);
  due.setHours(23, 59, 59, 999);
  return Math.ceil((due.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

export function dueLabel(iso: string | null): { text: string; urgent: boolean } | null {
  const days = daysLeft(iso);
  if (days == null) return null;
  const date = new Date(iso!).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
  if (days < 0) return { text: `${date} 마감 지남`, urgent: true };
  if (days === 0) return { text: "오늘까지", urgent: true };
  if (days === 1) return { text: "내일까지", urgent: true };
  return { text: `D-${days} · ${date}`, urgent: days <= 3 };
}
