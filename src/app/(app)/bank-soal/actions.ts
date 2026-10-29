"use server"

import { refresh } from "next/cache"
import { Prisma } from "@/generated/prisma/client"
import { db } from "@/lib/db"
import { audit } from "@/lib/audit"
import { requireRole } from "@/lib/auth/dal"
import { isFeatureEnabled } from "@/lib/features/access"
import { FEATURE_DISABLED } from "@/lib/features/registry"
import { STAFF } from "@/lib/auth/roles"
import { canManageSubject, getManagedQuestion } from "@/lib/data/access"
import { appendExamQuestions, editableExam } from "@/lib/data/exam-questions"
import { fail, ok, type ActionResult } from "@/lib/action-result"
import { parseBankForm } from "@/lib/exam/question-input"
import { MAX_IMPORT_QUESTIONS, parseQuestionImport, type ImportedQuestion, type ImportResult } from "@/lib/exam/import"
import { buildQuestion, revalidateImported, type RawQuestion } from "@/lib/exam/question-build"
import { MAX_UPLOAD_BYTES, parseExcel, parseWord } from "@/lib/exam/office"

const DENIED = "Mata uji tidak ditemukan atau di luar kewenangan Anda."
const MAX_BANK = 10_000

async function bankFull(subjectId: string, adding: number) {
  const n = await db.question.count({ where: { subjectId } })
  return n + adding > MAX_BANK ? fail(`Bank soal maksimal ${MAX_BANK} soal per mata uji.`) : null
}

const toCreate = (q: ImportedQuestion, subjectId: string, createdById: string) => ({
  subjectId,
  createdById,
  type: q.type,
  prompt: q.prompt,
  options: q.options ?? Prisma.DbNull,
  answerKey: q.answerKey ?? Prisma.DbNull,
  points: q.points,
  topic: q.topic,
  difficulty: q.difficulty,
})

/** Simpan soal ke bank (dan opsional langsung ke sebuah ujian). */
async function persist(user: Awaited<ReturnType<typeof requireRole>>, subjectId: string, questions: ImportedQuestion[], examId: string | null) {
  if (!(await canManageSubject(user, subjectId))) return fail(DENIED)
  const full = await bankFull(subjectId, questions.length)
  if (full) return full
  if (examId) {
    const { exam, error } = await editableExam(user, examId)
    if (error) return error
    if (exam.subjectId !== subjectId) return fail("Ujian tujuan harus dari mata uji yang sama.")
  }
  const created = await db.question.createManyAndReturn({ data: questions.map((q) => toCreate(q, subjectId, user.id)), select: { id: true } })
  if (examId) {
    const err = await appendExamQuestions(
      examId,
      questions.map((q, i) => ({ ...q, sourceId: created[i]?.id }))
    )
    if (err) return err
  }
  return null
}

// ---------------------------------------------------------------------------
// Satu soal
// ---------------------------------------------------------------------------

export async function createQuestion(subjectId: string, _prev: ActionResult, formData: FormData) {
  const user = await requireRole(...STAFF)
  if (!(await canManageSubject(user, subjectId))) return fail(DENIED)
  const { data, error } = parseBankForm(formData)
  if (error) return error
  const full = await bankFull(subjectId, 1)
  if (full) return full
  await db.question.create({ data: { ...data, subjectId, createdById: user.id } })
  refresh()
  return ok("Soal ditambahkan ke bank.")
}

export async function updateQuestion(id: string, _prev: ActionResult, formData: FormData) {
  const user = await requireRole(...STAFF)
  if (!(await getManagedQuestion(user, id))) return fail(DENIED)
  const { data, error } = parseBankForm(formData)
  if (error) return error
  // Ujian yang sudah memakai soal ini tidak berubah (soal disalin saat dimasukkan).
  await db.question.update({ where: { id }, data: { ...data, options: data.options ?? Prisma.DbNull, answerKey: data.answerKey ?? Prisma.DbNull } })
  refresh()
  return ok("Soal disimpan.")
}

export async function deleteQuestions(ids: string[]): Promise<ActionResult> {
  const user = await requireRole(...STAFF)
  const list = [...new Set(ids)].slice(0, 500)
  const owned = await db.question.findMany({ where: { id: { in: list }, subject: user.role === "DOSEN" ? { lecturers: { some: { userId: user.id } } } : {} }, select: { id: true } })
  if (owned.length === 0) return fail("Tidak ada soal yang dapat dihapus.")
  await db.question.deleteMany({ where: { id: { in: owned.map((q) => q.id) } } })
  await audit("QUESTIONS_DELETED", { userId: user.id, entity: "Question", metadata: { count: owned.length } })
  refresh()
  return ok(`${owned.length} soal dihapus dari bank.`)
}

