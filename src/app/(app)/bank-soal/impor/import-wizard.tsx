"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, ClipboardPaste, Download, FileSpreadsheet, FileText, Loader2, RotateCcw, Save } from "lucide-react"
import { toast } from "sonner"
import type { ImportResult } from "@/lib/exam/import"
import { DIFFICULTY_LABEL, QUESTION_TYPE_SHORT } from "@/lib/labels"
import { cn } from "@/lib/utils"
import { ActionForm, FormField } from "@/components/forms/action-form"
import { NativeSelect } from "@/components/forms/native-select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { previewImport, saveImported } from "../actions"

type Source = "excel" | "word" | "text"
const SOURCES: { key: Source; label: string; icon: typeof FileText; accept?: string }[] = [
  { key: "excel", label: "Excel (.xlsx)", icon: FileSpreadsheet, accept: ".xlsx" },
  { key: "word", label: "Word (.docx)", icon: FileText, accept: ".docx" },
  { key: "text", label: "Tempel teks", icon: ClipboardPaste },
]

const TEXT_EXAMPLE = `1. Ibukota Indonesia adalah ...
A. Bandung
*B. Jakarta
C. Surabaya
Poin: 2

2. Python membedakan huruf besar dan kecil.
Kunci: Benar

3. Jelaskan perbedaan while dan for!
Poin: 10`

