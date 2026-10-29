import type { ExamKind, QuestionType, SubjectType } from "@/generated/prisma/enums"

export const SUBJECT_TYPE_LABEL: Record<SubjectType, string> = { MATA_KULIAH: "Mata Kuliah", UMUM: "Umum" }

export const EXAM_KIND_LABEL: Record<ExamKind, string> = {
  KUIS: "Kuis",
  UTS: "UTS",
  UAS: "UAS",
  TRYOUT: "Try Out",
  LATIHAN: "Latihan",
  LAINNYA: "Lainnya",
}

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  MULTIPLE_CHOICE: "Pilihan ganda",
  TRUE_FALSE: "Benar / Salah",
  SHORT_ANSWER: "Isian singkat",
  ESSAY: "Esai",
}

export const QUESTION_TYPE_SHORT: Record<QuestionType, string> = { MULTIPLE_CHOICE: "PG", TRUE_FALSE: "BS", SHORT_ANSWER: "Isian", ESSAY: "Esai" }

export const DIFFICULTY_LABEL: Record<number, string> = { 1: "Mudah", 2: "Sedang", 3: "Sulit" }

/** UTS/UAS memakai pengamanan tingkat 2 (Safe Exam Browser) secara bawaan. */
export const isHighStakes = (kind: ExamKind | string) => kind === "UTS" || kind === "UAS"
