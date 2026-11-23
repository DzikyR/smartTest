import { z } from "zod"
import { getParticipantExam } from "@/lib/data/access"
import { beginAttempt } from "@/lib/exam/start"
import { attemptState, mobileDevice, mobileStartCheck, NOT_FOUND } from "@/lib/mobile/exam"
import { authenticate, error, json, readJson, throttle } from "@/lib/mobile/http"

const schema = z.object({
  token: z.string().max(12).optional(),
  /** Token Play Integrity / App Attest — wajib untuk ujian tingkat 2 (SEB) */
  integrityToken: z.string().max(8192).optional(),
})

const STATUS: Partial<Record<string, number>> = { OTHER_DEVICE: 423, TOKEN: 400, UPCOMING: 425, SESSION_UPCOMING: 425 }

/**
 * POST /api/v1/mobile/exams/[id]/start  { token?, integrityToken? }
 * Mulai atau lanjutkan — aturan sama dengan tombol Mulai di web (src/lib/exam/start.ts).
 * Respons berisi tata letak acak peserta, jawaban tersimpan, batas waktu (jam server),
 * dan kunci paket soal.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/v1/mobile/exams/[id]/start">) {
  const ctx = await authenticate(request, { roles: ["PESERTA"] })
  if (ctx instanceof Response) return ctx
  const limited = throttle(`start:${ctx.user.id}`, 30, 60_000)
  if (limited) return limited
  const body = await readJson(request, schema)
  if (body instanceof Response) return body
  const { id } = await params

  const exam = await getParticipantExam(ctx.user, id)
  if (!exam) return error(404, "NOT_FOUND", NOT_FOUND)
  const denied = await mobileStartCheck(exam, ctx, body.integrityToken)
  if (denied) return error(denied.status, denied.code, denied.message, denied.extra)

  const result = await beginAttempt(ctx.user, exam, {
    token: body.token,
    device: mobileDevice(ctx.deviceId!),
    // Ujian tingkat 2 di aplikasi selalu dikunci ke perangkat yang lolos verifikasi integritas.
    lockDevice: exam.lockDevice || exam.requireSeb,
    client: ctx.platform!,
  })
  if (!result.ok) return error(STATUS[result.code] ?? 403, result.code, result.error, result.fieldErrors ? { fields: result.fieldErrors } : {})
  return json({ resumed: result.resumed, ...(await attemptState(result.attemptId, exam)) })
}
