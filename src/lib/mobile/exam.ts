import "server-only"
import { z } from "zod"
import { db } from "@/lib/db"
import { audit } from "@/lib/audit"
import type { CurrentUser } from "@/lib/auth/dal"
import { examWindow, getParticipantExam } from "@/lib/data/access"
import { attemptDeadline, finalizeAttempt, isPastDeadline, sanitizeAnswers } from "@/lib/exam/attempt"
import { checkExamEnvironment, OTHER_DEVICE } from "@/lib/exam/guard"
import type { QuizAnswers } from "@/lib/exam/grading"
import type { ExamLayout } from "@/lib/exam/layout"
import { examQuestionIds, examQuestions, type RunnerQuestion } from "@/lib/exam/question-cache"
import { examRules } from "@/lib/exam/rules"
import { sha256Hex } from "@/lib/exam/security"
import type { DeviceBinding, ParticipantExam } from "@/lib/exam/start"
import { ms, type MobileContext } from "./http"
import { verifyAppIntegrity } from "./integrity"
import { sealPackage, type ExamPackage } from "./package"
import { serverKey } from "./token"

/**
 * Lembar ujian untuk aplikasi mobile — memakai mesin ujian yang sama dengan web
 * (tata letak acak, batas waktu, koreksi otomatis, kunci perangkat, batas jaringan).
 * Bedanya hanya transportasi: paket soal terenkripsi diunduh lebih awal, jawaban
 * disimpan sebagai delta bernomor urut (aman diulang saat sinyal putus-nyambung).
 */

export const NOT_FOUND = "Ujian tidak ditemukan atau tidak ditujukan untuk Anda."

export type Failure = { ok: false; status: number; code: string; message: string; extra?: Record<string, unknown> }
const failure = (status: number, code: string, message: string, extra?: Record<string, unknown>): Failure => ({ ok: false, status, code, message, extra })

// ---------------------------------------------------------------------------
// Paket soal (cache per daftar soal: objek dari question-cache dipakai bersama)
// ---------------------------------------------------------------------------

const packages = new WeakMap<RunnerQuestion[], ExamPackage>()

export async function examPackage(examId: string): Promise<ExamPackage> {
  const questions = await examQuestions(examId)
  let pkg = packages.get(questions)
  if (!pkg) {
    pkg = sealPackage(examId, questions, serverKey("exam-package/v1"))
    packages.set(questions, pkg)
  }
  return pkg
}

// ---------------------------------------------------------------------------
// Pengamanan
// ---------------------------------------------------------------------------

/** Kunci perangkat versi aplikasi: hash id perangkat rahasia (bukan cookie). */
export function mobileDevice(deviceId: string): DeviceBinding {
  const hash = sha256Hex(`mobile:${deviceId}`)
  return {
    state: async (attempt) => (!attempt.deviceTokenHash ? "unbound" : attempt.deviceTokenHash === hash ? "match" : "mismatch"),
    bind: async () => hash,
  }
}

export const isMobileClient = (client: string | null | undefined) => client === "android" || client === "ios"

/** Status ketersediaan ujian di aplikasi (untuk daftar & detail). */
export function mobileAvailability(exam: { workType: string; allowMobileApp: boolean; requireSeb: boolean }) {
  if (exam.workType === "ASSIGNMENT") return "web_only" as const // Tugas unggah berkas: tahap berikutnya
  if (!exam.allowMobileApp) return "not_allowed" as const
  if (exam.requireSeb) return "integrity_required" as const
  return "ok" as const
}

/** Jaringan yang diizinkan (sama dengan web). SEB diganti verifikasi integritas aplikasi. */
async function networkCheck(exam: ParticipantExam): Promise<Failure | null> {
  const env = await checkExamEnvironment({ ...exam, requireSeb: false })
  return env.ok ? null : failure(403, "NETWORK", env.message)
}

// ---------------------------------------------------------------------------
// Ringkasan ujian
// ---------------------------------------------------------------------------

