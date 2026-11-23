"use server"

import { refresh } from "next/cache"
import { z } from "zod"
import { db } from "@/lib/db"
import { audit } from "@/lib/audit"
import { requireRole, type CurrentUser } from "@/lib/auth/dal"
import { rateLimit } from "@/lib/rate-limit"
import { getParticipantExam } from "@/lib/data/access"
import { fail, ok, type ActionResult } from "@/lib/action-result"
import { attemptDeadline, finalizeAttempt, isPastDeadline, sanitizeAnswers } from "@/lib/exam/attempt"
import { bindDevice, checkExamEnvironment, deviceState, OTHER_DEVICE } from "@/lib/exam/guard"
import type { QuizAnswers } from "@/lib/exam/grading"
import { examQuestionIds } from "@/lib/exam/question-cache"
import { beginAttempt } from "@/lib/exam/start"

const NOT_FOUND = "Ujian tidak ditemukan atau tidak ditujukan untuk Anda."

const throttled = (user: CurrentUser) => !rateLimit(`exam:${user.id}`, 30, 60_000).ok

/**
 * Mulai (atau lanjutkan) ujian. Memeriksa jadwal, sesi, kesempatan, token,
 * jaringan & Safe Exam Browser. Urutan soal/pilihan diacak sekali di sini.
 */
export async function startExam(examId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireRole("PESERTA")
  if (throttled(user)) return fail("Terlalu banyak permintaan. Coba lagi sebentar lagi.")
  const exam = await getParticipantExam(user, examId)
  if (!exam) return fail(NOT_FOUND)
  if (exam.workType === "ASSIGNMENT") return fail("Tugas dikerjakan dari halaman tugas (tulis jawaban/unggah berkas, lalu Serahkan).")
  const sebHash = String(formData.get("sebHash") ?? "") || undefined

  const env = await checkExamEnvironment(exam, sebHash)
  if (!env.ok) {
    await audit("EXAM_ENV_REJECTED", { userId: user.id, entity: "Exam", entityId: examId, severity: "WARNING", metadata: { code: env.code } })
    return fail(env.message)
  }

  const result = await beginAttempt(user, exam, { token: String(formData.get("token") ?? ""), device: { state: deviceState, bind: bindDevice }, client: "web" })
  if (!result.ok) return fail(result.error, result.fieldErrors)
  refresh()
  return ok()
}

const answersSchema = z.record(z.string().max(40), z.string().max(5000, "Jawaban terlalu panjang"))
const flaggedSchema = z.array(z.string().max(40)).max(500)

async function ownRunning(user: CurrentUser, attemptId: string) {
  const attempt = await db.attempt.findFirst({
    where: { id: attemptId, userId: user.id, status: "IN_PROGRESS" },
    select: { id: true, examId: true, startedAt: true, extraMinutes: true, leaveCount: true, deviceTokenHash: true },
  })
  if (!attempt) return null
  const exam = await getParticipantExam(user, attempt.examId)
  // Draf Tugas bukan lembar ujian: tidak boleh disimpan/dikoreksi lewat jalur kuis.
  return exam && exam.workType !== "ASSIGNMENT" ? { attempt, exam } : null
}

async function guard(found: NonNullable<Awaited<ReturnType<typeof ownRunning>>>, sebHash?: string) {
  const env = await checkExamEnvironment(found.exam, sebHash)
  if (!env.ok) return env.message
  if (found.exam.lockDevice && (await deviceState(found.attempt)) === "mismatch") return OTHER_DEVICE
  return null
}

/** Simpan otomatis (berkala dari klien). Ditolak setelah batas waktu sehingga jawaban tersimpan selalu dari dalam waktu. */
export async function saveProgress(
  attemptId: string,
  rawAnswers: QuizAnswers,
  rawFlagged: string[],
  leaveCount: number,
  sebHash?: string
): Promise<ActionResult<{ savedAt: string; terminated?: boolean; deadline?: number }>> {
  const user = await requireRole("PESERTA")
  if (!rateLimit(`autosave:${user.id}`, 60, 60_000).ok) return fail("Terlalu sering menyimpan. Jawaban tetap tersimpan di perangkat.")
  const found = await ownRunning(user, attemptId)
  if (!found) return fail("Ujian tidak ditemukan atau sudah dikumpulkan.")
  const denied = await guard(found, sebHash)
  if (denied) return fail(denied)
  const { attempt, exam } = found
  if (isPastDeadline(exam, attempt)) return fail("Waktu pengerjaan sudah habis.")

  const answers = answersSchema.safeParse(rawAnswers)
  const flagged = flaggedSchema.safeParse(rawFlagged)
  if (!answers.success || !flagged.success) return fail("Format jawaban tidak valid.")
  const valid = await examQuestionIds(exam.id)
  // Jumlah keluar-halaman hanya boleh bertambah (tidak bisa direset klien).
  const leaves = Number.isInteger(leaveCount) ? Math.min(Math.max(leaveCount, attempt.leaveCount), 10_000) : attempt.leaveCount
  const savedAt = new Date()
  const updated = await db.attempt.updateMany({
    where: { id: attempt.id, status: "IN_PROGRESS" },
    data: { answers: sanitizeAnswers(answers.data, valid), flagged: flagged.data.filter((id) => valid.has(id)), leaveCount: leaves, lastSavedAt: savedAt },
  })
  if (updated.count === 0) return fail("Ujian sudah dikumpulkan.")

  if (exam.maxLeaves && leaves >= exam.maxLeaves) {
    await finalizeAttempt({ attemptId: attempt.id, exam, actorId: user.id, autoReason: "LEAVE_LIMIT" })
    refresh()
    return ok(`Batas ${exam.maxLeaves}× meninggalkan halaman ujian tercapai — jawaban dikumpulkan otomatis.`, { savedAt: savedAt.toISOString(), terminated: true })
  }
  // Batas waktu terbaru (pengawas dapat menambah waktu selama ujian berjalan): extraMinutes
  // baru saja dibaca di ownRunning pada permintaan ini. Satu sumber kebenaran: attemptDeadline.
  return ok(undefined, { savedAt: savedAt.toISOString(), deadline: attemptDeadline(exam, attempt) })
}

export async function submitExam(attemptId: string, rawAnswers: QuizAnswers, rawFlagged: string[] = [], sebHash?: string): Promise<ActionResult<{ score: number | null }>> {
  const user = await requireRole("PESERTA")
  if (throttled(user)) return fail("Terlalu banyak pengiriman. Coba lagi sebentar lagi.")
  const found = await ownRunning(user, attemptId)
  if (!found) return fail("Ujian tidak ditemukan atau sudah dikumpulkan.")
  const denied = await guard(found, sebHash)
  if (denied) return fail(denied)
  const parsed = answersSchema.safeParse(rawAnswers)
  if (!parsed.success) return fail("Format jawaban tidak valid.")
  const flagged = flaggedSchema.safeParse(rawFlagged)

  const result = await finalizeAttempt({ attemptId, exam: found.exam, answers: parsed.data, flagged: flagged.success ? flagged.data : [], actorId: user.id })
  if (!result) return fail("Ujian sudah dikumpulkan.")
  refresh()
  const score = found.exam.showScore ? result.score : null
  if (result.late) return ok("Waktu habis — yang dinilai adalah jawaban tersimpan sebelum batas waktu.", { score })
  if (result.pendingEssay) return ok("Ujian terkumpul. Soal esai menunggu penilaian.", { score })
  return ok(found.exam.showScore ? `Ujian terkumpul. Nilai Anda: ${result.score}` : "Ujian terkumpul. Nilai akan diumumkan.", { score })
}
