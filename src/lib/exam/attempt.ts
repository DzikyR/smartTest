import "server-only"
import { db } from "@/lib/db"
import { audit } from "@/lib/audit"
import { autoGradeQuiz, quizPercent, type QuizAnswers } from "./grading"

/** Toleransi keterlambatan jaringan saat ujian dikumpulkan otomatis. */
export const ATTEMPT_GRACE_MS = 2 * 60 * 1000

type TimedExam = { durationMinutes: number; endAt: Date | null; timed?: boolean }

/**
 * Batas akhir percobaan (epoch ms): durasi (+ tambahan waktu pengawas) atau jadwal
 * tutup, mana yang lebih dulu. Tanpa durasi (timed=false) dan tanpa jadwal tutup = Infinity.
 */
export function attemptDeadline(exam: TimedExam, attempt: { startedAt: Date; extraMinutes: number }) {
  const byDuration = exam.timed === false ? Infinity : attempt.startedAt.getTime() + (exam.durationMinutes + attempt.extraMinutes) * 60_000
  // Tambahan waktu pengawas juga melonggarkan jadwal tutup untuk peserta itu.
  const byEnd = exam.endAt ? exam.endAt.getTime() + attempt.extraMinutes * 60_000 : null
  return byEnd === null ? byDuration : Math.min(byDuration, byEnd)
}

export function isPastDeadline(exam: TimedExam, attempt: { startedAt: Date; extraMinutes: number }, now = Date.now()) {
  return now > attemptDeadline(exam, attempt) + ATTEMPT_GRACE_MS
}

export function sanitizeAnswers(raw: QuizAnswers, validIds: Set<string>) {
  return Object.fromEntries(Object.entries(raw).filter(([id, v]) => validIds.has(id) && typeof v === "string")) as QuizAnswers
}

/**
 * Mengakhiri percobaan IN_PROGRESS: koreksi otomatis → GRADED (atau SUBMITTED
 * bila ada esai). Lewat batas waktu: jawaban baru dari klien diabaikan, yang
 * dinilai adalah jawaban tersimpan otomatis. null bila sudah dikumpulkan.
 */
export async function finalizeAttempt(opts: {
  attemptId: string
  exam: { id: string; dueAt?: Date | null } & TimedExam
  answers?: QuizAnswers
  flagged?: string[]
  actorId: string
  /** Dicatat bila dikumpulkan otomatis: "LEAVE_LIMIT" | "PROCTOR" | "TIMEOUT" */
  autoReason?: string
}) {
  const attempt = await db.attempt.findFirst({
    where: { id: opts.attemptId, examId: opts.exam.id, status: "IN_PROGRESS" },
    select: { id: true, attemptNo: true, startedAt: true, extraMinutes: true, answers: true, userId: true },
  })
  if (!attempt) return null

  const questions = await db.examQuestion.findMany({ where: { examId: opts.exam.id }, select: { id: true, type: true, points: true, answerKey: true } })
  const valid = new Set(questions.map((q) => q.id))
  const stored = sanitizeAnswers((attempt.answers as QuizAnswers | null) ?? {}, valid)
  const late = isPastDeadline(opts.exam, attempt)
  const answers = opts.answers && !late ? sanitizeAnswers(opts.answers, valid) : stored

  const { scores, pendingEssay } = autoGradeQuiz(questions, answers)
  const score = pendingEssay ? null : quizPercent(questions, scores)
  const now = new Date()
  const updated = await db.attempt.updateMany({
    where: { id: attempt.id, status: "IN_PROGRESS" },
    data: {
      answers,
      questionScores: scores,
      ...(opts.flagged && !late ? { flagged: opts.flagged.filter((id) => valid.has(id)) } : {}),
      status: pendingEssay ? "SUBMITTED" : "GRADED",
      score,
      submittedAt: now,
      gradedAt: pendingEssay ? null : now,
      autoSubmitReason: opts.autoReason ?? (late ? "TIMEOUT" : null),
      // Lewat tenggat tetap diterima (s.d. jadwal tutup), tetapi ditandai terlambat.
      isLate: !!opts.exam.dueAt && now > opts.exam.dueAt,
    },
  })
  if (updated.count === 0) return null
  await audit(opts.autoReason === "PROCTOR" ? "ATTEMPT_FORCE_FINISHED" : "ATTEMPT_SUBMITTED", {
    userId: opts.actorId,
    entity: "Exam",
    entityId: opts.exam.id,
    metadata: { attempt: attempt.attemptNo, late, score, participant: attempt.userId },
  })
  return { score, pendingEssay, late }
}
