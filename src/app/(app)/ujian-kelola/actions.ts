"use server"

import { refresh } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { Prisma } from "@/generated/prisma/client"
import { db } from "@/lib/db"
import { audit } from "@/lib/audit"
import { requireRole, type CurrentUser } from "@/lib/auth/dal"
import { STAFF } from "@/lib/auth/roles"
import { canManageSubject, getManagedExam, managedSubjects } from "@/lib/data/access"
import { targetableClasses } from "@/lib/classes/access"
import { appendExamQuestions, editableExam } from "@/lib/data/exam-questions"
import { fail, formObject, ok, zodFail, type ActionResult } from "@/lib/action-result"
import { checkbox, optionalLocalDateTime, optionalNumber, optionalText } from "@/lib/validation"
import { finalizeAttempt, isPastDeadline } from "@/lib/exam/attempt"
import { MAX_QUESTIONS_PER_TASK, parseQuestionForm } from "@/lib/exam/question-input"
import { parseConfigKeys, parseIpList } from "@/lib/exam/security"
import { customRulesError } from "@/lib/exam/rules"
import { quizPercent, round2 } from "@/lib/exam/grading"

const DENIED = "Ujian tidak ditemukan atau di luar kewenangan Anda."
const KINDS = ["KUIS", "UTS", "UAS", "TRYOUT", "LATIHAN", "LAINNYA"] as const

// ---------------------------------------------------------------------------
// Pengaturan ujian
// ---------------------------------------------------------------------------

const examSchema = z
  .object({
    subjectId: z.string().trim().min(1, "Pilih mata uji"),
    title: z.string().trim().min(3, "Minimal 3 karakter").max(200),
    kind: z.enum(KINDS, "Pilih jenis ujian").default("KUIS"),
    categoryId: z
      .string()
      .optional()
      .transform((v) => v || null),
    workType: z.enum(["QUIZ", "QUESTION", "ASSIGNMENT"]).default("QUIZ"),
    maxPoints: optionalNumber(1, 1000, "Poin maksimal", false),
    dueAt: optionalLocalDateTime,
    /** Dikirim sebagai "Tanpa batas durasi" agar form/klien lama tetap ber-durasi. */
    untimed: checkbox,
    instructions: optionalText(10_000),
    durationMinutes: z.coerce.number("Durasi harus angka").int("Bilangan bulat").min(1, "Durasi 1–600 menit").max(600, "Durasi 1–600 menit"),
    startAt: optionalLocalDateTime,
    endAt: optionalLocalDateTime,
    maxAttempts: z.coerce.number().int().min(1, "1–10").max(10, "1–10"),
    questionsPerPage: z.coerce.number().int().min(1, "1–50").max(50, "1–50"),
    passingScore: optionalNumber(0, 100, "Nilai lulus", false),
    token: z
      .string()
      .trim()
      .max(12, "Maksimal 12 karakter")
      .regex(/^[A-Za-z0-9]*$/, "Hanya huruf & angka")
      .optional()
      .transform((v) => (v ? v.toUpperCase() : null)),
    shuffleQuestions: checkbox,
    shuffleOptions: checkbox,
    hideScore: checkbox,
    openToAll: checkbox,
    requireFullscreen: checkbox,
    blockCopyPaste: checkbox,
    lockDevice: checkbox,
    maxLeaves: optionalNumber(1, 50, "Batas pelanggaran"),
    allowedIps: optionalText(2000),
    requireSeb: checkbox,
    sebConfigKeys: optionalText(2000),
    rules: optionalText(5000),
  })
  .superRefine((v, ctx) => {
    if (v.startAt && v.endAt && v.endAt <= v.startAt) ctx.addIssue({ code: "custom", path: ["endAt"], message: "Waktu tutup harus setelah waktu buka" })
    if (v.workType === "ASSIGNMENT" && v.maxPoints === null) ctx.addIssue({ code: "custom", path: ["maxPoints"], message: "Isi poin maksimal tugas" })
    if (v.dueAt && v.endAt && v.dueAt > v.endAt) ctx.addIssue({ code: "custom", path: ["dueAt"], message: "Tenggat tidak boleh setelah waktu tutup" })
    if (v.dueAt && v.startAt && v.dueAt <= v.startAt) ctx.addIssue({ code: "custom", path: ["dueAt"], message: "Tenggat harus setelah waktu buka" })
    const ips = parseIpList(v.allowedIps).invalid
    if (ips.length) ctx.addIssue({ code: "custom", path: ["allowedIps"], message: `IP/CIDR tidak valid: ${ips.slice(0, 3).join(", ")}` })
    if (parseConfigKeys(v.sebConfigKeys).invalid.length) ctx.addIssue({ code: "custom", path: ["sebConfigKeys"], message: "Config Key = 64 karakter heksadesimal, satu per baris" })
    const rulesError = customRulesError(v.rules)
    if (rulesError) ctx.addIssue({ code: "custom", path: ["rules"], message: rulesError })
  })

