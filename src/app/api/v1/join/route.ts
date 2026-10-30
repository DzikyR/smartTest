import { getCurrentUser } from "@/lib/auth/dal"
import { joinWithCode, type JoinError } from "@/lib/classes/join"
import { clientIp } from "@/lib/rate-limit"

const STATUS: Record<JoinError, number> = {
  INVALID: 404,
  EXPIRED: 410,
  DISABLED: 403,
  LOCKED: 403,
  REMOVED: 403,
  ROLE: 403,
  FEATURE: 403,
  FULL: 409,
  PROFILE_INCOMPLETE: 422,
  RATE_LIMITED: 429,
}

/**
 * POST /api/v1/join  { "code": "K7M-QX2P" } — untuk aplikasi mobile/integrasi.
 * Logika sama persis dengan Server Action di web (joinWithCode).
 */
export async function POST(request: Request) {
  // CSRF: cookie sesi SameSite=Lax tidak terkirim dari form lintas situs; Origin (bila ada) wajib sama.
  const origin = request.headers.get("origin")
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "FORBIDDEN", message: "Origin tidak diizinkan." }, { status: 403 })
  if (!request.headers.get("content-type")?.includes("application/json")) return Response.json({ error: "BAD_REQUEST", message: "Gunakan Content-Type: application/json." }, { status: 415 })

  const user = await getCurrentUser()
  if (!user) return Response.json({ error: "UNAUTHENTICATED", message: "Silakan masuk terlebih dahulu." }, { status: 401 })
  if (user.mustChangePassword) return Response.json({ error: "PASSWORD_CHANGE_REQUIRED", message: "Ganti password sementara terlebih dahulu." }, { status: 403 })

  const body = (await request.json().catch(() => null)) as { code?: unknown } | null
  const result = await joinWithCode(user, body?.code, clientIp(request.headers))
  return Response.json(result, { status: result.ok ? 200 : STATUS[result.error], headers: { "Cache-Control": "no-store" } })
}
