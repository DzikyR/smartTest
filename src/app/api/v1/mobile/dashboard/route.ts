import { participantExams } from "@/lib/data/participant"
import { round2 } from "@/lib/exam/grading"
import { examCard } from "@/lib/mobile/exam"
import { recentPosts, studentClasses, weakEtag } from "@/lib/mobile/lms"
import { authenticate } from "@/lib/mobile/http"

/**
 * GET /api/v1/mobile/dashboard — beranda mahasiswa, isi & hitungan sama dengan dashboard web:
 * kelas, statistik (bisa dikerjakan / akan datang / rata-rata nilai), ujian untuk Anda, postingan terbaru.
 * Ber-ETag: If-None-Match yang cocok → 304 tanpa body. Jam server di header X-Server-Time (ETag tetap stabil).
 */
export async function GET(request: Request) {
  const ctx = await authenticate(request, { roles: ["PESERTA"] })
  if (ctx instanceof Response) return ctx
  const [classes, exams, posts] = await Promise.all([studentClasses(ctx.user), participantExams(ctx.user), recentPosts(ctx.user)])
  const now = exams.filter((e) => e.state === "running" || e.state === "available")
  const upcoming = exams.filter((e) => e.state === "upcoming")
  const scored = exams.filter((e) => e.best !== null)
  const body = {
    classes,
    stats: {
      available: now.length,
      upcoming: upcoming.length,
      mean: scored.length ? round2(scored.reduce((s, e) => s + (e.best as number), 0) / scored.length) : null,
      scored: scored.length,
    },
    // "Ujian untuk Anda": yang bisa dikerjakan dulu, lalu yang akan datang (seperti web).
    exams: [...now, ...upcoming].map(examCard),
    posts,
  }
  const etag = weakEtag(body)
  const headers = { ETag: etag, "Cache-Control": "private, no-cache", "X-Server-Time": String(Date.now()) }
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers })
  return Response.json(body, { headers })
}
