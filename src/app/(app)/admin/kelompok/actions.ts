"use server"

import { refresh } from "next/cache"
import { z } from "zod"
import { db } from "@/lib/db"
import { audit } from "@/lib/audit"
import { requireRole } from "@/lib/auth/dal"
import { isFeatureEnabled } from "@/lib/features/access"
import { FEATURE_DISABLED } from "@/lib/features/registry"
import { ADMINS } from "@/lib/auth/roles"
import { fail, formObject, ok, prismaCode, zodFail, type ActionResult } from "@/lib/action-result"
import { optionalText } from "@/lib/validation"

/** Admin + fitur Kelompok Peserta aktif; null bila fitur dinonaktifkan. */
async function requireGroupAdmin() {
  const user = await requireRole(...ADMINS)
  return (await isFeatureEnabled("admin.kelompok", user.role)) ? user : null
}

const schema = z.object({
  name: z.string().trim().min(2, "Minimal 2 karakter").max(80),
  description: optionalText(500),
})

export async function createGroup(_prev: ActionResult, formData: FormData) {
  const actor = await requireGroupAdmin()
  if (!actor) return fail(FEATURE_DISABLED)
  const parsed = schema.safeParse(formObject(formData))
  if (!parsed.success) return zodFail(parsed.error)
  try {
    const g = await db.group.create({ data: parsed.data, select: { id: true } })
    await audit("GROUP_CREATED", { userId: actor.id, entity: "Group", entityId: g.id })
  } catch (e) {
    if (prismaCode(e) === "P2002") return fail("Nama kelompok sudah dipakai.", { name: "Sudah dipakai" })
    throw e
  }
  refresh()
  return ok(`Kelompok "${parsed.data.name}" dibuat.`)
}

export async function updateGroup(id: string, _prev: ActionResult, formData: FormData) {
  if (!(await requireGroupAdmin())) return fail(FEATURE_DISABLED)
  const parsed = schema.safeParse(formObject(formData))
  if (!parsed.success) return zodFail(parsed.error)
  try {
    await db.group.update({ where: { id }, data: parsed.data })
  } catch (e) {
    if (prismaCode(e) === "P2002") return fail("Nama kelompok sudah dipakai.", { name: "Sudah dipakai" })
    throw e
  }
  refresh()
  return ok("Kelompok disimpan.")
}

export async function deleteGroup(id: string): Promise<ActionResult<{ href: string }>> {
  const actor = await requireGroupAdmin()
  if (!actor) return fail(FEATURE_DISABLED)
  const g = await db.group.delete({ where: { id }, select: { name: true } }).catch(() => null)
  if (!g) return fail("Kelompok tidak ditemukan.")
  await audit("GROUP_DELETED", { userId: actor.id, entity: "Group", entityId: id, severity: "WARNING", metadata: { name: g.name } })
  refresh()
  return ok(`Kelompok "${g.name}" dihapus (akun peserta tidak ikut terhapus).`, { href: "/admin/kelompok" })
}

/** Tambah anggota dari daftar email/username (satu per baris, koma, atau spasi). */
export async function addMembers(groupId: string, _prev: ActionResult, formData: FormData) {
  if (!(await requireGroupAdmin())) return fail(FEATURE_DISABLED)
  const ids = [...new Set(formData.getAll("userId").map(String).filter(Boolean))]
  const list = String(formData.get("identifiers") ?? "")
    .split(/[\s,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 2000)
  if (ids.length === 0 && list.length === 0) return fail("Pilih peserta atau tulis email/NIM.", { identifiers: "Wajib diisi" })

  const users = await db.user.findMany({
    where: { role: "PESERTA", OR: [{ id: { in: ids } }, { email: { in: list } }, { username: { in: list } }] },
    select: { id: true, email: true, username: true },
  })
  const found = new Set(users.flatMap((u) => [u.email, u.username ?? ""]))
  const missing = list.filter((l) => !found.has(l))
  const userIds = users.map((u) => u.id)
  const [created, restored] = await db.$transaction([
    db.groupMember.createMany({ data: userIds.map((userId) => ({ groupId, userId })), skipDuplicates: true }),
    // Ditambahkan Admin = keputusan sadar: pulihkan yang pernah dikeluarkan/menunggu (termasuk yang diblokir).
    db.groupMember.updateMany({ where: { groupId, userId: { in: userIds }, role: "STUDENT", status: { not: "ACTIVE" } }, data: { status: "ACTIVE", blockRejoin: false, removedAt: null } }),
  ])
  refresh()
  return ok(`${created.count + restored.count} peserta ditambahkan${missing.length ? `; tidak ditemukan: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? "…" : ""}` : ""}.`)
}

export async function removeMember(groupId: string, userId: string): Promise<ActionResult> {
  if (!(await requireGroupAdmin())) return fail(FEATURE_DISABLED)
  await db.groupMember.deleteMany({ where: { groupId, userId } })
  refresh()
  return ok("Peserta dikeluarkan dari kelompok.")
}
