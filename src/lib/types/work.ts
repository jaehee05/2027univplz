/** 학생 · 과제 · 답안 · 첨삭 타입. */

export type AssignmentStatus =
  | "assigned" // 내줬고 아직 손대지 않음
  | "writing" // 쓰는 중 (자동 저장됨)
  | "submitted" // 제출함
  | "correcting" // 첨삭 돌리는 중
  | "corrected" // 첨삭 끝, 선생님 확인 대기
  | "published"; // 학생에게 공개함

export const ASSIGNMENT_LABEL: Record<AssignmentStatus, string> = {
  assigned: "시작 전",
  writing: "쓰는 중",
  submitted: "제출함",
  correcting: "첨삭 중",
  corrected: "첨삭 완료",
  published: "공개함",
};

export interface StudentRow {
  uid: string;
  email: string;
  displayName: string;
  active: boolean;
  createdAt: string | null;
  /** 목록에서 바로 보여 줄 집계 */
  assignmentCount: number;
  submittedCount: number;
}

/** 과제에 복사해 둔 문항 하나. 기출을 나중에 고쳐도 이미 내준 과제는 그대로여야 한다. */
export interface AssignmentQuestion {
  questionId: string;
  /** 문제지에 적힌 번호 그대로 */
  number: string;
  prompt: string;
  charTarget: number | null;
  tolerance: number;
  /** 문제지가 범위를 못 박은 경우. 없으면 tolerance 로 계산한다. */
  charMin: number | null;
  charMax: number | null;
  points: number | null;
}

/**
 * 과제 하나 = 시험지 하나. 그 시험지의 문항을 전부 낸다.
 * 답안과 첨삭은 문항마다 따로 있고(`answers` · `corrections` 의 questionId),
 * 제출과 공개는 시험지 단위로 한꺼번에 한다.
 */
export interface Assignment {
  id: string;
  studentId: string;
  studentName: string;
  univId: string;
  univName: string;
  examId: string;
  examTitle: string;
  /** 문제지에 실린 차례 그대로 */
  questions: AssignmentQuestion[];
  assignedBy: string;
  /** 선생님이 자기에게 낸 연습 과제인지 */
  selfPractice: boolean;
  dueAt: string | null;
  status: AssignmentStatus;
  submittedAt: string | null;
  createdAt: string | null;
}

export interface Answer {
  id: string;
  assignmentId: string;
  /** 이 답안이 어느 문항의 것인지 */
  questionId: string;
  studentId: string;
  text: string;
  charCount: number;
  charCountNoSpace: number;
  status: "draft" | "submitted";
  updatedAt: string | null;
  submittedAt: string | null;
}

export type CorrectionStatus = "queued" | "running" | "done" | "error";

export interface ScoreItem {
  id: string;
  name: string;
  points: number;
  awarded: number;
  reason: string;
}

export interface AppliedDeduction {
  name: string;
  points: number;
  reason: string;
}

/** 원문 문자 오프셋으로 위치를 잡는다. 원고지 칸 좌표는 그릴 때 계산한다. */
export interface InlineComment {
  start: number;
  end: number;
  severity: "good" | "info" | "warning" | "error";
  category: string;
  message: string;
  suggestion: string | null;
}

export interface CorrectionOverall {
  summary: string;
  strengths: string[];
  improvements: string[];
  nextSteps: string[];
}

export interface Correction {
  id: string;
  answerId: string;
  assignmentId: string;
  studentId: string;
  univId: string;
  examId: string;
  questionId: string;
  status: CorrectionStatus;
  scores: {
    items: ScoreItem[];
    deductions: AppliedDeduction[];
    total: number;
  };
  inlineComments: InlineComment[];
  overall: CorrectionOverall;
  revisedExample: string;
  /** 선생님이 점수·코멘트를 고쳤는지 */
  teacherEdited: boolean;
  published: boolean;
  error: string | null;
  usage?: { model: string; inputTokens: number; outputTokens: number };
  createdAt: string | null;
  updatedAt: string | null;
  publishedAt: string | null;
}

/** 감점까지 반영한 총점. 0 아래로는 내려가지 않는다. */
export function totalScore(scores: Correction["scores"]): number {
  const earned = scores.items.reduce((sum, item) => sum + (Number(item.awarded) || 0), 0);
  const lost = scores.deductions.reduce((sum, item) => sum + (Number(item.points) || 0), 0);
  return Math.max(0, Math.round(earned - lost));
}

export const SEVERITY_LABEL: Record<InlineComment["severity"], string> = {
  good: "좋음",
  info: "참고",
  warning: "고칠 점",
  error: "문제",
};
