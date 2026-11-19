"use client"

import { useEffect, useRef, useState } from "react"
import { Paperclip, Plus, X } from "lucide-react"
import { FieldError, FormField } from "@/components/forms/action-form"
import { Checkbox } from "@/components/forms/checkbox"
import { NativeSelect } from "@/components/forms/native-select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { formatBytes } from "@/lib/format"
import { linkAttachment, POST_LIMITS, type PostKindValue } from "@/lib/classes/posts"
import { MAX_OPTIONS } from "@/lib/exam/question-input"
import { SUBMISSION_ACCEPT, SUBMISSION_FORMATS_LABEL } from "@/lib/submissions/files"
import { ATTACHMENT_ICON } from "./post-icon"

export type Topic = { id: string; name: string }
export type QuizOption = { id: string; title: string; published: boolean; questions: number }
export type ExistingAttachment = { id: string; type: "FILE" | "LINK" | "YOUTUBE"; name: string; size: number | null; url: string | null }
export type PostDefaults = { title: string; content: string | null; topicId: string | null; dueAt: string; maxPoints: number | null; attachments: ExistingAttachment[]; examTitle?: string; questionLocked?: boolean }

const NEW_TOPIC = "__new__"

/**
 * Isian postingan (buat & ubah) untuk keempat jenis. Jenis tidak bisa diganti
 * setelah dibuat. Lampiran berkas & tautan bisa dicampur dalam satu form.
 */
