import bcrypt from "bcryptjs"
import { z } from "zod"
import { db } from "@/lib/db"
import { audit } from "@/lib/audit"
import { hashPassword, passwordPolicyError } from "@/lib/password"
import { issueSession } from "@/lib/mobile/session"
import { authenticate, error, json, readJson, throttle } from "@/lib/mobile/http"

const schema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: z.string().min(1).max(128) })

/**
 * POST /api/v1/mobile/auth/password  { currentPassword, newPassword }
 * Sama dengan "Ganti password" di web: semua sesi lain (web & mobile) dicabut lewat
 * passwordChangedAt; perangkat ini langsung mendapat sesi baru.
 */
export async function POST(request: Request) {
  const ctx = await authenticate(request, { allowPasswordChange: true })
  if (ctx instanceof Response) return ctx
  if (!ctx.deviceId) return error(400, "DEVICE_REQUIRED", "Header X-Device-Id wajib diisi.")
  const body = await readJson(request, schema)
  if (body instanceof Response) return body

  const policy = passwordPolicyError(body.newPassword, ctx.user.email)
  if (policy) return error(400, "VALIDATION", "Periksa kembali isian yang ditandai.", { fields: { newPassword: policy } })
  const limited = throttle(`pwchange:${ctx.user.id}`, 5, 15 * 60 * 1000)
  if (limited) return limited

  const user = await db.user.findUnique({ where: { id: ctx.user.id }, select: { passwordHash: true } })
  if (!user || !(await bcrypt.compare(body.currentPassword, user.passwordHash))) {
    await audit("PASSWORD_CHANGE_FAILED", { userId: ctx.user.id, severity: "WARNING" })
    return error(400, "VALIDATION", "Password saat ini salah.", { fields: { currentPassword: "Password salah" } })
  }
  if (await bcrypt.compare(body.newPassword, user.passwordHash)) return error(400, "VALIDATION", "Periksa kembali isian yang ditandai.", { fields: { newPassword: "Harus berbeda dari password saat ini" } })

  await db.user.update({
    where: { id: ctx.user.id },
    data: { passwordHash: await hashPassword(body.newPassword), mustChangePassword: false, passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null },
  })
  await db.mobileRefreshToken.updateMany({ where: { userId: ctx.user.id, revokedAt: null }, data: { revokedAt: new Date() } })
  await audit("PASSWORD_CHANGED", { userId: ctx.user.id, entity: "User", entityId: ctx.user.id, metadata: { client: "mobile" } })
  return json(await issueSession(ctx.user.id, ctx.deviceId))
}
