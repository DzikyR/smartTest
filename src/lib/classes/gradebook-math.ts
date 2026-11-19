/**
 * Aturan rekap nilai kelas (murni — tanpa database, diuji unit).
 * Nilai memakai skala 0–100 milik Attempt.score agar Tugas & ujian bisa dirata-rata.
 */
import { round2 } from "@/lib/exam/grading"

export type GradebookAttempt = { status: "IN_PROGRESS" | "SUBMITTED" | "GRADED"; score: number | null; submittedAt: Date | null; isLate: boolean; feedback: string | null; submissionUrl?: string | null }

export type CellState = "graded" | "pending" | "missing" | "none"
export type GradeCell = { state: CellState; score: number | null; submittedAt: Date | null; isLate: boolean; feedback: string | null; submissionUrl: string | null }

export const CELL_LABEL: Record<CellState, string> = {
  graded: "Dinilai",
  pending: "Perlu dinilai",
  missing: "Tidak mengumpulkan",
  none: "Belum mengumpulkan",
}

/**
 * Satu sel (mahasiswa × pekerjaan):
 * - dinilai → nilai terbaik dari percobaan yang sudah dinilai;
 * - diserahkan tetapi belum dinilai → "perlu dinilai" (tidak dihitung di rata-rata);
 * - tidak ada pengumpulan & batas (tenggat, atau tutup bila tanpa tenggat) sudah lewat → 0;
 * - selain itu belum ada nilai (tidak dihitung).
 */
export function gradeCell(attempts: GradebookAttempt[], deadline: Date | null, now = new Date()): GradeCell {
  const graded = attempts.filter((a) => a.status === "GRADED" && a.score !== null)
  if (graded.length) {
    const best = graded.reduce((x, y) => (y.score! > x.score! ? y : x))
    return { state: "graded", score: round2(best.score!), submittedAt: best.submittedAt, isLate: best.isLate, feedback: best.feedback, submissionUrl: best.submissionUrl ?? null }
  }
  const submitted = attempts.filter((a) => a.status === "SUBMITTED").sort((x, y) => (y.submittedAt?.getTime() ?? 0) - (x.submittedAt?.getTime() ?? 0))[0]
  if (submitted) return { state: "pending", score: null, submittedAt: submitted.submittedAt, isLate: submitted.isLate, feedback: null, submissionUrl: submitted.submissionUrl ?? null }
  if (deadline && deadline < now) return { state: "missing", score: 0, submittedAt: null, isLate: false, feedback: null, submissionUrl: null }
  return { state: "none", score: null, submittedAt: null, isLate: false, feedback: null, submissionUrl: null }
}

/** Rata-rata sel yang punya nilai (dinilai, atau 0 karena tidak mengumpulkan); null bila belum ada. */
export function averageScore(cells: GradeCell[]) {
  const scored = cells.filter((c) => c.score !== null)
  return scored.length ? round2(scored.reduce((s, c) => s + c.score!, 0) / scored.length) : null
}

/** Poin Tugas dari nilai 0–100 (mis. 80 dari maks. 50 poin → 40). */
export const toPoints = (score: number | null, maxPoints: number | null) => (score === null ? null : round2((score * (maxPoints ?? 100)) / 100))