export function PostFields({ kind, topics, quizzes = [], defaults, defaultTopicId }: { kind: PostKindValue; topics: Topic[]; quizzes?: QuizOption[]; defaults?: PostDefaults; defaultTopicId?: string }) {
  const editing = !!defaults
  const [topic, setTopic] = useState(defaults ? (defaults.topicId ?? "") : (defaultTopicId ?? ""))
  const [qType, setQType] = useState<"ESSAY" | "MULTIPLE_CHOICE">("ESSAY")
  const work = kind === "TUGAS" || kind === "PERTANYAAN"

  return (
    <>
      {kind === "TUGAS_KUIS" && !editing && (
        <FormField
          name="examId"
          label="Ujian CBT"
          hint={quizzes.length ? "Soal, jadwal, durasi & pengamanan tetap diatur di modul Ujian. Kuis otomatis ditujukan ke kelas ini." : "Belum ada Tugas Kuis yang bisa ditautkan. Buat lewat menu Ujian (jenis pekerjaan: Tugas Kuis)."}
        >
          <NativeSelect id="examId" name="examId" defaultValue="">
            <option value="">— pilih ujian —</option>
            {quizzes.map((q) => (
              <option key={q.id} value={q.id}>
                {q.title} · {q.questions} soal{q.published ? "" : " · draf"}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      )}
      {kind === "TUGAS_KUIS" && editing && defaults.examTitle && <p className="rounded-lg bg-muted px-3 py-2 text-sm">Ujian tertaut: {defaults.examTitle}</p>}

      <FormField name="title" label={kind === "PERTANYAAN" ? "Pertanyaan" : kind === "TUGAS_KUIS" ? "Judul (opsional)" : "Judul"} hint={kind === "TUGAS_KUIS" ? "Kosongkan untuk memakai judul ujian." : undefined}>
        <Input id="title" name="title" defaultValue={defaults?.title} maxLength={150} required={kind !== "TUGAS_KUIS"} />
      </FormField>

      {kind === "PERTANYAAN" && !editing && <QuestionAnswerFields qType={qType} setQType={setQType} />}
      {kind === "PERTANYAAN" && editing && (
        <p className="text-xs text-muted-foreground">
          {defaults.questionLocked ? "Sudah ada jawaban terkumpul — teks soal di halaman Pertanyaan tidak lagi diubah dari sini." : "Jenis jawaban & pilihan diubah lewat halaman Pertanyaan (tab Soal)."}
        </p>
      )}

      <FormField name="content" label={kind === "MATERI" ? "Deskripsi (opsional)" : "Petunjuk (opsional)"}>
        <Textarea id="content" name="content" rows={kind === "MATERI" ? 5 : 3} defaultValue={defaults?.content ?? ""} maxLength={10_000} />
      </FormField>

      {work && (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField name="maxPoints" label={kind === "TUGAS" ? "Poin maksimal" : "Poin"} hint={kind === "TUGAS" ? "Nilai di Rekap dikonversi ke skala 0–100." : "1–100"}>
            <Input id="maxPoints" name="maxPoints" type="number" min={1} max={kind === "TUGAS" ? 1000 : 100} step="any" defaultValue={defaults ? (defaults.maxPoints ?? "") : kind === "TUGAS" ? 100 : 10} />
          </FormField>
          <FormField name="dueAt" label="Tenggat (opsional)" hint="WIB. Pengumpulan setelahnya ditandai terlambat.">
            <Input id="dueAt" name="dueAt" type="datetime-local" defaultValue={defaults?.dueAt ?? ""} />
          </FormField>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField name="topicId" label="Topik">
          <NativeSelect id="topicId" name="topicId" value={topic} onChange={(e) => setTopic(e.target.value)}>
            <option value="">Tanpa topik</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
            <option value={NEW_TOPIC}>+ Buat topik baru…</option>
          </NativeSelect>
        </FormField>
        {topic === NEW_TOPIC && (
          <FormField name="newTopic" label="Nama topik baru">
            <Input id="newTopic" name="newTopic" maxLength={80} placeholder="mis. Pertemuan 3" autoFocus />
          </FormField>
        )}
      </div>

      <AttachmentPicker existing={defaults?.attachments ?? []} />

      {!editing && <Checkbox name="publish" label="Terbitkan sekarang" hint="Tidak dicentang = disimpan sebagai draf (hanya terlihat pengajar)." />}
    </>
  )
}

/** Pertanyaan: jawaban singkat (dinilai manual) atau pilihan ganda (dikoreksi otomatis). */
function QuestionAnswerFields({ qType, setQType }: { qType: "ESSAY" | "MULTIPLE_CHOICE"; setQType: (v: "ESSAY" | "MULTIPLE_CHOICE") => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border p-3">
      <FormField name="qType" label="Jenis jawaban">
        <NativeSelect id="qType" name="qType" value={qType} onChange={(e) => setQType(e.target.value as "ESSAY" | "MULTIPLE_CHOICE")}>
          <option value="ESSAY">Jawaban singkat (dinilai pengajar)</option>
          <option value="MULTIPLE_CHOICE">Pilihan ganda (dikoreksi otomatis)</option>
        </NativeSelect>
      </FormField>
      {qType === "MULTIPLE_CHOICE" && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Pilihan — tandai jawaban benar</legend>
          {Array.from({ length: MAX_OPTIONS }, (_, i) => (
            <label key={i} className="flex items-center gap-2">
              <input type="radio" name="correct" value={i} defaultChecked={i === 0} className="size-4 accent-primary" aria-label={`Pilihan ${String.fromCharCode(65 + i)} benar`} />
              <span className="w-4 text-sm text-muted-foreground">{String.fromCharCode(65 + i)}</span>
              <Input name={`option_${i}`} maxLength={500} placeholder={i < 2 ? "Wajib" : "Opsional"} />
            </label>
          ))}
          <FieldError name="options" />
        </fieldset>
      )}
    </div>
  )
}

/**
 * "+ Tambah File" (banyak sekaligus, bisa diulang) dan "+ Tambah Link" dalam satu form.
 * Berkas dikumpulkan di state lalu dipasang ke <input name="files"> lewat DataTransfer,
 * sehingga ActionForm (new FormData(form)) mengirim semuanya.
 */
function AttachmentPicker({ existing }: { existing: ExistingAttachment[] }) {
  const [kept, setKept] = useState(existing)
  const [files, setFiles] = useState<File[]>([])
  const [links, setLinks] = useState<{ url: string; name: string; type: "LINK" | "YOUTUBE" }[]>([])
  const [linkOpen, setLinkOpen] = useState(false)
  const [draft, setDraft] = useState({ url: "", title: "" })
  const [error, setError] = useState<string | null>(null)
  const picker = useRef<HTMLInputElement>(null)
  const carrier = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!carrier.current) return
    const dt = new DataTransfer()
    files.forEach((f) => dt.items.add(f))
    carrier.current.files = dt.files
  }, [files])

  const total = kept.length + files.length + links.length
  const addFiles = (list: FileList | null) => {
    if (!list?.length) return
    const next = [...files, ...Array.from(list).filter((f) => !files.some((x) => x.name === f.name && x.size === f.size))]
    const big = next.find((f) => f.size > POST_LIMITS.maxFileBytes)
    const sum = next.reduce((n, f) => n + f.size, 0)
    if (big) setError(`"${big.name}" melebihi ${POST_LIMITS.maxFileBytes / 1024 / 1024} MB.`)
    else if (next.length > POST_LIMITS.maxFiles) setError(`Maksimal ${POST_LIMITS.maxFiles} berkas sekali simpan.`)
    else if (sum > POST_LIMITS.maxTotalBytes) setError(`Total berkas maksimal ${POST_LIMITS.maxTotalBytes / 1024 / 1024} MB sekali simpan.`)
    else if (kept.length + next.length + links.length > POST_LIMITS.maxAttachments) setError(`Maksimal ${POST_LIMITS.maxAttachments} lampiran per postingan.`)
    else {
      setError(null)
      setFiles(next)
    }
  }
  const addLink = () => {
    const link = linkAttachment(draft.url, draft.title)
    if (!link) return setError("Tautan harus diawali http:// atau https://.")
    if (links.some((l) => l.url === link.url)) return setError("Tautan ini sudah ditambahkan.")
    if (links.length >= POST_LIMITS.maxLinks || total >= POST_LIMITS.maxAttachments) return setError(`Maksimal ${POST_LIMITS.maxLinks} tautan per postingan.`)
    setError(null)
    setLinks([...links, link])
    setDraft({ url: "", title: "" })
    setLinkOpen(false)
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="flex items-center gap-1.5 text-sm font-medium">
        <Paperclip className="size-4" aria-hidden /> Lampiran {total ? `(${total})` : ""}
      </span>
      {kept.map((a) => (
        <AttachmentRow key={a.id} type={a.type} name={a.name} detail={a.type === "FILE" ? formatBytes(a.size) : hostOf(a.url)} onRemove={() => setKept(kept.filter((x) => x.id !== a.id))}>
          <input type="hidden" name="keepAttachment" value={a.id} />
        </AttachmentRow>
      ))}
      {files.map((f, i) => (
        <AttachmentRow key={`${f.name}-${f.size}`} type="FILE" name={f.name} detail={`${formatBytes(f.size)} · baru`} onRemove={() => setFiles(files.filter((_, j) => j !== i))} />
      ))}
      {links.map((l) => (
        <AttachmentRow key={l.url} type={l.type} name={l.name} detail={`${hostOf(l.url)} · baru`} onRemove={() => setLinks(links.filter((x) => x.url !== l.url))}>
          <input type="hidden" name="linkUrl" value={l.url} />
          <input type="hidden" name="linkTitle" value={l.name} />
        </AttachmentRow>
      ))}

      {linkOpen && (
        <div className="flex flex-col gap-2 rounded-xl border p-3">
          <Input
            type="url"
            inputMode="url"
            placeholder="https:// — YouTube, Google Drive, artikel…"
            value={draft.url}
            maxLength={2000}
            autoFocus
            aria-label="Alamat tautan"
            onChange={(e) => setDraft({ ...draft, url: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault() // jangan kirim form
                addLink()
              }
            }}
          />
          <Input placeholder="Judul tampilan (opsional)" value={draft.title} maxLength={150} aria-label="Judul tautan" onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setLinkOpen(false)}>
              Batal
            </Button>
            <Button type="button" size="sm" onClick={addLink}>
              Tambahkan
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => picker.current?.click()}>
          <Plus aria-hidden /> Tambah File
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setLinkOpen(true)} disabled={linkOpen}>
          <Plus aria-hidden /> Tambah Link
        </Button>
      </div>
      {/* picker: pemilih berkas (tanpa name); carrier: kumpulan berkas yang dikirim */}
      <input ref={picker} type="file" multiple accept={SUBMISSION_ACCEPT} className="hidden" onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))} />
      <input ref={carrier} type="file" name="files" multiple className="hidden" tabIndex={-1} aria-hidden />
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : (
        <FieldError name="attachments" />
      )}
      <p className="text-xs text-muted-foreground">
        {SUBMISSION_FORMATS_LABEL} · maks. {POST_LIMITS.maxFileBytes / 1024 / 1024} MB per berkas, {POST_LIMITS.maxTotalBytes / 1024 / 1024} MB sekali simpan.
      </p>
    </div>
  )
}

function AttachmentRow({ type, name, detail, onRemove, children }: { type: ExistingAttachment["type"]; name: string; detail: string | null; onRemove: () => void; children?: React.ReactNode }) {
  const Icon = ATTACHMENT_ICON[type]
  return (
    <div className="flex items-center gap-3 rounded-xl border px-3 py-2">
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{name}</span>
        {detail && <span className="block truncate text-xs text-muted-foreground">{detail}</span>}
      </span>
      <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove} aria-label={`Hapus lampiran ${name}`} title="Hapus lampiran">
        <X />
      </Button>
      {children}
    </div>
  )
}

function hostOf(url: string | null) {
  try {
    return url ? new URL(url).hostname : null
  } catch {
    return null
  }
}
