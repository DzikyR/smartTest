import { z } from "zod"
import { audit } from "@/lib/audit"
import { rotateSession } from "@/lib/mobile/session"
import { deviceHeaders, error, json, readJson, throttle } from "@/lib/mobile/http"

const schema = z.object({ refreshToken: z.string().min(20).max(200) })

/**
 * POST /api/v1/mobile/auth/refresh  { refreshToken } → token baru (rotasi).
 * Tanpa gerbang versi: aplikasi lama tetap bisa memperpanjang sesi untuk menyelesaikan ujian.
 */
export async function POST(request: Request) {
  const { deviceId } = deviceHeaders(request)
  if (!deviceId) return error(400, "DEVICE_REQUIRED", "Header X-Device-Id wajib diisi.")
  const limited = throttle(`refresh:${deviceId}`, 30, 60_000)
  if (limited) return limited
  const body = await readJson(request, schema)
  if (body instanceof Response) return body

  const result = await rotateSession(body.refreshToken, deviceId)
  if (!result.ok) {
    if (result.reason === "reused") await audit("MOBILE_TOKEN_REUSED", { severity: "CRITICAL", metadata: { deviceId } })
    return error(401, "SESSION_INVALID", "Sesi berakhir. Silakan masuk kembali.")
  }
  return json(result.tokens)
}
