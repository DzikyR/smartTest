import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, BookOpenText, CalendarClock, ClipboardList, FilePen, Library, MonitorCheck, Plus, Sparkles, Trophy, Users } from "lucide-react"
import { db } from "@/lib/db"
import { isAdmin, requireRole, type CurrentUser } from "@/lib/auth/dal"
import { managedSubjects } from "@/lib/data/access"
import { getTexts } from "@/lib/site/config"
import { JoinClassDialog } from "@/components/classes/join-class"
import { fill } from "@/content/texts"
import { enabledFeatures } from "@/lib/features/access"
import type { FeatureKey } from "@/lib/features/registry"
import { participantExams } from "@/lib/data/participant"
import { formatDateTime } from "@/lib/format"
import { EXAM_KIND_LABEL } from "@/lib/labels"
import { round2 } from "@/lib/exam/grading"
import { EXAM_STATUS, examStatus } from "@/lib/exam/status"
import { cn } from "@/lib/utils"
import { BarChart } from "@/components/charts/bar-chart"
import { ParticipantExamCard } from "@/components/exam/participant-exam-card"
import { EmptyState, StatCard } from "@/components/shell/page-parts"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata: Metadata = { title: "Dashboard" }

export default async function DashboardPage() {
  const user = await requireRole()
  return user.role === "PESERTA" ? <ParticipantDashboard user={user} /> : <StaffDashboard user={user} />
}

