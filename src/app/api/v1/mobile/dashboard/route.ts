import { participantExams } from "@/lib/data/participant"
import { mobileAvailability } from "@/lib/mobile/exam"
import { recentPosts, studentClasses, weakEtag } from "@/lib/mobile/lms"
import { authenticate, ms } from "@/lib/mobile/http"

/**
 * GET /api/v1/mobile/dashboard — beranda mahasiswa: kelas, ujian/pekerjaan aktif, dan
 * postingan terbaru. Ber-ETag: If-None-Match yang cocok → 304 tanpa body.
 * Jam server ada di header X-Server-Time (bukan di body, agar ETag stabil).
 */
export async function GET(request: Request) {
  const ctx = await authenticate(request, { roles: ["PESERTA"] })
  if (ctx instanceof Response) return ctx
  const [classes, exams, posts] = await Promise.all([studentClasses(ctx.user), participantExams(ctx.user), recentPosts(ctx.user)])
  const body = {
    classes,
    exams: exams
      .filter((e) => e.state === "running" || e.state === "available" || e.state === "upcoming")
      .map((e) => ({
        id: e.id,
        title: e.title,
        workType: e.workType,
        subject: e.subject.name,
        startAt: ms(e.startAt),
        endAt: ms(e.endAt),
        dueAt: ms(e.dueAt),
        durationMinutes: e.timed ? e.durationMinutes : null,
        state: e.state,
        mobile: mobileAvailability(e),
      })),
    posts,
  }
  const etag = weakEtag(body)
  const headers = { ETag: etag, "Cache-Control": "private, no-cache", "X-Server-Time": String(Date.now()) }
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers })
  return Response.json(body, { headers })
}
