import { submitAttempt, submitSchema } from "@/lib/mobile/exam"
import { authenticate, error, json, readJson, throttle } from "@/lib/mobile/http"

/**
 * POST /api/v1/mobile/attempts/[id]/submit  { answers, flagged?, leaveCount? }
 * Kumpulkan & koreksi otomatis (finalizeAttempt — sama dengan web). Idempotent: dikirim
 * ulang setelah berhasil → 200 dengan hasil yang sama (`duplicate: true`).
 */
export async function POST(request: Request, { params }: RouteContext<"/api/v1/mobile/attempts/[id]/submit">) {
  const ctx = await authenticate(request, { roles: ["PESERTA"], versionGate: false })
  if (ctx instanceof Response) return ctx
  const limited = throttle(`submit:${ctx.user.id}`, 30, 60_000)
  if (limited) return limited
  const body = await readJson(request, submitSchema)
  if (body instanceof Response) return body
  const { id } = await params
  const result = await submitAttempt(ctx, id, body)
  if (!result.ok) return error(result.status, result.code, result.message, result.extra)
  return json(result.data)
}
