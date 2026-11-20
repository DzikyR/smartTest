"use server"

import { createHash, randomBytes } from "node:crypto"
import { refresh } from "next/cache"
import { z } from "zod"
import { Prisma } from "@/generated/prisma/client"
import { db } from "@/lib/db"
import { audit } from "@/lib/audit"
import { requireRole, type CurrentUser } from "@/lib/auth/dal"
import { STAFF } from "@/lib/auth/roles"
import { isFeatureEnabled } from "@/lib/features/access"
import { ensurePersonalSpace, getManagedExam } from "@/lib/data/access"
import { getManagedClass, managedClasses } from "@/lib/classes/access"
import { getMaterialAccess, removeUnusedFiles } from "@/lib/classes/materials"
import { checkFileBatch, parseLinks, POST_KIND_LABEL, POST_KINDS, reusableDueAt, type LinkAttachment, type PostKindValue } from "@/lib/classes/posts"
import { parseAnswer } from "@/lib/exam/question-input"
import { invalidateExamQuestions } from "@/lib/exam/question-cache"
import { rateLimit } from "@/lib/rate-limit"
import { safeFileName, sniffSubmission, SUBMISSION_FORMATS_LABEL } from "@/lib/submissions/files"
import { removeStoredFiles, saveStoredFile } from "@/lib/submissions/storage"
import { checkbox, optionalLocalDateTime, optionalNumber, optionalText } from "@/lib/validation"
import { fail, formObject, ok, prismaCode, zodFail, type ActionResult } from "@/lib/action-result"

const DENIED = "Kelas tidak ditemukan atau di luar kewenangan Anda."
const NOT_FOUND = "Postingan tidak ditemukan."
/** Nilai khusus pilihan Topik: buat topik baru dari isian `newTopic`. */
const NEW_TOPIC = "__new__"

/**
 * Pengelola materi = pengelola kelas (pemilik, co-teacher aktif, atau Admin) dan
 * fitur "kelas.kelola" aktif. Kelas orang lain dibalas "tidak ditemukan" (anti-IDOR).
 */
async function requireManager(groupId: string) {
  const user = await requireRole(...STAFF)
  if (!(await isFeatureEnabled("kelas.kelola", user.role))) return null
  return (await getManagedClass(user, groupId)) ? user : null
}

type Dir = "up" | "down"

/** Tukar posisi dengan tetangga lalu tulis ulang urutan 0..n (sekaligus merapikan celah). */
function reorder<T extends { id: string }>(list: T[], id: string, dir: Dir) {
  const i = list.findIndex((x) => x.id === id)
  const j = dir === "up" ? i - 1 : i + 1
  if (i < 0 || j < 0 || j >= list.length) return null
  const next = [...list]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

async function nextMaterialOrder(groupId: string, topicId: string | null) {
  const last = await db.material.aggregate({ where: { groupId, topicId }, _max: { sortOrder: true } })
  return (last._max.sortOrder ?? -1) + 1
}

const isResult = (v: unknown): v is ActionResult<never> => !!v && typeof v === "object" && "ok" in v

/** Topik bernama `name` di kelas; dibuat bila belum ada (aman terhadap balapan nama unik). */
async function ensureTopic(groupId: string, name: string) {
  const found = await db.materialTopic.findFirst({ where: { groupId, name }, select: { id: true } })
  if (found) return found.id
  const last = await db.materialTopic.aggregate({ where: { groupId }, _max: { sortOrder: true } })
  try {
    return (await db.materialTopic.create({ data: { groupId, name, sortOrder: (last._max.sortOrder ?? -1) + 1 }, select: { id: true } })).id
  } catch (e) {
    if (prismaCode(e) !== "P2002") throw e
    return (await db.materialTopic.findFirstOrThrow({ where: { groupId, name }, select: { id: true } })).id
  }
}

/** Topik dari form: topik kelas ini, "Tanpa topik", atau topik baru. Topik kelas lain ditolak. */
async function resolveTopic(groupId: string, topicId: string | null, newTopic: string | null): Promise<string | null | ActionResult<never>> {
  if (topicId === NEW_TOPIC) {
    if (!newTopic) return fail("Isi nama topik baru.", { newTopic: "Wajib diisi" })
    return ensureTopic(groupId, newTopic)
  }
  if (!topicId) return null
  const t = await db.materialTopic.findFirst({ where: { id: topicId, groupId }, select: { id: true } })
  return t ? t.id : fail("Topik tidak ditemukan.", { topicId: "Tidak valid" })
}

// ---------------------------------------------------------------------------
// Lampiran (multi-berkas + multi-tautan)
// ---------------------------------------------------------------------------

type StoredFile = { name: string; mimeType: string; size: number; storageKey: string; sha256: string }
type NewAttachments = { files: StoredFile[]; links: LinkAttachment[] }

/**
 * Validasi SEMUA berkas & tautan baru lebih dulu (ukuran, isi berkas/magic bytes,
 * format tautan), baru kemudian ditulis ke disk — satu berkas buruk menggagalkan
 * semuanya tanpa meninggalkan berkas yatim.
 */
async function collectAttachments(groupId: string, formData: FormData, existingCount: number): Promise<NewAttachments | ActionResult<never>> {
  const uploads = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0)
  const { links, error: linkError } = parseLinks(formData.getAll("linkUrl").map(String), formData.getAll("linkTitle").map(String))
  if (linkError) return fail(linkError, { attachments: linkError })
  const batchError = checkFileBatch(uploads, existingCount + links.length)
  if (batchError) return fail(batchError, { attachments: batchError })

  const ready: { name: string; mimeType: string; bytes: Uint8Array }[] = []
  for (const file of uploads) {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const name = safeFileName(file.name)
    const mimeType = sniffSubmission(bytes, name)
    if (!mimeType) {
      const msg = `"${name}": format tidak didukung atau isi berkas tidak sesuai ekstensinya. Gunakan ${SUBMISSION_FORMATS_LABEL}.`
      return fail(msg, { attachments: msg })
    }
    ready.push({ name, mimeType, bytes })
  }

  const files: StoredFile[] = []
  try {
    for (const f of ready) {
      const storageKey = `materials/${groupId}/${randomBytes(16).toString("hex")}`
      await saveStoredFile(storageKey, f.bytes)
      files.push({ name: f.name, mimeType: f.mimeType, size: f.bytes.length, storageKey, sha256: createHash("sha256").update(f.bytes).digest("hex") })
    }
  } catch (e) {
    await removeStoredFiles(files.map((f) => f.storageKey))
    throw e
  }
  return { files, links }
}