// ---------------------------------------------------------------------------
// Buat soal massal (editor per halaman)
// ---------------------------------------------------------------------------

export async function saveBulk(
  subjectId: string,
  raws: RawQuestion[],
  examId: string | null
): Promise<ActionResult<{ created: number }>> {
  const user = await requireRole(...STAFF)
  if (!(await isFeatureEnabled("bank-soal.massal", user.role))) return fail(FEATURE_DISABLED)
  if (!Array.isArray(raws) || raws.length === 0) return fail("Belum ada soal.")
  if (raws.length > MAX_IMPORT_QUESTIONS) return fail(`Maksimal ${MAX_IMPORT_QUESTIONS} soal sekali simpan.`)
  const errors: Record<number, string> = {}
  const questions: ImportedQuestion[] = []
  raws.forEach((raw, i) => {
    const r = buildQuestion(raw ?? { type: "", prompt: "" })
    if (r.question) questions.push(r.question)
    else errors[i] = r.error
  })
  if (Object.keys(errors).length) {
    return fail(
      `${Object.keys(errors).length} soal belum lengkap — periksa yang ditandai merah.`,
      Object.fromEntries(Object.entries(errors).map(([i, m]) => [`q${i}`, m]))
    )
  }
  const err = await persist(user, subjectId, questions, examId)
  if (err) return err
  await audit("QUESTIONS_BULK_CREATED", { userId: user.id, entity: "Subject", entityId: subjectId, metadata: { count: questions.length, examId } })
  refresh()
  return ok(`${questions.length} soal disimpan${examId ? " ke bank dan ujian" : " ke bank soal"}.`, { created: questions.length })
}

// ---------------------------------------------------------------------------
// Impor Word / Excel / teks: pratinjau dulu, lalu simpan
// ---------------------------------------------------------------------------

export async function previewImport(_prev: ActionResult<unknown>, formData: FormData): Promise<ActionResult<ImportResult>> {
  const user = await requireRole(...STAFF)
  if (!(await isFeatureEnabled("bank-soal.impor", user.role))) return fail(FEATURE_DISABLED)
  const source = String(formData.get("source") ?? "")
  let result: ImportResult
  if (source === "text") {
    const text = String(formData.get("text") ?? "")
    if (!text.trim()) return fail("Tempel soal terlebih dahulu.", { text: "Wajib diisi" })
    if (text.length > 300_000) return fail("Teks terlalu panjang.", { text: "Maks. 300.000 karakter" })
    result = parseQuestionImport(text)
  } else {
    const file = formData.get("file")
    if (!(file instanceof File) || file.size === 0) return fail("Pilih berkas terlebih dahulu.", { file: "Wajib diisi" })
    if (file.size > MAX_UPLOAD_BYTES) return fail("Berkas maksimal 5 MB.", { file: "Terlalu besar" })
    const name = file.name.toLowerCase()
    const buffer = await file.arrayBuffer()
    if (name.endsWith(".xlsx")) result = await parseExcel(buffer)
    else if (name.endsWith(".docx")) result = await parseWord(buffer)
    else return fail("Format tidak didukung. Gunakan .xlsx (Excel) atau .docx (Word).", { file: "Gunakan .xlsx / .docx" })
  }
  if (result.questions.length === 0 && result.errors.length === 0) return fail("Tidak ada soal yang terbaca. Periksa format atau gunakan templat.")
  return ok(undefined, result)
}

export async function saveImported(subjectId: string, examId: string | null, items: unknown[]): Promise<ActionResult> {
  const user = await requireRole(...STAFF)
  if (!(await isFeatureEnabled("bank-soal.impor", user.role))) return fail(FEATURE_DISABLED)
  if (!Array.isArray(items) || items.length === 0) return fail("Tidak ada soal untuk disimpan.")
  if (items.length > MAX_IMPORT_QUESTIONS) return fail(`Maksimal ${MAX_IMPORT_QUESTIONS} soal per impor.`)
  const questions: ImportedQuestion[] = []
  for (const [i, item] of items.entries()) {
    const r = revalidateImported(item)
    if (!r.question) return fail(`Soal ${i + 1}: ${r.error}.`)
    questions.push(r.question)
  }
  const err = await persist(user, subjectId, questions, examId)
  if (err) return err
  await audit("QUESTIONS_IMPORTED", { userId: user.id, entity: "Subject", entityId: subjectId, metadata: { count: questions.length, examId } })
  refresh()
  return ok(`${questions.length} soal diimpor${examId ? " ke bank dan ujian" : " ke bank soal"}.`)
}
