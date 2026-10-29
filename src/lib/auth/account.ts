import "server-only"
import { createHash, randomBytes } from "node:crypto"
import { db } from "@/lib/db"
import { generateTempPassword, hashPassword } from "@/lib/password"
import { getAuthSettings, getTexts } from "@/lib/site/config"
import { sendMail } from "@/lib/mail"

// ---------------------------------------------------------------------------
// Reset password
//
// Token acak 256-bit (bukan JWT): bisa dicabut, sekali pakai, dan yang
// disimpan hanya hash SHA-256 — kebocoran tabel tidak membuka akun mana pun.
// ---------------------------------------------------------------------------

export const RESET_TOKEN_TTL_MINUTES = 30
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/ // 32 byte base64url

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex")

/**
 * Origin tautan di email diambil dari AUTH_URL, BUKAN header Host — header Host
 * bisa dipalsukan penyerang agar tautan reset mengarah ke domainnya.
 */
export const appOrigin = () => new URL(process.env.AUTH_URL || "http://localhost:3000").origin

/** Buat token baru; token lama yang belum dipakai milik user ini dicabut. */
export async function issueResetToken(userId: string, ipAddress: string | null) {
  const token = randomBytes(32).toString("base64url")
  await db.$transaction([
    db.passwordResetToken.deleteMany({ where: { userId, usedAt: null } }),
    db.passwordResetToken.create({ data: { userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60_000), ipAddress } }),
  ])
  return token
}

/** Token valid: format benar, ada, belum dipakai, belum kedaluwarsa, akun aktif. */
export async function findValidResetToken(token: unknown) {
  if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) return null
  const row = await db.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, usedAt: true, expiresAt: true, user: { select: { id: true, email: true, name: true, isActive: true } } },
  })
  if (!row || row.usedAt || row.expiresAt <= new Date() || !row.user.isActive) return null
  return row
}

export async function sendResetEmail(user: { name: string; email: string }, token: string) {
  const t = await getTexts()
  const app = t["app.name"]
  const link = `${appOrigin()}/reset-password?token=${token}`
  await sendMail({
    to: user.email,
    subject: `Atur ulang password ${app}`,
    text: [
      `Halo ${user.name},`,
      "",
      `Kami menerima permintaan untuk mengatur ulang password akun ${app} Anda. Buka tautan berikut (berlaku ${RESET_TOKEN_TTL_MINUTES} menit, sekali pakai):`,
      "",
      link,
      "",
      "Bila Anda tidak meminta ini, abaikan email ini — password Anda tidak berubah.",
    ].join("\n"),
  })
}

// ---------------------------------------------------------------------------
// Login dengan Google
// ---------------------------------------------------------------------------

export type GoogleProfile = { sub?: string; email?: string | null; email_verified?: boolean; name?: string | null }

/**
 * Tautkan/buat akun dari profil Google. Mengembalikan true, atau URL /login
 * berisi kode error. Email hanya dipercaya bila sudah diverifikasi Google.
 */
export async function linkGoogleAccount(profile: GoogleProfile): Promise<true | string> {
  const settings = await getAuthSettings()
  if (!settings.googleLogin) return "/login?error=google_disabled"
  const email = profile.email?.toLowerCase().trim()
  if (!profile.sub || !email || profile.email_verified !== true) return "/login?error=google_unverified"

  const user = (await db.user.findUnique({ where: { googleId: profile.sub } })) ?? (await db.user.findUnique({ where: { email } }))
  if (user) {
    if (!user.isActive) return "/login?error=google_inactive"
    if (user.googleId && user.googleId !== profile.sub) return "/login?error=google_conflict"
    await db.user.update({ where: { id: user.id }, data: { googleId: profile.sub, lastLoginAt: new Date(), failedLoginCount: 0, lockedUntil: null } })
    await db.auditLog.create({ data: { action: "LOGIN_SUCCESS", userId: user.id, metadata: { provider: "google", linked: !user.googleId } } })
    return true
  }

  if (!settings.registrationOpen) return "/login?error=google_closed"
  const created = await db.user.create({
    data: {
      email,
      name: (profile.name || email.split("@")[0]).slice(0, 120),
      googleId: profile.sub,
      role: "PESERTA",
      // Akun Google tidak punya password; password acak ini tidak diketahui siapa pun (bisa diatur lewat Lupa Password).
      passwordHash: await hashPassword(generateTempPassword(32), 10),
      lastLoginAt: new Date(),
    },
    select: { id: true },
  })
  await db.auditLog.create({ data: { action: "USER_REGISTERED", userId: created.id, entity: "User", entityId: created.id, metadata: { provider: "google" } } })
  return true
}