export function examSummary(exam: ParticipantExam) {
  return {
    id: exam.id,
    title: exam.title,
    kind: exam.kind,
    category: exam.category?.name ?? null,
    workType: exam.workType,
    subject: { code: exam.subject.code, name: exam.subject.name },
    instructions: exam.instructions,
    startAt: ms(exam.startAt),
    endAt: ms(exam.endAt),
    dueAt: ms(exam.dueAt),
    timed: exam.timed,
    durationMinutes: exam.durationMinutes,
    questionCount: exam._count.questions,
    questionsPerPage: exam.questionsPerPage,
    maxAttempts: exam.maxAttempts,
    maxLeaves: exam.maxLeaves,
    showScore: exam.showScore,
    passingScore: exam.passingScore,
    needsToken: !!exam.token,
    sessionActive: exam.sessionActive,
    window: examWindow(exam),
    mobile: mobileAvailability(exam),
    rules: examRules(exam),
  }
}

// ---------------------------------------------------------------------------
// Percobaan berjalan
// ---------------------------------------------------------------------------

const runningSelect = {
  id: true,
  examId: true,
  status: true,
  startedAt: true,
  extraMinutes: true,
  leaveCount: true,
  deviceTokenHash: true,
  answers: true,
  flagged: true,
  layout: true,
  clientSeq: true,
  client: true,
} as const

async function loadOwnRunning(user: CurrentUser, attemptId: string) {
  const attempt = await db.attempt.findFirst({ where: { id: attemptId, userId: user.id, status: "IN_PROGRESS" }, select: runningSelect })
  if (!attempt) return null
  const exam = await getParticipantExam(user, attempt.examId)
  return exam && exam.workType !== "ASSIGNMENT" ? { attempt, exam } : null
}

type Running = NonNullable<Awaited<ReturnType<typeof loadOwnRunning>>>

/** Percobaan tidak berjalan: sudah dikumpulkan (409 + hasil) atau memang tidak ada (404). */
async function closedOrMissing(user: CurrentUser, attemptId: string): Promise<Failure> {
  const done = await db.attempt.findFirst({
    where: { id: attemptId, userId: user.id },
    select: { status: true, score: true, autoSubmitReason: true, exam: { select: { showScore: true } } },
  })
  // IN_PROGRESS di sini = ujiannya tidak lagi ditujukan ke peserta (mis. dikeluarkan dari kelas).
  if (!done || done.status === "IN_PROGRESS") return failure(404, "NOT_FOUND", "Ujian tidak ditemukan atau sudah dikumpulkan.")
  return failure(409, "ATTEMPT_CLOSED", "Ujian sudah dikumpulkan.", { result: { status: done.status, score: done.exam.showScore ? done.score : null, reason: done.autoSubmitReason } })
}

/** Setara `guard()` lembar ujian web, dijalankan pada setiap simpan & kumpul. */
async function guardRunning(found: Running, ctx: MobileContext): Promise<Failure | null> {
  const net = await networkCheck(found.exam)
  if (net) return net
  if (!ctx.deviceId) return failure(400, "DEVICE_REQUIRED", "Header X-Device-Id wajib diisi.")
  const lock = found.exam.lockDevice || found.exam.requireSeb
  if (lock && (await mobileDevice(ctx.deviceId).state(found.attempt)) === "mismatch") return failure(423, "OTHER_DEVICE", OTHER_DEVICE)
  // Ujian tingkat 2 hanya boleh dilanjutkan dari aplikasi bila dimulai dari aplikasi (lolos verifikasi integritas saat mulai).
  if (found.exam.requireSeb && !isMobileClient(found.attempt.client)) return failure(403, "INTEGRITY_REQUIRED", "Ujian ini dimulai di Safe Exam Browser dan harus diselesaikan di sana.")
  return null
}

/** Keadaan lengkap untuk membuka / melanjutkan lembar ujian di aplikasi. */
export async function attemptState(attemptId: string, exam: ParticipantExam) {
  const attempt = await db.attempt.findUniqueOrThrow({ where: { id: attemptId }, select: runningSelect })
  const pkg = await examPackage(exam.id)
  return {
    attemptId: attempt.id,
    status: attempt.status,
    startedAt: attempt.startedAt.getTime(),
    deadline: ms(attemptDeadline(exam, attempt)),
    now: Date.now(),
    layout: attempt.layout as ExamLayout | null,
    answers: (attempt.answers as QuizAnswers | null) ?? {},
    flagged: (attempt.flagged as string[] | null) ?? [],
    seq: attempt.clientSeq,
    leaveCount: attempt.leaveCount,
    maxLeaves: exam.maxLeaves,
    questionsPerPage: exam.questionsPerPage,
    package: { version: pkg.version, key: pkg.key.toString("base64") },
  }
}

