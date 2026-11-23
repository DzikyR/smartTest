import "server-only"
import type { z } from "zod"
import type { Role } from "@/lib/auth/roles"
import { rateLimit } from "@/lib/rate-limit"
import { mobileUserFrom, type MobileUser } from "./session"
import { mobileConfig, versionLess } from "./version"

/**
 * Kerangka Route Handler /api/v1/mobile/*: JSON ringkas, kode error stabil (untuk
 * percabangan di aplikasi), autentikasi Bearer, force update, rate limit per pengguna.
 *
 * Tidak memakai cookie sama sekali → tidak rawan CSRF. Semua respons `no-store`
 * kecuali yang memang di-cache (paket soal, berkas, dashboard ber-ETag).
 */

export type Platform = "android" | "ios"

export type MobileContext = {
  user: MobileUser
  /** Id perangkat rahasia dari aplikasi (secure storage), dipakai untuk kunci perangkat & refresh token */
  deviceId: string | null
  platform: Platform | null
  appVersion: string | null
}

export function json(data: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return Response.json(data, { status: init.status ?? 200, headers: { "Cache-Control": "no-store", ...init.headers } })
}

export function error(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  return json({ error: code, message, ...extra }, { status })
}

export const DEVICE_ID_RE = /^[A-Za-z0-9_-]{16,128}$/

export function deviceHeaders(request: Request) {
  const h = request.headers
  const deviceId = h.get("x-device-id")
  const platform = h.get("x-platform")
  return {
    deviceId: deviceId && DEVICE_ID_RE.test(deviceId) ? deviceId : null,
    platform: platform === "android" || platform === "ios" ? (platform as Platform) : null,
    appVersion: h.get("x-app-version")?.slice(0, 32) ?? null,
  }
}

/** 426 bila versi aplikasi di bawah MOBILE_MIN_VERSION; 503 saat mode perawatan. */
export function versionGate(request: Request): Response | null {
  const cfg = mobileConfig()
  if (cfg.maintenance) return error(503, "MAINTENANCE", cfg.message ?? "Aplikasi sedang dalam perawatan. Coba lagi nanti.")
  if (cfg.minVersion && versionLess(deviceHeaders(request).appVersion, cfg.minVersion)) {
    return error(426, "UPGRADE_REQUIRED", "Versi aplikasi sudah tidak didukung. Perbarui aplikasi untuk melanjutkan.", { minVersion: cfg.minVersion, storeUrl: cfg.storeUrl })
  }
  return null
}

/**
 * Autentikasi + gerbang umum. `versionGate: false` untuk simpan/kumpul jawaban ujian:
 * peserta yang sedang ujian tidak boleh dipaksa update di tengah jalan.
 */
export async function authenticate(
  request: Request,
  opts: { roles?: Role[]; versionGate?: boolean; allowPasswordChange?: boolean } = {}
): Promise<MobileContext | Response> {
  if (opts.versionGate !== false) {
    const gate = versionGate(request)
    if (gate) return gate
  }
  const user = await mobileUserFrom(request)
  if (!user) return error(401, "UNAUTHENTICATED", "Sesi berakhir. Silakan masuk kembali.")
  if (user.mustChangePassword && !opts.allowPasswordChange) return error(403, "PASSWORD_CHANGE_REQUIRED", "Ganti password sementara terlebih dahulu.")
  if (opts.roles && !opts.roles.includes(user.role)) return error(403, "FORBIDDEN", "Fitur ini tidak tersedia untuk akun Anda.")
  return { user, ...deviceHeaders(request) }
}

/** Rate limit per kunci; null = lolos. */
export function throttle(key: string, limit: number, windowMs: number): Response | null {
  const r = rateLimit(`m:${key}`, limit, windowMs)
  if (r.ok) return null
  const retry = Math.max(1, Math.ceil((r.resetAt - Date.now()) / 1000))
  return Response.json({ error: "RATE_LIMITED", message: "Terlalu banyak permintaan. Coba lagi sebentar lagi.", retryAfter: retry }, { status: 429, headers: { "Retry-After": String(retry), "Cache-Control": "no-store" } })
}

const MAX_BODY_BYTES = 256 * 1024

/** Body JSON tervalidasi Zod, atau Response 400/413/415. */
export async function readJson<S extends z.ZodType>(request: Request, schema: S): Promise<z.infer<S> | Response> {
  if (!request.headers.get("content-type")?.includes("application/json")) return error(415, "BAD_REQUEST", "Gunakan Content-Type: application/json.")
  const length = Number(request.headers.get("content-length") ?? 0)
  if (length > MAX_BODY_BYTES) return error(413, "TOO_LARGE", "Data terlalu besar.")
  const text = await request.text().catch(() => "")
  if (text.length > MAX_BODY_BYTES) return error(413, "TOO_LARGE", "Data terlalu besar.")
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return error(400, "BAD_REQUEST", "JSON tidak valid.")
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    const fields: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".")
      if (key && !fields[key]) fields[key] = issue.message
    }
    return error(400, "VALIDATION", "Data tidak valid.", { fields })
  }
  return parsed.data
}

/** Epoch ms; Infinity (tanpa batas) → null agar aman di JSON. */
export const ms = (value: number | Date | null | undefined) => {
  if (value === null || value === undefined) return null
  const n = typeof value === "number" ? value : value.getTime()
  return Number.isFinite(n) ? n : null
}
