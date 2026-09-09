/** 대학 · 기출 · 문항 · 채점 기준 타입. 서버와 클라이언트가 함께 쓴다. */

import type { ManuscriptSpec } from "@/lib/manuscript/spec";

export interface University {
  id: string;
  name: string;
  /** URL·파일 경로에 쓰는 영문 약칭 */
  slug: string;
  order: number;
  active: boolean;
  /** 대학별 원고지 규격 덮어쓰기 (없으면 기본 규격) */
  manuscriptSpec?: Partial<ManuscriptSpec>;
  createdAt: string | null;
}

/** PDF 한 개의 저장 · 추출 상태 */
export interface PdfFile {
  storagePath: string;
  fileName: string;
  size: number;
  uploadedAt: string | null;
  extraction: Extraction | null;
}

export type ExtractionMethod = "pdfjs" | "claude";

export interface Extraction {
  /** pdfjs 로 뽑았는지, 스캔본이라 Claude 에 그림째 넘겼는지 */
  method: ExtractionMethod;
  pages: number;
  chars: number;
  text: string;
  extractedAt: string | null;
  /** 폴백 사유 등 관리 화면에 보여 줄 메모 */
  note?: string;
}

export interface Exam {
  id: string;
  univId: string;
  year: number;
  title: string;
  /** 오전/오후, 인문(1)/인문(2) 같은 구분 */
  session?: string;
  questionPdf: PdfFile | null;
  solutionPdf: PdfFile | null;
  questionCount: number;
  analysisStatus: AnalysisStatus;
  createdAt: string | null;
}

export type AnswerFormat = "manuscript" | "free";

export interface Question {
  id: string;
  /** 문제지에 적힌 번호 그대로 — "1", "2-1" 등 */
  number: string;
  /** 논제(문제에서 요구하는 것) */
  prompt: string;
  /** 제시문 — 가/나/다 … */
  passages: Passage[];
  /** "600자 내외" 의 600. 조건이 없으면 null */
  charTarget: number | null;
  /** 허용 오차 비율. 0.1 이면 ±10% */
  tolerance: number;
  /** 원문에 적힌 분량 조건 문구 그대로 */
  lengthNote: string | null;
  points: number | null;
  answerFormat: AnswerFormat;
  modelAnswer: string | null;
  /** Claude 가 뽑았는지 선생님이 직접 넣었는지 */
  source: "parsed" | "manual";
}

export interface Passage {
  label: string;
  text: string;
}

export type AnalysisStatus = "none" | "draft" | "confirmed";

export interface RubricItem {
  id: string;
  /** 채점 항목 이름 — "논지 파악", "제시문 활용" 등 */
  name: string;
  /** 100점 만점 기준 배점 */
  points: number;
  description: string;
  /** 만점·감점 판단 근거 */
  criteria: string[];
  /** 해설에 없어 모범답안에서 추론한 항목 */
  inferred: boolean;
}

export interface Deduction {
  name: string;
  points: number;
  description: string;
  inferred: boolean;
}

export interface AnswerStyle {
  /** 서론-본론-결론 요구 여부 등 구조 지침 */
  structure: string;
  /** 문체 · 어조 */
  tone: string;
  /** 자주 지적되는 금지 사항 */
  avoid: string[];
}

export interface QuestionType {
  name: string;
  description: string;
  /** 이 유형에서 자주 나오는 지시어 */
  cues: string[];
}

export interface Analysis {
  id: string;
  univId: string;
  /** 'exam' 이면 id 가 examId, 'aggregate' 면 대학 통합본 */
  scope: "exam" | "aggregate";
  questionTypes: QuestionType[];
  rubric: {
    items: RubricItem[];
    deductions: Deduction[];
  };
  answerStyle: AnswerStyle;
  modelAnswerPatterns: string[];
  status: Exclude<AnalysisStatus, "none">;
  version: number;
  /** 분석에 쓴 모델 · 토큰 */
  usage?: { model: string; inputTokens: number; outputTokens: number };
  updatedAt: string | null;
  confirmedAt: string | null;
}

export const RUBRIC_TOTAL = 100;

/** 배점 합계가 100 인지 확인한다. UI 와 저장 검증에서 함께 쓴다. */
export function rubricTotal(items: RubricItem[]): number {
  return items.reduce((sum, item) => sum + (Number(item.points) || 0), 0);
}