function attachmentRows({ files, links }: NewAttachments, start: number) {
  return [
    ...files.map((f) => ({ type: "FILE" as const, name: f.name, storageKey: f.storageKey, mimeType: f.mimeType, size: f.size, sha256: f.sha256 })),
    ...links.map((l) => ({ type: l.type, name: l.name, url: l.url })),
  ].map((row, i) => ({ ...row, sortOrder: start + i }))
}

const dropNew = (a: NewAttachments) => removeStoredFiles(a.files.map((f) => f.storageKey))

// ---------------------------------------------------------------------------
// Pekerjaan tertaut (Tugas / Pertanyaan dibuat di mesin ujian; Tugas Kuis memilih ujian CBT)
// ---------------------------------------------------------------------------

/** Batas kelas tujuan satu postingan (posting ke beberapa kelas). */
const MAX_TARGETS = 30

/**
 * Kelas tujuan "+ Buat": kelas asal (selalu pertama) + kelas lain yang dicentang,
 * disaring ke kelas AKTIF yang dikelola pengguna — ID di luar itu diabaikan (anti-IDOR).
 */
async function targetClasses(user: CurrentUser, groupId: string, formData: FormData) {
  const ids = [...new Set(formData.getAll("targetGroupId").map(String).filter((id) => id && id !== groupId))].slice(0, MAX_TARGETS)
  const others = ids.length
    ? await db.group.findMany({ where: { AND: [{ id: { in: ids } }, { archivedAt: null }, managedClasses(user)] }, orderBy: { name: "asc" }, select: { id: true, name: true } })
    : []
  return [{ id: groupId, name: "" }, ...others]
}

/** Kategori bawaan "Kuis" (sama dengan bawaan form ujian), bila ada. */
async function defaultCategoryId() {
  return (await db.examCategory.findFirst({ where: { kind: "KUIS", isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true } }))?.id ?? null
}

/** Bidang dasar Exam untuk pekerjaan ala Classroom: tanpa durasi, satu kali kirim, tanpa acak. */
const WORK_DEFAULTS = { kind: "KUIS" as const, durationMinutes: 60, timed: false, maxAttempts: 1, questionsPerPage: 1, shuffleQuestions: false, shuffleOptions: false }

const postSchema = z.object({
  title: z.string().trim().max(150, "Maksimal 150 karakter").default(""),
  content: optionalText(10_000),
  topicId: z
    .string()
    .optional()
    .transform((v) => v || null),
  newTopic: z
    .string()
    .trim()
    .max(80, "Maksimal 80 karakter")
    .optional()
    .transform((v) => v || null),
  publish: checkbox,
  dueAt: optionalLocalDateTime,
  maxPoints: optionalNumber(1, 1000, "Poin", false),
  examId: z
    .string()
    .optional()
    .transform((v) => v || null),
  qType: z.enum(["ESSAY", "MULTIPLE_CHOICE"]).default("ESSAY"),
})
type PostInput = z.infer<typeof postSchema>