export function ImportWizard({
  subjects,
  exams,
  initialSubject,
}: {
  subjects: { id: string; label: string }[]
  exams: { id: string; title: string; subjectId: string }[]
  initialSubject: string
}) {
  const router = useRouter()
  const [source, setSource] = useState<Source>("excel")
  const [preview, setPreview] = useState<ImportResult | null>(null)
  const [subjectId, setSubjectId] = useState(initialSubject)
  const [examId, setExamId] = useState("")
  const [pending, start] = useTransition()

  const save = () =>
    start(async () => {
      if (!preview) return
      const r = await saveImported(subjectId, examId || null, preview.questions)
      if (!r.ok) return void toast.error(r.error)
      toast.success(r.message)
      router.push(examId ? `/ujian-kelola/${examId}?tab=soal` : `/bank-soal?subject=${subjectId}`)
    })

  if (preview) {
    return (
      <div className="flex flex-col gap-5">
        <section className="grid gap-4 rounded-2xl bg-card p-5 ring-1 ring-border/60 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="i-subject">Simpan ke mata uji</Label>
            <NativeSelect id="i-subject" value={subjectId} onChange={(e) => (setSubjectId(e.target.value), setExamId(""))}>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="i-exam">Tambahkan juga ke ujian (opsional)</Label>
            <NativeSelect id="i-exam" value={examId} onChange={(e) => setExamId(e.target.value)}>
              <option value="">— hanya ke bank soal —</option>
              {exams
                .filter((e) => e.subjectId === subjectId)
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title}
                  </option>
                ))}
            </NativeSelect>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setPreview(null)} disabled={pending}>
              <RotateCcw aria-hidden /> Ulangi
            </Button>
            <Button onClick={save} disabled={pending || preview.questions.length === 0 || preview.errors.length > 0}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />} Simpan {preview.questions.length} soal
            </Button>
          </div>
        </section>

        {preview.errors.length > 0 && (
          <div className="rounded-2xl bg-destructive/5 p-4 ring-1 ring-destructive/30">
            <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
              <AlertTriangle className="size-4" aria-hidden /> {preview.errors.length} soal bermasalah — perbaiki berkas lalu unggah ulang agar tidak ada soal yang terlewat.
            </p>
            <ul className="mt-2 max-h-48 list-disc overflow-auto pl-6 text-xs text-destructive">
              {preview.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="overflow-hidden rounded-2xl bg-card ring-1 ring-border/60">
          <div className="border-b px-5 py-3 text-sm font-semibold">Pratinjau · {preview.questions.length} soal terbaca</div>
          <ol className="max-h-[60svh] divide-y overflow-auto">
            {preview.questions.map((q, i) => (
              <li key={i} className="flex gap-3 px-5 py-3 text-sm">
                <span className="w-6 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                <span className="w-12 shrink-0 rounded-full bg-tint-violet px-2 py-0.5 text-center text-xs font-semibold text-tint-violet-fg">{QUESTION_TYPE_SHORT[q.type]}</span>
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-wrap">{q.prompt}</p>
                  {q.options && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {q.options.map((o, j) => (
                        <span key={o.id} className={cn("mr-3", o.id === q.answerKey?.optionId && "font-semibold text-emerald-600")}>
                          {String.fromCharCode(65 + j)}. {o.text}
                        </span>
                      ))}
                    </p>
                  )}
                  {q.type === "TRUE_FALSE" && <p className="mt-1 text-xs text-emerald-600">Kunci: {q.answerKey?.value ? "Benar" : "Salah"}</p>}
                  {q.type === "SHORT_ANSWER" && <p className="mt-1 text-xs text-emerald-600">Diterima: {q.answerKey?.accepted?.join(" / ")}</p>}
                </div>
                <span className="shrink-0 text-right text-xs text-muted-foreground">
                  {q.points} poin
                  <br />
                  {DIFFICULTY_LABEL[q.difficulty]}
                  {q.topic && (
                    <>
                      <br />
                      {q.topic}
                    </>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    )
  }

  const active = SOURCES.find((s) => s.key === source)!
  return (
    <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
      <section className="flex flex-col gap-4 rounded-2xl bg-card p-5 ring-1 ring-border/60">
        <div className="flex flex-wrap gap-2" role="tablist">
          {SOURCES.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={source === key}
              onClick={() => setSource(key)}
              className={cn(
                "flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors",
                source === key ? "border-primary bg-primary text-primary-foreground shadow-md shadow-primary/25" : "hover:bg-muted"
              )}
            >
              <Icon className="size-4" aria-hidden /> {label}
            </button>
          ))}
        </div>
        <ActionForm key={source} action={previewImport} submitLabel="Baca & pratinjau" onSuccess={(r) => setPreview((r.data as ImportResult) ?? null)}>
          <input type="hidden" name="source" value={source} />
          {source === "text" ? (
            <FormField name="text" label="Tempel soal" hint="Pisahkan soal dengan nomor (1., 2.) atau baris kosong. Tandai jawaban benar dengan * atau baris Kunci:.">
              <Textarea id="text" name="text" rows={14} className="font-mono text-xs" placeholder={TEXT_EXAMPLE} spellCheck={false} />
            </FormField>
          ) : (
            <FormField name="file" label={`Berkas ${active.label}`} hint="Maksimal 5 MB, 200 soal per unggahan.">
              <Input id="file" name="file" type="file" accept={active.accept} className="h-auto py-3" required />
            </FormField>
          )}
        </ActionForm>
      </section>

      <aside className="flex flex-col gap-4">
        <div className="rounded-2xl bg-gradient-to-br from-primary to-[oklch(0.45_0.2_290)] p-5 text-primary-foreground">
          <p className="font-semibold">Unduh templat</p>
          <p className="mt-1 text-sm text-primary-foreground/80">Isi templat lalu unggah kembali. Contoh soal & petunjuk sudah disertakan.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {/* Unduhan berkas dari route handler — bukan navigasi halaman. */}
            <a href="/bank-soal/templat/excel" download className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-primary hover:bg-white/90">
              <Download className="size-4" aria-hidden /> Templat Excel
            </a>
            <a href="/bank-soal/templat/word" download className="inline-flex items-center gap-2 rounded-lg bg-white/15 px-3 py-2 text-sm font-semibold hover:bg-white/25">
              <Download className="size-4" aria-hidden /> Templat Word
            </a>
          </div>
        </div>
        <div className="rounded-2xl bg-card p-5 text-sm ring-1 ring-border/60">
          <p className="mb-2 font-semibold">Format singkat</p>
          {source === "excel" ? (
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>Satu baris = satu soal. Kolom: Jenis, Pertanyaan, A–F, Kunci, Poin, Topik, Kesulitan.</li>
              <li>Jenis: PG, BS, Isian, Esai.</li>
              <li>Kunci PG = huruf (B); BS = Benar/Salah; Isian = jawaban dipisah |; Esai dikosongkan.</li>
            </ul>
          ) : (
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>Awali tiap soal dengan nomor yang diketik (1., 2.){source === "word" ? " — matikan penomoran otomatis Word" : ""}.</li>
              <li>Pilihan ganda: baris A. sampai F.; tandai benar dengan *B. atau baris &quot;Kunci: B&quot;.</li>
              <li>Benar/Salah: &quot;Kunci: Benar&quot;. Isian: &quot;Kunci: a | b&quot;. Esai: tanpa kunci.</li>
              <li>Opsional: &quot;Poin: 2&quot;, &quot;Topik: …&quot;, &quot;Kesulitan: Sulit&quot;.</li>
            </ul>
          )}
        </div>
      </aside>
    </div>
  )
}
