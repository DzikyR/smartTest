import Link from "next/link"
import { CalendarClock, ChevronRight, Clock, FileQuestion, ShieldCheck } from "lucide-react"
import type { participantExams } from "@/lib/data/participant"
import { formatDateTime } from "@/lib/format"
import { EXAM_KIND_LABEL } from "@/lib/labels"
import { cn } from "@/lib/utils"

type Item = Awaited<ReturnType<typeof participantExams>>[number]

const STATE = {
  running: { label: "Sedang dikerjakan", className: "bg-tint-orange text-tint-orange-fg" },
  available: { label: "Bisa dikerjakan", className: "bg-tint-green text-tint-green-fg" },
  upcoming: { label: "Akan datang", className: "bg-tint-sky text-tint-sky-fg" },
  done: { label: "Selesai", className: "bg-tint-violet text-tint-violet-fg" },
  missed: { label: "Terlewat", className: "bg-tint-rose text-tint-rose-fg" },
} as const

export function ParticipantExamCard({ exam }: { exam: Item }) {
  const st = STATE[exam.state]
  return (
    <Link href={`/ujian/${exam.id}`} className="group flex flex-col gap-4 rounded-2xl bg-card p-5 ring-1 ring-border/60 transition hover:ring-primary/40">
      <div className="flex items-start gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary text-xs font-bold text-primary-foreground">{EXAM_KIND_LABEL[exam.kind]}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-muted-foreground">
            {exam.subject.code} · {exam.subject.name}
          </p>
          <h3 className="leading-snug font-semibold group-hover:text-primary">{exam.title}</h3>
        </div>
        <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold", st.className)}>{st.label}</span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Clock className="size-4" aria-hidden /> {exam.durationMinutes} menit
        </span>
        <span className="flex items-center gap-1.5">
          <FileQuestion className="size-4" aria-hidden /> {exam._count.questions} soal
        </span>
        {exam.requireSeb && (
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="size-4" aria-hidden /> Safe Exam Browser
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <CalendarClock className="size-3.5" aria-hidden />
          {exam.state === "upcoming" && exam.startAt ? `Dibuka ${formatDateTime(exam.startAt)}` : exam.endAt ? `Ditutup ${formatDateTime(exam.endAt)}` : "Tanpa batas waktu tutup"}
        </span>
        {exam.best !== null ? (
          <span className="rounded-full bg-primary px-2.5 py-0.5 text-sm font-bold text-primary-foreground tabular-nums">{exam.best}</span>
        ) : exam.pendingScore ? (
          <span>Nilai belum diumumkan</span>
        ) : (
          <ChevronRight className="size-4 transition group-hover:translate-x-0.5" aria-hidden />
        )}
      </div>
    </Link>
  )
}
