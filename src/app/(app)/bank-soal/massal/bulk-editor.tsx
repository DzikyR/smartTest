"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Copy, Loader2, Plus, Save, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { buildQuestion, type RawQuestion } from "@/lib/exam/question-build"
import { DIFFICULTY_LABEL, QUESTION_TYPE_LABEL } from "@/lib/labels"
import { cn } from "@/lib/utils"
import { NativeSelect } from "@/components/forms/native-select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { saveBulk } from "../actions"

type Kind = "PG" | "BS" | "Isian" | "Esai"
type Draft = { type: Kind; prompt: string; options: string[]; correct: number; tf: "Benar" | "Salah"; accepted: string; points: string; topic: string; difficulty: string }

const KIND_LABEL: Record<Kind, string> = {
  PG: QUESTION_TYPE_LABEL.MULTIPLE_CHOICE,
  BS: QUESTION_TYPE_LABEL.TRUE_FALSE,
  Isian: QUESTION_TYPE_LABEL.SHORT_ANSWER,
  Esai: QUESTION_TYPE_LABEL.ESSAY,
}
const PER_PAGE = [1, 5, 10, 20] as const
const MAX = 200

const blank = (d: Pick<Draft, "type" | "points" | "topic" | "difficulty">, optionCount: number): Draft => ({
  ...d,
  prompt: "",
  options: Array.from({ length: optionCount }, () => ""),
  correct: 0,
  tf: "Benar",
  accepted: "",
})

function toRaw(d: Draft): RawQuestion {
  return {
    type: d.type,
    prompt: d.prompt,
    options: d.options,
    key: d.type === "PG" ? String.fromCharCode(65 + d.correct) : d.type === "BS" ? d.tf : d.type === "Isian" ? d.accepted : "",
    points: d.points,
    topic: d.topic,
    difficulty: d.difficulty,
  }
}

const isEmpty = (d: Draft) => !d.prompt.trim() && d.options.every((o) => !o.trim()) && !d.accepted.trim()

/**
 * Editor soal massal: buat puluhan soal sekaligus, ditampilkan N soal per
 * halaman. Draf tersimpan di perangkat (aman bila halaman tertutup). Soal yang
 * belum lengkap ditandai merah; soal kosong diabaikan saat menyimpan.
 */
