import Link from "next/link"
import { ArrowLeft, Award, CalendarClock, ClipboardList } from "lucide-react"
import { db } from "@/lib/db"
import type { CurrentUser } from "@/lib/auth/dal"
import { examWindow, type getParticipantExam } from "@/lib/data/access"
import { formatDateTime } from "@/lib/format"
import { examLabel } from "@/lib/labels"
import { round2 } from "@/lib/exam/grading"
import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AssignmentPanel } from "./assignment-panel"
import { AttachmentList } from "@/components/exam/attachment-list"

type Exam = NonNullable<Awaited<ReturnType<typeof getParticipantExam>>>

const STATUS = {
  assigned: { label: "Ditugaskan", className: "bg-tint-sky text-tint-sky-fg" },
  draft: { label: "Draf — belum diserahkan", className: "bg-tint-orange text-tint-orange-fg" },
  submitted: { label: "Diserahkan", className: "bg-tint-green text-tint-green-fg" },
  graded: { label: "Dinilai", className: "bg-tint-violet text-tint-violet-fg" },
  missing: { label: "Tidak diserahkan", className: "bg-tint-rose text-tint-rose-fg" },
  upcoming: { label: "Belum dibuka", className: "bg-muted text-muted-foreground" },
} as const

/** Halaman Tugas (ASSIGNMENT) untuk peserta: instruksi, status, lembar kerja, dan nilai. */
export async function AssignmentView({ user, exam }: { user: CurrentUser; exam: Exam }) {
  const attempt = await db.attempt.findFirst({
    where: { examId: exam.id, userId: user.id },
    orderBy: { attemptNo: "desc" },
    include: { files: { orderBy: { createdAt: "asc" }, select: { id: true, fileName: true, size: true } } },
  })
  const attachments = await db.examAttachment.findMany({ where: { examId: exam.id }, orderBy: { createdAt: "asc" }, select: { id: true, fileName: true, size: true } })
  const window = examWindow(exam)
  const open = window === "open"
  const status = attempt?.status === "GRADED" ? "graded" : attempt?.status === "SUBMITTED" ? "submitted" : window === "upcoming" ? "upcoming" : window === "closed" ? "missing" : attempt ? "draft" : "assigned"
  const st = STATUS[status]
  const overdue = !!exam.dueAt && exam.dueAt < new Date() && (status === "assigned" || status === "draft")
  const max = exam.maxPoints ?? 100
  const points = attempt?.status === "GRADED" && attempt.score !== null ? round2((attempt.score * max) / 100) : null

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link href="/ujian" className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2 w-fit" })}>
        <ArrowLeft aria-hidden /> Ujian Saya
      </Link>
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-primary-deep p-6 text-primary-foreground">
        <p className="flex items-center gap-1.5 text-sm text-primary-foreground/80">
          <ClipboardList className="size-4" aria-hidden /> Tugas · {examLabel(exam)} · {exam.subject.code} {exam.subject.name}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{exam.title}</h1>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <span className="rounded-full bg-white/15 px-3 py-1">{max} poin</span>
          {exam.dueAt && (
            <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1">
              <CalendarClock className="size-4" aria-hidden /> Tenggat {formatDateTime(exam.dueAt)}
            </span>
          )}
          {exam.endAt && <span className="rounded-full bg-white/15 px-3 py-1">Ditutup {formatDateTime(exam.endAt)}</span>}
        </div>
      </section>

      {(exam.instructions || attachments.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Instruksi</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {exam.instructions && <p className="text-sm whitespace-pre-wrap">{exam.instructions}</p>}
            <AttachmentList items={attachments.map((a) => ({ id: a.id, name: a.fileName, size: a.size }))} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Tugas Anda
            <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", st.className)}>{st.label}</span>
            {(attempt?.isLate || overdue) && <span className="rounded-full bg-tint-rose px-2.5 py-1 text-xs font-semibold text-tint-rose-fg">{attempt?.isLate ? "Terlambat" : "Lewat tenggat"}</span>}
          </CardTitle>
          {attempt?.submittedAt && <p className="text-xs text-muted-foreground">Diserahkan {formatDateTime(attempt.submittedAt)}</p>}
        </CardHeader>
        <CardContent>
          {status === "upcoming" ? (
            <p className="text-sm text-muted-foreground">Tugas dibuka {exam.startAt ? formatDateTime(exam.startAt) : "segera"}.</p>
          ) : (
            <AssignmentPanel
              examId={exam.id}
              editable={open && (status === "assigned" || status === "draft")}
              submitted={status === "submitted"}
              canUnsubmit={open && status === "submitted"}
              initialText={attempt?.submissionText ?? ""}
              files={attempt?.files.map((f) => ({ id: f.id, name: f.fileName, size: f.size })) ?? []}
            />
          )}
        </CardContent>
      </Card>

      {attempt?.status === "GRADED" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="size-4 text-primary" aria-hidden /> Nilai
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {exam.showScore && points !== null ? (
              <p className="text-3xl font-bold tabular-nums">
                {points}
                <span className="text-base font-medium text-muted-foreground"> / {max}</span>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Nilai belum diumumkan pengajar.</p>
            )}
            {exam.showScore && attempt.feedback && <p className="rounded-xl bg-muted/50 p-3 text-sm whitespace-pre-wrap">{attempt.feedback}</p>}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
