import { participantExams } from "@/lib/data/participant"
import { mobileAvailability } from "@/lib/mobile/exam"
import { authenticate, json, ms } from "@/lib/mobile/http"

/** GET /api/v1/mobile/exams — ujian & pekerjaan yang ditujukan ke peserta, dengan statusnya. */
export async function GET(request: Request) {
  const ctx = await authenticate(request, { roles: ["PESERTA"] })
  if (ctx instanceof Response) return ctx
  const exams = await participantExams(ctx.user)
  return json({
    exams: exams.map((e) => ({
      id: e.id,
      title: e.title,
      kind: e.kind,
      category: e.category?.name ?? null,
      workType: e.workType,
      subject: { code: e.subject.code, name: e.subject.name },
      startAt: ms(e.startAt),
      endAt: ms(e.endAt),
      dueAt: ms(e.dueAt),
      timed: e.timed,
      durationMinutes: e.durationMinutes,
      questionCount: e._count.questions,
      maxAttempts: e.maxAttempts,
      attempts: e.attempts,
      state: e.state,
      best: e.best,
      pendingScore: e.pendingScore,
      mobile: mobileAvailability(e),
    })),
    now: Date.now(),
  })
}
