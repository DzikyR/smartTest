import { z } from "zod"
import { syncDevicePush } from "@/lib/mobile/push"
import { authenticate, error, json, readJson, throttle } from "@/lib/mobile/http"

const schema = z.object({ fcmToken: z.string().min(20).max(4096) })

/**
 * POST /api/v1/mobile/devices  { fcmToken }
 * Daftarkan token FCM & samakan langganan topik kelas (dilakukan server, bukan aplikasi).
 * Panggil saat aplikasi dibuka, saat token berganti (onTokenRefresh), dan setelah bergabung ke kelas.
 */
export async function POST(request: Request) {
  const ctx = await authenticate(request)
  if (ctx instanceof Response) return ctx
  if (!ctx.deviceId || !ctx.platform) return error(400, "DEVICE_REQUIRED", "Header X-Device-Id dan X-Platform wajib diisi.")
  const limited = throttle(`devices:${ctx.user.id}`, 10, 60_000)
  if (limited) return limited
  const body = await readJson(request, schema)
  if (body instanceof Response) return body
  const result = await syncDevicePush({ userId: ctx.user.id, deviceId: ctx.deviceId, platform: ctx.platform, appVersion: ctx.appVersion, fcmToken: body.fcmToken })
  return json(result)
}
