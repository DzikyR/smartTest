import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowLeft,
  BarChart3,
  Check,
  Clock,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileQuestion,
  FileUp,
  KeyRound,
  Layers,
  Library,
  Pencil,
  Play,
  ScrollText,
  ShieldCheck,
  Smartphone,
  Square,
  TimerOff,
  TimerReset,
  Trash2,
  Trophy,
  Users,
} from "lucide-react"
import { db } from "@/lib/db"
import { requireRole } from "@/lib/auth/dal"
import { enabledFeatures } from "@/lib/features/access"
import type { FeatureKey } from "@/lib/features/registry"
import { STAFF } from "@/lib/auth/roles"
import { getManagedExam } from "@/lib/data/access"
import { DISTRIBUTION_BUCKETS, loadExamReport } from "@/lib/data/exam-report"
import { formatDateTime, formatTime } from "@/lib/format"
import { EXAM_KIND_LABEL, QUESTION_TYPE_LABEL, SUBJECT_TYPE_LABEL } from "@/lib/labels"
import { EXAM_STATUS, examStatus } from "@/lib/exam/status"
import { examRules } from "@/lib/exam/rules"
import { effectiveSebKeys } from "@/lib/exam/guard"
import { parseIpList } from "@/lib/exam/security"
import { cn } from "@/lib/utils"
import { BarChart } from "@/components/charts/bar-chart"
import { ExamRulesList } from "@/components/exam/exam-rules"
import { EmptyState, StatCard, str, UrlTabs } from "@/components/shell/page-parts"
import { ActionButton } from "@/components/forms/action-button"
import { ConfirmAction } from "@/components/forms/confirm-action"
import { FormDialog } from "@/components/forms/form-dialog"
import { FormField } from "@/components/forms/action-form"
import { QuestionFields } from "@/components/question/question-fields"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  addFromBank,
  deleteExam,
  duplicateExam,
  extendTime,
  finishAttempts,
  resetDevice,
  setExamPublished,
  setSessionActive,
  setShowScore,
  updateExamQuestion,
  updateRules,
} from "../actions"
import { BankPickerFields, RemoveQuestionsButton } from "./client"

export const metadata: Metadata = { title: "Detail Ujian" }

type Option = { id: string; text: string }
type AnswerKey = { optionId?: string; value?: boolean; accepted?: string[] } | null
const TABS = [
  { key: "ringkasan", label: "Ringkasan" },
  { key: "soal", label: "Soal" },
  { key: "peserta", label: "Peserta & Pengawasan" },
  { key: "hasil", label: "Hasil" },
] as const