/** Aturan per jenis postingan (pesan per field). */
function kindErrors(kind: PostKindValue, v: PostInput, editing: boolean) {
  const errors: Record<string, string> = {}
  if (kind !== "TUGAS_KUIS" && !v.title) errors.title = "Wajib diisi"
  if (kind === "TUGAS" && v.title && v.title.length < 3) errors.title = "Minimal 3 karakter"
  if (kind === "TUGAS" && v.maxPoints === null) errors.maxPoints = "Isi poin maksimal"
  if (kind === "PERTANYAAN" && v.title && v.title.length < 5) errors.title = "Minimal 5 karakter"
  if (kind === "PERTANYAAN" && v.maxPoints !== null && v.maxPoints > 100) errors.maxPoints = "Poin pertanyaan 1–100"
  if (kind === "TUGAS_KUIS" && !editing && !v.examId) errors.examId = "Pilih ujian CBT"
  return errors
}

/** Satu soal Pertanyaan: jawaban singkat (dinilai manual) atau pilihan ganda (dikoreksi otomatis). */
function questionFromForm(v: PostInput, formData: FormData) {
  const answer = parseAnswer(v.qType, formData)
  if (Object.keys(answer.errors).length) return { error: fail("Periksa pilihan jawaban.", answer.errors) }
  return {
    question: {
      type: v.qType,
      prompt: v.title,
      options: answer.options ?? Prisma.DbNull,
      answerKey: answer.answerKey ?? Prisma.DbNull,
      points: v.maxPoints ?? 1,
      order: 1,
    },
  }
}

/** Ujian CBT (Tugas Kuis) yang boleh ditautkan: dikelola pengguna & berjenis kuis. */
async function linkableQuiz(user: CurrentUser, examId: string) {
  const exam = await getManagedExam(user, examId)
  return exam && exam.workType === "QUIZ" ? exam : null
}

const workTaken = () => fail("Pekerjaan ini sudah ditautkan di kelas ini.", { examId: "Sudah ditautkan" })

// ---------------------------------------------------------------------------
// Buat postingan (+ Buat → Tugas / Tugas Kuis / Pertanyaan / Materi)
// ---------------------------------------------------------------------------