async function Welcome({ name, subtitle, action }: { name: string; subtitle: string; action?: React.ReactNode }) {
  const first = name.split(/\s+/)[0]
  const t = await getTexts()
  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-primary-mid to-primary-deep p-6 text-primary-foreground sm:p-8">
      <div className="absolute -top-20 -right-16 size-64 rounded-full bg-white/10" aria-hidden />
      <div className="absolute right-24 -bottom-24 size-48 rounded-full bg-white/5" aria-hidden />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="flex items-center gap-1.5 text-sm text-primary-foreground/80">
            <Sparkles className="size-4" aria-hidden /> {t["dashboard.greeting"]}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Halo, {first}!</h1>
          <p className="mt-1 max-w-lg text-sm text-primary-foreground/85">{subtitle}</p>
        </div>
        {action}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Admin & dosen
// ---------------------------------------------------------------------------

async function StaffDashboard({ user }: { user: CurrentUser }) {
  const scope = { subject: managedSubjects(user) }
  const [features, t] = await Promise.all([enabledFeatures(user.role), getTexts()])
  const [subjects, questions, participants, exams, toGrade, recentLogs] = await Promise.all([
    db.subject.count({ where: managedSubjects(user) }),
    db.question.count({ where: scope }),
    db.user.count({ where: { role: "PESERTA", isActive: true } }),
    db.exam.findMany({
      where: scope,
      orderBy: { createdAt: "desc" },
      take: 60,
      select: { id: true, title: true, kind: true, publishedAt: true, sessionActive: true, startAt: true, endAt: true, durationMinutes: true, subject: { select: { code: true } } },
    }),
    db.attempt.groupBy({ by: ["examId"], where: { status: "SUBMITTED", exam: scope }, _count: true }),
    isAdmin(user)
      ? db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 6, select: { id: true, action: true, createdAt: true, user: { select: { name: true } } } })
      : Promise.resolve([]),
  ])
  const now = new Date()
  const withStatus = exams.map((e) => ({ ...e, status: examStatus(e, now) }))
  const active = withStatus.filter((e) => e.status === "open" || e.status === "upcoming")

  // Rata-rata nilai 8 ujian terakhir yang sudah memiliki nilai.
  const graded = await db.attempt.groupBy({
    by: ["examId"],
    where: { exam: scope, score: { not: null } },
    _avg: { score: true },
    _count: true,
  })
  const examTitle = new Map(exams.map((e) => [e.id, e]))
  const chart = graded
    .filter((g) => examTitle.has(g.examId))
    .slice(0, 8)
    .map((g) => {
      const e = examTitle.get(g.examId)!
      return { label: `${EXAM_KIND_LABEL[e.kind]} ${e.subject.code}`, value: round2(g._avg.score ?? 0), hint: `${e.title} · ${g._count} peserta` }
    })
  const toGradeTotal = toGrade.reduce((s, g) => s + g._count, 0)

  return (
    <div className="flex flex-col gap-6">
      <Welcome
        name={user.name}
        subtitle={toGradeTotal ? fill(t["dashboard.staff.toGrade"], { n: toGradeTotal }) : t["dashboard.staff.idle"]}
        action={
          <Link href="/ujian-kelola/baru" className={buttonVariants({ className: "rounded-xl bg-white text-primary hover:bg-white/90" })}>
            <Plus aria-hidden /> {t["dashboard.staff.cta"]}
          </Link>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Mata uji" value={subjects} icon={<BookOpenText />} tint="violet" hint={isAdmin(user) ? "seluruh sistem" : "yang Anda kelola"} />
        <StatCard label="Soal di bank" value={questions} icon={<Library />} tint="sky" />
        <StatCard label="Ujian aktif & terjadwal" value={active.length} icon={<MonitorCheck />} tint="green" hint={`${exams.length} ujian total`} />
        <StatCard label="Peserta aktif" value={participants} icon={<Users />} tint="orange" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Rata-rata nilai per ujian</CardTitle>
            <p className="text-xs text-muted-foreground">Ujian terbaru yang sudah memiliki nilai (skala 0–100)</p>
          </CardHeader>
          <CardContent>
            {chart.length ? (
              <BarChart title="Rata-rata nilai per ujian" valueLabel="Rata-rata" data={chart} max={100} height={200} />
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">Grafik tampil setelah ada ujian yang dinilai.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Ujian berjalan & terjadwal</CardTitle>
            <Link href="/ujian-kelola" className="text-xs font-medium text-primary hover:underline">
              Semua
            </Link>
          </CardHeader>
          <CardContent>
            {active.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Tidak ada ujian yang sedang berjalan.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {active.slice(0, 6).map((e) => (
                  <li key={e.id}>
                    <Link href={`/ujian-kelola/${e.id}?tab=peserta`} className="flex items-center gap-3 rounded-xl p-2 hover:bg-muted">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-tint-violet text-[10px] font-bold text-tint-violet-fg">{EXAM_KIND_LABEL[e.kind]}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{e.title}</span>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <CalendarClock className="size-3" aria-hidden />
                          {e.startAt ? formatDateTime(e.startAt) : "Dibuka"} · {e.durationMinutes} mnt
                        </span>
                      </span>
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", EXAM_STATUS[e.status].className)}>{EXAM_STATUS[e.status].label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FilePen className="size-4 text-primary" aria-hidden /> Perlu dinilai
            </CardTitle>
          </CardHeader>
          <CardContent>
            {toGrade.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Semua jawaban sudah dinilai. 🎉</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {toGrade.map((g) => {
                  const e = examTitle.get(g.examId)
                  return (
                    <li key={g.examId}>
                      <Link href={`/ujian-kelola/${g.examId}?tab=peserta`} className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 p-3 text-sm hover:bg-muted">
                        <span className="truncate">{e?.title ?? "Ujian"}</span>
                        <span className="flex shrink-0 items-center gap-1 font-semibold text-primary">
                          {g._count} esai <ArrowRight className="size-4" aria-hidden />
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Akses cepat</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {(
              [
                { href: "/bank-soal/massal", label: "Buat soal massal", icon: ClipboardList, tint: "bg-tint-violet text-tint-violet-fg", feature: "bank-soal.massal" },
                { href: "/bank-soal/impor", label: "Impor Word/Excel", icon: Library, tint: "bg-tint-sky text-tint-sky-fg", feature: "bank-soal.impor" },
              { href: "/ujian-kelola/baru", label: "Jadwalkan ujian", icon: CalendarClock, tint: "bg-tint-green text-tint-green-fg" },
              ...(isAdmin(user) ? [{ href: "/admin/pengguna", label: "Kelola pengguna", icon: Users, tint: "bg-tint-orange text-tint-orange-fg" }] : [{ href: "/mata-uji", label: "Mata uji saya", icon: BookOpenText, tint: "bg-tint-orange text-tint-orange-fg" }]),
              ] as { href: string; label: string; icon: typeof Library; tint: string; feature?: FeatureKey }[]
            )
              .filter((item) => !item.feature || features.includes(item.feature))
              .map(({ href, label, icon: Icon, tint }) => (
              <Link key={href} href={href} className="flex items-center gap-3 rounded-xl border p-3 text-sm font-medium hover:border-primary/40 hover:bg-muted/40">
                <span className={cn("flex size-9 items-center justify-center rounded-lg", tint)}>
                  <Icon className="size-[18px]" aria-hidden />
                </span>
                {label}
              </Link>
            ))}
            {recentLogs.length > 0 && (
              <div className="sm:col-span-2">
                <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase">Aktivitas terbaru</p>
                <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                  {recentLogs.map((l) => (
                    <li key={l.id} className="flex justify-between gap-2">
                      <span className="truncate">
                        <span className="font-mono">{l.action}</span> {l.user && `· ${l.user.name}`}
                      </span>
                      <span className="shrink-0">{formatDateTime(l.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Peserta
// ---------------------------------------------------------------------------

async function ParticipantDashboard({ user }: { user: CurrentUser }) {
  const [exams, t, features, classes] = await Promise.all([
    participantExams(user),
    getTexts(),
    enabledFeatures(user.role),
    db.groupMember.findMany({
      where: { userId: user.id, role: "STUDENT", status: { in: ["ACTIVE", "PENDING"] }, group: { archivedAt: null } },
      orderBy: { joinedAt: "desc" },
      take: 6,
      select: { status: true, group: { select: { id: true, name: true, subject: { select: { code: true } } } } },
    }),
  ])
  const canJoin = features.includes("kelas.gabung")
  const now = exams.filter((e) => e.state === "running" || e.state === "available")
  const upcoming = exams.filter((e) => e.state === "upcoming")
  const scored = exams.filter((e) => e.best !== null)
  const mean = scored.length ? round2(scored.reduce((s, e) => s + (e.best as number), 0) / scored.length) : null

  return (
    <div className="flex flex-col gap-6">
      <Welcome
        name={user.name}
        subtitle={now.length ? fill(t["dashboard.participant.available"], { n: now.length }) : t["dashboard.participant.idle"]}
        action={
          now.length > 0 ? (
            <Link href={`/ujian/${now[0].id}`} className={buttonVariants({ className: "rounded-xl bg-white text-primary hover:bg-white/90" })}>
              <MonitorCheck aria-hidden /> {t["dashboard.participant.cta"]}
            </Link>
          ) : (
            canJoin && <JoinClassDialog className="rounded-xl bg-white text-primary hover:bg-white/90" />
          )
        }
      />
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Kelas Saya</h2>
          <div className="flex items-center gap-3">
            {canJoin && now.length > 0 && <JoinClassDialog className="h-8 rounded-lg" label="Gabung" />}
            <Link href="/kelas" className="text-sm font-medium text-primary hover:underline">
              Lihat semua
            </Link>
          </div>
        </div>
        {classes.length === 0 ? (
          <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">Belum mengikuti kelas. Minta kode kelas ke pengajar{canJoin ? ", lalu tekan “Gabung kelas”" : ""}.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {classes.map(({ status, group: g }) => (
              <Link key={g.id} href={`/kelas/${g.id}`} className="flex items-center gap-2 rounded-xl bg-card px-3 py-2 text-sm font-medium ring-1 ring-border/60 hover:ring-primary/40">
                {g.subject && <span className="font-mono text-xs text-muted-foreground">{g.subject.code}</span>}
                {g.name}
                {status === "PENDING" && <span className="text-xs font-normal text-muted-foreground">· menunggu</span>}
              </Link>
            ))}
          </div>
        )}
      </section>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Bisa dikerjakan" value={now.length} icon={<MonitorCheck />} tint="green" />
        <StatCard label="Akan datang" value={upcoming.length} icon={<CalendarClock />} tint="sky" />
        <StatCard label="Rata-rata nilai" value={mean ?? "—"} icon={<Trophy />} tint="violet" hint={`${scored.length} ujian bernilai`} />
      </div>
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Ujian untuk Anda</h2>
          <Link href="/ujian" className="text-sm font-medium text-primary hover:underline">
            Lihat semua
          </Link>
        </div>
        {now.length + upcoming.length === 0 ? (
          <EmptyState title="Tidak ada ujian aktif" description="Ujian yang dijadwalkan untuk Anda akan tampil di sini." />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {[...now, ...upcoming].slice(0, 6).map((e) => (
              <ParticipantExamCard key={e.id} exam={e} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
