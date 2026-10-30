import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { notFound } from "next/navigation"
import { Clock, FileQuestion, Hourglass, PauseCircle, ShieldCheck, UserRound } from "lucide-react"
import { db } from "@/lib/db"
import { requireRole } from "@/lib/auth/dal"
import { examWindow } from "@/lib/data/access"
import { sessionWindow } from "@/lib/sessions/access"
import { examRules } from "@/lib/exam/rules"
import { examLabel } from "@/lib/labels"
import { formatDateTime } from "@/lib/format"
import { getBrand } from "@/lib/site/config"
import { Logo } from "@/components/shell/logo"
import { ExamRulesList } from "@/components/exam/exam-rules"
import { Skeleton } from "@/components/ui/skeleton"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LobbyCountdown } from "./lobby-countdown"

export const metadata: Metadata = { title: "Ruang Tunggu Ujian" }

/**
 * Ruang tunggu sesi ujian publik — sengaja di luar shell aplikasi: tanpa menu
 * kelas/perkuliahan, hanya informasi ujian, hitung mundur, dan tata tertib.
 */
export default async function LobbyPage({ params }: PageProps<"/sesi/[id]">) {
  const brand = await getBrand()
  return (
    <div className="min-h-svh bg-background">
      <header className="flex h-16 items-center justify-between border-b border-border/60 px-4 sm:px-6">
        <Logo brand={brand} href="/ujian" />
        <Link href="/ujian" className="text-sm font-medium text-muted-foreground hover:text-foreground">
          Ujian Saya
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4 sm:p-8">
        <Suspense fallback={<Skeleton className="h-96 rounded-3xl" />}>
          <Lobby params={params} />
        </Suspense>
      </main>
    </div>
  )
}

async function Lobby({ params }: { params: PageProps<"/sesi/[id]">["params"] }) {
  const user = await requireRole("PESERTA")
  const { id } = await params
  // Hanya peserta terdaftar (bukan yang dikeluarkan) — selain itu 404.
  const p = await db.sessionParticipant.findUnique({
    where: { sessionId_userId: { sessionId: id, userId: user.id } },
    select: {
      status: true,
      session: {
        include: {
          createdBy: { select: { name: true } },
          exam: { include: { category: { select: { name: true } }, subject: { select: { code: true, name: true } }, _count: { select: { questions: true } } } },
        },
      },
    },
  })
  if (!p || p.status !== "ACTIVE" || !p.session.exam.publishedAt) notFound()
  const { session: s } = p
  const exam = s.exam
  const attempt = await db.attempt.findFirst({ where: { examId: exam.id, userId: user.id }, orderBy: { attemptNo: "desc" }, select: { status: true } })

  const sw = sessionWindow(s)
  const ew = examWindow(exam)
  // Waktu mulai efektif: yang paling akhir antara pembukaan sesi dan jadwal ujian.
  const startsAt = [s.opensAt, exam.startAt].filter((d): d is Date => !!d && d > new Date()).sort((a, b) => b.getTime() - a.getTime())[0] ?? null
  const state = attempt?.status === "IN_PROGRESS" ? "running" : attempt ? "done" : sw === "stopped" ? "stopped" : sw === "closed" || ew === "closed" ? "closed" : sw === "upcoming" || ew === "upcoming" ? "waiting" : "open"

  return (
    <>
      <section className="rounded-3xl bg-gradient-to-br from-primary via-primary-mid to-primary-deep p-6 text-primary-foreground">
        <p className="text-sm text-primary-foreground/80">
          {examLabel(exam)} · {s.name}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{exam.title}</h1>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1">
            <Clock className="size-4" aria-hidden /> {exam.timed ? `${exam.durationMinutes} menit` : "Tanpa batas durasi"}
          </span>
          <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1">
            <FileQuestion className="size-4" aria-hidden /> {exam._count.questions} soal
          </span>
          {s.createdBy && (
            <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1">
              <UserRound className="size-4" aria-hidden /> {s.createdBy.name}
            </span>
          )}
        </div>
      </section>

      <Card className="text-center">
        <CardContent className="flex flex-col items-center gap-4 py-6">
          {state === "waiting" && (
            <>
              <Hourglass className="size-8 text-primary" aria-hidden />
              <p className="font-semibold">Ujian dimulai dalam</p>
              <LobbyCountdown target={startsAt?.getTime() ?? null} />
              {startsAt && <p className="text-sm text-muted-foreground">{formatDateTime(startsAt)} WIB · halaman diperbarui otomatis</p>}
            </>
          )}
          {state === "stopped" && (
            <>
              <PauseCircle className="size-8 text-tint-orange-fg" aria-hidden />
              <p className="font-semibold">Sesi sedang dihentikan penyelenggara</p>
              <p className="text-sm text-muted-foreground">Tetap di halaman ini — tombol mulai muncul otomatis saat sesi dilanjutkan.</p>
              <LobbyCountdown target={null} />
            </>
          )}
          {state === "open" && (
            <>
              <ShieldCheck className="size-8 text-tint-green-fg" aria-hidden />
              <p className="font-semibold">Ujian sudah dibuka</p>
              {s.closesAt && <p className="text-sm text-muted-foreground">Mulai sebelum {formatDateTime(s.closesAt)} WIB.</p>}
              <Link href={`/ujian/${exam.id}`} className={buttonVariants({ size: "lg", className: "h-12 rounded-xl px-8 text-base" })}>
                Masuk ruang ujian
              </Link>
            </>
          )}
          {state === "running" && (
            <Link href={`/ujian/${exam.id}`} className={buttonVariants({ size: "lg", className: "h-12 rounded-xl px-8 text-base" })}>
              Lanjutkan ujian
            </Link>
          )}
          {state === "done" && (
            <>
              <p className="font-semibold">Anda sudah mengerjakan ujian ini.</p>
              <Link href={`/ujian/${exam.id}`} className={buttonVariants({ variant: "outline" })}>
                Lihat status & hasil
              </Link>
            </>
          )}
          {state === "closed" && <p className="font-semibold text-muted-foreground">Batas masuk sesi sudah lewat.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tata tertib</CardTitle>
        </CardHeader>
        <CardContent>
          <ExamRulesList rules={examRules(exam)} />
        </CardContent>
      </Card>
    </>
  )
}
