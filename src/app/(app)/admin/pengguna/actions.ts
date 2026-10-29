"use server"

import { refresh } from "next/cache"
import ExcelJS from "exceljs"
import { z } from "zod"
import type { Role } from "@/generated/prisma/enums"
import { db } from "@/lib/db"
import { audit } from "@/lib/audit"
import { requireRole, type CurrentUser } from "@/lib/auth/dal"
import { ADMINS } from "@/lib/auth/roles"
import { generateTempPassword, hashPassword } from "@/lib/password"
import { fail, formObject, ok, prismaCode, zodFail, type ActionResult } from "@/lib/action-result"
import { MAX_UPLOAD_BYTES } from "@/lib/exam/office"

/** Role yang boleh dikelola: Super Admin → semua; Admin → Dosen & Peserta. */
export async function assignableRoles(actor: { role: Role }): Promise<Role[]> {
  return actor.role === "SUPER_ADMIN" ? ["SUPER_ADMIN", "ADMIN", "DOSEN", "PESERTA"] : ["DOSEN", "PESERTA"]
}

const username = z
  .string()
  .trim()
  .max(50)
  .regex(/^[A-Za-z0-9._-]*$/, "Hanya huruf, angka, titik, strip, garis bawah")
  .optional()
  .transform((v) => (v ? v.toLowerCase() : null))

const schema = z.object({
  name: z.string().trim().min(2, "Minimal 2 karakter").max(120),
  email: z.email("Email tidak valid").max(254).transform((v) => v.toLowerCase().trim()),
  username,
  role: z.enum(["SUPER_ADMIN", "ADMIN", "DOSEN", "PESERTA"], "Pilih role"),
})

async function guardTarget(actor: CurrentUser, userId: string) {
  const target = await db.user.findUnique({ where: { id: userId }, select: { id: true, role: true, name: true } })
  if (!target) return { error: fail("Pengguna tidak ditemukan.") }
  if (!(await assignableRoles(actor)).includes(target.role)) return { error: fail("Anda tidak berwenang mengelola akun ini.") }
  return { target }
}

function dupe(e: unknown) {
  if (prismaCode(e) !== "P2002") return null
  const target = String((e as { meta?: { target?: unknown } }).meta?.target ?? "")
  return target.includes("username") ? fail("Username/NIM sudah dipakai.", { username: "Sudah dipakai" }) : fail("Email sudah terdaftar.", { email: "Sudah terdaftar" })
}

export async function createUser(_prev: ActionResult, formData: FormData) {
  const actor = await requireRole(...ADMINS)
  const parsed = schema.safeParse(formObject(formData))
  if (!parsed.success) return zodFail(parsed.error)
  if (!(await assignableRoles(actor)).includes(parsed.data.role)) return fail("Anda tidak berwenang membuat akun dengan role ini.", { role: "Tidak diizinkan" })

  const password = generateTempPassword()
  const groupId = String(formData.get("groupId") ?? "") || null
  try {
    const user = await db.user.create({
      data: {
        ...parsed.data,
        passwordHash: await hashPassword(password),
        mustChangePassword: true,
        ...(groupId && parsed.data.role === "PESERTA" ? { memberships: { create: { groupId } } } : {}),
      },
      select: { id: true },
    })
    await audit("USER_CREATED", { userId: actor.id, entity: "User", entityId: user.id, metadata: { role: parsed.data.role } })
  } catch (e) {
    const d = dupe(e)
    if (d) return d
    throw e
  }
  refresh()
  return ok(`Akun ${parsed.data.name} dibuat.`, { password })
}

export async function updateUser(userId: string, _prev: ActionResult, formData: FormData) {
  const actor = await requireRole(...ADMINS)
  const { error } = await guardTarget(actor, userId)
  if (error) return error
  const parsed = schema.safeParse(formObject(formData))
  if (!parsed.success) return zodFail(parsed.error)
  if (!(await assignableRoles(actor)).includes(parsed.data.role)) return fail("Anda tidak berwenang memberi role ini.", { role: "Tidak diizinkan" })
  if (userId === actor.id && parsed.data.role !== actor.role) return fail("Anda tidak dapat mengubah role akun sendiri.", { role: "Tidak diizinkan" })
  try {
    await db.user.update({ where: { id: userId }, data: parsed.data })
  } catch (e) {
    const d = dupe(e)
    if (d) return d
    throw e
  }
  await audit("USER_UPDATED", { userId: actor.id, entity: "User", entityId: userId, metadata: { role: parsed.data.role } })
  refresh()
  return ok("Pengguna disimpan.")
}

export async function resetPassword(userId: string): Promise<ActionResult<{ password: string }>> {
  const actor = await requireRole(...ADMINS)
  const { error, target } = await guardTarget(actor, userId)
  if (error) return error
  const password = generateTempPassword()
  await db.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(password), mustChangePassword: true, passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null },
  })
  await audit("PASSWORD_RESET", { userId: actor.id, entity: "User", entityId: userId, severity: "WARNING" })
  return ok(`Password ${target.name} direset.`, { password })
}