/** `examId` saat mengubah: kelas yang sudah terpasang di ujian ini tetap boleh dipertahankan. */
async function parseExam(user: CurrentUser, formData: FormData, examId?: string) {
  const parsed = examSchema.safeParse(formObject(formData))
  if (!parsed.success) return { error: zodFail(parsed.error) }
  const { hideScore, untimed, ...v } = parsed.data
  if (!(await canManageSubject(user, v.subjectId))) return { error: fail("Mata uji tidak valid.", { subjectId: "Pilih mata uji yang Anda kelola" }) }
  // Kategori menentukan perilaku dasar (kind) — nilai kind dari klien tidak dipercaya bila kategori dipilih.
  if (v.categoryId) {
    const category = await db.examCategory.findFirst({ where: { id: v.categoryId, OR: [{ isActive: true }, ...(examId ? [{ exams: { some: { id: examId } } }] : [])] }, select: { kind: true } })
    if (!category) return { error: fail("Kategori tidak valid.", { categoryId: "Pilih kategori yang tersedia" }) }
    v.kind = category.kind
  }
  const groupIds = [...new Set(formData.getAll("groupId").map(String).filter(Boolean))]
  // Hanya kelas yang boleh dituju actor; ID lain (mis. form dimodifikasi) diabaikan.
  const allowed = examId ? { OR: [targetableClasses(user), { exams: { some: { examId } } }] } : targetableClasses(user)
  const groups = v.openToAll ? [] : (await db.group.findMany({ where: { AND: [{ id: { in: groupIds } }, allowed] }, select: { id: true } })).map((g) => g.id)
  // Tugas: tanpa durasi & satu kali pengiriman (bisa dibatalkan/diperbaiki sebelum dinilai).
  const assignment = v.workType === "ASSIGNMENT"
  return {
    data: { ...v, timed: assignment ? false : !untimed, maxAttempts: assignment ? 1 : v.maxAttempts, maxPoints: assignment ? v.maxPoints : null, showScore: !hideScore },
    groups,
  }
}

export async function createExam(_prev: ActionResult, formData: FormData) {
  const user = await requireRole(...STAFF)
  const { data, groups, error } = await parseExam(user, formData)
  if (error) return error
  const exam = await db.exam.create({
    data: { ...data, createdById: user.id, groups: { create: groups.map((groupId) => ({ groupId })) } },
    select: { id: true },
  })
  await audit("EXAM_CREATED", { userId: user.id, entity: "Exam", entityId: exam.id, metadata: { kind: data.kind } })
  redirect(data.workType === "ASSIGNMENT" ? `/ujian-kelola/${exam.id}` : `/ujian-kelola/${exam.id}?tab=soal`)
}

export async function updateExam(examId: string, _prev: ActionResult, formData: FormData) {
  const user = await requireRole(...STAFF)
  const exam = await getManagedExam(user, examId)
  if (!exam) return fail(DENIED)
  const { data, groups, error } = await parseExam(user, formData, examId)
  if (error) return error
  if (data.subjectId !== exam.subjectId && exam._count.attempts > 0) return fail("Mata uji tidak dapat diganti setelah ada peserta.", { subjectId: "Terkunci" })
  await db.$transaction([
    db.exam.update({ where: { id: examId }, data }),
    db.examGroup.deleteMany({ where: { examId } }),
    db.examGroup.createMany({ data: groups.map((groupId) => ({ examId, groupId })) }),
  ])
  await audit("EXAM_UPDATED", { userId: user.id, entity: "Exam", entityId: examId })
  redirect(`/ujian-kelola/${examId}`)
}