export default async function ExamDetailPage({ params, searchParams }: PageProps<"/ujian-kelola/[id]">) {
  const user = await requireRole(...STAFF)
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const exam = await getManagedExam(user, id)
  if (!exam) notFound()
  const tab = TABS.find((t) => t.key === str(sp.tab))?.key ?? "ringkasan"
  const status = examStatus(exam)
  const [questions, report] = await Promise.all([db.examQuestion.findMany({ where: { examId: id }, orderBy: [{ order: "asc" }, { id: "asc" }] }), loadExamReport(exam)])
  const features = await enabledFeatures(user.role)
  const locked = report.finished > 0
  const totalPoints = questions.reduce((s, q) => s + q.points, 0)
  const base = `/ujian-kelola/${id}`

  return (
    <div className="flex flex-col gap-6">
      <Link href="/ujian-kelola" className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2 w-fit" })}>
        <ArrowLeft aria-hidden /> Kelola Ujian
      </Link>

      {/* ----- Kepala ujian ----- */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-primary-deep p-6 text-primary-foreground">
        <div className="absolute -top-16 -right-10 size-56 rounded-full bg-white/10" aria-hidden />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full bg-white/20 px-2.5 py-0.5 font-semibold">{EXAM_KIND_LABEL[exam.kind]}</span>
              <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", EXAM_STATUS[status].className)}>{EXAM_STATUS[status].label}</span>
              <span className="text-primary-foreground/80">
                {exam.subject.code} · {exam.subject.name} ({SUBJECT_TYPE_LABEL[exam.subject.type]})
              </span>
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{exam.title}</h1>
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-primary-foreground/85">
              <span className="flex items-center gap-1.5">
                <Clock className="size-4" aria-hidden /> {exam.durationMinutes} menit
              </span>
              <span className="flex items-center gap-1.5">
                <FileQuestion className="size-4" aria-hidden /> {questions.length} soal · {totalPoints} poin
              </span>
              <span className="flex items-center gap-1.5">
                <Users className="size-4" aria-hidden /> {exam.openToAll ? "Semua peserta" : exam.groups.map((g) => g.group.name).join(", ") || "Belum ada peserta"}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ActionButton action={setExamPublished.bind(null, exam.id, !exam.publishedAt)} className="rounded-xl bg-white text-primary hover:bg-white/90">
              {exam.publishedAt ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
              {exam.publishedAt ? "Tarik ke draf" : "Terbitkan"}
            </ActionButton>
            <Link href={`${base}/ubah`} className={buttonVariants({ variant: "secondary", className: "rounded-xl bg-white/15 text-primary-foreground hover:bg-white/25" })}>
              <Pencil aria-hidden /> Ubah
            </Link>
            <ActionButton action={duplicateExam.bind(null, exam.id)} variant="secondary" className="rounded-xl bg-white/15 text-primary-foreground hover:bg-white/25" title="Duplikat">
              <Copy aria-hidden />
            </ActionButton>
            {exam._count.attempts === 0 && (
              <ConfirmAction
                action={deleteExam.bind(null, exam.id)}
                title="Hapus ujian?"
                description={`"${exam.title}" beserta ${questions.length} soalnya akan dihapus permanen (bank soal tidak terpengaruh).`}
                confirmLabel="Hapus"
                destructive
                trigger={
                  <Button variant="secondary" className="rounded-xl bg-white/15 text-primary-foreground hover:bg-white/25" aria-label="Hapus ujian">
                    <Trash2 aria-hidden />
                  </Button>
                }
              />
            )}
          </div>
        </div>
      </section>

      <UrlTabs
        label="Bagian ujian"
        active={tab}
        tabs={TABS.map((t) => ({
          key: t.key,
          href: `${base}?tab=${t.key}`,
          label: t.key === "soal" ? `Soal (${questions.length})` : t.key === "hasil" && report.needsGrading ? `Hasil · ${report.needsGrading} perlu dinilai` : t.label,
        }))}
      />

      {tab === "ringkasan" && <SummaryTab exam={exam} questions={questions.length} report={report} />}
      {tab === "soal" && <QuestionsTab exam={exam} questions={questions} locked={locked} totalPoints={totalPoints} features={features} />}
      {tab === "peserta" && <ParticipantsTab exam={exam} report={report} />}
      {tab === "hasil" && <ResultsTab exam={exam} report={report} canExport={features.includes("ujian-kelola.ekspor")} />}
    </div>
  )
}

type Exam = NonNullable<Awaited<ReturnType<typeof getManagedExam>>>
type Report = Awaited<ReturnType<typeof loadExamReport>>

// ---------------------------------------------------------------------------
// Ringkasan: kendali sesi, pengamanan, tata tertib
// ---------------------------------------------------------------------------

function SummaryTab({ exam, questions, report }: { exam: Exam; questions: number; report: Report }) {
  const sebKeys = exam.requireSeb ? effectiveSebKeys(exam) : []
  const appOrigin = (() => {
    try {
      return new URL(process.env.AUTH_URL ?? "").origin
    } catch {
      return ""
    }
  })()
  const security = [
    exam.requireSeb && "Safe Exam Browser",
    exam.requireFullscreen && "Layar penuh",
    exam.blockCopyPaste && "Blokir salin/tempel",
    exam.lockDevice && "1 perangkat",
    exam.maxLeaves && `Maks. ${exam.maxLeaves}× keluar`,
    exam.allowedIps && `Jaringan: ${parseIpList(exam.allowedIps).rules.length} aturan`,
  ].filter(Boolean) as string[]

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Belum mulai" value={report.notStarted} icon={<Users />} tint="sky" />
        <StatCard label="Sedang mengerjakan" value={report.inProgress} icon={<Clock />} tint="orange" hint={report.expired ? `${report.expired} waktunya habis` : undefined} />
        <StatCard label="Selesai" value={report.finished} icon={<Check />} tint="green" />
        <StatCard label="Rata-rata nilai" value={report.stats?.mean ?? "—"} icon={<Trophy />} tint="violet" hint={report.needsGrading ? `${report.needsGrading} esai perlu dinilai` : undefined} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Kendali sesi</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5">
              <dt className="text-muted-foreground">Sesi</dt>
              <dd className="flex items-center gap-2 font-medium">
                <span className={cn("size-2.5 rounded-full", exam.sessionActive ? "bg-emerald-500" : "bg-amber-500")} aria-hidden />
                {exam.sessionActive ? "Aktif" : "Dihentikan"}
              </dd>
              <dt className="text-muted-foreground">Jadwal</dt>
              <dd>
                {exam.startAt ? formatDateTime(exam.startAt) : "Dibuka langsung"} — {exam.endAt ? formatDateTime(exam.endAt) : "tanpa batas tutup"}
              </dd>
              <dt className="text-muted-foreground">Durasi</dt>
              <dd>{exam.durationMinutes} menit per peserta</dd>
              <dt className="text-muted-foreground">Token</dt>
              <dd className="flex items-center gap-1.5">
                <KeyRound className="size-4 text-muted-foreground" aria-hidden />
                {exam.token ? <code className="rounded bg-muted px-2 font-mono font-bold tracking-widest">{exam.token}</code> : "tidak dipakai"}
              </dd>
              <dt className="text-muted-foreground">Tampilan</dt>
              <dd>
                {exam.questionsPerPage === 1 ? "1 soal per layar" : `${exam.questionsPerPage} soal per halaman`} · acak {[exam.shuffleQuestions && "soal", exam.shuffleOptions && "pilihan"].filter(Boolean).join(" & ") || "tidak"}
              </dd>
              <dt className="text-muted-foreground">Nilai</dt>
              <dd>
                {exam.showScore ? "Ditampilkan ke peserta" : "Disembunyikan"}
                {exam.passingScore !== null && ` · lulus ≥ ${exam.passingScore}`}
              </dd>
              <dt className="text-muted-foreground">Pengamanan</dt>
              <dd>{security.length ? security.join(" · ") : "Tidak ada"}</dd>
            </dl>
            <div className="flex flex-wrap gap-2">
              <ActionButton action={setSessionActive.bind(null, exam.id, !exam.sessionActive)} variant="outline" className="rounded-xl">
                {exam.sessionActive ? <Square aria-hidden /> : <Play aria-hidden />} {exam.sessionActive ? "Hentikan sesi" : "Buka sesi"}
              </ActionButton>
              <ActionButton action={setShowScore.bind(null, exam.id, !exam.showScore)} variant="outline" className="rounded-xl">
                {exam.showScore ? <EyeOff aria-hidden /> : <Eye aria-hidden />} {exam.showScore ? "Sembunyikan nilai" : "Tampilkan nilai"}
              </ActionButton>
            </div>
            {!exam.publishedAt && (
              <p className="rounded-xl bg-tint-orange p-3 text-tint-orange-fg">
                Ujian masih <strong>draf</strong> — peserta belum dapat melihatnya. {questions === 0 ? "Tambahkan soal lalu terbitkan." : "Terbitkan bila sudah siap."}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <ScrollText className="size-4 text-primary" aria-hidden /> Tata tertib
            </CardTitle>
            <FormDialog
              title="Tata Tertib Tambahan"
              description="Aturan otomatis mengikuti pengaturan ujian. Tambahkan ketentuan lain — dapat diubah kapan saja."
              action={updateRules.bind(null, exam.id)}
              trigger={
                <Button variant="outline" size="sm" className="rounded-lg">
                  <Pencil aria-hidden /> Tambah / ubah
                </Button>
              }
            >
              <FormField name="rules" label="Satu aturan per baris (maks. 20)">
                <Textarea id="rules" name="rules" defaultValue={exam.rules ?? ""} rows={6} maxLength={5000} />
              </FormField>
            </FormDialog>
          </CardHeader>
          <CardContent>
            <ExamRulesList rules={examRules({ ...exam, _count: { questions } })} className="text-muted-foreground" />
          </CardContent>
        </Card>
      </div>

      {exam.requireSeb && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary" aria-hidden /> Safe Exam Browser
              {sebKeys.length === 0 && <Badge variant="destructive">Config Key belum diatur — verifikasi lemah</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
              <li>
                Buat berkas konfigurasi di <strong>SEB Config Tool</strong>: Start URL <code className="rounded bg-muted px-1">{appOrigin}/login</code>, izinkan domain SmartTest di URL Filter, aktifkan
                &ldquo;Send Config Key&rdquo;, Quit URL <code className="rounded bg-muted px-1">{appOrigin}/ujian/selesai</code>.
              </li>
              <li>
                Salin <strong>Config Key</strong> ke <code>SEB_CONFIG_KEYS</code> di <code>.env</code> server (berlaku untuk semua ujian) atau ke pengaturan ujian ini.
              </li>
              <li>
                Unggah berkas .seb dan isi <code>SEB_CONFIG_URL</code> agar peserta mendapat tombol &ldquo;Buka di Safe Exam Browser&rdquo;.
              </li>
            </ol>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Soal
// ---------------------------------------------------------------------------

async function QuestionsTab({
  exam,
  questions,
  locked,
  totalPoints,
  features,
}: {
  exam: Exam
  questions: Awaited<ReturnType<typeof db.examQuestion.findMany>>
  locked: boolean
  totalPoints: number
  features: FeatureKey[]
}) {
  const bank = await db.question.findMany({
    where: { subjectId: exam.subjectId },
    orderBy: [{ topic: "asc" }, { createdAt: "asc" }],
    select: { id: true, type: true, prompt: true, points: true, topic: true, difficulty: true },
  })
  const used = new Set(questions.map((q) => q.sourceId).filter(Boolean))
  const topics = [...new Set(bank.map((b) => b.topic).filter((t): t is string => !!t))]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {questions.length} soal · total {totalPoints} poin{locked && " · dikunci karena sudah ada peserta yang mengumpulkan"}
        </p>
        {!locked && (
          <div className="flex flex-wrap gap-2">
            <FormDialog
              title="Ambil dari Bank Soal"
              description={`${bank.length} soal tersedia di bank ${exam.subject.code}.`}
              action={addFromBank.bind(null, exam.id)}
              submitLabel="Tambahkan"
              wide
              trigger={
                <Button className="rounded-xl" disabled={bank.length === 0} title={bank.length === 0 ? "Bank soal mata uji ini masih kosong" : undefined}>
                  <Library aria-hidden /> Dari bank soal
                </Button>
              }
            >
              <BankPickerFields items={bank.map((b) => ({ ...b, used: used.has(b.id) }))} topics={topics} />
            </FormDialog>
            {features.includes("bank-soal.massal") && (
              <Link href={`/bank-soal/massal?exam=${exam.id}`} className={buttonVariants({ variant: "outline", className: "rounded-xl" })}>
                <Layers aria-hidden /> Buat massal
              </Link>
            )}
            {features.includes("bank-soal.impor") && (
              <Link href={`/bank-soal/impor?subject=${exam.subjectId}`} className={buttonVariants({ variant: "outline", className: "rounded-xl" })}>
                <FileUp aria-hidden /> Impor Word/Excel
              </Link>
            )}
          </div>
        )}
      </div>

      {questions.length === 0 ? (
        <EmptyState title="Belum ada soal" description="Ambil dari bank soal, buat banyak soal sekaligus, atau impor dari Word/Excel (pilih ujian ini sebagai tujuan)." />
      ) : (
        <>
          {!locked && (
            <div className="flex justify-end">
              <RemoveQuestionsButton examId={exam.id} formId="exam-questions" />
            </div>
          )}
          <form id="exam-questions" className="flex flex-col gap-3">
            {questions.map((q, i) => {
              const options = (q.options as Option[] | null) ?? []
              const key = q.answerKey as AnswerKey
              return (
                <article key={q.id} className="flex gap-3 rounded-2xl bg-card p-4 ring-1 ring-border/60">
                  {!locked && <input type="checkbox" name="qid" value={q.id} className="mt-1.5 size-4 shrink-0 accent-primary" aria-label={`Pilih soal ${i + 1}`} />}
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-sm font-bold text-secondary-foreground tabular-nums">{i + 1}</span>
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <p className="text-sm whitespace-pre-wrap">{q.prompt}</p>
                    {q.type === "MULTIPLE_CHOICE" && (
                      <ul className="grid gap-1 text-sm sm:grid-cols-2">
                        {options.map((o, j) => (
                          <li key={o.id} className={cn("flex gap-2 rounded-lg px-2 py-1", o.id === key?.optionId ? "bg-tint-green font-medium text-tint-green-fg" : "bg-muted/60")}>
                            <span className="font-semibold">{String.fromCharCode(65 + j)}.</span> <span className="min-w-0 flex-1">{o.text}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {q.type === "TRUE_FALSE" && <p className="text-sm text-tint-green-fg">Kunci: {key?.value ? "Benar" : "Salah"}</p>}
                    {q.type === "SHORT_ANSWER" && <p className="text-sm text-tint-green-fg">Diterima: {key?.accepted?.join(" / ")}</p>}
                    <p className="text-xs text-muted-foreground">
                      {QUESTION_TYPE_LABEL[q.type]} · {q.points} poin
                    </p>
                  </div>
                  {!locked && (
                    <FormDialog
                      title={`Ubah Soal ${i + 1}`}
                      description="Hanya mengubah soal di ujian ini; bank soal tidak berubah."
                      action={updateExamQuestion.bind(null, q.id)}
                      wide
                      trigger={
                        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Ubah soal ${i + 1}`} title="Ubah">
                          <Pencil />
                        </Button>
                      }
                    >
                      <QuestionFields defaults={{ ...q, options, answerKey: key }} />
                    </FormDialog>
                  )}
                </article>
              )
            })}
          </form>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Peserta & pengawasan langsung
// ---------------------------------------------------------------------------

function ParticipantsTab({ exam, report }: { exam: Exam; report: Report }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {report.rows.length} peserta · {report.inProgress} mengerjakan · {report.finished} selesai · {report.notStarted} belum mulai. Muat ulang halaman untuk data terbaru.
        </p>
        <div className="flex flex-wrap gap-2">
          {report.expired > 0 && (
            <ActionButton action={finishAttempts.bind(null, exam.id, "expired")} variant="outline" className="rounded-xl">
              <TimerOff aria-hidden /> Kumpulkan yang waktunya habis ({report.expired})
            </ActionButton>
          )}
          {report.inProgress + report.expired > 0 && (
            <ConfirmAction
              action={finishAttempts.bind(null, exam.id, "all")}
              title="Akhiri semua percobaan berjalan?"
              description="Peserta yang sedang mengerjakan dikumpulkan paksa dengan jawaban terakhir yang tersimpan otomatis."
              confirmLabel="Akhiri sekarang"
              destructive
              trigger={
                <Button variant="outline" className="rounded-xl">
                  <TimerOff className="text-destructive" aria-hidden /> Akhiri semua
                </Button>
              }
            />
          )}
        </div>
      </div>
      {report.rows.length === 0 ? (
        <EmptyState title="Belum ada peserta" description="Pilih kelompok peserta atau buka untuk semua peserta melalui menu Ubah." />
      ) : (
        <Card className="py-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-3xl text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">Peserta</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium">Progres</th>
                  <th className="px-3 py-3 font-medium">Pelanggaran</th>
                  <th className="px-3 py-3 font-medium">Nilai</th>
                  <th className="px-5 py-3 text-right font-medium">Aksi pengawas</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {report.rows.map(({ user, running, latest, best, leaveCount }) => (
                  <tr key={user.id}>
                    <td className="px-5 py-3">
                      <span className="block font-medium">{user.name}</span>
                      <span className="block font-mono text-xs text-muted-foreground">{user.username ?? user.email}</span>
                    </td>
                    <td className="px-3 py-3">
                      {running ? (
                        <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", running.expired ? "bg-muted text-muted-foreground" : "bg-tint-orange text-tint-orange-fg")}>
                          {running.expired ? "Waktu habis" : `Mengerjakan · s.d. ${formatTime(new Date(running.deadline))}`}
                        </span>
                      ) : latest ? (
                        <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", latest.status === "SUBMITTED" ? "bg-tint-sky text-tint-sky-fg" : "bg-tint-green text-tint-green-fg")}>
                          {latest.status === "SUBMITTED" ? "Perlu dinilai" : "Selesai"}
                          {latest.autoSubmitReason === "LEAVE_LIMIT" && " · otomatis (pelanggaran)"}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Belum mulai</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">
                      {running ? (
                        <>
                          {running.answered} terjawab
                          {running.lastSavedAt && ` · simpan ${formatTime(running.lastSavedAt)}`}
                          {running.extraMinutes > 0 && ` · +${running.extraMinutes} mnt`}
                        </>
                      ) : latest ? (
                        formatDateTime(latest.submittedAt)
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-3">{leaveCount > 0 ? <span className="rounded-full bg-tint-rose px-2 py-0.5 text-xs font-semibold text-tint-rose-fg">{leaveCount}×</span> : <span className="text-xs text-muted-foreground">—</span>}</td>
                    <td className="px-3 py-3 font-semibold tabular-nums">{best ?? "—"}</td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1">
                        {running && (
                          <>
                            <FormDialog
                              title={`Tambah waktu ${user.name}`}
                              action={extendTime.bind(null, running.id)}
                              submitLabel="Tambah"
                              trigger={
                                <Button variant="ghost" size="icon-sm" aria-label={`Tambah waktu ${user.name}`} title="Tambah waktu">
                                  <TimerReset />
                                </Button>
                              }
                            >
                              <FormField name="minutes" label="Tambahan waktu (menit)" hint="Berlaku hanya untuk peserta ini (mis. gangguan listrik/koneksi).">
                                <Input id="minutes" name="minutes" type="number" min={1} max={240} defaultValue={10} />
                              </FormField>
                            </FormDialog>
                            {exam.lockDevice && running.deviceTokenHash && (
                              <ConfirmAction
                                action={resetDevice.bind(null, running.id)}
                                title={`Reset perangkat ${user.name}?`}
                                description="Peserta dapat melanjutkan dari perangkat lain (mis. laptop mati)."
                                confirmLabel="Reset"
                                trigger={
                                  <Button variant="ghost" size="icon-sm" aria-label={`Reset perangkat ${user.name}`} title="Reset perangkat">
                                    <Smartphone />
                                  </Button>
                                }
                              />
                            )}
                            <ConfirmAction
                              action={finishAttempts.bind(null, exam.id, { attemptId: running.id })}
                              title={`Akhiri ujian ${user.name}?`}
                              description="Dikumpulkan paksa dengan jawaban yang tersimpan."
                              confirmLabel="Akhiri"
                              destructive
                              trigger={
                                <Button variant="ghost" size="icon-sm" aria-label={`Akhiri ujian ${user.name}`} title="Akhiri">
                                  <TimerOff className="text-destructive" />
                                </Button>
                              }
                            />
                          </>
                        )}
                        {latest && (
                          <Link href={`/ujian-kelola/${exam.id}/koreksi/${latest.id}`} className={buttonVariants({ variant: latest.status === "SUBMITTED" ? "default" : "ghost", size: "sm", className: "rounded-lg" })}>
                            {latest.status === "SUBMITTED" ? "Nilai" : "Lihat"}
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Hasil & analisis
// ---------------------------------------------------------------------------

function ResultsTab({ exam, report, canExport }: { exam: Exam; report: Report; canExport: boolean }) {
  if (!report.stats) return <EmptyState title="Belum ada hasil" description="Statistik, sebaran nilai, dan analisis butir soal tampil setelah peserta mengumpulkan." />
  const s = report.stats
  return (
    <div className="flex flex-col gap-6">
      {canExport && (
        <div className="flex justify-end">
          <a href={`/ujian-kelola/${exam.id}/ekspor`} className={buttonVariants({ variant: "outline", className: "rounded-xl" })} download>
            <Download aria-hidden /> Ekspor nilai (Excel)
          </a>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Peserta dinilai" value={s.count} icon={<Users />} tint="sky" />
        <StatCard label="Rata-rata" value={s.mean} icon={<BarChart3 />} tint="violet" />
        <StatCard label="Tertinggi / terendah" value={`${s.max} / ${s.min}`} icon={<Trophy />} tint="orange" />
        <StatCard
          label="Lulus"
          value={s.passed !== null ? `${s.passed} (${Math.round((s.passed / s.count) * 100)}%)` : "—"}
          hint={exam.passingScore !== null ? `nilai ≥ ${exam.passingScore}` : "Nilai lulus belum diatur"}
          icon={<Check />}
          tint="green"
        />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Sebaran nilai</CardTitle>
            <p className="text-xs text-muted-foreground">Jumlah peserta per rentang nilai terbaik</p>
          </CardHeader>
          <CardContent>
            <BarChart
              title="Sebaran nilai peserta"
              valueLabel="Peserta"
              data={report.distribution.map((d, i) => ({ label: DISTRIBUTION_BUCKETS[i], value: d.count }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Analisis butir soal</CardTitle>
            <p className="text-xs text-muted-foreground">% jawaban dengan poin penuh. &lt;30% = sulit (periksa kunci), &gt;90% = sangat mudah.</p>
          </CardHeader>
          <CardContent>
            <ol className="flex max-h-80 flex-col divide-y overflow-auto text-sm">
              {report.items.map((q, i) => (
                <li key={q.id} className="flex items-center gap-3 py-2">
                  <span className="w-6 text-right text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate" title={q.prompt}>
                    {q.prompt}
                  </span>
                  <span className="h-1.5 w-20 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <span className="block h-full rounded-full bg-chart-1" style={{ width: `${q.correctRate ?? 0}%` }} />
                  </span>
                  <span
                    className={cn(
                      "w-12 text-right text-xs font-semibold tabular-nums",
                      q.correctRate !== null && q.correctRate < 30 && "text-destructive",
                      q.correctRate !== null && q.correctRate > 90 && "text-emerald-600"
                    )}
                  >
                    {q.correctRate !== null ? `${q.correctRate}%` : "—"}
                  </span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