export async function createPost(groupId: string, kind: PostKindValue, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireManager(groupId)
  if (!user) return fail(DENIED)
  if (!POST_KINDS.includes(kind)) return fail("Jenis postingan tidak dikenal.")
  const parsed = postSchema.safeParse(formObject(formData))
  if (!parsed.success) return zodFail(parsed.error)
  const v = parsed.data
  const errors = kindErrors(kind, v, false)
  if (Object.keys(errors).length) return fail("Periksa kembali isian yang ditandai.", errors)

  // Kelas tujuan: kelas ini + kelas aktif lain yang DIKELOLA pengguna (ID lain diabaikan).
  const targets = await targetClasses(user, groupId, formData)

  // Validasi pekerjaan tertaut sebelum menyentuh disk
  let question: ReturnType<typeof questionFromForm>["question"] | null = null
  let quiz: Awaited<ReturnType<typeof linkableQuiz>> = null
  if (kind === "PERTANYAAN") {
    const q = questionFromForm(v, formData)
    if (q.error) return q.error
    question = q.question
  }
  if (kind === "TUGAS_KUIS") {
    quiz = await linkableQuiz(user, v.examId!)
    if (!quiz) return fail("Ujian tidak ditemukan atau di luar kewenangan Anda.", { examId: "Tidak valid" })
    const taken = await db.material.findMany({ where: { groupId: { in: targets.map((t) => t.id) }, examId: quiz.id }, select: { group: { select: { name: true } } } })
    if (taken.length) return fail(`Ujian ini sudah ditautkan di kelas ${taken.map((t) => t.group.name).join(", ")}.`, { examId: "Sudah ditautkan" })
  }

  const topicId = await resolveTopic(groupId, v.topicId, v.newTopic)
  if (isResult(topicId)) return topicId
  const attachments = await collectAttachments(groupId, formData, 0)
  if (isResult(attachments)) return attachments

  const title = v.title || quiz?.title.slice(0, 150) || ""
  const now = new Date()
  // Tugas/Pertanyaan selalu masuk RUANG AJAR pembuatnya (tanpa syarat mata uji kelas);
  // akses pengelolaannya dihitung dari kelas tujuan (lihat managedExams).
  let subjectId: string | null = null
  let categoryId: string | null = null
  let placed: { groupId: string; topicId: string | null; sortOrder: number }[]
  try {
    if (kind === "TUGAS" || kind === "PERTANYAAN") {
      subjectId = await ensurePersonalSpace(user)
      categoryId = await defaultCategoryId()
    }
    // Topik di kelas lain disamakan menurut nama (dibuat bila belum ada), seperti "Gunakan kembali".
    const topicName = topicId ? (await db.materialTopic.findUnique({ where: { id: topicId }, select: { name: true } }))?.name : null
    placed = []
    for (const t of targets) {
      const tTopic = t.id === groupId ? topicId : topicName ? await ensureTopic(t.id, topicName) : null
      placed.push({ groupId: t.id, topicId: tTopic, sortOrder: await nextMaterialOrder(t.id, tTopic) })
    }
  } catch (e) {
    await dropNew(attachments)
    throw e
  }

  try {
    // Satu transaksi: salinan untuk SEMUA kelas tujuan dibuat, atau tidak sama sekali.
    await db.$transaction(async (tx) => {
      for (const target of placed) {
        let examId: string | null = null
        if (subjectId) {
          const exam = await tx.exam.create({
            data: {
              ...WORK_DEFAULTS,
              title,
              instructions: v.content,
              categoryId,
              subjectId,
              createdById: user.id,
              workType: kind === "TUGAS" ? "ASSIGNMENT" : "QUESTION",
              maxPoints: kind === "TUGAS" ? v.maxPoints : null,
              dueAt: v.dueAt,
              publishedAt: v.publish ? now : null,
              groups: { create: [{ groupId: target.groupId }] },
              ...(question ? { questions: { create: [question] } } : {}),
            },
            select: { id: true },
          })
          examId = exam.id
        }
        if (quiz) {
          // Menautkan kuis = menujukannya ke kelas ini (struktur & alur CBT tidak berubah)
          await tx.examGroup.upsert({ where: { examId_groupId: { examId: quiz.id, groupId: target.groupId } }, create: { examId: quiz.id, groupId: target.groupId }, update: {} })
          examId = quiz.id
        }
        await tx.material.create({
          data: {
            kind,
            title,
            content: v.content,
            groupId: target.groupId,
            topicId: target.topicId,
            examId,
            createdById: user.id,
            sortOrder: target.sortOrder,
            status: v.publish ? "PUBLISHED" : "DRAFT",
            publishedAt: v.publish ? now : null,
            // Semua salinan menunjuk berkas fisik yang SAMA (tanpa unggah ulang)
            attachments: { create: attachmentRows(attachments, 0) },
          },
        })
      }
    })
  } catch (e) {
    await dropNew(attachments) // jangan tinggalkan berkas yatim bila DB gagal
    if (prismaCode(e) === "P2002") return workTaken()
    throw e
  }
  const others = targets.filter((t) => t.id !== groupId)
  await audit("MATERIAL_CREATED", {
    userId: user.id,
    entity: "Group",
    entityId: groupId,
    metadata: { title, kind, publish: v.publish, files: attachments.files.length, links: attachments.links.length, alsoPostedTo: others.map((t) => t.id) },
  })
  refresh()
  const label = POST_KIND_LABEL[kind]
  const where = others.length ? ` di ${targets.length} kelas` : ""
  const quizNote = quiz && !quiz.publishedAt && v.publish ? " Ujian CBT-nya belum terbit, jadi mahasiswa belum melihatnya sampai ujian diterbitkan." : ""
  return ok(v.publish ? `${label} "${title}" diterbitkan${where}.${quizNote}` : `${label} "${title}" disimpan sebagai draf${where}.`)
}

// ---------------------------------------------------------------------------
// Ubah / hapus / terbitkan / urutkan
// ---------------------------------------------------------------------------

