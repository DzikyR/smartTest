import { z } from "zod"
import { db } from "@/lib/db"
import { verifyCredentials } from "@/lib/auth/credentials"
import { clientIp } from "@/lib/rate-limit"
import { issueSession } from "@/lib/mobile/session"
import { deviceHeaders, error, json, readJson, versionGate } from "@/lib/mobile/http"

const schema = z.object({ identifier: z.string().trim().min(1).max(254), password: z.string().min(1).max(128) })

/**
 * POST /api/v1/mobile/auth/login  { identifier, password }
 * Header wajib: X-Device-Id (rahasia per instalasi), X-Platform (android|ios), X-App-Version.
 * Aturan login sama persis dengan web (src/lib/auth/credentials.ts).
 */
export async function POST(request: Request) {
  const gate = versionGate(request)
  if (gate) return gate
  const device = deviceHeaders(request)
  if (!device.deviceId || !device.platform) return error(400, "DEVICE_REQUIRED", "Header X-Device-Id dan X-Platform wajib diisi.")
  const body = await readJson(request, schema)
  if (body instanceof Response) return body

  const result = await verifyCredentials(body, { ip: clientIp(request.headers), userAgent: request.headers.get("user-agent")?.slice(0, 255) ?? null })
  if (!result.ok) {
    if (result.reason === "rate_limited") return error(429, "RATE_LIMITED", "Terlalu banyak percobaan masuk. Coba lagi dalam 15 menit.")
    if (result.reason === "locked") return error(423, "ACCOUNT_LOCKED", "Akun dikunci sementara karena terlalu banyak percobaan gagal. Coba lagi dalam 15 menit.")
    return error(401, "INVALID_CREDENTIALS", "Email/NIM atau password salah.")
  }

  const { user } = result
  const tokens = await issueSession(user.id, device.deviceId)
  await db.mobileDevice.upsert({
    where: { userId_deviceId: { userId: user.id, deviceId: device.deviceId } },
    create: { userId: user.id, deviceId: device.deviceId, platform: device.platform, appVersion: device.appVersion },
    update: { platform: device.platform, appVersion: device.appVersion },
  })
  const profile = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { id: true, name: true, email: true, username: true, role: true, mustChangePassword: true } })
  return json({ user: profile, ...tokens })
}
