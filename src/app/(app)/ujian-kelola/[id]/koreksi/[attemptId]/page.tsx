import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Check, X } from "lucide-react"
import { db } from "@/lib/db"
import { requireRole } from "@/lib/auth/dal"
import { STAFF } from "@/lib/auth/roles"
import { managedSubjects } from "@/lib/data/access"
import { formatDateTime } from "@/lib/format"
import { QUESTION_TYPE_LABEL } from "@/lib/labels"
import { cn } from "@/lib/utils"
import { PageHeader } from "@/components/shell/page-parts"
import { ActionForm, FormField } from "@/components/forms/action-form"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { gradeAttempt } from "../../../actions"

export const metadata: Metadata = { title: "Koreksi" }

type Option = { id: string; text: string }
type AnswerKey = { optionId?: string; value?: boolean; accepted?: string[] } | null
const REASON: Record<string, string> = { LEAVE_LIMIT: "dikumpulkan otomatis — batas pelanggaran", PROCTOR: "diakhiri pengawas", TIMEOUT: "waktu habis" }

export default async function GradeAttemptPage({ params }: PageProps<"/ujian-kelola/[id]/koreksi/[attemptId]">) {
  const user = await requireRole(...STAFF)
  const { id, attemptId } = await params
  const attempt = await db.attempt.findFirst({
    where: { id: attemptId, examId: id, status: { not: "IN_PROGRESS" }, exam: { subject: managedSubjects(user) } },
    include: { user: { select: { name: true, username: true, email: true } }, gradedBy: { select: { name: true } }, exam: { select: { title: true } } },
  })
  if (!attempt) notFound()
  const questions = await db.examQuestion.findMany({ where: { examId: id }, orderBy: [{ order: "asc" }, { id: "asc" }] })
  const answers = (attempt.answers as Record<string, string> | null) ?? {}
  const scores = (attempt.questionScores as Record<string, number> | null) ?? {}
  const flagged = new Set(Array.isArray(attempt.flagged) ? (attempt.flagged as string[]) : [])

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <Link href={`/ujian-kelola/${id}?tab=peserta`} className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2 w-fit" })}>
        <ArrowLeft aria-hidden /> {attempt.exam.title}
      </Link>
      <PageHeader
        title={attempt.user.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{attempt.user.username ?? attempt.user.email}</span>· percobaan {attempt.attemptNo} · {formatDateTime(attempt.submittedAt)}
            {attempt.status === "GRADED" ? <Badge>Nilai {attempt.score}</Badge> : <Badge variant="outline">Perlu dinilai</Badge>}
            {attempt.leaveCount > 0 && <Badge variant="destructive">Keluar halaman {attempt.leaveCount}×</Badge>}
            {attempt.autoSubmitReason && <Badge variant="outline">{REASON[attempt.autoSubmitReason] ?? attempt.autoSubmitReason}</Badge>}
          </span>
        }
      />
      <ActionForm action={gradeAttempt.bind(null, attempt.id)} submitLabel={attempt.status === "GRADED" ? "Simpan nilai ulang" : "Simpan nilai"}>
        <ol className="flex flex-col gap-3">
          {questions.map((q, i) => {
            const answer = answers[q.id] ?? ""
            const key = q.answerKey as AnswerKey
            const options = (q.options as Option[] | null) ?? []
            const earned = scores[q.id]
            const correct = earned !== undefined && earned >= q.points
            return (
              <li key={q.id} className="flex flex-col gap-3 rounded-2xl bg-card p-4 ring-1 ring-border/60">
                <div className="flex items-start gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-sm font-bold text-secondary-foreground">{i + 1}</span>
                  <p className="flex-1 text-sm whitespace-pre-wrap">{q.prompt}</p>
                  <span className="shrink-0 text-right text-xs text-muted-foreground">
                    {QUESTION_TYPE_LABEL[q.type]}
                    {flagged.has(q.id) && <span className="block text-tint-orange-fg">ditandai ragu-ragu</span>}
                  </span>
                </div>
                {q.type === "ESSAY" ? (
                  <>
                    <p className="rounded-xl bg-muted p-3 text-sm whitespace-pre-wrap">{answer || <em className="text-muted-foreground">(kosong)</em>}</p>
                    <FormField name={`essay_${q.id}`} label={`Poin (maks. ${q.points})`} className="max-w-40">
                      <Input id={`essay_${q.id}`} name={`essay_${q.id}`} type="number" inputMode="decimal" min={0} max={q.points} step="any" defaultValue={earned ?? ""} required />
                    </FormField>
                  </>
                ) : (
                  <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl p-3 text-sm", correct ? "bg-tint-green" : "bg-tint-rose")}>
                    {correct ? <Check className="size-4 text-tint-green-fg" aria-label="Benar" /> : <X className="size-4 text-tint-rose-fg" aria-label="Salah" />}
                    <span>
                      Jawaban:{" "}
                      <strong>
                        {q.type === "MULTIPLE_CHOICE"
                          ? (options.find((o) => o.id === answer)?.text ?? "—")
                          : q.type === "TRUE_FALSE"
                            ? answer === "true"
                              ? "Benar"
                              : answer === "false"
                                ? "Salah"
                                : "—"
                            : answer || "—"}
                      </strong>
                    </span>
                    <span className="text-muted-foreground">
                      Kunci: {q.type === "MULTIPLE_CHOICE" ? options.find((o) => o.id === key?.optionId)?.text : q.type === "TRUE_FALSE" ? (key?.value ? "Benar" : "Salah") : key?.accepted?.join(" / ")}
                    </span>
                    <span className="ml-auto text-xs font-semibold tabular-nums">
                      {earned ?? 0}/{q.points}
                    </span>
                  </div>
                )}
              </li>
            )
          })}
        </ol>
        <FormField name="feedback" label="Umpan balik untuk peserta (opsional)">
          <Textarea id="feedback" name="feedback" defaultValue={attempt.feedback ?? ""} rows={3} maxLength={5000} />
        </FormField>
        {attempt.gradedBy && (
          <p className="text-xs text-muted-foreground">
            Terakhir dinilai oleh {attempt.gradedBy.name} · {formatDateTime(attempt.gradedAt)}
          </p>
        )}
      </ActionForm>
    </div>
  )
}