export async function updatePost(groupId: string, materialId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireManager(groupId)
  if (!user) return fail(DENIED)
  const current = await db.material.findFirst({
    where: { id: materialId, groupId },
    select: { kind: true, topicId: true, examId: true, attachments: { select: { id: true, storageKey: true, sortOrder: true } }, exam: { select: { title: true, startAt: true, endAt: true } } },
  })
  if (!current) return fail(NOT_FOUND)
  const parsed = postSchema.safeParse(formObject(formData))
  if (!parsed.success) return zodFail(parsed.error)
  const v = parsed.data // status diatur lewat setMaterialPublished; jenis tidak bisa diganti
  const kind = current.kind
  const errors = kindErrors(kind, v, true)
  if (Object.keys(errors).length) return fail("Periksa kembali isian yang ditandai.", errors)

  // Tugas/Pertanyaan: tenggat & skor tersimpan di ujiannya → wajib berhak mengelola ujiannya (lihat managedExams)
  const work = (kind === "TUGAS" || kind === "PERTANYAAN") && current.examId ? await getManagedExam(user, current.examId) : null
  if ((kind === "TUGAS" || kind === "PERTANYAAN") && current.examId && !work) return fail(`Hanya pengampu mata uji yang dapat mengubah ${POST_KIND_LABEL[kind]} ini.`)
  if (work && v.dueAt && work.endAt && v.dueAt > work.endAt) return fail("Periksa tenggat.", { dueAt: "Tenggat tidak boleh setelah waktu tutup pekerjaan" })
  if (work && v.dueAt && work.startAt && v.dueAt <= work.startAt) return fail("Periksa tenggat.", { dueAt: "Tenggat harus setelah waktu buka pekerjaan" })

  const topicId = await resolveTopic(groupId, v.topicId, v.newTopic)
  if (isResult(topicId)) return topicId
  const keep = new Set(formData.getAll("keepAttachment").map(String))
  const removed = current.attachments.filter((a) => !keep.has(a.id))
  const kept = current.attachments.length - removed.length
  const attachments = await collectAttachments(groupId, formData, kept)
  if (isResult(attachments)) return attachments

  const title = v.title || current.exam?.title.slice(0, 150) || ""
  const start = Math.max(-1, ...current.attachments.map((a) => a.sortOrder)) + 1
  // Soal Pertanyaan hanya diselaraskan selama belum ada jawaban yang dikumpulkan (penilaian adil)
  const lockedQuestion = work?.workType === "QUESTION" ? (await db.attempt.count({ where: { examId: work.id, status: { not: "IN_PROGRESS" } } })) > 0 : true
  try {
    await db.$transaction(async (tx) => {
      if (work) {
        await tx.exam.update({
          where: { id: work.id },
          data: { title, instructions: v.content, dueAt: v.dueAt, ...(work.workType === "ASSIGNMENT" ? { maxPoints: v.maxPoints } : {}) },
        })
        if (!lockedQuestion) await tx.examQuestion.updateMany({ where: { examId: work.id }, data: { prompt: title, ...(v.maxPoints ? { points: v.maxPoints } : {}) } })
      }
      await tx.material.update({
        where: { id: materialId },
        data: { title, content: v.content, topicId, ...(topicId !== current.topicId ? { sortOrder: await nextMaterialOrder(groupId, topicId) } : {}) },
      })
      if (removed.length) await tx.materialAttachment.deleteMany({ where: { materialId, id: { in: removed.map((a) => a.id) } } })
      const rows = attachmentRows(attachments, start)
      if (rows.length) await tx.materialAttachment.createMany({ data: rows.map((r) => ({ ...r, materialId })) })
    })
  } catch (e) {
    await dropNew(attachments)
    throw e
  }
  if (work && !lockedQuestion) invalidateExamQuestions(work.id)
  await removeUnusedFiles(removed.map((a) => a.storageKey))
  await audit("MATERIAL_UPDATED", { userId: user.id, entity: "Group", entityId: groupId, metadata: { materialId, title, kind, added: attachments.files.length + attachments.links.length, removed: removed.length } })
  refresh()
  return ok(`${POST_KIND_LABEL[kind]} disimpan.`)
}

/**
 * Hapus postingan beserta lampirannya. Tugas/Pertanyaan yang dibuat dari kelas ini
 * ikut terhapus bila belum ada yang mengerjakan & hanya ditujukan ke kelas ini;
 * selain itu pekerjaannya dipertahankan (tetap di tab Ujian & Tugas, nilai aman).
 */
export async function deleteMaterial(groupId: string, materialId: string): Promise<ActionResult> {
  const user = await requireManager(groupId)
  if (!user) return fail(DENIED)
  const m = await db.material.findFirst({ where: { id: materialId, groupId }, select: { title: true, kind: true, examId: true, attachments: { select: { storageKey: true } } } })
  if (!m) return fail(NOT_FOUND)
  const work = (m.kind === "TUGAS" || m.kind === "PERTANYAAN") && m.examId ? await getManagedExam(user, m.examId) : null
  const dropWork = !!work && work._count.attempts === 0 && work.groups.every((g) => g.group.id === groupId) && (await db.material.count({ where: { examId: work.id } })) === 1
  const examFiles = dropWork ? await db.examAttachment.findMany({ where: { examId: work!.id }, select: { storageKey: true } }) : []

  await db.$transaction(async (tx) => {
    await tx.material.delete({ where: { id: materialId } })
    if (dropWork) await tx.exam.delete({ where: { id: work!.id } })
  })
  await removeUnusedFiles(m.attachments.map((a) => a.storageKey))
  if (examFiles.length) await removeStoredFiles(examFiles.map((f) => f.storageKey))
  await audit("MATERIAL_DELETED", { userId: user.id, entity: "Group", entityId: groupId, severity: "WARNING", metadata: { materialId, title: m.title, kind: m.kind, examDeleted: dropWork ? m.examId : null } })
  refresh()
  const kept = m.examId && !dropWork ? " Pekerjaannya tetap ada di tab Ujian & Tugas." : ""
  return ok(`${POST_KIND_LABEL[m.kind]} "${m.title}" dihapus.${kept}`)
}

