import "server-only"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { db } from "@/lib/db"
import { ipFailureGate } from "@/lib/network/trusted"

/**
 * Pemeriksaan email/NIM + password — satu-satunya pintu login (NextAuth di web &
 * POST /api/v1/mobile/auth/login). Batas login gagal per IP, kunci akun setelah 5× gagal,
 * waktu respons sama untuk akun yang tidak ada (cegah user enumeration), audit log.
 */

const MAX_FAILED_ATTEMPTS = 5
const LOCK_DURATION_MS = 15 * 60 * 1000

// Hash dummy agar waktu respons sama saat akun tidak ada (cegah user enumeration).
const DUMMY_HASH = bcrypt.hashSync("smarttest-dummy-password", 12)

export const credentialsSchema = z.object({
  /** Email atau username (NIM/NIP/nomor peserta) */
  identifier: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(128),
})

/**
 * Batas per IP hanya menghitung login yang GAGAL. Satu lab/kampus sering keluar lewat satu IP (NAT),
 * jadi kalau login berhasil ikut dihitung, mahasiswa ke-21 di ruang ujian ditolak. Penebakan password
 * ke satu akun tetap dihentikan oleh kunci akun (MAX_FAILED_ATTEMPTS); batas ini menahan password
 * spraying (banyak akun dari satu IP).
 */
// Batasnya (100 gagal / 15 menit, dikalikan untuk jaringan kampus tepercaya) ada di IP_LIMITS.loginFail.

export type VerifiedUser = { id: string; name: string; email: string; role: "SUPER_ADMIN" | "ADMIN" | "DOSEN" | "PESERTA" }

export type CredentialsResult = { ok: true; user: VerifiedUser } | { ok: false; reason: "invalid" | "locked" | "rate_limited" }

export async function verifyCredentials(raw: unknown, ctx: { ip: string; userAgent: string | null }): Promise<CredentialsResult> {
  const parsed = credentialsSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, reason: "invalid" }
  const identifier = parsed.data.identifier.toLowerCase()
  const { password } = parsed.data
  const { ip, userAgent } = ctx

  const gate = await ipFailureGate(ip, "loginFail")
  if (gate.blocked) return { ok: false, reason: "rate_limited" }
  const countFailure = gate.fail

  const user = await db.user.findFirst({
    where: identifier.includes("@") ? { email: identifier } : { username: { equals: identifier, mode: "insensitive" } },
  })

  if (!user || !user.isActive) {
    await bcrypt.compare(password, DUMMY_HASH)
    await db.auditLog.create({
      data: { action: "LOGIN_FAILED", severity: "WARNING", userId: user?.id, ipAddress: ip, userAgent, metadata: { identifier, reason: user ? "inactive" : "unknown" } },
    })
    countFailure()
    return { ok: false, reason: "invalid" }
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    countFailure()
    return { ok: false, reason: "locked" }
  }

  if (!(await bcrypt.compare(password, user.passwordHash))) {
    const failed = user.failedLoginCount + 1
    const lock = failed >= MAX_FAILED_ATTEMPTS
    await db.$transaction([
      db.user.update({
        where: { id: user.id },
        data: { failedLoginCount: lock ? 0 : failed, lockedUntil: lock ? new Date(Date.now() + LOCK_DURATION_MS) : null },
      }),
      db.auditLog.create({ data: { action: lock ? "ACCOUNT_LOCKED" : "LOGIN_FAILED", severity: lock ? "CRITICAL" : "WARNING", userId: user.id, ipAddress: ip, userAgent } }),
    ])
    countFailure()
    return { ok: false, reason: lock ? "locked" : "invalid" }
  }

  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } }),
    db.auditLog.create({ data: { action: "LOGIN_SUCCESS", userId: user.id, ipAddress: ip, userAgent } }),
  ])
  return { ok: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } }
}
