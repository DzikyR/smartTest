import type { Metadata } from "next"
import Link from "next/link"
import { Award, BarChart3, ClipboardCheck } from "lucide-react"
import { db } from "@/lib/db"
import { requireFeature } from "@/lib/features/access"
import { formatDateTime } from "@/lib/format"
import { examLabel } from "@/lib/labels"
import { round2 } from "@/lib/exam/grading"
import { cn } from "@/lib/utils"
import { EmptyState, PageHeader, StatCard } from "@/components/shell/page-parts"
import { Card } from "@/components/ui/card"

export const metadata: Metadata = { title: "Hasil Ujian" }

export default async function ResultsPage() {
  const user = await requireFeature("hasil.lihat", "PESERTA")
  const attempts = await db.attempt.findMany({
    where: { userId: user.id, status: { not: "IN_PROGRESS" } },
    orderBy: { submittedAt: "desc" },
    select: {
      id: true,
      attemptNo: true,
      status: true,
      score: true,
      submittedAt: true,
      feedback: true,
      exam: { select: { id: true, title: true, kind: true, category: { select: { name: true } }, showScore: true, passingScore: true, subject: { select: { code: true, name: true } } } },
    },
  })
  const visible = attempts.filter((a) => a.exam.showScore && a.score !== null)
  const mean = visible.length ? round2(visible.reduce((s, a) => s + (a.score as number), 0) / visible.length) : null
  const passed = visible.filter((a) => a.exam.passingScore !== null && (a.score as number) >= a.exam.passingScore).length

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Hasil Ujian" description="Nilai ditampilkan setelah diumumkan oleh pengelola ujian." />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Ujian dikerjakan" value={attempts.length} icon={<ClipboardCheck />} tint="violet" />
        <StatCard label="Rata-rata nilai" value={mean ?? "—"} icon={<BarChart3 />} tint="sky" />
        <StatCard label="Lulus" value={passed} icon={<Award />} tint="green" hint="Ujian yang memiliki nilai lulus" />
      </div>
      {attempts.length === 0 ? (
        <EmptyState title="Belum ada hasil" description="Hasil ujian yang sudah Anda kumpulkan akan muncul di sini." />
      ) : (
        <Card className="py-0">
          <ul className="divide-y">
            {attempts.map((a) => {
              const shown = a.exam.showScore && a.score !== null
              const pass = shown && a.exam.passingScore !== null ? (a.score as number) >= a.exam.passingScore : null
              return (
                <li key={a.id}>
                  <Link href={`/ujian/${a.exam.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-muted/40">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-tint-violet text-xs font-bold text-tint-violet-fg">{examLabel(a.exam)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{a.exam.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {a.exam.subject.code} · {a.exam.subject.name} · {formatDateTime(a.submittedAt)}
                        {a.attemptNo > 1 && ` · percobaan ${a.attemptNo}`}
                      </span>
                    </span>
                    {pass !== null && (
                      <span className={cn("hidden rounded-full px-2.5 py-1 text-xs font-semibold sm:inline", pass ? "bg-tint-green text-tint-green-fg" : "bg-tint-rose text-tint-rose-fg")}>
                        {pass ? "Lulus" : "Belum lulus"}
                      </span>
                    )}
                    {shown ? (
                      <span className="text-xl font-bold tabular-nums">{a.score}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">{a.status === "SUBMITTED" ? "Menunggu koreksi" : "Belum diumumkan"}</span>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        </Card>
      )}
    </div>
  )
}
