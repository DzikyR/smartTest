"use server"

import { headers } from "next/headers"
import { refresh } from "next/cache"
import { z } from "zod"
import { db } from "@/lib/db"
import { audit } from "@/lib/audit"
import { isAdmin, requireRole, type CurrentUser } from "@/lib/auth/dal"
import { MAX_ROSTER, parseRoster } from "@/lib/classes/roster"
import { STAFF } from "@/lib/auth/roles"
import { canManageSubject } from "@/lib/data/access"
import { isFeatureEnabled } from "@/lib/features/access"
import { FEATURE_DISABLED } from "@/lib/features/registry"
import { getManagedClass } from "@/lib/classes/access"
import { createClassCode } from "@/lib/classes/codes"
import { joinWithCode, type JoinResult } from "@/lib/classes/join"
import { clientIp } from "@/lib/rate-limit"
import { optionalLocalDateTime, optionalText } from "@/lib/validation"
import { fail, formObject, ok, prismaCode, zodFail, type ActionResult } from "@/lib/action-result"

// ---------------------------------------------------------------------------
// Peserta: gabung kelas lewat kode
// ---------------------------------------------------------------------------

export async function joinClassAction(code: string): Promise<JoinResult> {
  const user = await requireRole()
  const result = await joinWithCode(user, code, clientIp(await headers()))
  if (result.ok && !result.already) refresh()
  return result
}

const studentId = z
  .string()
  .trim()
  .min(3, "Minimal 3 karakter")
  .max(50)
  .regex(/^[A-Za-z0-9._-]+$/, "Hanya huruf, angka, titik, strip, garis bawah")
  .transform((v) => v.toLowerCase())

/**
 * Lengkapi NIM (username) sebelum bergabung. Hanya bila masih kosong — NIM yang
 * sudah terisi hanya bisa diubah Admin, agar tidak bisa mengaku NIM orang lain.
 */
export async function completeStudentId(raw: string): Promise<ActionResult> {
  const user = await requireRole("PESERTA")
  if (user.username) return fail("NIM sudah terisi. Hubungi admin bila perlu diubah.")
  const parsed = studentId.safeParse(raw)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "NIM tidak valid", { studentId: parsed.error.issues[0]?.message ?? "Tidak valid" })
  try {
    const updated = await db.user.updateMany({ where: { id: user.id, username: null }, data: { username: parsed.data } })
    if (updated.count === 0) return fail("NIM sudah terisi. Hubungi admin bila perlu diubah.")
  } catch (e) {
    if (prismaCode(e) === "P2002") return fail("NIM ini sudah dipakai akun lain. Hubungi admin bila NIM Anda dipakai orang lain.", { studentId: "Sudah dipakai" })
    throw e
  }
  await audit("STUDENT_ID_SET", { userId: user.id, entity: "User", entityId: user.id, metadata: { username: parsed.data } })
  return ok("NIM disimpan.")
}

// ---------------------------------------------------------------------------
// Pengajar: buat & atur kelas
// ---------------------------------------------------------------------------

async function requireClassTeacher() {
  const user = await requireRole(...STAFF)
  return (await isFeatureEnabled("kelas.kelola", user.role)) ? user : null
}

/** Kelas yang dikelola actor; null bila bukan miliknya/tidak ada (dibalas "tidak ditemukan", bukan "dilarang"). */
async function managed(actor: CurrentUser | null, id: string) {
  return actor ? getManagedClass(actor, id) : null
}

const checkbox = z.preprocess((v) => v === "on" || v === "true", z.boolean())

const classSchema = z.object({
  name: z.string().trim().min(3, "Minimal 3 karakter").max(80, "Maksimal 80 karakter"),
  term: optionalText(40),
  description: optionalText(500),
  subjectId: z
    .string()
    .optional()
    .transform((v) => v || null),
  joinPolicy: z.enum(["AUTO", "APPROVAL"]).default("AUTO"),
  requireStudentId: checkbox,
})

async function validSubject(actor: CurrentUser, subjectId: string | null) {
  return !subjectId || canManageSubject(actor, subjectId)
}

const nameTaken = () => fail("Nama kelas sudah dipakai. Tambahkan kelas/semester, mis. “Algoritma — IF-1A 2026 Ganjil”.", { name: "Sudah dipakai" })

