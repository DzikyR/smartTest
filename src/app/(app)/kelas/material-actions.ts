"use server"

import { createHash, randomBytes } from "node:crypto"
import { refresh } from "next/cache"
import { z } from "zod"
import { db } from "@/lib/db"
import { audit } from "@/lib/audit"
import { requireRole } from "@/lib/auth/dal"
import { STAFF } from "@/lib/auth/roles"
import { isFeatureEnabled } from "@/lib/features/access"
import { getManagedClass } from "@/lib/classes/access"
import { getMaterialAccess } from "@/lib/classes/materials"
import { rateLimit } from "@/lib/rate-limit"
import { safeFileName, sniffSubmission, SUBMISSION_FORMATS_LABEL, SUBMISSION_LIMITS } from "@/lib/submissions/files"
import { removeStoredFiles, saveStoredFile } from "@/lib/submissions/storage"
import { checkbox, optionalHttpUrl, optionalText } from "@/lib/validation"
import { fail, formObject, ok, prismaCode, zodFail, type ActionResult } from "@/lib/action-result"

const DENIED = "Kelas tidak ditemukan atau di luar kewenangan Anda."
const NOT_FOUND = "Materi tidak ditemukan."

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

/** Topik wajib milik kelas yang sama (mencegah memindahkan materi ke topik kelas lain). */
async function validTopic(groupId: string, topicId: string | null) {
  return !topicId || !!(await db.materialTopic.findFirst({ where: { id: topicId, groupId }, select: { id: true } }))
}

// ---------------------------------------------------------------------------
// Materi
// ---------------------------------------------------------------------------

const materialSchema = z
  .object({
    title: z.string().trim().max(150, "Maksimal 150 karakter").default(""),
    content: optionalText(10_000),
    type: z.enum(["TEXT", "LINK", "FILE", "ASSIGNMENT"], "Pilih jenis materi"),
    url: optionalHttpUrl,
    examId: z
      .string()
      .optional()
      .transform((v) => v || null),
    topicId: z
      .string()
      .optional()
      .transform((v) => v || null),
    publish: checkbox,
  })
  .superRefine((v, ctx) => {
    if (v.type !== "ASSIGNMENT" && !v.title) ctx.addIssue({ code: "custom", path: ["title"], message: "Wajib diisi" })
    if (v.type === "ASSIGNMENT" && !v.examId) ctx.addIssue({ code: "custom", path: ["examId"], message: "Pilih Tugas yang ditautkan" })
    if (v.type === "TEXT" && !v.content) ctx.addIssue({ code: "custom", path: ["content"], message: "Isi materi wajib diisi untuk jenis Teks" })
    if (v.type === "LINK" && !v.url) ctx.addIssue({ code: "custom", path: ["url"], message: "Tautan wajib diisi untuk jenis Tautan" })
  })

type StoredFile = { fileName: string; mimeType: string; size: number; storageKey: string; sha256: string }

/** Validasi & simpan berkas materi (aturan sama dengan lampiran ujian). null = tidak ada berkas baru. */
async function storeUpload(groupId: string, formData: FormData): Promise<StoredFile | null | ActionResult<never>> {
  const file = formData.get("file")
  if (!(file instanceof File) || file.size === 0) return null
  if (file.size > SUBMISSION_LIMITS.maxBytes) return fail(`Ukuran berkas maksimal ${SUBMISSION_LIMITS.maxBytes / 1024 / 1024} MB.`, { file: "Terlalu besar" })
  const bytes = new Uint8Array(await file.arrayBuffer())
  const fileName = safeFileName(file.name)
  const mimeType = sniffSubmission(bytes, fileName)
  if (!mimeType) return fail(`Format tidak didukung atau isi berkas tidak sesuai ekstensinya. Gunakan ${SUBMISSION_FORMATS_LABEL}.`, { file: "Format tidak didukung" })
  const storageKey = `materials/${groupId}/${randomBytes(16).toString("hex")}`
  await saveStoredFile(storageKey, bytes)
  return { fileName, mimeType, size: bytes.length, storageKey, sha256: createHash("sha256").update(bytes).digest("hex") }
}

/**
 * Jenis Tugas menautkan Tugas (Exam ASSIGNMENT) yang SUDAH ditujukan ke kelas ini —
 * pengumpulan & nilai tetap di mesin Tugas yang ada. Judul kosong = judul Tugas.
 */
async function resolveTask(groupId: string, v: { type: string; examId: string | null; title: string }): Promise<{ examId: string | null; title: string } | ActionResult<never>> {
  if (v.type !== "ASSIGNMENT") return { examId: null, title: v.title }
  const exam = await db.exam.findFirst({ where: { id: v.examId!, workType: "ASSIGNMENT", groups: { some: { groupId } } }, select: { id: true, title: true } })
  if (!exam) return fail("Tugas tidak ditemukan atau belum ditujukan ke kelas ini.", { examId: "Tidak valid" })
  return { examId: exam.id, title: v.title || exam.title }
}

const taskTaken = () => fail("Tugas ini sudah ditautkan di materi kelas.", { examId: "Sudah ditautkan" })

const isResult = (v: unknown): v is ActionResult<never> => !!v && typeof v === "object" && "ok" in v
const NO_FILE = { fileName: null, mimeType: null, size: null, storageKey: null, sha256: null }

