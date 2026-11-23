import { getParticipantExam } from "@/lib/data/access"
import { examPackage, NOT_FOUND } from "@/lib/mobile/exam"
import { authenticate, error, throttle } from "@/lib/mobile/http"

/**
 * GET /api/v1/mobile/exams/[id]/package — paket soal TERENKRIPSI (application/octet-stream).
 * Boleh diunduh sebelum ujian dibuka; kuncinya baru diberikan saat Mulai. ETag = versi
 * paket → unduh ulang hanya bila soal berubah (If-None-Match → 304).
 */
export async function GET(request: Request, { params }: RouteContext<"/api/v1/mobile/exams/[id]/package">) {
  const ctx = await authenticate(request, { roles: ["PESERTA"] })
  if (ctx instanceof Response) return ctx
  const limited = throttle(`pkg:${ctx.user.id}`, 20, 60_000)
  if (limited) return limited
  const { id } = await params
  const exam = await getParticipantExam(ctx.user, id)
  if (!exam || exam.workType === "ASSIGNMENT") return error(404, "NOT_FOUND", NOT_FOUND)
  if (!exam.allowMobileApp) return error(403, "MOBILE_NOT_ALLOWED", "Ujian ini tidak dapat dikerjakan dari aplikasi.")
  if (exam._count.questions === 0) return error(409, "NO_QUESTIONS", "Ujian belum memiliki soal.")
  if (exam.endAt && Date.now() > exam.endAt.getTime()) return error(410, "CLOSED", "Ujian sudah ditutup.")

  const pkg = await examPackage(id)
  const etag = `"${pkg.version}"`
  const headers = { ETag: etag, "Cache-Control": "private, no-cache", "X-Package-Version": pkg.version }
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers })
  return new Response(new Uint8Array(pkg.blob), { headers: { ...headers, "Content-Type": "application/octet-stream" } })
}
