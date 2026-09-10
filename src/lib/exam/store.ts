import "server-only";

import type { DocumentData, DocumentSnapshot, Timestamp } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase/admin";
import type {
  Analysis,
  Exam,
  Extraction,
  PdfFile,
  Question,
  University,
} from "@/lib/types/exam";

export type PdfKind = "question" | "solution";

export function toIso(value: unknown): string | null {
  const ts = value as Timestamp | undefined;
  return ts?.toDate?.()?.toISOString() ?? null;
}

/* ── 컬렉션 참조 ─────────────────────────────────────────── */

export const universities = () => adminDb().collection("universities");
export const universityRef = (univId: string) => universities().doc(univId);
export const exams = (univId: string) => universityRef(univId).collection("exams");
export const examRef = (univId: string, examId: string) => exams(univId).doc(examId);
export const questions = (univId: string, examId: string) =>
  examRef(univId, examId).collection("questions");
/** 추출한 원문은 따로 둔다 — exam 문서가 1MB 제한에 걸리지 않게. */
export const extractionRef = (univId: string, examId: string, kind: PdfKind) =>
  examRef(univId, examId).collection("extractions").doc(kind);
export const analyses = (univId: string) => universityRef(univId).collection("analyses");
export const analysisRef = (univId: string, analysisId: string) =>
  analyses(univId).doc(analysisId);

/* ── 문서 → DTO ─────────────────────────────────────────── */

function toPdfFile(raw: DocumentData | undefined): PdfFile | null {
  if (!raw) return null;
  return {
    storagePath: raw.storagePath,
    fileName: raw.fileName,
    size: raw.size ?? 0,
    pageFrom: raw.pageFrom ?? null,
    pageTo: raw.pageTo ?? null,
    uploadedAt: toIso(raw.uploadedAt),
    extraction: raw.extraction
      ? ({
          method: raw.extraction.method,
          pages: raw.extraction.pages ?? 0,
          chars: raw.extraction.chars ?? 0,
          // 원문은 extractions 하위 문서에 있다.
          text: "",
          extractedAt: toIso(raw.extraction.extractedAt),
          note: raw.extraction.note ?? undefined,
        } satisfies Extraction)
      : null,
  };
}

export function toUniversity(snap: DocumentSnapshot): University {
  const data = snap.data() ?? {};
  return {
    id: snap.id,
    name: data.name,
    slug: data.slug,
    order: data.order ?? 0,
    active: data.active ?? true,
    manuscriptSpec: data.manuscriptSpec ?? undefined,
    createdAt: toIso(data.createdAt),
  };
}

export function toExam(snap: DocumentSnapshot, univId: string): Exam {
  const data = snap.data() ?? {};
  return {
    id: snap.id,
    univId,
    year: data.year,
    title: data.title,
    session: data.session ?? undefined,
    questionPdf: toPdfFile(data.questionPdf),
    solutionPdf: toPdfFile(data.solutionPdf),
    questionCount: data.questionCount ?? 0,
    analysisStatus: data.analysisStatus ?? "none",
    createdAt: toIso(data.createdAt),
  };
}

export function toQuestion(snap: DocumentSnapshot): Question {
  const data = snap.data() ?? {};
  return {
    id: snap.id,
    number: data.number,
    prompt: data.prompt ?? "",
    passages: data.passages ?? [],
    charTarget: data.charTarget ?? null,
    tolerance: data.tolerance ?? 0.1,
    charMin: data.charMin ?? null,
    charMax: data.charMax ?? null,
    lengthNote: data.lengthNote ?? null,
    points: data.points ?? null,
    answerFormat: data.answerFormat ?? "manuscript",
    modelAnswer: data.modelAnswer ?? null,
    source: data.source ?? "manual",
  };
}

export function toAnalysis(snap: DocumentSnapshot, univId: string): Analysis {
  const data = snap.data() ?? {};
  return {
    id: snap.id,
    univId,
    scope: data.scope ?? "exam",
    questionTypes: data.questionTypes ?? [],
    rubric: data.rubric ?? { items: [], deductions: [] },
    answerStyle: data.answerStyle ?? { structure: "", tone: "", avoid: [] },
    modelAnswerPatterns: data.modelAnswerPatterns ?? [],
    status: data.status ?? "draft",
    version: data.version ?? 1,
    usage: data.usage ?? undefined,
    updatedAt: toIso(data.updatedAt),
    confirmedAt: toIso(data.confirmedAt),
  };
}

/* ── 자주 쓰는 조회 ──────────────────────────────────────── */

export async function listUniversities(): Promise<University[]> {
  const snap = await universities().get();
  return snap.docs.map(toUniversity).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

export async function listExams(univId: string): Promise<Exam[]> {
  const snap = await exams(univId).get();
  return snap.docs
    .map((doc) => toExam(doc, univId))
    .sort((a, b) => b.year - a.year || a.title.localeCompare(b.title));
}

export async function listQuestions(univId: string, examId: string): Promise<Question[]> {
  const snap = await questions(univId, examId).get();
  return snap.docs
    .map(toQuestion)
    .sort((a, b) => a.number.localeCompare(b.number, "ko", { numeric: true }));
}

/** 추출한 원문 전체. 없으면 빈 문자열. */
export async function readExtractedText(
  univId: string,
  examId: string,
  kind: PdfKind,
): Promise<string> {
  const snap = await extractionRef(univId, examId, kind).get();
  return (snap.data()?.text as string | undefined) ?? "";
}