export async function setMaterialPublished(groupId: string, materialId: string, publish: boolean): Promise<ActionResult> {
  const user = await requireManager(groupId)
  if (!user) return fail(DENIED)
  const m = await db.material.findFirst({ where: { id: materialId, groupId }, select: { publishedAt: true, kind: true, examId: true } })
  if (!m) return fail(NOT_FOUND)
  // Tugas/Pertanyaan ikut diterbitkan/ditarik bersama postingannya (bila pengguna mengelola ujiannya)
  const work = (m.kind === "TUGAS" || m.kind === "PERTANYAAN") && m.examId ? await getManagedExam(user, m.examId) : null
  if (publish && work?.workType === "QUESTION" && work._count.questions !== 1) return fail("Pertanyaan harus berisi tepat satu soal. Periksa soalnya di halaman Pertanyaan.")
  if (publish && work?.workType === "ASSIGNMENT" && !work.maxPoints) return fail("Isi poin maksimal Tugas sebelum menerbitkan.")
  const now = new Date()
  await db.$transaction([
    db.material.update({
      where: { id: materialId },
      // publishedAt = waktu terbit pertama; tidak di-reset saat dijadikan draf lagi
      data: { status: publish ? "PUBLISHED" : "DRAFT", ...(publish && !m.publishedAt ? { publishedAt: now } : {}) },
    }),
    ...(work ? [db.exam.update({ where: { id: work.id }, data: { publishedAt: publish ? (work.publishedAt ?? now) : null } })] : []),
  ])
  await audit(publish ? "MATERIAL_PUBLISHED" : "MATERIAL_UNPUBLISHED", { userId: user.id, entity: "Group", entityId: groupId, metadata: { materialId, examId: work?.id } })
  refresh()
  const quiz = m.kind === "TUGAS_KUIS" && m.examId ? await db.exam.findUnique({ where: { id: m.examId }, select: { publishedAt: true } }) : null
  const quizNote = publish && quiz && !quiz.publishedAt ? " Ujian CBT-nya belum terbit, jadi mahasiswa belum melihatnya sampai ujian diterbitkan." : ""
  return ok(publish ? `Diterbitkan — terlihat oleh anggota kelas.${quizNote}` : "Dijadikan draf — disembunyikan dari mahasiswa.")
}

/** Geser postingan naik/turun di dalam topiknya. */
export async function moveMaterial(groupId: string, materialId: string, dir: Dir): Promise<ActionResult> {
  const user = await requireManager(groupId)
  if (!user) return fail(DENIED)
  const m = await db.material.findFirst({ where: { id: materialId, groupId }, select: { topicId: true } })
  if (!m) return fail(NOT_FOUND)
  const siblings = await db.material.findMany({ where: { groupId, topicId: m.topicId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true } })
  const next = reorder(siblings, materialId, dir)
  if (!next) return ok()
  await db.$transaction(next.map((x, i) => db.material.update({ where: { id: x.id }, data: { sortOrder: i } })))
  refresh()
  return ok()
}

// ---------------------------------------------------------------------------
// Gunakan kembali postingan (dari kelas lain yang dikelola pengajar yang sama)
// ---------------------------------------------------------------------------

/**
 * Salin postingan ke kelas ini sebagai DRAF. Lampiran disalin sebagai baris baru
 * yang menunjuk berkas fisik yang SAMA (tanpa unggah ulang). Topik disamakan
 * menurut nama (dibuat bila belum ada). Tugas/Pertanyaan disalin sebagai pekerjaan
 * baru (soal ikut, tanpa jawaban/nilai); Tugas Kuis menautkan ujian CBT yang sama.
 */
