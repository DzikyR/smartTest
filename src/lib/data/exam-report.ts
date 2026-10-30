import "server-only"
import { db } from "@/lib/db"
import { attemptDeadline, isPastDeadline } from "@/lib/exam/attempt"
import { round2 } from "@/lib/exam/grading"

/**
 * Peserta ujian: semua peserta aktif, atau anggota AKTIF kelompok/kelas terpilih —
 * ditambah siapa pun yang sudah punya percobaan (mis. dikeluarkan dari kelas setelah
 * mengerjakan), agar nilainya tetap muncul di rekap.
 */
export async function examParticipants(exam: { id: string; openToAll: boolean }) {
  return db.user.findMany({
    where: {
      role: "PESERTA",
      isActive: true,
      ...(exam.openToAll
        ? {}
        : { OR: [{ memberships: { some: { status: "ACTIVE", group: { exams: { some: { examId: exam.id } } } } } }, { attempts: { some: { examId: exam.id } } }] }),
    },
    orderBy: [{ name: "asc" }],
    select: { id: true, name: true, username: true, email: true },
    take: 2000,
  })
}

export const DISTRIBUTION_BUCKETS = ["0–9", "10–19", "20–29", "30–39", "40–49", "50–59", "60–69", "70–79", "80–89", "90–100"]

/**
 * Rekap ujian: status tiap peserta (untuk pengawasan langsung), statistik
 * nilai, sebaran nilai, dan analisis butir soal.
 */
export async function loadExamReport(exam: { id: string; openToAll: boolean; durationMinutes: number; timed: boolean; endAt: Date | null; passingScore: number | null }) {
  const [participants, attempts, questions] = await Promise.all([
    examParticipants(exam),
    db.attempt.findMany({
      where: { examId: exam.id },
      orderBy: { attemptNo: "desc" },
      select: {
        id: true,
        userId: true,
        attemptNo: true,
        status: true,
        score: true,
        startedAt: true,
        submittedAt: true,
        extraMinutes: true,
        leaveCount: true,
        lastSavedAt: true,
        deviceTokenHash: true,
        autoSubmitReason: true,
        isLate: true,
        questionScores: true,
        answers: true,
      },
    }),
    db.examQuestion.findMany({ where: { examId: exam.id }, orderBy: [{ order: "asc" }, { id: "asc" }], select: { id: true, type: true, prompt: true, points: true } }),
  ])

  // Peserta yang mengerjakan tetapi sudah tidak terdaftar tetap ditampilkan.
  const known = new Set(participants.map((p) => p.id))
  const extraIds = [...new Set(attempts.map((a) => a.userId).filter((id) => !known.has(id)))]
  const extra = extraIds.length ? await db.user.findMany({ where: { id: { in: extraIds } }, select: { id: true, name: true, username: true, email: true } }) : []

  const now = Date.now()
  const rows = [...participants, ...extra].map((user) => {
    const mine = attempts.filter((a) => a.userId === user.id)
    const running = mine.find((a) => a.status === "IN_PROGRESS") ?? null
    const finals = mine.filter((a) => a.status !== "IN_PROGRESS")
    const graded = finals.filter((a) => a.score !== null)
    const best = graded.length ? Math.max(...graded.map((a) => a.score as number)) : null
    const answered = running ? Object.values((running.answers as Record<string, string> | null) ?? {}).filter((v) => String(v).trim()).length : 0
    return {
      user,
      running: running
        ? { ...running, answered, deadline: attemptDeadline(exam, running), expired: isPastDeadline(exam, running, now) }
        : null,
      latest: finals[0] ?? null,
      attempts: finals.length,
      best,
      leaveCount: Math.max(0, ...mine.map((a) => a.leaveCount)),
      passed: best !== null && exam.passingScore !== null ? best >= exam.passingScore : null,
    }
  })

  const scores = rows.map((r) => r.best).filter((s): s is number => s !== null)
  const stats = scores.length
    ? {
        count: scores.length,
        mean: round2(scores.reduce((a, b) => a + b, 0) / scores.length),
        max: Math.max(...scores),
        min: Math.min(...scores),
        passed: exam.passingScore !== null ? scores.filter((s) => s >= exam.passingScore!).length : null,
      }
    : null
  const distribution = DISTRIBUTION_BUCKETS.map((label, i) => ({ label, count: scores.filter((s) => Math.min(9, Math.floor(s / 10)) === i).length }))

  const scored = attempts.filter((a) => a.status !== "IN_PROGRESS" && a.questionScores && typeof a.questionScores === "object")
  const items = questions.map((q) => {
    const values = scored.map((a) => (a.questionScores as Record<string, number>)[q.id]).filter((v): v is number => typeof v === "number")
    return {
      ...q,
      responses: values.length,
      correctRate: values.length ? round2((values.filter((v) => v >= q.points).length / values.length) * 100) : null,
    }
  })

  return {
    rows,
    stats,
    distribution,
    items,
    notStarted: rows.filter((r) => !r.running && !r.latest).length,
    inProgress: rows.filter((r) => r.running && !r.running.expired).length,
    expired: rows.filter((r) => r.running?.expired).length,
    finished: rows.filter((r) => r.latest).length,
    needsGrading: attempts.filter((a) => a.status === "SUBMITTED").length,
  }
}