export async function createMaterial(groupId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireManager(groupId)
  if (!user) return fail(DENIED)
  const parsed = materialSchema.safeParse(formObject(formData))
  if (!parsed.success) return zodFail(parsed.error)
  const { publish, topicId, type, content, url } = parsed.data
  if (!(await validTopic(groupId, topicId))) return fail("Topik tidak ditemukan.", { topicId: "Tidak valid" })
  const task = await resolveTask(groupId, parsed.data)
  if (isResult(task)) return task
  const data = { content, url, ...task }

  const stored = type === "FILE" ? await storeUpload(groupId, formData) : null
  if (isResult(stored)) return stored
  if (type === "FILE" && !stored) return fail("Pilih berkas terlebih dahulu.", { file: "Wajib diisi" })

  try {
    await db.material.create({
      data: {
        ...data,
        type,
        url: type === "LINK" ? data.url : null,
        ...(stored ?? NO_FILE),
        groupId,
        topicId,
        createdById: user.id,
        sortOrder: await nextMaterialOrder(groupId, topicId),
        status: publish ? "PUBLISHED" : "DRAFT",
        publishedAt: publish ? new Date() : null,
      },
    })
  } catch (e) {
    if (stored) await removeStoredFiles([stored.storageKey]) // jangan tinggalkan berkas yatim bila DB gagal
    if (prismaCode(e) === "P2002") return taskTaken()
    throw e
  }
  await audit("MATERIAL_CREATED", { userId: user.id, entity: "Group", entityId: groupId, metadata: { title: data.title, type, publish } })
  refresh()
  return ok(publish ? `Materi "${data.title}" diterbitkan.` : `Materi "${data.title}" disimpan sebagai draf.`)
}

export async function updateMaterial(groupId: string, materialId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireManager(groupId)
  if (!user) return fail(DENIED)
  const current = await db.material.findFirst({ where: { id: materialId, groupId }, select: { type: true, topicId: true, storageKey: true } })
  if (!current) return fail(NOT_FOUND)
  const parsed = materialSchema.safeParse(formObject(formData))
  if (!parsed.success) return zodFail(parsed.error)
  const { topicId, type, content, url } = parsed.data // status diatur lewat setMaterialPublished
  if (!(await validTopic(groupId, topicId))) return fail("Topik tidak ditemukan.", { topicId: "Tidak valid" })
  const task = await resolveTask(groupId, parsed.data)
  if (isResult(task)) return task
  const data = { content, url, ...task }

  const stored = type === "FILE" ? await storeUpload(groupId, formData) : null
  if (isResult(stored)) return stored
  if (type === "FILE" && !stored && !current.storageKey) return fail("Pilih berkas terlebih dahulu.", { file: "Wajib diisi" })

  // Berkas lama dibuang bila diganti, atau bila jenis bukan lagi Berkas.
  const dropOld = !!current.storageKey && (!!stored || type !== "FILE")
  try {
    await db.material.update({
      where: { id: materialId },
      data: {
        ...data,
        type,
        url: type === "LINK" ? data.url : null,
        ...(stored ?? (type === "FILE" ? {} : NO_FILE)),
        topicId,
        ...(topicId !== current.topicId ? { sortOrder: await nextMaterialOrder(groupId, topicId) } : {}),
      },
    })
  } catch (e) {
    if (stored) await removeStoredFiles([stored.storageKey])
    if (prismaCode(e) === "P2002") return taskTaken()
    throw e
  }
  if (dropOld) await removeStoredFiles([current.storageKey!])
  await audit("MATERIAL_UPDATED", { userId: user.id, entity: "Group", entityId: groupId, metadata: { materialId, title: data.title, type } })
  refresh()
  return ok("Materi disimpan.")
}

export async function deleteMaterial(groupId: string, materialId: string): Promise<ActionResult> {
  const user = await requireManager(groupId)
  if (!user) return fail(DENIED)
  const m = await db.material.findFirst({ where: { id: materialId, groupId }, select: { title: true, storageKey: true } })
  if (!m) return fail(NOT_FOUND)
  await db.material.delete({ where: { id: materialId } })
  if (m.storageKey) await removeStoredFiles([m.storageKey])
  await audit("MATERIAL_DELETED", { userId: user.id, entity: "Group", entityId: groupId, severity: "WARNING", metadata: { materialId, title: m.title } })
  refresh()
  return ok(`Materi "${m.title}" dihapus.`)
}

export async function setMaterialPublished(groupId: string, materialId: string, publish: boolean): Promise<ActionResult> {
  const user = await requireManager(groupId)
  if (!user) return fail(DENIED)
  const m = await db.material.findFirst({ where: { id: materialId, groupId }, select: { publishedAt: true } })
  if (!m) return fail(NOT_FOUND)
  await db.material.update({
    where: { id: materialId },
    // publishedAt = waktu terbit pertama; tidak di-reset saat dijadikan draf lagi
    data: { status: publish ? "PUBLISHED" : "DRAFT", ...(publish && !m.publishedAt ? { publishedAt: new Date() } : {}) },
  })
  await audit(publish ? "MATERIAL_PUBLISHED" : "MATERIAL_UNPUBLISHED", { userId: user.id, entity: "Group", entityId: groupId, metadata: { materialId } })
  refresh()
  return ok(publish ? "Materi diterbitkan — terlihat oleh anggota kelas." : "Materi dijadikan draf — disembunyikan dari mahasiswa.")
}

/** Geser materi naik/turun di dalam topiknya. */
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

/** Hapus topik; materinya TIDAK ikut terhapus, pindah ke "Tanpa topik" (onDelete: SetNull). */
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
  return ok(t._count.materials ? `Topik "${t.name}" dihapus. ${t._count.materials} materi dipindah ke "Tanpa topik".` : `Topik "${t.name}" dihapus.`)
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

/** Mahasiswa menandai/membatalkan "Selesai dibaca" (hanya materi terbit di kelasnya). */
export async function setMaterialDone(groupId: string, materialId: string, done: boolean): Promise<ActionResult> {
  const user = await requireRole("PESERTA")
  if (!(await getMaterialAccess(user, groupId, materialId))) return fail(NOT_FOUND)
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