export async function setExamPublished(examId: string, published: boolean): Promise<ActionResult> {
  const user = await requireRole(...STAFF)
  const exam = await getManagedExam(user, examId)
  if (!exam) return fail(DENIED)
  if (published && exam.workType !== "ASSIGNMENT" && exam._count.questions === 0) return fail("Tambahkan minimal satu soal sebelum menerbitkan.")
  if (published && exam.workType === "ASSIGNMENT" && !exam.maxPoints) return fail("Isi poin maksimal tugas (menu Ubah) sebelum menerbitkan.")
  if (published && exam.workType === "QUESTION" && exam._count.questions !== 1) return fail("Pertanyaan harus berisi tepat satu soal. Hapus soal lain atau ubah jenisnya menjadi Tugas Kuis.")
  if (published && !exam.openToAll && exam.groups.length === 0 && exam._count.sessions === 0)
    return fail("Tentukan peserta: pilih kelas/kelompok, buka untuk semua peserta (menu Ubah), atau buat sesi publik.")
  await db.exam.update({ where: { id: examId }, data: { publishedAt: published ? (exam.publishedAt ?? new Date()) : null } })
  await audit(published ? "EXAM_PUBLISHED" : "EXAM_UNPUBLISHED", { userId: user.id, entity: "Exam", entityId: examId })
  refresh()
  return ok(published ? "Ujian diterbitkan — terlihat oleh peserta." : "Ujian ditarik menjadi draf.")
}

export async function setSessionActive(examId: string, active: boolean): Promise<ActionResult> {
  const user = await requireRole(...STAFF)
  if (!(await getManagedExam(user, examId))) return fail(DENIED)
  await db.exam.update({ where: { id: examId }, data: { sessionActive: active } })
  await audit(active ? "EXAM_SESSION_OPENED" : "EXAM_SESSION_CLOSED", { userId: user.id, entity: "Exam", entityId: examId })
  refresh()
  return ok(active ? "Sesi dibuka — peserta dapat mulai." : "Sesi dihentikan — tidak ada percobaan baru.")
}

export async function setShowScore(examId: string, show: boolean): Promise<ActionResult> {
  const user = await requireRole(...STAFF)
  if (!(await getManagedExam(user, examId))) return fail(DENIED)
  await db.exam.update({ where: { id: examId }, data: { showScore: show } })
  refresh()
  return ok(show ? "Nilai ditampilkan ke peserta." : "Nilai disembunyikan dari peserta.")
}

export async function updateRules(examId: string, _prev: ActionResult, formData: FormData) {
  const user = await requireRole(...STAFF)
  if (!(await getManagedExam(user, examId))) return fail(DENIED)
  const text = String(formData.get("rules") ?? "").trim()
  const error = text.length > 5000 ? "Maksimal 5000 karakter" : customRulesError(text)
  if (error) return fail("Periksa kembali tata tertib.", { rules: error })
  await db.exam.update({ where: { id: examId }, data: { rules: text || null } })
  refresh()
  return ok("Tata tertib disimpan.")
}

export async function duplicateExam(examId: string): Promise<ActionResult<{ href: string }>> {
  const user = await requireRole(...STAFF)
  const exam = await getManagedExam(user, examId)
  if (!exam) return fail(DENIED)
  const fields = {
    subjectId: exam.subjectId,
    kind: exam.kind,
    instructions: exam.instructions,
    durationMinutes: exam.durationMinutes,
    startAt: exam.startAt,
    endAt: exam.endAt,
    maxAttempts: exam.maxAttempts,
    questionsPerPage: exam.questionsPerPage,
    passingScore: exam.passingScore,
    shuffleQuestions: exam.shuffleQuestions,
    shuffleOptions: exam.shuffleOptions,
    showScore: exam.showScore,
    openToAll: exam.openToAll,
    token: exam.token,
    rules: exam.rules,
    requireFullscreen: exam.requireFullscreen,
    blockCopyPaste: exam.blockCopyPaste,
    lockDevice: exam.lockDevice,
    maxLeaves: exam.maxLeaves,
    allowedIps: exam.allowedIps,
    requireSeb: exam.requireSeb,
    sebConfigKeys: exam.sebConfigKeys,
  }
  const questions = await db.examQuestion.findMany({ where: { examId }, orderBy: { order: "asc" } })
  const copy = await db.exam.create({
    data: {
      ...fields,
      title: `${exam.title} (salinan)`.slice(0, 200),
      createdById: user.id,
      groups: { create: exam.groups.map((g) => ({ groupId: g.group.id })) },
      questions: {
        create: questions.map((q) => ({
          type: q.type,
          prompt: q.prompt,
          options: q.options ?? Prisma.DbNull,
          answerKey: q.answerKey ?? Prisma.DbNull,
          points: q.points,
          order: q.order,
          sourceId: q.sourceId,
        })),
      },
    },
    select: { id: true },
  })
  await audit("EXAM_DUPLICATED", { userId: user.id, entity: "Exam", entityId: copy.id, metadata: { from: examId } })
  return ok("Ujian diduplikasi sebagai draf.", { href: `/ujian-kelola/${copy.id}` })
}

