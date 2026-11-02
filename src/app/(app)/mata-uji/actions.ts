"use server"

import { refresh } from "next/cache"
import { z } from "zod"
import { db } from "@/lib/db"
import { audit } from "@/lib/audit"
import { isAdmin, requireRole } from "@/lib/auth/dal"
import { STAFF } from "@/lib/auth/roles"
import { canManageSubject } from "@/lib/data/access"
import { fail, formObject, ok, prismaCode, zodFail, type ActionResult } from "@/lib/action-result"
import { code, optionalText } from "@/lib/validation"

const schema = z.object({
  code: code(30),
  name: z.string().trim().min(3, "Minimal 3 karakter").max(150),
  type: z.enum(["MATA_KULIAH", "UMUM"], "Pilih jenis mata uji"),
  description: optionalText(2000),
})

/** Dosen pengelola (hanya akun ber-role DOSEN yang aktif). */
async function lecturerIds(formData: FormData) {
  const ids = [...new Set(formData.getAll("lecturerId").map(String))].slice(0, 50)
  if (ids.length === 0) return []
  const rows = await db.user.findMany({ where: { id: { in: ids }, role: "DOSEN" }, select: { id: true } })
  return rows.map((r) => r.id)
}

const NOT_FOUND = "Mata uji tidak ditemukan."
const CODE_TAKEN = "Kode sudah dipakai mata uji lain. Pakai kode berbeda, mis. tambahkan kelas: IF201-A."

/**
 * Pengajar sudah divalidasi admin saat role-nya ditetapkan, jadi ia boleh membuat mata uji sendiri
 * dan otomatis menjadi pengelolanya. Penunjukan pengelola lain tetap wewenang admin.
 */
export async function createSubject(_prev: ActionResult, formData: FormData) {
  const actor = await requireRole(...STAFF)
  const parsed = schema.safeParse(formObject(formData))
  if (!parsed.success) return zodFail(parsed.error)
  const lecturers = isAdmin(actor) ? await lecturerIds(formData) : [actor.id]
  try {
    const s = await db.subject.create({
      data: { ...parsed.data, code: parsed.data.code.toUpperCase(), lecturers: { create: lecturers.map((userId) => ({ userId })) } },
      select: { id: true },
    })
    await audit("SUBJECT_CREATED", { userId: actor.id, entity: "Subject", entityId: s.id })
  } catch (e) {
    if (prismaCode(e) === "P2002") return fail(CODE_TAKEN, { code: "Kode sudah dipakai" })
    throw e
  }
  refresh()
  return ok(`Mata uji "${parsed.data.name}" ditambahkan.`)
}

export async function updateSubject(id: string, _prev: ActionResult, formData: FormData) {
  const actor = await requireRole(...STAFF)
  if (!(await canManageSubject(actor, id))) return fail(NOT_FOUND)
  const parsed = schema.safeParse(formObject(formData))
  if (!parsed.success) return zodFail(parsed.error)
  const update = db.subject.update({ where: { id }, data: { ...parsed.data, code: parsed.data.code.toUpperCase() } })
  try {
    if (isAdmin(actor)) {
      const lecturers = await lecturerIds(formData)
      await db.$transaction([
        update,
        db.subjectLecturer.deleteMany({ where: { subjectId: id } }),
        db.subjectLecturer.createMany({ data: lecturers.map((userId) => ({ subjectId: id, userId })) }),
      ])
    } else {
      await update // pengajar tidak mengubah daftar pengelola
    }
  } catch (e) {
    if (prismaCode(e) === "P2002") return fail(CODE_TAKEN, { code: "Kode sudah dipakai" })
    if (prismaCode(e) === "P2025") return fail("Mata uji tidak ditemukan.")
    throw e
  }
  await audit("SUBJECT_UPDATED", { userId: actor.id, entity: "Subject", entityId: id })
  refresh()
  return ok("Mata uji disimpan.")
}

export async function setSubjectActive(id: string, active: boolean): Promise<ActionResult> {
  const actor = await requireRole(...STAFF)
  if (!(await canManageSubject(actor, id))) return fail(NOT_FOUND)
  await db.subject.update({ where: { id }, data: { isActive: active } })
  refresh()
  return ok(active ? "Mata uji diaktifkan." : "Mata uji dinonaktifkan — ujiannya tidak tampil ke peserta.")
}

export async function deleteSubject(id: string): Promise<ActionResult> {
  const actor = await requireRole(...STAFF)
  if (!(await canManageSubject(actor, id))) return fail(NOT_FOUND)
  if (!isAdmin(actor)) {
    const others = await db.subjectLecturer.count({ where: { subjectId: id, userId: { not: actor.id } } })
    if (others > 0) return fail("Mata uji ini juga dikelola pengajar lain, jadi tidak dapat Anda hapus. Hubungi admin.")
  }
  const exams = await db.exam.count({ where: { subjectId: id } })
  if (exams > 0) return fail(`Mata uji masih memiliki ${exams} ujian. Hapus ujiannya atau nonaktifkan mata uji ini.`)
  const s = await db.subject.delete({ where: { id }, select: { name: true } }).catch(() => null)
  if (!s) return fail("Mata uji tidak ditemukan.")
  await audit("SUBJECT_DELETED", { userId: actor.id, entity: "Subject", entityId: id, severity: "WARNING", metadata: { name: s.name } })
  refresh()
  return ok(`Mata uji "${s.name}" beserta bank soalnya dihapus.`)
}