export async function setUserActive(userId: string, active: boolean): Promise<ActionResult> {
  const actor = await requireRole(...ADMINS)
  if (userId === actor.id) return fail("Anda tidak dapat menonaktifkan akun sendiri.")
  const { error } = await guardTarget(actor, userId)
  if (error) return error
  await db.user.update({ where: { id: userId }, data: { isActive: active } })
  await audit(active ? "USER_ACTIVATED" : "USER_DEACTIVATED", { userId: actor.id, entity: "User", entityId: userId, severity: active ? "INFO" : "WARNING" })
  refresh()
  return ok(active ? "Akun diaktifkan." : "Akun dinonaktifkan — tidak dapat login.")
}

// ---------------------------------------------------------------------------
// Impor pengguna dari Excel: Nama | Email | Username/NIM | Role | Kelompok
// ---------------------------------------------------------------------------

export type ImportedAccount = { name: string; email: string; username: string | null; role: Role; password: string }

const ROLE_ALIASES: Record<string, Role> = { peserta: "PESERTA", mahasiswa: "PESERTA", dosen: "DOSEN", admin: "ADMIN", "super admin": "SUPER_ADMIN" }

export async function importUsers(_prev: ActionResult<unknown>, formData: FormData): Promise<ActionResult<{ accounts: ImportedAccount[]; errors: string[] }>> {
  const actor = await requireRole(...ADMINS)
  const file = formData.get("file")
  if (!(file instanceof File) || file.size === 0) return fail("Pilih berkas Excel (.xlsx).", { file: "Wajib diisi" })
  if (file.size > MAX_UPLOAD_BYTES) return fail("Berkas maksimal 5 MB.", { file: "Terlalu besar" })

  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.load(await file.arrayBuffer())
  } catch {
    return fail("Berkas bukan Excel (.xlsx) yang valid.", { file: "Format tidak dikenali" })
  }
  const ws = wb.worksheets[0]
  if (!ws) return fail("Sheet tidak ditemukan.")
  const header = ws.getRow(1)
  const col: Record<string, number> = {}
  header.eachCell((cell, i) => {
    const h = cell.text.trim().toLowerCase()
    if (h.startsWith("nama")) col.name ??= i
    else if (h.startsWith("email")) col.email ??= i
    else if (h.includes("nim") || h.includes("username")) col.username ??= i
    else if (h.startsWith("role") || h.startsWith("peran")) col.role ??= i
    else if (h.startsWith("kelompok") || h.startsWith("kelas")) col.group ??= i
  })
  if (!col.name || !col.email) return fail('Kolom "Nama" dan "Email" wajib ada di baris pertama.')

  const allowed = await assignableRoles(actor)
  const groups = new Map((await db.group.findMany({ select: { id: true, name: true } })).map((g) => [g.name.toLowerCase(), g.id]))
  const accounts: ImportedAccount[] = []
  const errors: string[] = []
  const get = (row: ExcelJS.Row, key: string) => (col[key] ? row.getCell(col[key]).text.trim() : "")

  for (let r = 2; r <= Math.min(ws.rowCount, 1001); r++) {
    const row = ws.getRow(r)
    const raw = { name: get(row, "name"), email: get(row, "email"), username: get(row, "username") || undefined, role: ROLE_ALIASES[get(row, "role").toLowerCase()] ?? "PESERTA" }
    if (!raw.name && !raw.email) continue
    const parsed = schema.safeParse(raw)
    if (!parsed.success) {
      errors.push(`Baris ${r}: ${parsed.error.issues[0]?.message ?? "data tidak valid"}`)
      continue
    }
    if (!allowed.includes(parsed.data.role)) {
      errors.push(`Baris ${r}: tidak berwenang membuat role ${parsed.data.role}`)
      continue
    }
    const groupName = get(row, "group")
    const groupId = groupName ? groups.get(groupName.toLowerCase()) : undefined
    if (groupName && !groupId) {
      errors.push(`Baris ${r}: kelompok "${groupName}" belum ada`)
      continue
    }
    const password = generateTempPassword()
    try {
      await db.user.create({
        data: {
          ...parsed.data,
          passwordHash: await hashPassword(password),
          mustChangePassword: true,
          ...(groupId ? { memberships: { create: { groupId } } } : {}),
        },
      })
      accounts.push({ ...parsed.data, password })
    } catch (e) {
      errors.push(`Baris ${r}: ${dupe(e) ? "email/username sudah terdaftar" : "gagal disimpan"}`)
    }
  }
  await audit("USERS_IMPORTED", { userId: actor.id, entity: "User", metadata: { created: accounts.length, failed: errors.length } })
  refresh()
  return ok(`${accounts.length} akun dibuat${errors.length ? `, ${errors.length} baris dilewati` : ""}.`, { accounts, errors })
}
