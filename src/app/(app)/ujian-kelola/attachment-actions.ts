"use server"

import { createHash, randomBytes } from "node:crypto"
import { refresh } from "next/cache"
import { db } from "@/lib/db"
import { audit } from "@/lib/audit"
import { requireRole } from "@/lib/auth/dal"
import { STAFF } from "@/lib/auth/roles"
import { getManagedExam } from "@/lib/data/access"
import { safeFileName, sniffSubmission, SUBMISSION_FORMATS_LABEL, SUBMISSION_LIMITS } from "@/lib/submissions/files"
import { removeStoredFiles, saveStoredFile } from "@/lib/submissions/storage"
import { fail, ok, type ActionResult } from "@/lib/action-result"

const MAX_ATTACHMENTS = 10
const DENIED = "Ujian tidak ditemukan atau di luar kewenangan Anda."

/** Lampiran referensi pengajar (panduan, templat laporan, dataset) — bisa diunduh peserta ujian ini. */
export async function uploadExamAttachment(examId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireRole(...STAFF)
  const exam = await getManagedExam(user, examId)
  if (!exam) return fail(DENIED)
  const file = formData.get("file")
  if (!(file instanceof File) || file.size === 0) return fail("Pilih berkas terlebih dahulu.", { file: "Wajib diisi" })
  if (file.size > SUBMISSION_LIMITS.maxBytes) return fail(`Ukuran berkas maksimal ${SUBMISSION_LIMITS.maxBytes / 1024 / 1024} MB.`, { file: "Terlalu besar" })
  if ((await db.examAttachment.count({ where: { examId } })) >= MAX_ATTACHMENTS) return fail(`Maksimal ${MAX_ATTACHMENTS} lampiran per ujian.`)

  const bytes = new Uint8Array(await file.arrayBuffer())
  const fileName = safeFileName(file.name)
  const mimeType = sniffSubmission(bytes, fileName)
  if (!mimeType) return fail(`Format tidak didukung atau isi berkas tidak sesuai ekstensinya. Gunakan ${SUBMISSION_FORMATS_LABEL}.`, { file: "Format tidak didukung" })

  const storageKey = `attachments/${examId}/${randomBytes(16).toString("hex")}`
  await saveStoredFile(storageKey, bytes)
  try {
    await db.examAttachment.create({ data: { examId, fileName, mimeType, size: bytes.length, storageKey, sha256: createHash("sha256").update(bytes).digest("hex"), createdById: user.id } })
  } catch (e) {
    await removeStoredFiles([storageKey])
    throw e
  }
  await audit("EXAM_ATTACHMENT_ADDED", { userId: user.id, entity: "Exam", entityId: examId, metadata: { fileName, bytes: bytes.length } })
  refresh()
  return ok(`"${fileName}" dilampirkan.`)
}

export async function removeExamAttachment(examId: string, attachmentId: string): Promise<ActionResult> {
  const user = await requireRole(...STAFF)
  if (!(await getManagedExam(user, examId))) return fail(DENIED)
  const att = await db.examAttachment.findFirst({ where: { id: attachmentId, examId }, select: { id: true, storageKey: true, fileName: true } })
  if (!att) return fail("Lampiran tidak ditemukan.")
  await db.examAttachment.delete({ where: { id: att.id } })
  await removeStoredFiles([att.storageKey])
  await audit("EXAM_ATTACHMENT_REMOVED", { userId: user.id, entity: "Exam", entityId: examId, metadata: { fileName: att.fileName } })
  refresh()
  return ok(`"${att.fileName}" dihapus.`)
}
