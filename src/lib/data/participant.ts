import "server-only"
import { db } from "@/lib/db"
import type { CurrentUser } from "@/lib/auth/dal"
import { examWindow, visibleExams } from "./access"

export type ParticipantExamState = "running" | "available" | "upcoming" | "done" | "missed"

/** Ujian yang terlihat oleh peserta beserta status pengerjaannya (opsional: hanya yang ditujukan ke satu kelas). */
export async function participantExams(user: CurrentUser, filter: { groupId?: string } = {}) {
  const exams = await db.exam.findMany({
    where: { AND: [visibleExams(user), filter.groupId ? { groups: { some: { groupId: filter.groupId } } } : {}] },
    orderBy: [{ startAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
    select: {
      id: true,
      title: true,
      kind: true,
      category: { select: { name: true } },
      workType: true,
      dueAt: true,
      timed: true,
      durationMinutes: true,
      startAt: true,
      endAt: true,
      maxAttempts: true,
      sessionActive: true,
      showScore: true,
      passingScore: true,
      requireSeb: true,
      subject: { select: { code: true, name: true, type: true } },
      _count: { select: { questions: true } },
      attempts: { where: { userId: user.id }, select: { status: true, score: true, submittedAt: true } },
    },
  })
  const now = new Date()
  return exams.map(({ attempts, ...exam }) => {
    const finals = attempts.filter((a) => a.status !== "IN_PROGRESS")
    const scores = exam.showScore ? finals.filter((a) => a.score !== null).map((a) => a.score as number) : []
    const window = examWindow(exam, now)
    const state: ParticipantExamState = attempts.some((a) => a.status === "IN_PROGRESS")
      ? "running"
      : window === "upcoming"
        ? "upcoming"
        : finals.length > 0 && (finals.length >= exam.maxAttempts || window === "closed")
          ? "done"
          : window === "closed"
            ? "missed"
            : "available"
    return { ...exam, state, attempts: finals.length, best: scores.length ? Math.max(...scores) : null, pendingScore: finals.length > 0 && scores.length === 0 }
  })
}