export async function createClass(_prev: ActionResult, formData: FormData): Promise<ActionResult<{ href: string }>> {
  const actor = await requireClassTeacher()
  if (!actor) return fail(FEATURE_DISABLED)
  const parsed = classSchema.safeParse(formObject(formData))
  if (!parsed.success) return zodFail(parsed.error)
  if (!(await validSubject(actor, parsed.data.subjectId))) return fail("Anda tidak mengelola mata uji ini.", { subjectId: "Tidak diizinkan" })
  try {
    const group = await db.$transaction(async (tx) => {
      const g = await tx.group.create({ data: { ...parsed.data, ownerId: actor.id }, select: { id: true } })
      await createClassCode(tx, g.id, actor.id)
      return g
    })
    await audit("CLASS_CREATED", { userId: actor.id, entity: "Group", entityId: group.id })
    refresh()
    return ok(`Kelas "${parsed.data.name}" dibuat. Bagikan kodenya ke mahasiswa.`, { href: `/kelas/${group.id}?tab=pengaturan` })
  } catch (e) {
    if (prismaCode(e) === "P2002") return nameTaken()
    throw e
  }
}

const settingsSchema = classSchema.extend({ joinLocked: checkbox })

export async function updateClass(id: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const actor = await requireClassTeacher()
  const cls = await managed(actor, id)
  if (!actor || !cls) return fail("Kelas tidak ditemukan.")
  const parsed = settingsSchema.safeParse(formObject(formData))
  if (!parsed.success) return zodFail(parsed.error)
  if (!(await validSubject(actor, parsed.data.subjectId))) return fail("Anda tidak mengelola mata uji ini.", { subjectId: "Tidak diizinkan" })
  try {
    await db.group.update({ where: { id }, data: parsed.data })
  } catch (e) {
    if (prismaCode(e) === "P2002") return nameTaken()
    throw e
  }
  await audit("CLASS_UPDATED", { userId: actor.id, entity: "Group", entityId: id, metadata: { joinLocked: parsed.data.joinLocked, joinPolicy: parsed.data.joinPolicy } })
  refresh()
  return ok("Pengaturan kelas disimpan.")
}

export async function setClassArchived(id: string, archived: boolean): Promise<ActionResult> {
  const actor = await requireClassTeacher()
  if (!actor || !(await managed(actor, id))) return fail("Kelas tidak ditemukan.")
  await db.group.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } })
  await audit(archived ? "CLASS_ARCHIVED" : "CLASS_UNARCHIVED", { userId: actor.id, entity: "Group", entityId: id })
  refresh()
  return ok(archived ? "Kelas diarsipkan — kode tidak lagi menerima anggota baru." : "Kelas diaktifkan kembali.")
}

// ---------------------------------------------------------------------------
// Pengajar: kode kelas
// ---------------------------------------------------------------------------

/** Ganti kode (mis. bocor): kode lama REVOKED & langsung mati, anggota lama tidak terpengaruh. */
export async function rotateClassCode(id: string): Promise<ActionResult> {
  const actor = await requireClassTeacher()
  if (!actor || !(await managed(actor, id))) return fail("Kelas tidak ditemukan.")
  const code = await db.$transaction(async (tx) => {
    await tx.accessCode.updateMany({ where: { groupId: id, status: { not: "REVOKED" } }, data: { status: "REVOKED", revokedAt: new Date() } })
    return createClassCode(tx, id, actor.id)
  })
  await audit("CLASS_CODE_ROTATED", { userId: actor.id, entity: "Group", entityId: id, severity: "WARNING" })
  refresh()
  return ok(`Kode baru: ${code.code}. Kode lama sudah tidak berlaku.`)
}

/** Jeda/aktifkan kode tanpa menggantinya (kode yang sama, tidak perlu disebar ulang). */
export async function setClassCodeEnabled(id: string, enabled: boolean): Promise<ActionResult> {
  const actor = await requireClassTeacher()
  if (!actor || !(await managed(actor, id))) return fail("Kelas tidak ditemukan.")
  const r = await db.accessCode.updateMany({ where: { groupId: id, status: enabled ? "DISABLED" : "ACTIVE" }, data: { status: enabled ? "ACTIVE" : "DISABLED" } })
  if (r.count === 0) return fail("Kode tidak ditemukan — buat kode baru.")
  await audit(enabled ? "CLASS_CODE_ENABLED" : "CLASS_CODE_DISABLED", { userId: actor.id, entity: "Group", entityId: id })
  refresh()
  return ok(enabled ? "Kode diaktifkan." : "Kode dinonaktifkan — tidak ada yang bisa bergabung sampai diaktifkan lagi.")
}

