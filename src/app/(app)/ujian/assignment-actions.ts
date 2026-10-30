"use server"

import { createHash, randomBytes } from "node:crypto"
import { refresh } from "next/cache"
import { db } from "@/lib/db"
import { audit } from "@/lib/audit"
import { requireRole, type CurrentUser } from "@/lib/auth/dal"
import { examWindow, getParticipantExam } from "@/lib/data/access"
import { isFeatureEnabled } from "@/lib/features/access"
import { rateLimit } from "@/lib/rate-limit"
import { safeFileName, sniffSubmission, SUBMISSION_FORMATS_LABEL, SUBMISSION_LIMITS } from "@/lib/submissions/files"
import { removeStoredFiles, saveStoredFile } from "@/lib/submissions/storage"
import { fail, ok, type ActionResult } from "@/lib/action-result"

const NOT_FOUND = "Tugas tidak ditemukan atau tidak ditujukan untuk Anda."

/** Tugas yang boleh diubah peserta: terlihat olehnya, jenis ASSIGNMENT, dan sedang dibuka (lewat tenggat tetap boleh s.d. tutup). */
async function openAssignment(user: CurrentUser, examId: string) {
  const exam = await getParticipantExam(user, examId)
  if (!exam || exam.workType !== "ASSIGNMENT") return { error: fail(NOT_FOUND) }
  const window = examWindow(exam)
  if (window === "upcoming") return { error: fail("Tugas belum dibuka.") }
  if (window === "closed") return { error: fail("Tugas sudah ditutup — tidak bisa diubah atau diserahkan lagi.") }
  return { exam }
}

/** Draf milik peserta; dibuat saat pertama kali menyimpan/mengunggah. Satu percobaan per tugas. */
async function draftFor(user: CurrentUser, examId: string, create: boolean) {
  const existing = await db.attempt.findFirst({ where: { examId, userId: user.id }, orderBy: { attemptNo: "desc" }, include: { files: { select: { id: true, size: true } } } })
  if (existing) return existing.status === "IN_PROGRESS" ? { attempt: existing } : { error: fail("Tugas sudah diserahkan. Batalkan pengiriman dulu untuk mengubahnya.") }
  if (!create) return { error: fail(NOT_FOUND) }
  if (!(await isFeatureEnabled("ujian.mulai", user.role))) return { error: fail("Memulai ujian/tugas baru sedang dinonaktifkan oleh administrator.") }
  const attempt = await db.attempt.create({ data: { examId, userId: user.id, attemptNo: 1 }, include: { files: { select: { id: true, size: true } } } })
  return { attempt }
}

const cleanText = (raw: unknown) => (typeof raw === "string" ? raw.replace(/\r\n/g, "\n").trim() : "")

export async function saveAssignmentText(examId: string, raw: string): Promise<ActionResult<{ savedAt: string }>> {
  const user = await requireRole("PESERTA")
  const text = cleanText(raw)
  if (text.length > SUBMISSION_LIMITS.maxTextLength) return fail(`Jawaban maksimal ${SUBMISSION_LIMITS.maxTextLength.toLocaleString("id-ID")} karakter.`)
  const { error } = await openAssignment(user, examId)
  if (error) return error
  const draft = await draftFor(user, examId, true)
  if (draft.error) return draft.error
  const updated = await db.attempt.updateMany({ where: { id: draft.attempt.id, status: "IN_PROGRESS" }, data: { submissionText: text || null, lastSavedAt: new Date() } })
  if (updated.count === 0) return fail("Tugas sudah diserahkan.")
  return ok(undefined, { savedAt: new Date().toISOString() })
}

