import "server-only"
import { db } from "@/lib/db"
import { audit } from "@/lib/audit"
import type { CurrentUser } from "@/lib/auth/dal"
import { isFeatureEnabled } from "@/lib/features/access"
import { participantSession, sessionWindow } from "@/lib/sessions/access"
import { examWindow, type getParticipantExam } from "@/lib/data/access"
import { prismaCode } from "@/lib/action-result"
import { buildLayout } from "./layout"
import { OTHER_DEVICE } from "./guard"
import { examQuestions } from "./question-cache"

/**
 * Mulai (atau lanjutkan) percobaan — dipakai bersama lembar ujian web (Server Action
 * `startExam`) dan aplikasi mobile (POST /api/v1/mobile/exams/[id]/start), sehingga
 * aturan jadwal, sesi, kesempatan, dan token tidak pernah berbeda antar klien.
 *
 * Pemeriksaan lingkungan (jaringan, Safe Exam Browser / integritas aplikasi) dilakukan
 * pemanggil SEBELUM fungsi ini, karena caranya berbeda untuk browser dan aplikasi.
 */

export type ParticipantExam = NonNullable<Awaited<ReturnType<typeof getParticipantExam>>>

/** Kunci perangkat: web memakai cookie HttpOnly, aplikasi memakai id perangkat rahasia. */
export type DeviceBinding = {
  state(attempt: { id: string; deviceTokenHash: string | null }): Promise<"match" | "unbound" | "mismatch">
  /** Ikat percobaan ke perangkat ini; mengembalikan hash untuk Attempt.deviceTokenHash. */
  bind(attemptId: string): Promise<string>
}

export type StartError = "OTHER_DEVICE" | "FEATURE" | "STOPPED" | "UPCOMING" | "CLOSED" | "SESSION_STOPPED" | "SESSION_UPCOMING" | "SESSION_CLOSED" | "MAX_ATTEMPTS" | "NO_QUESTIONS" | "TOKEN"

export type StartResult =
  | { ok: true; attemptId: string; resumed: boolean }
  | { ok: false; code: StartError; error: string; fieldErrors?: Record<string, string> }

const no = (code: StartError, error: string, fieldErrors?: Record<string, string>): StartResult => ({ ok: false, code, error, fieldErrors })

export async function beginAttempt(
  user: CurrentUser,
  exam: ParticipantExam,
  opts: {
    token?: string
    device: DeviceBinding
    /** Kunci perangkat berlaku (bawaan: pengaturan ujian; aplikasi dapat mewajibkannya untuk ujian tingkat 2) */
    lockDevice?: boolean
    client: "web" | "android" | "ios"
  }
): Promise<StartResult> {
  const examId = exam.id
  const lockDevice = opts.lockDevice ?? exam.lockDevice

  // Lanjutkan percobaan yang sedang berjalan.
  const running = await db.attempt.findFirst({ where: { examId, userId: user.id, status: "IN_PROGRESS" }, select: { id: true, deviceTokenHash: true } })
  if (running) {
    if (lockDevice) {
      const state = await opts.device.state(running)
      if (state === "mismatch") return no("OTHER_DEVICE", OTHER_DEVICE)
      if (state === "unbound") await db.attempt.updateMany({ where: { id: running.id, deviceTokenHash: null }, data: { deviceTokenHash: await opts.device.bind(running.id) } })
    }
    return { ok: true, attemptId: running.id, resumed: true }
  }

  // Hanya percobaan BARU yang diblokir; yang sedang berjalan sudah dilanjutkan di atas.
  if (!(await isFeatureEnabled("ujian.mulai", user.role))) return no("FEATURE", "Memulai ujian baru sedang dinonaktifkan oleh administrator.")
  if (!exam.sessionActive) return no("STOPPED", "Sesi ujian sedang ditutup oleh pengawas.")
  const window = examWindow(exam)
  if (window === "upcoming") return no("UPCOMING", "Ujian belum dibuka.")
  if (window === "closed") return no("CLOSED", "Ujian sudah ditutup.")
  // Jalur umum: jendela sesi mengatur kapan boleh MULAI (setelah mulai, durasi ujian yang berlaku).
  const session = await participantSession(user, examId)
  if (session) {
    const sw = sessionWindow(session)
    if (sw === "stopped") return no("SESSION_STOPPED", "Sesi ujian sedang dihentikan pengawas.")
    if (sw === "upcoming") return no("SESSION_UPCOMING", "Sesi belum dibuka. Tunggu di ruang tunggu sampai waktu mulai.")
    if (sw === "closed") return no("SESSION_CLOSED", "Batas masuk sesi sudah lewat.")
  }
  const done = await db.attempt.count({ where: { examId, userId: user.id } })
  if (done >= exam.maxAttempts) return no("MAX_ATTEMPTS", `Batas ${exam.maxAttempts}× kesempatan sudah tercapai.`)
  if (exam._count.questions === 0) return no("NO_QUESTIONS", "Ujian belum memiliki soal.")

  if (exam.token) {
    const given = (opts.token ?? "").trim().toUpperCase()
    if (given !== exam.token.toUpperCase()) {
      await audit("EXAM_TOKEN_INVALID", { userId: user.id, entity: "Exam", entityId: examId, severity: "WARNING" })
      return no("TOKEN", "Token ujian salah. Minta token kepada pengawas.", { token: "Token tidak sesuai" })
    }
  }

  const questions = await examQuestions(examId) // cache bersama: mulai serentak = satu query per ujian
  const layout = buildLayout(questions, exam)
  // Nomor dari percobaan tertinggi, bukan jumlah: percobaan yang direset pengawas sudah dihapus.
  const last = await db.attempt.aggregate({ where: { examId, userId: user.id }, _max: { attemptNo: true } })
  const attemptNo = (last._max.attemptNo ?? 0) + 1
  let attemptId: string
  try {
    const attempt = await db.attempt.create({ data: { examId, userId: user.id, attemptNo, layout, sessionId: session?.id ?? null, client: opts.client }, select: { id: true } })
    attemptId = attempt.id
    if (lockDevice) await db.attempt.update({ where: { id: attempt.id }, data: { deviceTokenHash: await opts.device.bind(attempt.id) } })
  } catch (e) {
    if (prismaCode(e) !== "P2002") throw e
    // Klik ganda / permintaan ulang: percobaan yang dibuat permintaan pertama dilanjutkan.
    const other = await db.attempt.findFirst({ where: { examId, userId: user.id, status: "IN_PROGRESS" }, select: { id: true } })
    if (!other) throw e
    return { ok: true, attemptId: other.id, resumed: true }
  }
  await audit("EXAM_STARTED", { userId: user.id, entity: "Exam", entityId: examId, metadata: { attempt: attemptNo, client: opts.client } })
  return { ok: true, attemptId, resumed: false }
}