const limitsSchema = z.object({
  expiresAt: optionalLocalDateTime,
  maxUses: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v) : null))
    .pipe(z.number().int("Bilangan bulat").min(1, "Minimal 1").max(10_000).nullable()),
})

export async function setClassCodeLimits(id: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const actor = await requireClassTeacher()
  if (!actor || !(await managed(actor, id))) return fail("Kelas tidak ditemukan.")
  const parsed = limitsSchema.safeParse(formObject(formData))
  if (!parsed.success) return zodFail(parsed.error)
  const r = await db.accessCode.updateMany({ where: { groupId: id, status: { not: "REVOKED" } }, data: parsed.data })
  if (r.count === 0) return fail("Kode tidak ditemukan — buat kode baru.")
  await audit("CLASS_CODE_LIMITS", { userId: actor.id, entity: "Group", entityId: id, metadata: { expiresAt: parsed.data.expiresAt?.toISOString() ?? null, maxUses: parsed.data.maxUses } })
  refresh()
  return ok("Batas kode disimpan.")
}

// ---------------------------------------------------------------------------
// Pengajar: anggota
// ---------------------------------------------------------------------------

/**
 * Ubah status satu anggota. `where` gabungan (groupId + userId) DAN kelas harus
 * dikelola actor → pengajar kelas A tidak bisa menyentuh anggota kelas B.
 */
async function updateMember(id: string, userId: string, from: ("ACTIVE" | "PENDING" | "REMOVED")[], data: { status: "ACTIVE" | "REMOVED"; blockRejoin?: boolean }, action: string, message: string) {
  const actor = await requireClassTeacher()
  if (!actor || !(await managed(actor, id))) return fail("Kelas tidak ditemukan.")
  const r = await db.groupMember.updateMany({
    where: { groupId: id, userId, role: "STUDENT", status: { in: from } },
    data: { ...data, removedAt: data.status === "REMOVED" ? new Date() : null, ...(data.status === "ACTIVE" ? { blockRejoin: false } : {}) },
  })
  if (r.count === 0) return fail("Anggota tidak ditemukan atau statusnya sudah berubah.")
  await audit(action, { userId: actor.id, entity: "Group", entityId: id, severity: data.status === "REMOVED" ? "WARNING" : "INFO", metadata: { member: userId, block: data.blockRejoin ?? false } })
  refresh()
  return ok(message)
}

export async function approveMember(id: string, userId: string) {
  return updateMember(id, userId, ["PENDING"], { status: "ACTIVE" }, "CLASS_MEMBER_APPROVED", "Anggota disetujui.")
}

export async function rejectMember(id: string, userId: string) {
  return updateMember(id, userId, ["PENDING"], { status: "REMOVED" }, "CLASS_MEMBER_REJECTED", "Permintaan bergabung ditolak.")
}

export async function removeMember(id: string, userId: string, block: boolean) {
  return updateMember(id, userId, ["ACTIVE", "PENDING"], { status: "REMOVED", blockRejoin: block }, "CLASS_MEMBER_REMOVED", block ? "Anggota dikeluarkan dan diblokir." : "Anggota dikeluarkan — riwayat nilainya tetap tersimpan.")
}

export async function restoreMember(id: string, userId: string) {
  return updateMember(id, userId, ["REMOVED"], { status: "ACTIVE" }, "CLASS_MEMBER_RESTORED", "Anggota dikembalikan ke kelas.")
}

// ---------------------------------------------------------------------------
// Pemilik kelas: co-teacher (pengajar pendamping)
// ---------------------------------------------------------------------------

/** Hanya pemilik kelas atau Admin yang mengatur co-teacher (co-teacher tidak bisa mengundang orang lain). */
async function ownedClass(actor: CurrentUser | null, id: string) {
  const cls = await managed(actor, id)
  return actor && cls && (cls.ownerId === actor.id || isAdmin(actor)) ? cls : null
}

