import { participantExams } from "@/lib/data/participant"
import { examCard } from "@/lib/mobile/exam"
import { authenticate, json } from "@/lib/mobile/http"

/**
 * GET /api/v1/mobile/exams[?classId=…] — ujian & pekerjaan yang ditujukan ke peserta, dengan statusnya
 * (opsional: hanya yang ditujukan ke satu kelas — tab "Ujian & Tugas" di halaman kelas).
 */
export async function GET(request: Request) {
  const ctx = await authenticate(request, { roles: ["PESERTA"] })
  if (ctx instanceof Response) return ctx
  const classId = new URL(request.url).searchParams.get("classId")?.slice(0, 40) || undefined
  const exams = await participantExams(ctx.user, { groupId: classId })
  return json({ exams: exams.map(examCard), now: Date.now() })
}
