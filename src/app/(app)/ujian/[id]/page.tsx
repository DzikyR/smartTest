import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, CalendarClock, Clock, Download, FileQuestion, KeyRound, Lock, MonitorCheck, RotateCcw, ScrollText, ShieldCheck } from "lucide-react"
import { db } from "@/lib/db"
import { requireRole } from "@/lib/auth/dal"
import { examWindow, getParticipantExam } from "@/lib/data/access"
import { formatDateTime } from "@/lib/format"
import { EXAM_KIND_LABEL } from "@/lib/labels"
import { attemptDeadline } from "@/lib/exam/attempt"
import { applyLayout, type ExamLayout } from "@/lib/exam/layout"
import { checkExamEnvironment, deviceState, OTHER_DEVICE } from "@/lib/exam/guard"
import { examRules } from "@/lib/exam/rules"
import type { QuizAnswers } from "@/lib/exam/grading"
import { ExamRulesList } from "@/components/exam/exam-rules"
import { ActionForm, FormField } from "@/components/forms/action-form"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { saveProgress, startExam, submitExam } from "../actions"
import { ExamRunner } from "./exam-runner"
import { SebHashField } from "./seb-hash-field"

export const metadata: Metadata = { title: "Ujian" }

const isLayout = (v: unknown): v is ExamLayout => !!v && typeof v === "object" && Array.isArray((v as ExamLayout).questions)

export default async function TakeExamPage({ params }: PageProps<"/ujian/[id]">) {
  const user = await requireRole("PESERTA")
  const { id } = await params
  const exam = await getParticipantExam(user, id)
  if (!exam) notFound()

  const attempts = await db.attempt.findMany({ where: { examId: id, userId: user.id }, orderBy: { attemptNo: "desc" } })
  const running = attempts.find((a) => a.status === "IN_PROGRESS") ?? null
  const finals = attempts.filter((a) => a.status !== "IN_PROGRESS")
  const window = examWindow(exam)
  const left = exam.maxAttempts - attempts.length
  const env = await checkExamEnvironment(exam)
  const device = running && exam.lockDevice ? await deviceState(running) : "match"
  const rules = examRules(exam)
  const kindLabel = EXAM_KIND_LABEL[exam.kind]
  const runnerActive = env.ok && !!running && device === "match"

  if (runnerActive && running) {
    // Soal tanpa kunci jawaban, diurutkan sesuai tata letak acak milik percobaan ini.
    const questions = applyLayout(
      await db.examQuestion.findMany({ where: { examId: id }, orderBy: [{ order: "asc" }, { id: "asc" }], select: { id: true, type: true, prompt: true, options: true, points: true } }),
      isLayout(running.layout) ? running.layout : null
    )
    const profile = await db.user.findUnique({ where: { id: user.id }, select: { name: true, username: true } })
    return (
      <ExamRunner
        attemptId={running.id}
        title={exam.title}
        kindLabel={kindLabel}
        participant={profile ?? { name: user.name, username: null }}
        questions={questions.map((q) => ({ ...q, options: q.options as { id: string; text: string }[] | null }))}
        perPage={exam.questionsPerPage}
        initialAnswers={(running.answers as QuizAnswers | null) ?? {}}
        initialFlagged={Array.isArray(running.flagged) ? (running.flagged as string[]) : []}
        initialLeaveCount={running.leaveCount}
        initialDeadline={attemptDeadline(exam, running)}
        saveAction={saveProgress.bind(null, running.id)}
        submitAction={submitExam.bind(null, running.id)}
        security={{ requireFullscreen: exam.requireFullscreen, blockCopyPaste: exam.blockCopyPaste, maxLeaves: exam.maxLeaves }}
        rules={rules}
      />
    )
  }

  const best = exam.showScore ? finals.filter((a) => a.score !== null).reduce<number | null>((m, a) => Math.max(m ?? 0, a.score as number), null) : null
  const blocked =
    !env.ok || window !== "open" || !exam.sessionActive || (left <= 0 && !running)
      ? !env.ok
        ? null
        : window === "upcoming"
          ? `Ujian dibuka ${exam.startAt ? formatDateTime(exam.startAt) : ""}.`
          : window === "closed"
            ? "Ujian sudah ditutup."
            : !exam.sessionActive
              ? "Sesi sedang ditutup oleh pengawas. Tunggu hingga sesi dibuka."
              : `Batas ${exam.maxAttempts}× kesempatan sudah tercapai.`
      : null

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <Link href="/ujian" className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2 w-fit" })}>
        <ArrowLeft aria-hidden /> Ujian Saya
      </Link>

      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-primary-deep p-6 text-primary-foreground">
        <div className="absolute -top-16 -right-10 size-56 rounded-full bg-white/10" aria-hidden />
        <div className="relative">
          <p className="text-sm text-primary-foreground/80">
            {exam.subject.code} · {exam.subject.name}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{exam.title}</h1>
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1">
              <MonitorCheck className="size-4" aria-hidden /> {kindLabel}
            </span>
            <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1">
              <Clock className="size-4" aria-hidden /> {exam.durationMinutes} menit
            </span>
            <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1">
              <FileQuestion className="size-4" aria-hidden /> {exam._count.questions} soal
            </span>
            {exam.endAt && (
              <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1">
                <CalendarClock className="size-4" aria-hidden /> Tutup {formatDateTime(exam.endAt)}
              </span>
            )}
            {best !== null && <span className="rounded-full bg-white px-3 py-1 font-semibold text-primary">Nilai terbaik {best}</span>}
          </div>
        </div>
      </section>

      {exam.instructions && (
        <Card>
          <CardHeader>
            <CardTitle>Petunjuk</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{exam.instructions}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScrollText className="size-4 text-primary" aria-hidden /> Tata tertib
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ExamRulesList rules={rules} className="text-muted-foreground" />
        </CardContent>
      </Card>

      {!env.ok ? (
        env.code === "SEB" ? (
          <SebRequired configUrl={process.env.SEB_CONFIG_URL || null} />
        ) : (
          <Notice>{env.message}</Notice>
        )
      ) : running && device === "mismatch" ? (
        <Notice>{OTHER_DEVICE}</Notice>
      ) : running ? (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">Ujian Anda masih berjalan dan siap dilanjutkan di perangkat ini. Waktu tetap berjalan.</p>
            <ActionForm action={startExam.bind(null, exam.id)} submitLabel="Lanjutkan di perangkat ini" footerClassName="justify-start">
              <SebHashField />
            </ActionForm>
          </CardContent>
        </Card>
      ) : blocked ? (
        <Notice>{blocked}</Notice>
      ) : (
        <Card className="ring-2 ring-primary/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MonitorCheck className="size-4 text-primary" aria-hidden /> Mulai {kindLabel}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Waktu {exam.durationMinutes} menit mulai dihitung saat tombol ditekan. Dengan menekan Mulai, Anda menyatakan telah membaca dan menyetujui tata tertib di atas.
              {exam.maxAttempts > 1 && ` Sisa kesempatan: ${left}×.`}
            </p>
            <ActionForm action={startExam.bind(null, exam.id)} submitLabel={finals.length ? "Mulai lagi" : "Mulai ujian"} footerClassName="justify-start">
              <SebHashField />
              {exam.token && (
                <FormField name="token" label="Token ujian" hint="Diumumkan oleh pengawas saat ujian dimulai." className="max-w-56">
                  <div className="relative">
                    <KeyRound className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <Input id="token" name="token" autoComplete="off" maxLength={12} className="pl-8 font-mono tracking-widest uppercase" required />
                  </div>
                </FormField>
              )}
            </ActionForm>
          </CardContent>
        </Card>
      )}

      {exam.requireSeb && finals.length > 0 && !running && (
        <Link href="/ujian/selesai" className={buttonVariants({ variant: "outline", className: "w-fit rounded-xl" })}>
          <ShieldCheck aria-hidden /> Selesai — keluar dari Safe Exam Browser
        </Link>
      )}

      {finals.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">Riwayat</h2>
          {finals.map((a) => (
            <article key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-card p-4 text-sm ring-1 ring-border/60">
              <span>
                Percobaan {a.attemptNo} <span className="text-muted-foreground">· {formatDateTime(a.submittedAt)}</span>
                {a.autoSubmitReason === "LEAVE_LIMIT" && (
                  <Badge variant="destructive" className="ml-2">
                    Otomatis: batas pelanggaran
                  </Badge>
                )}
              </span>
              {exam.showScore && a.score !== null ? (
                <span className="flex items-center gap-2">
                  <Badge className="text-sm tabular-nums">{a.score}</Badge>
                  {exam.passingScore !== null && <Badge variant={a.score >= exam.passingScore ? "secondary" : "destructive"}>{a.score >= exam.passingScore ? "Lulus" : "Belum lulus"}</Badge>}
                </span>
              ) : (
                <Badge variant="outline">{a.status === "SUBMITTED" && exam.showScore ? "Menunggu koreksi esai" : "Nilai belum diumumkan"}</Badge>
              )}
              {a.feedback && exam.showScore && <p className="w-full rounded-xl bg-secondary p-2.5 text-xs text-secondary-foreground">Umpan balik: {a.feedback}</p>}
            </article>
          ))}
          {left > 0 && window === "open" && finals.length > 0 && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <RotateCcw className="size-3.5" aria-hidden /> Anda masih memiliki {left} kesempatan.
            </p>
          )}
        </section>
      )}
    </div>
  )
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 rounded-2xl border border-dashed bg-card/60 p-4 text-sm text-muted-foreground">
      <Lock className="size-4 shrink-0" aria-hidden /> {children}
    </p>
  )
}

