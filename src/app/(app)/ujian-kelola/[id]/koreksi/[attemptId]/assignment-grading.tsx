import Link from "next/link"
import { ArrowLeft, FileText } from "lucide-react"
import { formatBytes, formatDateTime } from "@/lib/format"
import { round2 } from "@/lib/exam/grading"
import { PageHeader } from "@/components/shell/page-parts"
import { ActionForm, FormField } from "@/components/forms/action-form"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { gradeAssignment } from "../../../actions"

type Props = {
  examId: string
  examTitle: string
  maxPoints: number
  attempt: {
    id: string
    status: string
    score: number | null
    submittedAt: Date | null
    isLate: boolean
    submissionText: string | null
    feedback: string | null
    user: { name: string; username: string | null; email: string }
    gradedBy: { name: string } | null
    files: { id: string; fileName: string; size: number }[]
  }
}

/** Halaman penilaian Tugas: jawaban teks + berkas (unduh) + poin & komentar. */
export function AssignmentGrading({ examId, examTitle, maxPoints, attempt }: Props) {
  const points = attempt.status === "GRADED" && attempt.score !== null ? round2((attempt.score * maxPoints) / 100) : null
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link href={`/ujian-kelola/${examId}?tab=peserta`} className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2 w-fit" })}>
        <ArrowLeft aria-hidden /> {examTitle}
      </Link>
      <PageHeader
        title={attempt.user.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{attempt.user.username ?? attempt.user.email}</span>· diserahkan {formatDateTime(attempt.submittedAt)}
            {attempt.isLate && <Badge variant="destructive">Terlambat</Badge>}
            {points !== null ? <Badge>{`Nilai ${points} / ${maxPoints}`}</Badge> : <Badge variant="outline">Perlu dinilai</Badge>}
          </span>
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>Jawaban</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {attempt.submissionText ? <p className="rounded-xl bg-muted p-3 text-sm whitespace-pre-wrap">{attempt.submissionText}</p> : <p className="text-sm text-muted-foreground">(tanpa jawaban teks)</p>}
          {attempt.files.length > 0 ? (
            <ul className="flex flex-col divide-y rounded-xl border">
              {attempt.files.map((f) => (
                <li key={f.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <a href={`/berkas/${f.id}`} className="min-w-0 flex-1 truncate font-medium hover:text-primary hover:underline">
                    {f.fileName}
                  </a>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(f.size)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">(tanpa berkas)</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Penilaian</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={gradeAssignment.bind(null, attempt.id)} submitLabel={points !== null ? "Simpan nilai ulang" : "Simpan nilai"}>
            <FormField name="points" label={`Poin (0–${maxPoints})`} className="max-w-48">
              <Input id="points" name="points" type="number" inputMode="decimal" min={0} max={maxPoints} step="any" defaultValue={points ?? ""} required />
            </FormField>
            <FormField name="feedback" label="Komentar untuk mahasiswa (opsional)">
              <Textarea id="feedback" name="feedback" rows={4} maxLength={5000} defaultValue={attempt.feedback ?? ""} />
            </FormField>
            {attempt.gradedBy && <p className="text-xs text-muted-foreground">Terakhir dinilai oleh {attempt.gradedBy.name}.</p>}
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  )
}
