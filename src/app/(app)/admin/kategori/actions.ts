"use server"

import { refresh } from "next/cache"
import { z } from "zod"
import { db } from "@/lib/db"
import { audit } from "@/lib/audit"
import { requireRole } from "@/lib/auth/dal"
import { ADMINS } from "@/lib/auth/roles"
import { fail, formObject, ok, prismaCode, zodFail, type ActionResult } from "@/lib/action-result"

const schema = z.object({
  name: z.string().trim().min(2, "Minimal 2 karakter").max(40, "Maksimal 40 karakter"),
  kind: z.enum(["KUIS", "UTS", "UAS", "TRYOUT", "LATIHAN", "LAINNYA"], "Pilih perilaku dasar"),
  sortOrder: z.coerce.number().int().min(0).max(999).default(100),
})

const taken = () => fail("Nama kategori sudah ada.", { name: "Sudah ada" })

export async function createCategory(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const actor = await requireRole(...ADMINS)
  const parsed = schema.safeParse(formObject(formData))
  if (!parsed.success) return zodFail(parsed.error)
  try {
    const c = await db.examCategory.create({ data: parsed.data, select: { id: true } })
    await audit("CATEGORY_CREATED", { userId: actor.id, entity: "ExamCategory", entityId: c.id, metadata: parsed.data })
  } catch (e) {
    if (prismaCode(e) === "P2002") return taken()
    throw e
  }
  refresh()
  return ok(`Kategori "${parsed.data.name}" dibuat.`)
}

/** Ubah kategori. Perilaku dasar (kind) ujian yang sudah ada TIDAK ikut berubah — hanya ujian baru/yang disimpan ulang. */
export async function updateCategory(id: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const actor = await requireRole(...ADMINS)
  const parsed = schema.safeParse(formObject(formData))
  if (!parsed.success) return zodFail(parsed.error)
  try {
    await db.examCategory.update({ where: { id }, data: parsed.data })
  } catch (e) {
    if (prismaCode(e) === "P2002") return taken()
    if (prismaCode(e) === "P2025") return fail("Kategori tidak ditemukan.")
    throw e
  }
  await audit("CATEGORY_UPDATED", { userId: actor.id, entity: "ExamCategory", entityId: id, metadata: parsed.data })
  refresh()
  return ok("Kategori disimpan.")
}

/** Nonaktif = tidak bisa dipilih untuk ujian baru; ujian yang sudah memakainya tidak terpengaruh. */
export async function setCategoryActive(id: string, active: boolean): Promise<ActionResult> {
  const actor = await requireRole(...ADMINS)
  const r = await db.examCategory.updateMany({ where: { id }, data: { isActive: active } })
  if (r.count === 0) return fail("Kategori tidak ditemukan.")
  await audit(active ? "CATEGORY_ENABLED" : "CATEGORY_DISABLED", { userId: actor.id, entity: "ExamCategory", entityId: id })
  refresh()
  return ok(active ? "Kategori diaktifkan." : "Kategori dinonaktifkan — tidak bisa dipilih untuk ujian baru.")
}
