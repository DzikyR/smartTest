import { classPosts, isActiveStudent, weakEtag } from "@/lib/mobile/lms"
import { authenticate, error } from "@/lib/mobile/http"

/** GET /api/v1/mobile/classes/[id]/posts — tab Materi kelas (topik + postingan terbit). Ber-ETag. */
export async function GET(request: Request, { params }: RouteContext<"/api/v1/mobile/classes/[id]/posts">) {
  const ctx = await authenticate(request, { roles: ["PESERTA"] })
  if (ctx instanceof Response) return ctx
  const { id } = await params
  if (!(await isActiveStudent(ctx.user, id))) return error(404, "NOT_FOUND", "Kelas tidak ditemukan atau Anda belum menjadi anggota aktif.")
  const body = await classPosts(ctx.user, id)
  const etag = weakEtag(body)
  const headers = { ETag: etag, "Cache-Control": "private, no-cache" }
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers })
  return Response.json(body, { headers })
}
