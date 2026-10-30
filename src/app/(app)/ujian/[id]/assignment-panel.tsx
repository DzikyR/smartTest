"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { FileText, Loader2, Paperclip, RotateCcw, Send, Trash2, Upload } from "lucide-react"
import { toast } from "sonner"
import { removeAssignmentFile, saveAssignmentText, submitAssignment, unsubmitAssignment, uploadAssignmentFile } from "../assignment-actions"
import { SUBMISSION_ACCEPT, SUBMISSION_FORMATS_LABEL, SUBMISSION_LIMITS } from "@/lib/submissions/files"
import { formatBytes } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

export type AssignmentFile = { id: string; name: string; size: number }

/**
 * Lembar kerja Tugas: jawaban teks (tersimpan otomatis) + berkas, lalu Serahkan.
 * Setelah diserahkan & sebelum dinilai, peserta bisa membatalkan pengiriman.
 */
export function AssignmentPanel({
  examId,
  editable,
  submitted,
  canUnsubmit,
  initialText,
  files,
}: {
  examId: string
  /** Draf/belum mulai & tugas dibuka */
  editable: boolean
  submitted: boolean
  canUnsubmit: boolean
  initialText: string
  files: AssignmentFile[]
}) {
  const [text, setText] = useState(initialText)
  const [saved, setSaved] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const [uploading, setUploading] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const dirty = useRef(false)

  // Simpan otomatis 1,5 detik setelah berhenti mengetik.
  useEffect(() => {
    if (!editable || !dirty.current) return
    const timer = setTimeout(async () => {
      const r = await saveAssignmentText(examId, text)
      if (r.ok) setSaved(new Date(r.data!.savedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }))
      else toast.error(r.error)
    }, 1500)
    return () => clearTimeout(timer)
  }, [text, editable, examId])

  const upload = async (file: File) => {
    if (file.size > SUBMISSION_LIMITS.maxBytes) return toast.error(`Ukuran berkas maksimal ${SUBMISSION_LIMITS.maxBytes / 1024 / 1024} MB.`)
    setUploading(true)
    const fd = new FormData()
    fd.append("file", file)
    const r = await uploadAssignmentFile(examId, { ok: false, error: "" }, fd)
    setUploading(false)
    if (fileInput.current) fileInput.current.value = ""
    if (r.ok) toast.success(r.message)
    else toast.error(r.error)
  }

  const act = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const r = await fn()
      if (r.ok) toast.success(r.message)
      else toast.error(r.error)
    })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="assignment-text" className="text-sm font-medium">
          Jawaban
        </label>
        {editable ? (
          <>
            <Textarea
              id="assignment-text"
              value={text}
              onChange={(e) => {
                dirty.current = true
                setText(e.target.value)
              }}
              rows={8}
              maxLength={SUBMISSION_LIMITS.maxTextLength}
              placeholder="Tulis jawaban di sini (opsional bila mengunggah berkas)…"
            />
            <p className="text-xs text-muted-foreground">{saved ? `Tersimpan otomatis ${saved}` : "Tersimpan otomatis saat Anda berhenti mengetik."}</p>
          </>
        ) : text ? (
          <p className="rounded-xl bg-muted/50 p-3 text-sm whitespace-pre-wrap">{text}</p>
        ) : (
          <p className="text-sm text-muted-foreground">—</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <Paperclip className="size-4" aria-hidden /> Berkas ({files.length}/{SUBMISSION_LIMITS.maxFiles})
        </p>
        {files.length > 0 && (
          <ul className="flex flex-col divide-y rounded-xl border">
            {files.map((f) => (
              <li key={f.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <a href={`/berkas/${f.id}`} className="min-w-0 flex-1 truncate font-medium hover:text-primary hover:underline">
                  {f.name}
                </a>
                <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(f.size)}</span>
                {editable && (
                  <Button variant="ghost" size="icon-sm" aria-label={`Hapus ${f.name}`} title="Hapus" disabled={pending} onClick={() => act(() => removeAssignmentFile(examId, f.id))}>
                    <Trash2 className="text-destructive" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {editable && files.length < SUBMISSION_LIMITS.maxFiles && (
          <div className="flex flex-wrap items-center gap-3">
            <input ref={fileInput} type="file" accept={SUBMISSION_ACCEPT} className="hidden" id="assignment-file" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            <Button type="button" variant="outline" disabled={uploading} onClick={() => fileInput.current?.click()}>
              {uploading ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />} Unggah berkas
            </Button>
            <span className="text-xs text-muted-foreground">
              {SUBMISSION_FORMATS_LABEL} · maks. {SUBMISSION_LIMITS.maxBytes / 1024 / 1024} MB per berkas
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
        {editable && (
          <Button disabled={pending || uploading || (!text.trim() && files.length === 0)} onClick={() => act(() => submitAssignment(examId, text))}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />} Serahkan
          </Button>
        )}
        {submitted && canUnsubmit && (
          <Button variant="outline" disabled={pending} onClick={() => act(() => unsubmitAssignment(examId))}>
            <RotateCcw aria-hidden /> Batalkan pengiriman
          </Button>
        )}
      </div>
    </div>
  )
}