export async function addCoTeacher(id: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const actor = await requireClassTeacher()
  const cls = await ownedClass(actor, id)
  if (!actor || !cls) return fail("Hanya pemilik kelas atau Admin yang dapat menambah pengajar.")
  const identifier = String(formData.get("identifier") ?? "").trim().toLowerCase()
  if (!identifier) return fail("Isi email atau username pengajar.", { identifier: "Wajib diisi" })
  const teacher = await db.user.findFirst({
    where: { isActive: true, role: { in: ["DOSEN", "ADMIN"] }, OR: [{ email: identifier }, { username: identifier }] },
    select: { id: true, name: true },
  })
  if (!teacher) return fail("Pengajar tidak ditemukan (harus akun Pengajar/Admin yang aktif).", { identifier: "Tidak ditemukan" })
  if (teacher.id === cls.ownerId) return fail("Ia sudah pemilik kelas ini.", { identifier: "Pemilik kelas" })
  await db.groupMember.upsert({
    where: { groupId_userId: { groupId: id, userId: teacher.id } },
    create: { groupId: id, userId: teacher.id, role: "TEACHER" },
    update: { role: "TEACHER", status: "ACTIVE", removedAt: null, blockRejoin: false },
  })
  await audit("CLASS_TEACHER_ADDED", { userId: actor.id, entity: "Group", entityId: id, metadata: { teacher: teacher.id } })
  refresh()
  return ok(`${teacher.name} ditambahkan sebagai pengajar.`)
}

export async function removeCoTeacher(id: string, userId: string): Promise<ActionResult> {
  const actor = await requireClassTeacher()
  if (!actor || !(await ownedClass(actor, id))) return fail("Hanya pemilik kelas atau Admin yang dapat mengatur pengajar.")
  const r = await db.groupMember.deleteMany({ where: { groupId: id, userId, role: "TEACHER" } })
  if (r.count === 0) return fail("Pengajar tidak ditemukan.")
  await audit("CLASS_TEACHER_REMOVED", { userId: actor.id, entity: "Group", entityId: id, severity: "WARNING", metadata: { teacher: userId } })
  refresh()
  return ok("Pengajar dicabut dari kelas.")
}

// ---------------------------------------------------------------------------
// Pengajar: daftar NIM resmi (roster)
// ---------------------------------------------------------------------------

/** Ganti seluruh daftar NIM + atur "hanya NIM terdaftar". Kosongkan untuk menghapus daftar. */
export async function saveRoster(id: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const actor = await requireClassTeacher()
  if (!actor || !(await managed(actor, id))) return fail("Kelas tidak ditemukan.")
  const { entries, invalid } = parseRoster(String(formData.get("roster") ?? ""))
  if (invalid.length) return fail(`${invalid.length} baris tidak valid (mis. "${invalid[0]}"). NIM: 3–50 huruf/angka/titik/strip.`, { roster: "Periksa baris yang tidak valid" })
  if (entries.length > MAX_ROSTER) return fail(`Maksimal ${MAX_ROSTER} NIM per kelas.`, { roster: "Terlalu banyak" })
  const rosterOnly = formData.get("rosterOnly") === "on"
  if (rosterOnly && entries.length === 0) return fail("Isi daftar NIM sebelum mengaktifkan “hanya NIM terdaftar”.", { roster: "Daftar kosong" })
  await db.$transaction([
    db.classRoster.deleteMany({ where: { groupId: id } }),
    db.classRoster.createMany({ data: entries.map((e) => ({ groupId: id, ...e })) }),
    // Daftar NIM yang dipakai sebagai syarat menyiratkan NIM wajib diisi.
    db.group.update({ where: { id }, data: { rosterOnly, ...(rosterOnly ? { requireStudentId: true } : {}) } }),
  ])
  await audit("CLASS_ROSTER_SAVED", { userId: actor.id, entity: "Group", entityId: id, metadata: { count: entries.length, rosterOnly } })
  refresh()
  return ok(`Daftar NIM disimpan (${entries.length} NIM)${rosterOnly ? " — hanya NIM terdaftar yang dapat bergabung" : ""}.`)
}