export async function deleteExam(examId: string): Promise<ActionResult<{ href: string }>> {
  const user = await requireRole(...STAFF)
  const exam = await getManagedExam(user, examId)
  if (!exam) return fail(DENIED)
  if (exam._count.attempts > 0) return fail("Ujian sudah dikerjakan peserta dan tidak dapat dihapus. Tarik menjadi draf bila perlu.")
  await db.exam.delete({ where: { id: examId } })
  await audit("EXAM_DELETED", { userId: user.id, entity: "Exam", entityId: examId, severity: "WARNING", metadata: { title: exam.title } })
  return ok(`"${exam.title}" dihapus.`, { href: "/ujian-kelola" })
}

// ---------------------------------------------------------------------------
// Soal ujian
// ---------------------------------------------------------------------------

/** Ambil soal dari bank: centang manual (bankId[]) atau acak N soal menurut topik/kesulitan. */
export async function addFromBank(examId: string, _prev: ActionResult, formData: FormData) {
  const user = await requireRole(...STAFF)
  const { exam, error } = await editableExam(user, examId)
  if (error) return error
  // Soal yang sudah ada di ujian tidak diambil lagi.
  const used = new Set((await db.examQuestion.findMany({ where: { examId, sourceId: { not: null } }, select: { sourceId: true } })).map((q) => q.sourceId!))

  let ids = formData.getAll("bankId").map(String).filter(Boolean).slice(0, MAX_QUESTIONS_PER_TASK)
  if (ids.length === 0) {
    const count = Number(formData.get("count") ?? 0)
    if (!Number.isInteger(count) || count < 1 || count > MAX_QUESTIONS_PER_TASK) return fail("Centang soal, atau isi jumlah soal acak.", { count: `Isi 1–${MAX_QUESTIONS_PER_TASK}` })
    const topic = String(formData.get("topic") ?? "").trim()
    const difficulty = Number(formData.get("difficulty") ?? 0)
    const type = String(formData.get("type") ?? "")
    const pool = (
      await db.question.findMany({
        where: {
          subjectId: exam.subjectId,
          ...(topic ? { topic } : {}),
          ...([1, 2, 3].includes(difficulty) ? { difficulty } : {}),
          ...(["MULTIPLE_CHOICE", "TRUE_FALSE", "SHORT_ANSWER", "ESSAY"].includes(type) ? { type: type as Prisma.QuestionWhereInput["type"] & string } : {}),
        },
        select: { id: true },
      })
    ).filter((p) => !used.has(p.id))
    if (pool.length < count) return fail(`Hanya ada ${pool.length} soal yang cocok dan belum dipakai di ujian ini.`, { count: `Maks. ${pool.length}` })
    ids = pool
      .map((p) => ({ id: p.id, r: Math.random() }))
      .sort((a, b) => a.r - b.r)
      .slice(0, count)
      .map((p) => p.id)
  }
  const items = await db.question.findMany({ where: { id: { in: ids }, subjectId: exam.subjectId }, orderBy: { createdAt: "asc" } })
  const fresh = items.filter((q) => !used.has(q.id))
  if (fresh.length === 0) return fail("Soal terpilih sudah ada di ujian ini.")
  const err = await appendExamQuestions(
    examId,
    fresh.map((q) => ({ ...q, sourceId: q.id }))
  )
  if (err) return err
  refresh()
  return ok(`${fresh.length} soal ditambahkan dari bank${items.length > fresh.length ? ` (${items.length - fresh.length} sudah ada)` : ""}.`)
}

