import { saveDelta, saveSchema } from "@/lib/mobile/exam"
import { authenticate, error, json, readJson, throttle } from "@/lib/mobile/http"

/**
 * PUT /api/v1/mobile/attempts/[id]/answers  { seq, answers, cleared?, flagged?, leaveCount? }
 * Simpan otomatis berupa DELTA bernomor urut. Aman diulang: seq yang sama → respons sama,
 * seq lama → 409 STALE_SEQ (tidak menimpa). Tanpa gerbang versi (tidak memaksa update di tengah ujian).
 */
export async function PUT(request: Request, { params }: RouteContext<"/api/v1/mobile/attempts/[id]/answers">) {
  const ctx = await authenticate(request, { roles: ["PESERTA"], versionGate: false })
  if (ctx instanceof Response) return ctx
  const limited = throttle(`autosave:${ctx.user.id}`, 60, 60_000)
  if (limited) return limited
  const body = await readJson(request, saveSchema)
  if (body instanceof Response) return body
  const { id } = await params
  const result = await saveDelta(ctx, id, body)
  if (!result.ok) return error(result.status, result.code, result.message, result.extra)
  return json(result.data)
}
