import type { Metadata } from "next"
import { requireRole } from "@/lib/auth/dal"
import { isFeatureEnabled } from "@/lib/features/access"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { participantExams, type ParticipantExamState } from "@/lib/data/participant"
import { ParticipantExamCard } from "@/components/exam/participant-exam-card"
import { EmptyState, PageHeader } from "@/components/shell/page-parts"

export const metadata: Metadata = { title: "Ujian Saya" }

const GROUPS: { title: string; states: ParticipantExamState[]; empty?: string }[] = [
  { title: "Sedang berlangsung", states: ["running", "available"], empty: "Tidak ada ujian yang sedang dibuka." },
  { title: "Akan datang", states: ["upcoming"] },
  { title: "Selesai", states: ["done"] },
  { title: "Terlewat", states: ["missed"] },
]

export default async function MyExamsPage() {
  const user = await requireRole("PESERTA")
  const [exams, canStart] = await Promise.all([participantExams(user), isFeatureEnabled("ujian.mulai", user.role)])
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Ujian Saya" description="Kuis, UTS, UAS, dan tes yang ditujukan untuk Anda. Siapkan koneksi stabil sebelum memulai." />
      {!canStart && (
        <Alert>
          <AlertTitle>Memulai ujian baru sedang dinonaktifkan</AlertTitle>
          <AlertDescription>Ujian yang sedang Anda kerjakan tetap dapat dilanjutkan dan dikumpulkan.</AlertDescription>
        </Alert>
      )}
      {exams.length === 0 ? (
        <EmptyState title="Belum ada ujian" description="Ujian yang diterbitkan untuk Anda akan muncul di sini." />
      ) : (
        GROUPS.map((g) => {
          const items = exams.filter((e) => g.states.includes(e.state))
          if (items.length === 0 && !g.empty) return null
          return (
            <section key={g.title} className="flex flex-col gap-3">
              <h2 className="font-semibold">
                {g.title} <span className="text-sm font-normal text-muted-foreground">({items.length})</span>
              </h2>
              {items.length ? (
                <div className="grid gap-4 lg:grid-cols-2">
                  {items.map((e) => (
                    <ParticipantExamCard key={e.id} exam={e} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{g.empty}</p>
              )}
            </section>
          )
        })
      )}
    </div>
  )
}