export async function updateExamQuestion(questionId: string, _prev: ActionResult, formData: FormData) {
  const user = await requireRole(...STAFF)
  const q = await db.examQuestion.findUnique({ where: { id: questionId }, select: { examId: true } })
  if (!q) return fail(DENIED)
  const { error: locked } = await editableExam(user, q.examId)
  if (locked) return locked
  const { data, error } = parseQuestionForm(formData)
  if (error) return error
  await db.examQuestion.update({
    where: { id: questionId },
    data: { type: data.type, prompt: data.prompt, points: data.points, order: data.order, options: data.options ?? Prisma.DbNull, answerKey: data.answerKey ?? Prisma.DbNull },
  })
  refresh()
  return ok("Soal ujian disimpan.")
}

export async function removeExamQuestions(examId: string, ids: string[]): Promise<ActionResult> {
  const user = await requireRole(...STAFF)
  const { exam, error } = await editableExam(user, examId)
  if (error) return error
  const n = await db.examQuestion.count({ where: { examId, id: { in: ids } } })
  if (exam.publishedAt && n >= exam._count.questions) return fail("Ujian terbit harus memiliki minimal satu soal.")
  await db.examQuestion.deleteMany({ where: { examId, id: { in: ids } } })
  refresh()
  return ok(`${n} soal dikeluarkan dari ujian (bank soal tidak berubah).`)
}

// ---------------------------------------------------------------------------
// Pengawasan & penilaian
// ---------------------------------------------------------------------------

async function managedAttempt(user: CurrentUser, attemptId: string) {
  return db.attempt.findFirst({
    where: { id: attemptId, exam: { subject: managedSubjects(user) } },
    include: { exam: { select: { id: true, durationMinutes: true, endAt: true } }, user: { select: { name: true } } },
  })
}

export async function extendTime(attemptId: string, _prev: ActionResult, formData: FormData) {
  const user = await requireRole(...STAFF)
  const attempt = await managedAttempt(user, attemptId)
  if (!attempt || attempt.status !== "IN_PROGRESS") return fail("Percobaan tidak ditemukan atau sudah selesai.")
  const minutes = Number(formData.get("minutes"))
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 240) return fail("Isi 1–240 menit.", { minutes: "1–240" })
  await db.attempt.update({ where: { id: attemptId }, data: { extraMinutes: { increment: minutes } } })
  await audit("ATTEMPT_TIME_EXTENDED", { userId: user.id, entity: "Attempt", entityId: attemptId, metadata: { minutes } })
  refresh()
  return ok(`Waktu ${attempt.user.name} ditambah ${minutes} menit.`)
}

export async function resetDevice(attemptId: string): Promise<ActionResult> {
  const user = await requireRole(...STAFF)
  const attempt = await managedAttempt(user, attemptId)
  if (!attempt || attempt.status !== "IN_PROGRESS") return fail("Percobaan tidak ditemukan atau sudah selesai.")
  await db.attempt.update({ where: { id: attemptId }, data: { deviceTokenHash: null } })
  await audit("ATTEMPT_DEVICE_RESET", { userId: user.id, entity: "Attempt", entityId: attemptId, severity: "WARNING" })
  refresh()
  return ok(`Perangkat ${attempt.user.name} direset — dapat melanjutkan dari perangkat lain.`)
}

/** Akhiri percobaan berjalan: satu peserta, yang waktunya habis, atau semua. */
export async function finishAttempts(examId: string, scope: "expired" | "all" | { attemptId: string }): Promise<ActionResult> {
  const user = await requireRole(...STAFF)
  const exam = await getManagedExam(user, examId)
  if (!exam) return fail(DENIED)
  if (exam.workType === "ASSIGNMENT") return fail("Tidak berlaku untuk Tugas — draf mahasiswa tidak dikumpulkan paksa.")
  const running = await db.attempt.findMany({
    where: { examId, status: "IN_PROGRESS", ...(typeof scope === "object" ? { id: scope.attemptId } : {}) },
    select: { id: true, startedAt: true, extraMinutes: true },
  })
  const targets = scope === "expired" ? running.filter((a) => isPastDeadline(exam, a)) : running
  let done = 0
  for (const a of targets) if (await finalizeAttempt({ attemptId: a.id, exam, actorId: user.id, autoReason: "PROCTOR" })) done++
  refresh()
  return ok(done ? `${done} percobaan diakhiri dan dinilai dari jawaban tersimpan.` : "Tidak ada percobaan yang perlu diakhiri.")
}

