"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { after } from "next/server"
import { z } from "zod"
import { signIn } from "@/auth"
import { db } from "@/lib/db"
import { audit } from "@/lib/audit"
import { getCurrentUser } from "@/lib/auth/dal"
import { HOME, safeCallbackUrl } from "@/lib/auth/roles"
import { findValidResetToken, issueResetToken, sendResetEmail } from "@/lib/auth/account"
import { getAuthSettings } from "@/lib/site/config"
import { clientIp, rateLimit } from "@/lib/rate-limit"
import { hashPassword, passwordPolicyError } from "@/lib/password"
import { fail, formObject, ok, prismaCode, zodFieldErrors, type ActionResult } from "@/lib/action-result"

const email = z.email("Email tidak valid").max(254).transform((v) => v.toLowerCase().trim())

// ---------------------------------------------------------------------------
// Daftar akun (peserta)
// ---------------------------------------------------------------------------

const registerSchema = z.object({
  name: z.string().trim().min(2, "Minimal 2 karakter").max(120, "Maksimal 120 karakter"),
  email,
  password: z.string().max(128),
  confirm: z.string().max(128),
})

export async function registerAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  if (await getCurrentUser()) redirect(HOME)
  if (!(await getAuthSettings()).registrationOpen) return fail("Pendaftaran akun baru sedang ditutup. Hubungi admin.")
  // Honeypot: field tersembunyi yang hanya diisi bot.
  if (String(formData.get("website") ?? "")) return fail("Pendaftaran gagal. Coba lagi.")

  const raw = formObject(formData)
  const parsed = registerSchema.safeParse({ ...raw, email: String(raw.email ?? "").trim() })
  if (!parsed.success) return fail("Periksa kembali isian yang ditandai.", zodFieldErrors(parsed.error))
  const { name, password, confirm } = parsed.data
  const errors: Record<string, string> = {}
  const policy = passwordPolicyError(password, parsed.data.email)
  if (policy) errors.password = policy
  if (password !== confirm) errors.confirm = "Konfirmasi tidak sama"
  if (Object.keys(errors).length) return fail("Periksa kembali isian yang ditandai.", errors)

  const ip = clientIp(await headers())
  if (!rateLimit(`register:${ip}`, 5, 60 * 60 * 1000).ok) return fail("Terlalu banyak pendaftaran dari jaringan Anda. Coba lagi nanti.")

  try {
    const user = await db.user.create({ data: { name, email: parsed.data.email, role: "PESERTA", passwordHash: await hashPassword(password) }, select: { id: true } })
    await audit("USER_REGISTERED", { userId: user.id, entity: "User", entityId: user.id, metadata: { provider: "credentials" } })
  } catch (e) {
    if (prismaCode(e) === "P2002") return fail("Email sudah terdaftar. Silakan masuk, atau gunakan Lupa password.", { email: "Sudah terdaftar" })
    throw e
  }
  await signIn("credentials", { identifier: parsed.data.email, password, redirect: false })
  redirect(HOME)
}

// ---------------------------------------------------------------------------
// Lupa password → email tautan → atur password baru
// ---------------------------------------------------------------------------

const RESET_SENT = "Bila email tersebut terdaftar, tautan untuk mengatur ulang password sudah dikirim. Periksa kotak masuk atau folder spam."

export async function requestPasswordReset(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = email.safeParse(String(formData.get("email") ?? "").trim())
  if (!parsed.success) return fail("Masukkan email yang valid.", { email: "Email tidak valid" })
  const ip = clientIp(await headers())
  if (!rateLimit(`reset:ip:${ip}`, 5, 15 * 60 * 1000).ok || !rateLimit(`reset:email:${parsed.data}`, 3, 60 * 60 * 1000).ok)
    return fail("Terlalu banyak permintaan. Coba lagi beberapa saat lagi.")

  const user = await db.user.findUnique({ where: { email: parsed.data }, select: { id: true, name: true, email: true, isActive: true } })
  if (user?.isActive) {
    const token = await issueResetToken(user.id, ip)
    // Kirim setelah respons: waktu respons tidak membedakan email terdaftar atau tidak.
    after(() => sendResetEmail(user, token).catch((e) => console.error("[mail] gagal mengirim email reset", e)))
    await audit("PASSWORD_RESET_REQUESTED", { userId: user.id, entity: "User", entityId: user.id })
  }
  // Pesan selalu sama — tidak membocorkan email mana yang terdaftar.
  return ok(RESET_SENT)
}

export async function resetPasswordWithToken(token: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const ip = clientIp(await headers())
  if (!rateLimit(`reset:submit:${ip}`, 10, 15 * 60 * 1000).ok) return fail("Terlalu banyak percobaan. Coba lagi beberapa saat lagi.")
  const row = await findValidResetToken(token)
  if (!row) return fail("Tautan reset tidak valid atau sudah kedaluwarsa. Minta tautan baru.")

  const next = String(formData.get("password") ?? "")
  const confirm = String(formData.get("confirm") ?? "")
  const errors: Record<string, string> = {}
  const policy = passwordPolicyError(next, row.user.email)
  if (policy) errors.password = policy
  if (next !== confirm) errors.confirm = "Konfirmasi tidak sama"
  if (Object.keys(errors).length) return fail("Periksa kembali isian yang ditandai.", errors)

  const passwordHash = await hashPassword(next)
  const used = await db.$transaction(async (tx) => {
    // Tandai terpakai lebih dulu: dua kiriman bersamaan → hanya satu yang lolos.
    const claimed = await tx.passwordResetToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } })
    if (claimed.count === 0) return false
    await tx.user.update({
      where: { id: row.user.id },
      // passwordChangedAt mencabut semua sesi lama (dicek di Data Access Layer).
      data: { passwordHash, mustChangePassword: false, passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null },
    })
    await tx.passwordResetToken.deleteMany({ where: { userId: row.user.id, id: { not: row.id } } })
    return true
  })
  if (!used) return fail("Tautan reset sudah dipakai. Minta tautan baru bila perlu.")
  await audit("PASSWORD_RESET", { userId: row.user.id, entity: "User", entityId: row.user.id, severity: "WARNING" })
  redirect("/login?reset=1")
}

// ---------------------------------------------------------------------------
// Masuk dengan Google
// ---------------------------------------------------------------------------

export async function googleSignIn(formData: FormData) {
  if (!(await getAuthSettings()).googleLogin) redirect("/login?error=google_disabled")
  await signIn("google", { redirectTo: safeCallbackUrl(formData.get("callbackUrl"), HOME) })
}