export function BulkEditor({
  subjects,
  exams,
  initialSubject,
  initialExam,
}: {
  subjects: { id: string; label: string }[]
  exams: { id: string; title: string; subjectId: string }[]
  initialSubject: string
  initialExam: string | null
}) {
  const router = useRouter()
  const storageKey = `smarttest:bulk:${initialSubject}`
  const [subjectId, setSubjectId] = useState(initialSubject)
  const [examId, setExamId] = useState(initialExam ?? "")
  const [defaults, setDefaults] = useState({ type: "PG" as Kind, points: "1", topic: "", difficulty: "2", optionCount: 4 })
  const [perPage, setPerPage] = useState<number>(5)
  const [page, setPage] = useState(0)
  const [drafts, setDrafts] = useState<Draft[]>(() => Array.from({ length: 5 }, () => blank({ type: "PG", points: "1", topic: "", difficulty: "2" }, 4)))
  const [serverErrors, setServerErrors] = useState<Record<number, string>>({})
  const [showErrors, setShowErrors] = useState(false)
  const [pending, start] = useTransition()

  // Pulihkan draf yang belum tersimpan.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      const saved = raw ? (JSON.parse(raw) as Draft[]) : null
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved?.length && saved.some((d) => !isEmpty(d))) setDrafts(saved)
    } catch {}
  }, [storageKey])
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(drafts))
    } catch {}
  }, [drafts, storageKey])

  const errors = useMemo(() => drafts.map((d) => (isEmpty(d) ? null : (buildQuestion(toRaw(d)).error ?? null))), [drafts])
  const filled = drafts.filter((d) => !isEmpty(d)).length
  const invalid = errors.filter(Boolean).length
  const pages = Math.max(1, Math.ceil(drafts.length / perPage))
  const current = Math.min(page, pages - 1)
  const from = current * perPage

  const update = (i: number, patch: Partial<Draft>) => {
    setDrafts((prev) => prev.map((d, j) => (j === i ? { ...d, ...patch } : d)))
    setServerErrors((e) => {
      if (!(i in e)) return e
      const next = { ...e }
      delete next[i]
      return next
    })
  }
  const add = (n: number) => {
    const room = MAX - drafts.length
    if (room <= 0) return toast.error(`Maksimal ${MAX} soal sekali simpan.`)
    const count = Math.min(n, room)
    setDrafts((prev) => [...prev, ...Array.from({ length: count }, () => blank(defaults, defaults.optionCount))])
    setPage(Math.floor(drafts.length / perPage))
  }
  const remove = (i: number) => setDrafts((prev) => (prev.length === 1 ? [blank(defaults, defaults.optionCount)] : prev.filter((_, j) => j !== i)))
  const duplicate = (i: number) => setDrafts((prev) => (prev.length >= MAX ? prev : [...prev.slice(0, i + 1), { ...prev[i], prompt: prev[i].prompt }, ...prev.slice(i + 1)]))

  const save = () => {
    setShowErrors(true)
    const indexed = drafts.map((d, i) => ({ d, i })).filter(({ d }) => !isEmpty(d))
    if (indexed.length === 0) return toast.error("Belum ada soal yang diisi.")
    const firstBad = indexed.find(({ i }) => errors[i])
    if (firstBad) {
      setPage(Math.floor(firstBad.i / perPage))
      return toast.error(`${invalid} soal belum lengkap — periksa yang ditandai merah.`)
    }
    start(async () => {
      const r = await saveBulk(subjectId, indexed.map(({ d }) => toRaw(d)), examId || null)
      if (!r.ok) {
        const mapped: Record<number, string> = {}
        for (const [k, v] of Object.entries(r.fieldErrors ?? {})) {
          const pos = Number(k.replace(/^q/, ""))
          if (Number.isInteger(pos) && indexed[pos]) mapped[indexed[pos].i] = v
        }
        setServerErrors(mapped)
        toast.error(r.error)
        return
      }
      toast.success(r.message)
      try {
        localStorage.removeItem(storageKey)
      } catch {}
      router.push(examId ? `/ujian-kelola/${examId}?tab=soal` : `/bank-soal?subject=${subjectId}`)
    })
  }

  const subjectExams = exams.filter((e) => e.subjectId === subjectId)

  return (
    <div className="flex flex-col gap-5">
      {/* ----- Pengaturan ----- */}
      <section className="grid gap-4 rounded-2xl bg-card p-5 ring-1 ring-border/60 md:grid-cols-2 xl:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="b-subject">Mata uji</Label>
          <NativeSelect id="b-subject" value={subjectId} onChange={(e) => (setSubjectId(e.target.value), setExamId(""))}>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="b-exam">Tambahkan juga ke ujian (opsional)</Label>
          <NativeSelect id="b-exam" value={examId} onChange={(e) => setExamId(e.target.value)}>
            <option value="">— hanya ke bank soal —</option>
            {subjectExams.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="b-perpage">Soal per halaman</Label>
          <NativeSelect id="b-perpage" value={perPage} onChange={(e) => (setPerPage(Number(e.target.value)), setPage(0))}>
            {PER_PAGE.map((n) => (
              <option key={n} value={n}>
                {n} soal
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="b-type">Jenis bawaan soal baru</Label>
          <NativeSelect id="b-type" value={defaults.type} onChange={(e) => setDefaults((d) => ({ ...d, type: e.target.value as Kind }))}>
            {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="b-opt">Jumlah pilihan (PG)</Label>
          <NativeSelect id="b-opt" value={defaults.optionCount} onChange={(e) => setDefaults((d) => ({ ...d, optionCount: Number(e.target.value) }))}>
            {[2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n} pilihan ({"ABCDEF".slice(0, n).split("").join(", ")})
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="b-points">Poin bawaan</Label>
          <Input id="b-points" type="number" min={0.5} max={100} step="any" value={defaults.points} onChange={(e) => setDefaults((d) => ({ ...d, points: e.target.value }))} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="b-topic">Topik bawaan</Label>
          <Input id="b-topic" value={defaults.topic} maxLength={100} onChange={(e) => setDefaults((d) => ({ ...d, topic: e.target.value }))} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="b-diff">Kesulitan bawaan</Label>
          <NativeSelect id="b-diff" value={defaults.difficulty} onChange={(e) => setDefaults((d) => ({ ...d, difficulty: e.target.value }))}>
            {[1, 2, 3].map((n) => (
              <option key={n} value={n}>
                {DIFFICULTY_LABEL[n]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <p className="text-xs text-muted-foreground md:col-span-2 xl:col-span-4">Pengaturan bawaan berlaku untuk soal yang ditambahkan berikutnya. Draf tersimpan otomatis di perangkat ini sampai disimpan ke server.</p>
      </section>

      {/* ----- Ringkasan & navigasi ----- */}
      <div className="sticky top-16 z-20 flex flex-wrap items-center gap-3 rounded-2xl bg-card/95 p-3 ring-1 ring-border/60 backdrop-blur">
        <span className="text-sm">
          <strong className="tabular-nums">{filled}</strong> soal terisi dari {drafts.length}
          {invalid > 0 && <span className="ml-2 text-destructive">· {invalid} belum lengkap</span>}
        </span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={() => setPage(current - 1)} disabled={current === 0} aria-label="Halaman sebelumnya">
            <ChevronLeft />
          </Button>
          <span className="text-sm tabular-nums">
            Halaman {current + 1}/{pages}
          </span>
          <Button variant="ghost" size="icon-sm" onClick={() => setPage(current + 1)} disabled={current >= pages - 1} aria-label="Halaman berikutnya">
            <ChevronRight />
          </Button>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="rounded-lg" onClick={() => add(perPage)}>
            <Plus aria-hidden /> Tambah {perPage} soal
          </Button>
          <Button size="sm" className="rounded-lg" onClick={save} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />} Simpan {filled} soal
          </Button>
        </div>
      </div>

      {/* ----- Daftar soal halaman ini ----- */}
      <ol className="flex flex-col gap-4" start={from + 1}>
        {drafts.slice(from, from + perPage).map((d, k) => {
          const i = from + k
          const err = serverErrors[i] ?? (showErrors ? errors[i] : null)
          const ok = !isEmpty(d) && !errors[i]
          return (
            <li key={i} className={cn("flex flex-col gap-3 rounded-2xl bg-card p-5 ring-1 ring-border/60", err && "ring-2 ring-destructive/60")}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground tabular-nums">{i + 1}</span>
                <NativeSelect aria-label={`Jenis soal ${i + 1}`} value={d.type} onChange={(e) => update(i, { type: e.target.value as Kind })} className="h-8 w-44">
                  {(Object.keys(KIND_LABEL) as Kind[]).map((kind) => (
                    <option key={kind} value={kind}>
                      {KIND_LABEL[kind]}
                    </option>
                  ))}
                </NativeSelect>
                <Input aria-label={`Poin soal ${i + 1}`} type="number" min={0.5} max={100} step="any" value={d.points} onChange={(e) => update(i, { points: e.target.value })} className="h-8 w-20" />
                <span className="text-xs text-muted-foreground">poin</span>
                <Input aria-label={`Topik soal ${i + 1}`} placeholder="Topik" value={d.topic} maxLength={100} onChange={(e) => update(i, { topic: e.target.value })} className="h-8 w-36" />
                <NativeSelect aria-label={`Kesulitan soal ${i + 1}`} value={d.difficulty} onChange={(e) => update(i, { difficulty: e.target.value })} className="h-8 w-28">
                  {[1, 2, 3].map((n) => (
                    <option key={n} value={n}>
                      {DIFFICULTY_LABEL[n]}
                    </option>
                  ))}
                </NativeSelect>
                <span className="ml-auto flex items-center gap-1">
                  {ok && <CheckCircle2 className="size-4 text-emerald-600" aria-label="Lengkap" />}
                  <Button variant="ghost" size="icon-sm" onClick={() => duplicate(i)} aria-label={`Duplikat soal ${i + 1}`} title="Duplikat">
                    <Copy />
                  </Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => remove(i)} aria-label={`Hapus soal ${i + 1}`} title="Hapus">
                    <Trash2 className="text-destructive" />
                  </Button>
                </span>
              </div>
              <Textarea aria-label={`Pertanyaan ${i + 1}`} placeholder="Tulis pertanyaan…" rows={2} maxLength={5000} value={d.prompt} onChange={(e) => update(i, { prompt: e.target.value })} />

              {d.type === "PG" && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {d.options.map((o, j) => (
                    <label key={j} className={cn("flex items-center gap-2 rounded-xl border p-1.5 pl-2.5", d.correct === j && "border-emerald-500 bg-tint-green")}>
                      <input
                        type="radio"
                        name={`correct-${i}`}
                        checked={d.correct === j}
                        onChange={() => update(i, { correct: j })}
                        className="size-4 accent-emerald-600"
                        aria-label={`Pilihan ${String.fromCharCode(65 + j)} benar`}
                      />
                      <span className="w-4 text-sm font-semibold">{String.fromCharCode(65 + j)}</span>
                      <Input
                        aria-label={`Pilihan ${String.fromCharCode(65 + j)} soal ${i + 1}`}
                        value={o}
                        maxLength={500}
                        onChange={(e) => update(i, { options: d.options.map((x, m) => (m === j ? e.target.value : x)) })}
                        className="h-8 border-0 bg-transparent shadow-none focus-visible:ring-0"
                      />
                    </label>
                  ))}
                  {d.options.length < 6 && (
                    <Button variant="ghost" size="sm" className="w-fit" onClick={() => update(i, { options: [...d.options, ""] })}>
                      <Plus aria-hidden /> Pilihan {String.fromCharCode(65 + d.options.length)}
                    </Button>
                  )}
                </div>
              )}
              {d.type === "BS" && (
                <div className="flex gap-2">
                  {(["Benar", "Salah"] as const).map((v) => (
                    <label key={v} className={cn("flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm", d.tf === v && "border-emerald-500 bg-tint-green")}>
                      <input type="radio" name={`tf-${i}`} checked={d.tf === v} onChange={() => update(i, { tf: v })} className="size-4 accent-emerald-600" /> {v}
                    </label>
                  ))}
                </div>
              )}
              {d.type === "Isian" && (
                <Input aria-label={`Jawaban diterima soal ${i + 1}`} placeholder="Jawaban yang diterima — pisahkan dengan | (mis. def | define)" value={d.accepted} onChange={(e) => update(i, { accepted: e.target.value })} />
              )}
              {d.type === "Esai" && <p className="text-xs text-muted-foreground">Esai dinilai manual setelah ujian.</p>}
              {err && (
                <p className="flex items-center gap-1.5 text-xs text-destructive">
                  <AlertCircle className="size-3.5" aria-hidden /> {err}
                </p>
              )}
            </li>
          )
        })}
      </ol>

      <div className="flex flex-wrap justify-between gap-2">
        <Button variant="outline" onClick={() => setPage(current - 1)} disabled={current === 0}>
          <ChevronLeft aria-hidden /> Sebelumnya
        </Button>
        {current < pages - 1 ? (
          <Button variant="outline" onClick={() => setPage(current + 1)}>
            Berikutnya <ChevronRight aria-hidden />
          </Button>
        ) : (
          <Button variant="outline" onClick={() => add(perPage)}>
            <Plus aria-hidden /> Tambah {perPage} soal lagi
          </Button>
        )}
      </div>
    </div>
  )
}