function SebRequired({ configUrl }: { configUrl: string | null }) {
  // seb:// / sebs:// membuka SEB langsung dengan berkas konfigurasi.
  const sebLink = configUrl?.replace(/^http(s?):\/\//i, (_m, s: string) => `seb${s}://`)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-primary" aria-hidden /> Wajib Safe Exam Browser
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <p className="text-muted-foreground">
          Ujian ini hanya dapat dikerjakan menggunakan <strong>Safe Exam Browser (SEB)</strong>, yang mengunci perangkat selama ujian. Soal tidak ditampilkan di browser biasa.
        </p>
        <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>
            Pasang SEB dari{" "}
            <a href="https://safeexambrowser.org/download_en.html" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              safeexambrowser.org
            </a>{" "}
            (Windows, macOS, iPad/iPhone). Ponsel Android tidak didukung — gunakan laptop/PC.
          </li>
          <li>Buka konfigurasi ujian {sebLink ? "dengan tombol di bawah" : "dari pengawas (berkas .seb)"}, lalu login dan buka ujian ini dari dalam SEB.</li>
        </ol>
        {sebLink && (
          <div className="flex flex-wrap gap-2">
            <a href={sebLink} className={buttonVariants({ className: "rounded-xl" })}>
              <ShieldCheck aria-hidden /> Buka di Safe Exam Browser
            </a>
            <a href={configUrl!} className={buttonVariants({ variant: "outline", className: "rounded-xl" })} download>
              <Download aria-hidden /> Unduh konfigurasi (.seb)
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
