/**
 * Penilaian — fungsi murni (tanpa database) agar mudah diuji.
 * Semua nilai akhir pengumpulan berskala 0–100.
 */

import type { QuestionType } from "@/generated/prisma/enums"

export type AnswerKey = { optionId?: string; value?: boolean; accepted?: string[] } | null
export type GradableQuestion = { id: string; type: QuestionType; points: number; answerKey: unknown }
/** Jawaban mahasiswa: id pilihan (PG), "true"/"false" (B/S), atau teks (isian/esai). */
export type QuizAnswers = Record<string, string>

export const round2 = (n: number) => Math.round(n * 100) / 100

/** Normalisasi isian singkat: huruf kecil, spasi dirapikan. */
export const normalizeShort = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ")

/**
 * Koreksi otomatis kuis. Soal esai yang dijawab menunggu penilaian dosen
 * (`pendingEssay`); esai kosong langsung bernilai 0.
 */
export function autoGradeQuiz(questions: GradableQuestion[], answers: QuizAnswers) {
  const scores: Record<string, number> = {}
  let pendingEssay = false
  for (const q of questions) {
    const answer = (answers[q.id] ?? "").trim()
    const key = q.answerKey as AnswerKey
    switch (q.type) {
      case "MULTIPLE_CHOICE":
        scores[q.id] = answer !== "" && answer === key?.optionId ? q.points : 0
        break
      case "TRUE_FALSE":
        scores[q.id] = answer !== "" && key?.value !== undefined && answer === String(key.value) ? q.points : 0
        break
      case "SHORT_ANSWER":
        scores[q.id] = answer !== "" && (key?.accepted ?? []).some((a) => normalizeShort(a) === normalizeShort(answer)) ? q.points : 0
        break
      case "ESSAY":
        if (answer === "") scores[q.id] = 0
        else pendingEssay = true
        break
    }
  }
  return { scores, pendingEssay }
}

/** Persentase 0–100 dari poin per soal. Soal tanpa skor dihitung 0. */
export function quizPercent(questions: { id: string; points: number }[], scores: Record<string, number>) {
  const total = questions.reduce((s, q) => s + q.points, 0)
  if (total <= 0) return 0
  const earned = questions.reduce((s, q) => s + Math.min(q.points, Math.max(0, scores[q.id] ?? 0)), 0)
  return round2((earned / total) * 100)
}

/** Nilai rubrik analitik: Σ (bobot kriteria % × skor level). */
export function rubricScore(criteria: { id: string; weight: number }[], levelScores: Record<string, number>) {
  return round2(criteria.reduce((s, c) => s + (c.weight / 100) * (levelScores[c.id] ?? 0), 0))
}