export async function reusePost(groupId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireManager(groupId)
  if (!user) return fail(DENIED)
  const sourceId = String(formData.get("sourceId") ?? "")
  if (!sourceId) return fail("Pilih postingan yang akan digunakan kembali.", { sourceId: "Wajib dipilih" })
  const src = await db.material.findFirst({
    where: { id: sourceId, groupId: { not: groupId }, group: managedClasses(user) },
    select: {
      title: true,
      content: true,
      kind: true,
      examId: true,
      topic: { select: { name: true } },
      attachments: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { type: true, name: true, url: true, storageKey: true, mimeType: true, size: true, sha256: true, sortOrder: true } },
    },
  })
  if (!src) return fail("Postingan sumber tidak ditemukan atau di luar kewenangan Anda.", { sourceId: "Tidak valid" })

  const exam = src.examId ? await getManagedExam(user, src.examId) : null
  if (src.examId && !exam) return fail(`Hanya pengampu mata uji yang dapat menggunakan kembali ${POST_KIND_LABEL[src.kind]} ini.`)
  if (src.kind === "TUGAS_KUIS" && exam && (await db.material.findFirst({ where: { groupId, examId: exam.id }, select: { id: true } }))) return workTaken()
  const questions = exam && src.kind !== "TUGAS_KUIS" ? await db.examQuestion.findMany({ where: { examId: exam.id }, orderBy: { order: "asc" } }) : []
  // Salinan Tugas/Pertanyaan masuk ruang ajar PENYALIN (bukan mata uji/ruang ajar kelas sumber),
  // sehingga pengelola kelas tujuan pasti berhak menilainya.
  const copySubjectId = exam && src.kind !== "TUGAS_KUIS" ? await ensurePersonalSpace(user) : null

  const topicId = src.topic ? await ensureTopic(groupId, src.topic.name) : null
  const sortOrder = await nextMaterialOrder(groupId, topicId)
  try {
    await db.$transaction(async (tx) => {
      let examId: string | null = null
      if (exam && src.kind === "TUGAS_KUIS") {
        await tx.examGroup.upsert({ where: { examId_groupId: { examId: exam.id, groupId } }, create: { examId: exam.id, groupId }, update: {} })
        examId = exam.id
      } else if (exam) {
        // Pekerjaan baru untuk kelas ini: jadwal buka/tutup dikosongkan, tenggat lampau dibuang, belum terbit
        const copy = await tx.exam.create({
          data: {
            title: exam.title,
            kind: exam.kind,
            categoryId: exam.categoryId,
            instructions: exam.instructions,
            durationMinutes: exam.durationMinutes,
            timed: exam.timed,
            maxAttempts: exam.maxAttempts,
            questionsPerPage: exam.questionsPerPage,
            passingScore: exam.passingScore,
            shuffleQuestions: exam.shuffleQuestions,
            shuffleOptions: exam.shuffleOptions,
            showScore: exam.showScore,
            rules: exam.rules,
            workType: exam.workType,
            maxPoints: exam.maxPoints,
            dueAt: reusableDueAt(exam.dueAt),
            subjectId: copySubjectId!,
            createdById: user.id,
            groups: { create: [{ groupId }] },
            questions: {
              create: questions.map((q) => ({ type: q.type, prompt: q.prompt, options: q.options ?? Prisma.DbNull, answerKey: q.answerKey ?? Prisma.DbNull, points: q.points, order: q.order, sourceId: q.sourceId })),
            },
          },
          select: { id: true },
        })
        examId = copy.id
      }
      await tx.material.create({
        data: {
          kind: src.kind,
          title: src.title,
          content: src.content,
          groupId,
          topicId,
          examId,
          createdById: user.id,
          sortOrder,
          status: "DRAFT",
          attachments: { create: src.attachments.map(({ sortOrder: order, ...a }) => ({ ...a, sortOrder: order })) },
        },
      })
    })
  } catch (e) {
    if (prismaCode(e) === "P2002") return workTaken()
    throw e
  }
  await audit("MATERIAL_REUSED", { userId: user.id, entity: "Group", entityId: groupId, metadata: { from: sourceId, kind: src.kind, attachments: src.attachments.length } })
  refresh()
  return ok(`"${src.title}" disalin ke kelas ini sebagai draf. Periksa, lalu terbitkan.`)
}

// ---------------------------------------------------------------------------
// Topik
// ---------------------------------------------------------------------------

const topicSchema = z.object({ name: z.string().trim().min(1, "Wajib diisi").max(80, "Maksimal 80 karakter") })
const topicTaken = () => fail("Topik dengan nama ini sudah ada di kelas.", { name: "Sudah dipakai" })

export async function createTopic(groupId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireManager(groupId)
  if (!user) return fail(DENIED)
  const parsed = topicSchema.safeParse(formObject(formData))
  if (!parsed.success) return zodFail(parsed.error)
  const last = await db.materialTopic.aggregate({ where: { groupId }, _max: { sortOrder: true } })
  try {
    await db.materialTopic.create({ data: { groupId, name: parsed.data.name, sortOrder: (last._max.sortOrder ?? -1) + 1 } })
  } catch (e) {
    if (prismaCode(e) === "P2002") return topicTaken()
    throw e
  }
  refresh()
  return ok(`Topik "${parsed.data.name}" dibuat.`)
}

export async function renameTopic(groupId: string, topicId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireManager(groupId)
  if (!user) return fail(DENIED)
  const parsed = topicSchema.safeParse(formObject(formData))
  if (!parsed.success) return zodFail(parsed.error)
  try {
    const r = await db.materialTopic.updateMany({ where: { id: topicId, groupId }, data: { name: parsed.data.name } })
    if (r.count === 0) return fail("Topik tidak ditemukan.")
  } catch (e) {
    if (prismaCode(e) === "P2002") return topicTaken()
    throw e
  }
  refresh()
  return ok("Topik diganti namanya.")
}

