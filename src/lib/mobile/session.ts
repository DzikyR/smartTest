import "server-only"
import { randomBytes } from "node:crypto"
import { db } from "@/lib/db"
import type { CurrentUser } from "@/lib/auth/dal"
import { bearer, hashToken, newRefreshToken, REFRESH_TTL_MS, serverKey, signAccessToken, verifyAccessToken, type AccessClaims } from "./token"

/**
 * Sesi aplikasi mobile: access token (15 menit) + refresh token berotasi (30 hari, bergeser).
 *
 * Rotasi: setiap refresh menukar token lama dengan token baru dalam family yang sama.
 * Token lama yang dipakai lagi = indikasi pencurian → seluruh family dicabut, KECUALI
 * dalam jeda toleransi 60 detik dan token penggantinya belum pernah dipakai: itu
 * respons refresh yang hilang di jaringan putus-nyambung (siswa tidak terlempar keluar
 * di tengah ujian).
 */

const REUSE_GRACE_MS = 60_000

export type MobileTokens = { accessToken: string; refreshToken: string; expiresIn: number }

function access(userId: string, familyId: string, authAt: Date) {
  return signAccessToken({ sub: userId, fam: familyId, aat: authAt.getTime() }, serverKey("access-token/v1"))
}

async function createRefresh(data: { userId: string; familyId: string; deviceId: string; authAt: Date }) {
  const refreshToken = newRefreshToken()
  const row = await db.mobileRefreshToken.create({
    data: { ...data, tokenHash: hashToken(refreshToken), expiresAt: new Date(Date.now() + REFRESH_TTL_MS) },
    select: { id: true },
  })
  return { id: row.id, refreshToken }
}

/** Login baru di satu perangkat = family baru. */
export async function issueSession(userId: string, deviceId: string): Promise<MobileTokens> {
  const authAt = new Date()
  const familyId = randomBytes(16).toString("hex")
  const { refreshToken } = await createRefresh({ userId, familyId, deviceId, authAt })
  const { token, expiresIn } = access(userId, familyId, authAt)
  return { accessToken: token, refreshToken, expiresIn }
}

const revokeFamily = (familyId: string) => db.mobileRefreshToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: new Date() } })

export type RefreshResult = { ok: true; tokens: MobileTokens; userId: string } | { ok: false; reason: "invalid" | "reused" }

export async function rotateSession(rawToken: string, deviceId: string): Promise<RefreshResult> {
  const row = await db.mobileRefreshToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    select: { id: true, familyId: true, deviceId: true, authAt: true, expiresAt: true, revokedAt: true, replacedBy: true, userId: true, user: { select: { isActive: true, passwordChangedAt: true } } },
  })
  if (!row) return { ok: false, reason: "invalid" }
  const now = Date.now()
  // Token dipakai dari perangkat lain = bocor.
  if (row.deviceId !== deviceId) {
    await revokeFamily(row.familyId)
    return { ok: false, reason: "reused" }
  }
  if (row.expiresAt.getTime() <= now) return { ok: false, reason: "invalid" }
  if (!row.user.isActive || (row.user.passwordChangedAt && row.user.passwordChangedAt > row.authAt)) {
    await revokeFamily(row.familyId)
    return { ok: false, reason: "invalid" }
  }

  if (row.revokedAt) {
    const replacement = row.replacedBy ? await db.mobileRefreshToken.findUnique({ where: { id: row.replacedBy }, select: { id: true, revokedAt: true } }) : null
    const lostResponse = replacement && !replacement.revokedAt && now - row.revokedAt.getTime() <= REUSE_GRACE_MS
    if (!lostResponse) {
      await revokeFamily(row.familyId)
      return { ok: false, reason: "reused" }
    }
    // Pengganti yang tidak pernah sampai ke aplikasi dibatalkan; terbitkan pengganti baru.
    const claimed = await db.mobileRefreshToken.updateMany({ where: { id: replacement.id, revokedAt: null }, data: { revokedAt: new Date() } })
    if (claimed.count === 0) return { ok: false, reason: "invalid" }
  } else {
    // Klaim token lama secara atomik: dua refresh bersamaan → hanya satu yang menang.
    const claimed = await db.mobileRefreshToken.updateMany({ where: { id: row.id, revokedAt: null }, data: { revokedAt: new Date() } })
    if (claimed.count === 0) return { ok: false, reason: "invalid" }
  }

  const next = await createRefresh({ userId: row.userId, familyId: row.familyId, deviceId, authAt: row.authAt })
  await db.mobileRefreshToken.update({ where: { id: row.id }, data: { replacedBy: next.id } })
  const { token, expiresIn } = access(row.userId, row.familyId, row.authAt)
  return { ok: true, userId: row.userId, tokens: { accessToken: token, refreshToken: next.refreshToken, expiresIn } }
}

/** Logout: cabut family dari refresh token ini (access token yang tersisa habis ≤ 15 menit). */
export async function endSession(rawToken: string) {
  const row = await db.mobileRefreshToken.findUnique({ where: { tokenHash: hashToken(rawToken) }, select: { familyId: true, userId: true, deviceId: true } })
  if (!row) return null
  await revokeFamily(row.familyId)
  return row
}

export type MobileUser = CurrentUser & { claims: AccessClaims }

/**
 * Pengguna dari header Authorization: Bearer — setara getCurrentUser() di DAL:
 * selalu membaca ulang user dari database (akun nonaktif / role berubah langsung
 * berlaku), dan sesi sebelum password terakhir diganti tidak berlaku.
 */
export async function mobileUserFrom(request: Request): Promise<MobileUser | null> {
  const token = bearer(request.headers.get("authorization"))
  if (!token) return null
  const claims = verifyAccessToken(token, serverKey("access-token/v1"))
  if (!claims) return null
  const user = await db.user.findUnique({
    where: { id: claims.sub },
    select: { id: true, name: true, email: true, username: true, role: true, isActive: true, mustChangePassword: true, passwordChangedAt: true },
  })
  if (!user || !user.isActive) return null
  if (user.passwordChangedAt && claims.aat < user.passwordChangedAt.getTime()) return null
  return { id: user.id, name: user.name, email: user.email, username: user.username, role: user.role, mustChangePassword: user.mustChangePassword, claims }
}