/** Nilai esai (soal lain sudah dikoreksi otomatis). Penilaian ulang diperbolehkan. */
export async function gradeAttempt(attemptId: string, _prev: ActionResult, formData: FormData) {
  const user = await requireRole(...STAFF)
  const attempt = await managedAttempt(user, attemptId)
  if (!attempt || attempt.status === "IN_PROGRESS") return fail("Percobaan tidak ditemukan atau belum dikumpulkan.")
  const questions = await db.examQuestion.findMany({ where: { examId: attempt.examId }, select: { id: true, type: true, points: true } })
  const scores = { ...((attempt.questionScores as Record<string, number> | null) ?? {}) }
  const errors: Record<string, string> = {}
  for (const q of questions.filter((q) => q.type === "ESSAY")) {
    const raw = String(formData.get(`essay_${q.id}`) ?? "").trim()
    const n = Number(raw)
    if (raw === "" || !Number.isFinite(n) || n < 0 || n > q.points) errors[`essay_${q.id}`] = `Isi 0–${q.points}`
    else scores[q.id] = round2(n)
  }
  if (Object.keys(errors).length) return fail("Lengkapi poin esai yang ditandai.", errors)
  const feedback = String(formData.get("feedback") ?? "").trim().slice(0, 5000) || null
  const score = quizPercent(questions, scores)
  await db.attempt.update({ where: { id: attemptId }, data: { questionScores: scores, score, status: "GRADED", gradedAt: new Date(), gradedById: user.id, feedback } })
  await audit(attempt.status === "GRADED" ? "ATTEMPT_REGRADED" : "ATTEMPT_GRADED", { userId: user.id, entity: "Attempt", entityId: attemptId, metadata: { score, previous: attempt.score } })
  refresh()
  return ok(`Nilai ${attempt.user.name}: ${score}`)
}

/** Nilai Tugas (ASSIGNMENT): poin 0–maks + komentar. Penilaian ulang diperbolehkan. */
export async function gradeAssignment(attemptId: string, _prev: ActionResult, formData: FormData) {
  const user = await requireRole(...STAFF)
  const attempt = await db.attempt.findFirst({
    where: { id: attemptId, status: { in: ["SUBMITTED", "GRADED"] }, exam: { workType: "ASSIGNMENT", subject: managedSubjects(user) } },
    select: { id: true, status: true, score: true, exam: { select: { maxPoints: true } }, user: { select: { name: true } } },
  })
  if (!attempt) return fail("Tugas tidak ditemukan, belum diserahkan, atau di luar kewenangan Anda.")
  const max = attempt.exam.maxPoints ?? 100
  const raw = String(formData.get("points") ?? "").trim()
  const points = Number(raw.replace(",", "."))
  if (raw === "" || !Number.isFinite(points) || points < 0 || points > max) return fail("Periksa poin.", { points: `Isi 0–${max}` })
  const feedback = String(formData.get("feedback") ?? "").trim().slice(0, 5000) || null
  const score = round2((points / max) * 100)
  // updateMany + status: mahasiswa yang membatalkan pengiriman di detik yang sama tidak ikut "dinilai" sebagai draf.
  const r = await db.attempt.updateMany({ where: { id: attemptId, status: { in: ["SUBMITTED", "GRADED"] } }, data: { score, status: "GRADED", gradedAt: new Date(), gradedById: user.id, feedback } })
  if (r.count === 0) return fail("Mahasiswa baru saja membatalkan pengiriman — tunggu diserahkan ulang.")
  await audit(attempt.status === "GRADED" ? "ATTEMPT_REGRADED" : "ATTEMPT_GRADED", { userId: user.id, entity: "Attempt", entityId: attemptId, metadata: { points, max, score, previous: attempt.score } })
  refresh()
  return ok(`Nilai ${attempt.user.name}: ${round2(points)} / ${max}`)
}