/** Hapus topik; postingannya TIDAK ikut terhapus, pindah ke "Tanpa topik" (onDelete: SetNull). */
export async function deleteTopic(groupId: string, topicId: string): Promise<ActionResult> {
  const user = await requireManager(groupId)
  if (!user) return fail(DENIED)
  const t = await db.materialTopic.findFirst({ where: { id: topicId, groupId }, select: { name: true, _count: { select: { materials: true } } } })
  if (!t) return fail("Topik tidak ditemukan.")
  const base = await nextMaterialOrder(groupId, null)
  await db.$transaction(async (tx) => {
    // taruh di akhir "Tanpa topik" dengan urutan semula
    const moved = await tx.material.findMany({ where: { topicId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true } })
    for (const [i, m] of moved.entries()) await tx.material.update({ where: { id: m.id }, data: { topicId: null, sortOrder: base + i } })
    await tx.materialTopic.delete({ where: { id: topicId } })
  })
  await audit("MATERIAL_TOPIC_DELETED", { userId: user.id, entity: "Group", entityId: groupId, metadata: { name: t.name, materials: t._count.materials } })
  refresh()
  return ok(t._count.materials ? `Topik "${t.name}" dihapus. ${t._count.materials} postingan dipindah ke "Tanpa topik".` : `Topik "${t.name}" dihapus.`)
}

export async function moveTopic(groupId: string, topicId: string, dir: Dir): Promise<ActionResult> {
  const user = await requireManager(groupId)
  if (!user) return fail(DENIED)
  const topics = await db.materialTopic.findMany({ where: { groupId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true } })
  const next = reorder(topics, topicId, dir)
  if (!next) return topics.some((t) => t.id === topicId) ? ok() : fail("Topik tidak ditemukan.")
  await db.$transaction(next.map((x, i) => db.materialTopic.update({ where: { id: x.id }, data: { sortOrder: i } })))
  refresh()
  return ok()
}

// ---------------------------------------------------------------------------
// Progres & diskusi (mahasiswa anggota aktif + pengelola kelas)
// ---------------------------------------------------------------------------

/** Mahasiswa menandai/membatalkan "Selesai dibaca" (hanya Materi terbit di kelasnya). */
export async function setMaterialDone(groupId: string, materialId: string, done: boolean): Promise<ActionResult> {
  const user = await requireRole("PESERTA")
  const access = await getMaterialAccess(user, groupId, materialId)
  if (!access || access.material.kind !== "MATERI") return fail(NOT_FOUND)
  const key = { materialId_userId: { materialId, userId: user.id } }
  if (done) await db.materialProgress.upsert({ where: key, create: { materialId, userId: user.id }, update: {} })
  else await db.materialProgress.deleteMany({ where: { materialId, userId: user.id } })
  refresh()
  return ok(done ? "Ditandai selesai dibaca." : "Tanda selesai dibatalkan.")
}

const commentSchema = z.object({ body: z.string().trim().min(1, "Tulis komentar terlebih dahulu").max(2000, "Maksimal 2.000 karakter") })

export async function addMaterialComment(groupId: string, materialId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireRole()
  if (!(await getMaterialAccess(user, groupId, materialId))) return fail(NOT_FOUND)
  if (!rateLimit(`material-comment:${user.id}`, 10, 60_000).ok) return fail("Terlalu banyak komentar. Coba lagi sebentar lagi.")
  const parsed = commentSchema.safeParse(formObject(formData))
  if (!parsed.success) return zodFail(parsed.error)
  await db.materialComment.create({ data: { materialId, authorId: user.id, body: parsed.data.body } })
  refresh()
  return ok("Komentar terkirim.")
}

/** Hapus komentar: penulisnya sendiri, atau pengelola kelas (moderasi). */
export async function deleteMaterialComment(groupId: string, materialId: string, commentId: string): Promise<ActionResult> {
  const user = await requireRole()
  const access = await getMaterialAccess(user, groupId, materialId)
  const c = access ? await db.materialComment.findFirst({ where: { id: commentId, materialId }, select: { authorId: true } }) : null
  if (!access || !c || (!access.manage && c.authorId !== user.id)) return fail("Komentar tidak ditemukan.")
  await db.materialComment.delete({ where: { id: commentId } })
  if (c.authorId !== user.id) await audit("MATERIAL_COMMENT_REMOVED", { userId: user.id, entity: "Group", entityId: groupId, metadata: { materialId, authorId: c.authorId } })
  refresh()
  return ok("Komentar dihapus.")
}