// ---------------------------------------------------------------------------
// Mulai
// ---------------------------------------------------------------------------

/** Pemeriksaan khusus aplikasi sebelum beginAttempt (yang sama dengan web). */
export async function mobileStartCheck(exam: ParticipantExam, ctx: MobileContext, integrityToken: string | undefined): Promise<Failure | null> {
  if (exam.workType === "ASSIGNMENT") return failure(400, "WEB_ONLY", "Tugas dikerjakan dari halaman tugas di web (tulis jawaban/unggah berkas, lalu Serahkan).")
  if (!ctx.deviceId || !ctx.platform) return failure(400, "DEVICE_REQUIRED", "Header X-Device-Id dan X-Platform wajib diisi.")
  if (!exam.allowMobileApp) return failure(403, "MOBILE_NOT_ALLOWED", "Ujian ini tidak dapat dikerjakan dari aplikasi. Gunakan laptop/PC sesuai arahan pengawas.")
  const net = await networkCheck(exam)
  if (net) return net
  if (exam.requireSeb) {
    const integrity = await verifyAppIntegrity({ platform: ctx.platform, token: integrityToken, nonce: `${exam.id}:${ctx.user.id}` })
    if (!integrity.ok) {
      await audit("EXAM_ENV_REJECTED", { userId: ctx.user.id, entity: "Exam", entityId: exam.id, severity: "WARNING", metadata: { code: "INTEGRITY", reason: integrity.reason, client: ctx.platform } })
      return failure(403, "INTEGRITY_REQUIRED", "Ujian tingkat 2 (UTS/UAS) belum dapat dikerjakan dari aplikasi ini. Gunakan Safe Exam Browser di laptop/PC/iPad.")
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Simpan otomatis (delta)
// ---------------------------------------------------------------------------

const answerValue = z.string().max(5000, "Jawaban terlalu panjang")
const questionId = z.string().max(40)

export const saveSchema = z.object({
  /** Naik 1 setiap simpan dari aplikasi; permintaan dengan seq ≤ yang tersimpan tidak menimpa apa pun */
  seq: z.number().int().min(1).max(2_000_000_000),
  /** Jawaban yang berubah sejak simpan terakhir yang berhasil */
  answers: z.record(questionId, answerValue).default({}),
  /** Soal yang jawabannya dihapus peserta */
  cleared: z.array(questionId).max(500).default([]),
  /** Daftar lengkap soal bertanda ragu-ragu (kecil, dikirim utuh) */
  flagged: z.array(questionId).max(500).optional(),
  /** Total keluar aplikasi/split-screen yang tercatat aplikasi — hanya boleh bertambah */
  leaveCount: z.number().int().min(0).max(10_000).optional(),
})

export async function saveDelta(ctx: MobileContext, attemptId: string, body: z.infer<typeof saveSchema>) {
  const user = ctx.user
  for (let tries = 0; tries < 2; tries++) {
    const found = await loadOwnRunning(user, attemptId)
    if (!found) return closedOrMissing(user, attemptId)
    const denied = await guardRunning(found, ctx)
    if (denied) return denied
    const { attempt, exam } = found
    if (isPastDeadline(exam, attempt)) return failure(409, "TIME_UP", "Waktu pengerjaan sudah habis.", { deadline: ms(attemptDeadline(exam, attempt)) })

    const current = { seq: attempt.clientSeq, deadline: ms(attemptDeadline(exam, attempt)), now: Date.now() }
    // Permintaan ulang dari simpan yang sudah berhasil (respons hilang di jaringan): jawab sama.
    if (body.seq === attempt.clientSeq) return { ok: true as const, data: { ...current, savedAt: null, duplicate: true } }
    if (body.seq < attempt.clientSeq) return failure(409, "STALE_SEQ", "Simpanan ini sudah digantikan yang lebih baru.", { seq: attempt.clientSeq })

    const valid = await examQuestionIds(exam.id)
    const merged: QuizAnswers = { ...((attempt.answers as QuizAnswers | null) ?? {}) }
    for (const id of body.cleared) delete merged[id]
    Object.assign(merged, body.answers)
    const answers = sanitizeAnswers(merged, valid)
    const flagged = body.flagged ? body.flagged.filter((id) => valid.has(id)) : undefined
    const leaves = body.leaveCount === undefined ? attempt.leaveCount : Math.min(Math.max(body.leaveCount, attempt.leaveCount), 10_000)
    const savedAt = new Date()

    // Kunci optimistis pada clientSeq: dua simpan bersamaan → yang kalah membaca ulang lalu mencoba lagi.
    const updated = await db.attempt.updateMany({
      where: { id: attempt.id, status: "IN_PROGRESS", clientSeq: attempt.clientSeq },
      data: { answers, ...(flagged ? { flagged } : {}), leaveCount: leaves, lastSavedAt: savedAt, clientSeq: body.seq },
    })
    if (updated.count === 0) continue

    if (exam.maxLeaves && leaves >= exam.maxLeaves) {
      const result = await finalizeAttempt({ attemptId: attempt.id, exam, actorId: user.id, autoReason: "LEAVE_LIMIT" })
      return failure(409, "ATTEMPT_CLOSED", `Batas ${exam.maxLeaves}× meninggalkan aplikasi ujian tercapai — jawaban dikumpulkan otomatis.`, {
        result: { status: result?.pendingEssay ? "SUBMITTED" : "GRADED", score: exam.showScore ? (result?.score ?? null) : null, reason: "LEAVE_LIMIT" },
      })
    }
    // Batas waktu terbaru (pengawas dapat menambah waktu) — satu sumber kebenaran: attemptDeadline.
    return { ok: true as const, data: { seq: body.seq, deadline: current.deadline, now: Date.now(), savedAt: savedAt.getTime(), duplicate: false } }
  }
  return failure(409, "CONFLICT", "Jawaban sedang disimpan dari permintaan lain. Coba lagi.")
}

// ---------------------------------------------------------------------------
// Kumpulkan
// ---------------------------------------------------------------------------

export const submitSchema = z.object({
  seq: z.number().int().min(0).max(2_000_000_000).optional(),
  /** Seluruh jawaban (bukan delta) */
  answers: z.record(questionId, answerValue),
  flagged: z.array(questionId).max(500).default([]),
  leaveCount: z.number().int().min(0).max(10_000).optional(),
})

export async function submitAttempt(ctx: MobileContext, attemptId: string, body: z.infer<typeof submitSchema>) {
  const user = ctx.user
  const found = await loadOwnRunning(user, attemptId)
  // Dikirim ulang setelah berhasil (respons hilang): kembalikan hasil yang sama, bukan error.
  if (!found) {
    const closed = await closedOrMissing(user, attemptId)
    return closed.code === "ATTEMPT_CLOSED" ? { ok: true as const, data: { duplicate: true, ...(closed.extra!.result as object) } } : closed
  }
  const denied = await guardRunning(found, ctx)
  if (denied) return denied
  const { attempt, exam } = found
  if (body.leaveCount !== undefined && body.leaveCount > attempt.leaveCount) {
    await db.attempt.updateMany({ where: { id: attempt.id, status: "IN_PROGRESS" }, data: { leaveCount: Math.min(body.leaveCount, 10_000) } })
  }

  // Lewat batas waktu + toleransi: jawaban kiriman diabaikan, yang dinilai jawaban tersimpan (aturan web).
  const result = await finalizeAttempt({ attemptId, exam, answers: body.answers, flagged: body.flagged, actorId: user.id })
  if (!result) {
    const closed = await closedOrMissing(user, attemptId)
    return closed.code === "ATTEMPT_CLOSED" ? { ok: true as const, data: { duplicate: true, ...(closed.extra!.result as object) } } : closed
  }
  const message = result.late
    ? "Waktu habis — yang dinilai adalah jawaban tersimpan sebelum batas waktu."
    : result.pendingEssay
      ? "Ujian terkumpul. Soal esai menunggu penilaian."
      : exam.showScore
        ? `Ujian terkumpul. Nilai Anda: ${result.score}`
        : "Ujian terkumpul. Nilai akan diumumkan."
  return {
    ok: true as const,
    data: { duplicate: false, status: result.pendingEssay ? "SUBMITTED" : "GRADED", score: exam.showScore ? result.score : null, late: result.late, message },
  }
}
