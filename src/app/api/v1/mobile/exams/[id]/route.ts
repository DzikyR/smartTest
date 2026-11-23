import { db } from "@/lib/db"
import { getParticipantExam } from "@/lib/data/access"
import { examPackage, examSummary, NOT_FOUND } from "@/lib/mobile/exam"
import { authenticate, error, json } from "@/lib/mobile/http"

/** GET /api/v1/mobile/exams/[id] — detail, tata tertib, percobaan berjalan, dan versi paket soal. */
export async function GET(request: Request, { params }: RouteContext<"/api/v1/mobile/exams/[id]">) {
  const ctx = await authenticate(request, { roles: ["PESERTA"] })
  if (ctx instanceof Response) return ctx
  const { id } = await params
  const exam = await getParticipantExam(ctx.user, id)
  if (!exam) return error(404, "NOT_FOUND", NOT_FOUND)
  const [attempts, pkg] = await Promise.all([
    db.attempt.findMany({ where: { examId: id, userId: ctx.user.id }, orderBy: { attemptNo: "asc" }, select: { id: true, attemptNo: true, status: true, score: true, submittedAt: true } }),
    exam.workType !== "ASSIGNMENT" && exam._count.questions > 0 ? examPackage(id) : null,
  ])
  return json({
    exam: examSummary(exam),
    running: attempts.find((a) => a.status === "IN_PROGRESS")?.id ?? null,
    attempts: attempts
      .filter((a) => a.status !== "IN_PROGRESS")
      .map((a) => ({ id: a.id, no: a.attemptNo, status: a.status, score: exam.showScore ? a.score : null, submittedAt: a.submittedAt?.getTime() ?? null })),
    package: pkg ? { version: pkg.version, size: pkg.blob.length } : null,
    now: Date.now(),
  })
}
