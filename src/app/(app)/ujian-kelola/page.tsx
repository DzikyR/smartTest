import type { Metadata } from "next"
import Link from "next/link"
import { CalendarClock, ChevronRight, Clock, FileQuestion, Plus, Users } from "lucide-react"
import { db } from "@/lib/db"
import { requireRole } from "@/lib/auth/dal"
import { STAFF } from "@/lib/auth/roles"
import { managedSubjects } from "@/lib/data/access"
import { formatDateTime } from "@/lib/format"
import { EXAM_KIND_LABEL } from "@/lib/labels"
import { EXAM_STATUS, examStatus, type ExamStatus } from "@/lib/exam/status"
import { cn } from "@/lib/utils"
import { EmptyState, PageHeader, str, UrlTabs } from "@/components/shell/page-parts"
import { buttonVariants } from "@/components/ui/button"

export const metadata: Metadata = { title: "Kelola Ujian" }

const TABS: { key: string; label: string; statuses?: ExamStatus[] }[] = [
  { key: "semua", label: "Semua" },
  { key: "aktif", label: "Berlangsung", statuses: ["open", "stopped"] },
  { key: "terjadwal", label: "Terjadwal", statuses: ["upcoming"] },
  { key: "draf", label: "Draf", statuses: ["draft"] },
  { key: "selesai", label: "Selesai", statuses: ["closed"] },
]

export default async function ManageExamsPage({ searchParams }: PageProps<"/ujian-kelola">) {
  const user = await requireRole(...STAFF)
  const sp = await searchParams
  const tab = TABS.find((t) => t.key === str(sp.tab)) ?? TABS[0]
  const exams = await db.exam.findMany({
    where: { subject: managedSubjects(user) },
    orderBy: [{ startAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
    include: {
      subject: { select: { code: true, name: true } },
      groups: { select: { group: { select: { name: true } } } },
      _count: { select: { questions: true } },
    },
  })
  const counts = await db.attempt.groupBy({ by: ["examId", "status"], where: { examId: { in: exams.map((e) => e.id) } }, _count: true })
  const countOf = (examId: string, status?: string) => counts.filter((c) => c.examId === examId && (!status || c.status === status)).reduce((s, c) => s + c._count, 0)
  const now = new Date()
  const withStatus = exams.map((e) => ({ ...e, status: examStatus(e, now) }))
  const shown = tab.statuses ? withStatus.filter((e) => tab.statuses!.includes(e.status)) : withStatus

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Kelola Ujian"
        description="Atur jadwal, durasi, soal, peserta, dan pengamanan setiap ujian."
        actions={
          <Link href="/ujian-kelola/baru" className={buttonVariants({ className: "rounded-xl" })}>
            <Plus aria-hidden /> Buat ujian
          </Link>
        }
      />
      <UrlTabs
        label="Filter status"
        active={tab.key}
        tabs={TABS.map((t) => ({
          key: t.key,
          href: `/ujian-kelola?tab=${t.key}`,
          label: `${t.label} (${t.statuses ? withStatus.filter((e) => t.statuses!.includes(e.status)).length : withStatus.length})`,
        }))}
      />
      {shown.length === 0 ? (
        <EmptyState
          title="Belum ada ujian di sini"
          description="Buat ujian, tentukan durasinya, lalu isi soal dari bank, buat massal, atau impor Word/Excel."
          action={
            <Link href="/ujian-kelola/baru" className={buttonVariants({ size: "sm" })}>
              <Plus aria-hidden /> Buat ujian
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {shown.map((e) => {
            const st = EXAM_STATUS[e.status]
            const pending = countOf(e.id, "SUBMITTED")
            return (
              <Link key={e.id} href={`/ujian-kelola/${e.id}`} className="group flex flex-col gap-4 rounded-2xl bg-card p-5 ring-1 ring-border/60 transition hover:ring-primary/40">
                <div className="flex items-start gap-3">
                  <span className="flex size-12 shrink-0 flex-col items-center justify-center rounded-xl bg-primary text-primary-foreground">
                    <span className="text-[10px] leading-none font-medium uppercase opacity-80">{EXAM_KIND_LABEL[e.kind].slice(0, 6)}</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-muted-foreground">
                      {e.subject.code} · {e.subject.name}
                    </p>
                    <h2 className="leading-snug font-semibold group-hover:text-primary">{e.title}</h2>
                  </div>
                  <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold", st.className)}>{st.label}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="size-4" aria-hidden /> {e.durationMinutes} mnt
                  </span>
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <FileQuestion className="size-4" aria-hidden /> {e._count.questions} soal
                  </span>
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Users className="size-4" aria-hidden /> {countOf(e.id)} percobaan
                  </span>
                  <span className="truncate text-muted-foreground">{e.openToAll ? "Semua peserta" : e.groups.map((g) => g.group.name).join(", ") || "Belum ada peserta"}</span>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <CalendarClock className="size-3.5" aria-hidden />
                    {e.startAt ? formatDateTime(e.startAt) : "Dibuka langsung"}
                    {e.endAt && ` — ${formatDateTime(e.endAt)}`}
                  </span>
                  {pending > 0 ? <span className="font-semibold text-tint-orange-fg">{pending} esai perlu dinilai</span> : <ChevronRight className="size-4" aria-hidden />}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