export async function uploadAssignmentFile(examId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireRole("PESERTA")
  if (!rateLimit(`upload:${user.id}`, 20, 60_000).ok) return fail("Terlalu banyak unggahan. Coba lagi sebentar lagi.")
  const file = formData.get("file")
  if (!(file instanceof File) || file.size === 0) return fail("Pilih berkas terlebih dahulu.", { file: "Wajib diisi" })
  if (file.size > SUBMISSION_LIMITS.maxBytes) return fail(`Ukuran berkas maksimal ${SUBMISSION_LIMITS.maxBytes / 1024 / 1024} MB.`, { file: "Terlalu besar" })

  const { exam, error } = await openAssignment(user, examId)
  if (error) return error
  const draft = await draftFor(user, examId, true)
  if (draft.error) return draft.error
  if (draft.attempt.files.length >= SUBMISSION_LIMITS.maxFiles) return fail(`Maksimal ${SUBMISSION_LIMITS.maxFiles} berkas per tugas. Hapus salah satu dulu.`)

  const bytes = new Uint8Array(await file.arrayBuffer())
  const fileName = safeFileName(file.name)
  const mimeType = sniffSubmission(bytes, fileName)
  if (!mimeType) return fail(`Format tidak didukung atau isi berkas tidak sesuai ekstensinya. Gunakan ${SUBMISSION_FORMATS_LABEL}.`, { file: "Format tidak didukung" })

  // Kunci acak — nama dari pengguna tidak pernah dipakai sebagai path di disk.
  const storageKey = `submissions/${exam.id}/${draft.attempt.id}/${randomBytes(16).toString("hex")}`
  await saveStoredFile(storageKey, bytes)
  try {
    await db.submissionFile.create({ data: { attemptId: draft.attempt.id, fileName, mimeType, size: bytes.length, storageKey, sha256: createHash("sha256").update(bytes).digest("hex") } })
  } catch (e) {
    await removeStoredFiles([storageKey]) // jangan tinggalkan berkas yatim bila DB gagal
    throw e
  }
  refresh()
  return ok(`"${fileName}" diunggah.`)
}

export async function removeAssignmentFile(examId: string, fileId: string): Promise<ActionResult> {
  const user = await requireRole("PESERTA")
  const { error } = await openAssignment(user, examId)
  if (error) return error
  // Hanya berkas milik sendiri, pada draf (belum diserahkan), di tugas ini.
  const file = await db.submissionFile.findFirst({ where: { id: fileId, attempt: { examId, userId: user.id, status: "IN_PROGRESS" } }, select: { id: true, storageKey: true, fileName: true } })
  if (!file) return fail("Berkas tidak ditemukan atau tugas sudah diserahkan.")
  await db.submissionFile.delete({ where: { id: file.id } })
  await removeStoredFiles([file.storageKey])
  refresh()
  return ok(`"${file.fileName}" dihapus.`)
}

/** Serahkan: teks terakhir ikut disimpan. Lewat tenggat tetap diterima (s.d. tutup) tetapi ditandai terlambat. */
export async function submitAssignment(examId: string, raw: string): Promise<ActionResult> {
  const user = await requireRole("PESERTA")
  const text = cleanText(raw)
  if (text.length > SUBMISSION_LIMITS.maxTextLength) return fail(`Jawaban maksimal ${SUBMISSION_LIMITS.maxTextLength.toLocaleString("id-ID")} karakter.`)
  const { exam, error } = await openAssignment(user, examId)
  if (error) return error
  const draft = await draftFor(user, examId, true)
  if (draft.error) return draft.error
  if (!text && draft.attempt.files.length === 0) return fail("Tulis jawaban atau unggah minimal satu berkas sebelum menyerahkan.")

  const now = new Date()
  const isLate = !!exam.dueAt && now > exam.dueAt
  const updated = await db.attempt.updateMany({
    where: { id: draft.attempt.id, status: "IN_PROGRESS" },
    data: { submissionText: text || null, status: "SUBMITTED", submittedAt: now, isLate, lastSavedAt: now },
  })
  if (updated.count === 0) return fail("Tugas sudah diserahkan.")
  await audit("ASSIGNMENT_SUBMITTED", { userId: user.id, entity: "Exam", entityId: examId, metadata: { files: draft.attempt.files.length, late: isLate } })
  refresh()
  return ok(isLate ? "Tugas diserahkan (terlambat)." : "Tugas diserahkan.")
}

/** Batalkan pengiriman (seperti Classroom): kembali menjadi draf selama belum dinilai & tugas masih dibuka. */
export async function unsubmitAssignment(examId: string): Promise<ActionResult> {
  const user = await requireRole("PESERTA")
  const { error } = await openAssignment(user, examId)
  if (error) return error
  const updated = await db.attempt.updateMany({ where: { examId, userId: user.id, status: "SUBMITTED" }, data: { status: "IN_PROGRESS", submittedAt: null, isLate: false } })
  if (updated.count === 0) return fail("Tidak bisa dibatalkan — tugas belum diserahkan atau sudah dinilai.")
  await audit("ASSIGNMENT_UNSUBMITTED", { userId: user.id, entity: "Exam", entityId: examId })
  refresh()
  return ok("Pengiriman dibatalkan — Anda bisa mengubah jawaban lalu menyerahkan lagi.")
}
