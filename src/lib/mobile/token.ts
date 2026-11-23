import { createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto"

/**
 * Token aplikasi mobile — fungsi murni berbasis node:crypto (tanpa database) agar mudah diuji.
 *
 *  - Access token: JWT HS256 berumur pendek (15 menit), tidak disimpan di server.
 *    Algoritme dikunci HS256 (header `alg` dari klien tidak pernah dipercaya).
 *  - Refresh token: 32 byte acak; server hanya menyimpan SHA-256-nya.
 *
 * Kunci diturunkan (HKDF) dari MOBILE_TOKEN_SECRET, atau dari AUTH_SECRET bila kosong,
 * sehingga tidak ada rahasia baru yang wajib diisi. Label `info` berbeda per keperluan.
 */

export const ACCESS_TTL_SEC = 15 * 60
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000

export type AccessClaims = {
  /** User.id */
  sub: string
  /** MobileRefreshToken.familyId — satu login di satu perangkat */
  fam: string
  /** Waktu login (epoch ms), dibandingkan dengan User.passwordChangedAt */
  aat: number
  iat: number
  exp: number
}

const b64url = (buf: Buffer | string) => Buffer.from(buf).toString("base64url")
const HEADER = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))

export function deriveKey(secret: string, purpose: string) {
  return Buffer.from(hkdfSync("sha256", secret, "smarttest-mobile", purpose, 32))
}

const keys = new Map<string, Buffer>()
/** Kunci turunan dari rahasia server; dilempar bila server belum dikonfigurasi. */
export function serverKey(purpose: "access-token/v1" | "exam-package/v1") {
  const hit = keys.get(purpose)
  if (hit) return hit
  const secret = process.env.MOBILE_TOKEN_SECRET || process.env.AUTH_SECRET
  if (!secret) throw new Error("MOBILE_TOKEN_SECRET atau AUTH_SECRET belum diisi")
  const key = deriveKey(secret, purpose)
  keys.set(purpose, key)
  return key
}

export function signAccessToken(claims: Omit<AccessClaims, "iat" | "exp">, key: Buffer, now = Date.now()) {
  const iat = Math.floor(now / 1000)
  const payload = b64url(JSON.stringify({ ...claims, iat, exp: iat + ACCESS_TTL_SEC }))
  const sig = createHmac("sha256", key).update(`${HEADER}.${payload}`).digest("base64url")
  return { token: `${HEADER}.${payload}.${sig}`, expiresIn: ACCESS_TTL_SEC }
}

/** Klaim bila tanda tangan sah & belum kedaluwarsa; selain itu null. */
export function verifyAccessToken(token: string, key: Buffer, now = Date.now()): AccessClaims | null {
  const parts = token.split(".")
  if (parts.length !== 3 || parts[0] !== HEADER) return null
  const expected = createHmac("sha256", key).update(`${parts[0]}.${parts[1]}`).digest()
  const given = Buffer.from(parts[2], "base64url")
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  let claims: AccessClaims
  try {
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"))
  } catch {
    return null
  }
  if (typeof claims?.sub !== "string" || typeof claims.fam !== "string" || typeof claims.aat !== "number" || typeof claims.exp !== "number") return null
  return claims.exp * 1000 > now ? claims : null
}

export const newRefreshToken = () => `rt_${randomBytes(32).toString("base64url")}`
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex")

/** Bearer token dari header Authorization, atau null. */
export function bearer(header: string | null) {
  const m = /^Bearer\s+([A-Za-z0-9_.-]{20,2048})$/.exec(header ?? "")
  return m ? m[1] : null
}
