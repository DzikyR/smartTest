import "server-only"
import { db } from "@/lib/db"
import { attemptDeadline, isPastDeadline } from "@/lib/exam/attempt"
import { countAnswered, isRunningState, liveState, RECENT_FINISHED_MS, STATE_ORDER, type LiveState } from "@/lib/exam/monitoring"

/** Batas aman satu tampilan (beban uji: 1.000 peserta serentak). */
const MAX_ROWS = 5000

const ATTEMPT_SELECT = {
  id: true,
  examId: true,
  userId: true,
  attemptNo: true,
  status: true,
  startedAt: true,
  submittedAt: true,
  lastSavedAt: true,
  extraMinutes: true,
  leaveCount: true,
  answers: true,
  score: true,
  isLate: true,
  autoSubmitReason: true,
  session: { select: { name: true } },
  user: { select: { id: true, name: true, username: true, email: true } },
} as const

/**
 * Peserta yang sedang mengerjakan ujian (lintas ujian) ditambah yang baru selesai
 * (≤ 3 jam, untuk melihat nilai/pelanggaran dan reset), untuk Admin/Super Admin.
 * Draf Tugas (ASSIGNMENT) bukan ujian berjalan, jadi tidak ikut. Satu baris per
 * peserta per ujian: percobaan terakhirnya (hanya itu yang boleh direset).
 */
export async function loadLiveMonitoring() {
  const quiz = { workType: { not: "ASSIGNMENT" as const } }
  const since = new Date(Date.now() - RECENT_FINISHED_MS)
  const [running, finished] = await Promise.all([
    db.attempt.findMany({ where: { status: "IN_PROGRESS", exam: quiz }, orderBy: { startedAt: "asc" }, take: MAX_ROWS, select: ATTEMPT_SELECT }),
    db.attempt.findMany({ where: { status: { not: "IN_PROGRESS" }, submittedAt: { gte: since }, exam: quiz }, orderBy: { submittedAt: "desc" }, take: MAX_ROWS, select: ATTEMPT_SELECT }),
  ])

  const latest = new Map<string, (typeof running)[number]>()
  for (const a of [...running, ...finished]) {
    const key = `${a.examId}:${a.userId}`
    const seen = latest.get(key)
    if (!seen || a.attemptNo > seen.attemptNo) latest.set(key, a)
  }
  const attempts = [...latest.values()]

  const examIds = [...new Set(attempts.map((a) => a.examId))]
  const [exams, done] = examIds.length
    ? await Promise.all([
        db.exam.findMany({
          where: { id: { in: examIds } },
          select: {
            id: true,
            title: true,
            durationMinutes: true,
            timed: true,
            endAt: true,
            maxLeaves: true,
            subject: { select: { code: true, name: true } },
            _count: { select: { questions: true } },
          },
        }),
        db.attempt.groupBy({ by: ["examId"], where: { examId: { in: examIds }, status: { not: "IN_PROGRESS" } }, _count: { _all: true } }),
      ])
    : [[], []]

  const examById = new Map(exams.map((e) => [e.id, e]))
  const now = Date.now()
  const rows = attempts.flatMap((a) => {
    const exam = examById.get(a.examId)
    if (!exam) return []
    const isRunning = a.status === "IN_PROGRESS"
    const lastSeen = (a.lastSavedAt ?? a.startedAt).getTime()
    const state: LiveState = isRunning ? liveState({ lastSeen, expired: isPastDeadline(exam, a, now) }, now) : "selesai"
    return [
      {
        id: a.id,
        user: a.user,
        exam,
        session: a.session?.name ?? null,
        attemptNo: a.attemptNo,
        status: a.status,
        startedAt: a.startedAt,
        submittedAt: a.submittedAt,
        remaining: isRunning ? attemptDeadline(exam, a) - now : 0,
        lastSeenAgo: now - lastSeen,
        answered: countAnswered(a.answers),
        leaveCount: a.leaveCount,
        score: a.score,
        isLate: a.isLate,
        autoLeave: a.autoSubmitReason === "LEAVE_LIMIT",
        state,
      },
    ]
  })
  rows.sort((x, y) => STATE_ORDER[x.state] - STATE_ORDER[y.state] || x.user.name.localeCompare(y.user.name, "id"))

  const doneByExam = new Map(done.map((f) => [f.examId, f._count._all]))
  const summary = exams
    .map((exam) => {
      const mine = rows.filter((r) => r.exam.id === exam.id)
      const by = (s: LiveState) => mine.filter((r) => r.state === s).length
      return {
        exam,
        running: mine.filter((r) => isRunningState(r.state)).length,
        online: by("online"),
        lambat: by("lambat"),
        putus: by("putus"),
        habis: by("habis"),
        violations: mine.filter((r) => r.leaveCount > 0).length,
        finished: doneByExam.get(exam.id) ?? 0,
      }
    })
    .sort((x, y) => y.running - x.running || x.exam.title.localeCompare(y.exam.title, "id"))

  return { rows, summary, truncated: running.length === MAX_ROWS || finished.length === MAX_ROWS, now }
}

export type LiveRow = Awaited<ReturnType<typeof loadLiveMonitoring>>["rows"][number]
