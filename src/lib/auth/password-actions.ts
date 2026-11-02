"use server"

import { SESSION_EXPIRED_URL } from "@/lib/auth/roles"
import bcrypt from "bcryptjs"
import { redirect } from "next/navigation"
import { signOut } from "@/auth"
import { db } from "@/lib/db"
import { audit } from "@/lib/audit"
import { getCurrentUser } from "@/lib/auth/dal"
import { rateLimit } from "@/lib/rate-limit"
import { hashPassword, passwordPolicyError } from "@/lib/password"
import { fail, type ActionResult } from "@/lib/action-result"

/**
 * Ganti password sendiri. Setelah berhasil, SEMUA sesi pengguna (termasuk
 * perangkat lain) dicabut lewat passwordChangedAt, lalu pengguna login ulang.
 */
export async function changePassword(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  // Bukan requireRole: halaman ini justru tujuan redirect bagi mustChangePassword.
  const actor = await getCurrentUser()
  if (!actor) redirect(SESSION_EXPIRED_URL)

  const current = String(formData.get("current") ?? "")
  const next = String(formData.get("next") ?? "")
  const confirm = String(formData.get("confirm") ?? "")
  const errors: Record<string, string> = {}
  if (!current) errors.current = "Wajib diisi"
  const policy = passwordPolicyError(next, actor.email)
  if (policy) errors.next = policy
  if (next !== confirm) errors.confirm = "Konfirmasi tidak sama"
  if (Object.keys(errors).length) return fail("Periksa kembali isian yang ditandai.", errors)
  if (!rateLimit(`pwchange:${actor.id}`, 5, 15 * 60 * 1000).ok) return fail("Terlalu banyak percobaan. Coba lagi dalam 15 menit.")

  const user = await db.user.findUnique({ where: { id: actor.id }, select: { passwordHash: true } })
  if (!user || !(await bcrypt.compare(current, user.passwordHash))) {
    await audit("PASSWORD_CHANGE_FAILED", { userId: actor.id, severity: "WARNING" })
    return fail("Password saat ini salah.", { current: "Password salah" })
  }
  if (await bcrypt.compare(next, user.passwordHash)) return fail("Periksa kembali isian yang ditandai.", { next: "Harus berbeda dari password saat ini" })

  await db.user.update({
    where: { id: actor.id },
    data: { passwordHash: await hashPassword(next), mustChangePassword: false, passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null },
  })
  await audit("PASSWORD_CHANGED", { userId: actor.id, entity: "User", entityId: actor.id })
  await signOut({ redirectTo: "/login" })
  return fail("") // tidak tercapai — signOut melempar redirect
}
