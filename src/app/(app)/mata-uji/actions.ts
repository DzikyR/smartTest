"use server"

import { refresh } from "next/cache"
import { z } from "zod"
import { db } from "@/lib/db"
import { audit } from "@/lib/audit"
import { requireRole } from "@/lib/auth/dal"
import { ADMINS } from "@/lib/auth/roles"
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

export async function createSubject(_prev: ActionResult, formData: FormData) {
  const actor = await requireRole(...ADMINS)
  const parsed = schema.safeParse(formObject(formData))
  if (!parsed.success) return zodFail(parsed.error)
  const lecturers = await lecturerIds(formData)
  try {
    const s = await db.subject.create({
      data: { ...parsed.data, code: parsed.data.code.toUpperCase(), lecturers: { create: lecturers.map((userId) => ({ userId })) } },
      select: { id: true },
    })
    await audit("SUBJECT_CREATED", { userId: actor.id, entity: "Subject", entityId: s.id })
  } catch (e) {
    if (prismaCode(e) === "P2002") return fail("Kode sudah dipakai.", { code: "Kode sudah dipakai" })
    throw e
  }
  refresh()
  return ok(`Mata uji "${parsed.data.name}" ditambahkan.`)
}

export async function updateSubject(id: string, _prev: ActionResult, formData: FormData) {
  const actor = await requireRole(...ADMINS)
  const parsed = schema.safeParse(formObject(formData))
  if (!parsed.success) return zodFail(parsed.error)
  const lecturers = await lecturerIds(formData)
  try {
    await db.$transaction([
      db.subject.update({ where: { id }, data: { ...parsed.data, code: parsed.data.code.toUpperCase() } }),
      db.subjectLecturer.deleteMany({ where: { subjectId: id } }),
      db.subjectLecturer.createMany({ data: lecturers.map((userId) => ({ subjectId: id, userId })) }),
    ])
  } catch (e) {
    if (prismaCode(e) === "P2002") return fail("Kode sudah dipakai.", { code: "Kode sudah dipakai" })
    if (prismaCode(e) === "P2025") return fail("Mata uji tidak ditemukan.")
    throw e
  }
  await audit("SUBJECT_UPDATED", { userId: actor.id, entity: "Subject", entityId: id })
  refresh()
  return ok("Mata uji disimpan.")
}

export async function setSubjectActive(id: string, active: boolean): Promise<ActionResult> {
  await requireRole(...ADMINS)
  await db.subject.update({ where: { id }, data: { isActive: active } })
  refresh()
  return ok(active ? "Mata uji diaktifkan." : "Mata uji dinonaktifkan — ujiannya tidak tampil ke peserta.")
}

export async function deleteSubject(id: string): Promise<ActionResult> {
  const actor = await requireRole(...ADMINS)
  const exams = await db.exam.count({ where: { subjectId: id } })
  if (exams > 0) return fail(`Mata uji masih memiliki ${exams} ujian. Hapus ujiannya atau nonaktifkan mata uji ini.`)
  const s = await db.subject.delete({ where: { id }, select: { name: true } }).catch(() => null)
  if (!s) return fail("Mata uji tidak ditemukan.")
  await audit("SUBJECT_DELETED", { userId: actor.id, entity: "Subject", entityId: id, severity: "WARNING", metadata: { name: s.name } })
  refresh()
  return ok(`Mata uji "${s.name}" beserta bank soalnya dihapus.`)
}
