"use client"

import { useRef, useState, useTransition } from "react"
import { FileText, Loader2, Paperclip, Trash2, Upload } from "lucide-react"
import { toast } from "sonner"
import { removeExamAttachment, uploadExamAttachment } from "@/app/(app)/ujian-kelola/attachment-actions"
import { SUBMISSION_ACCEPT, SUBMISSION_FORMATS_LABEL, SUBMISSION_LIMITS } from "@/lib/submissions/files"
import { formatBytes } from "@/lib/format"
import { Button } from "@/components/ui/button"

export type AttachmentItem = { id: string; name: string; size: number }

/** Daftar lampiran referensi ujian. `examId` diisi → mode pengajar (unggah & hapus). */
export function AttachmentList({ items, examId }: { items: AttachmentItem[]; examId?: string }) {
  const input = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [pending, start] = useTransition()

  const upload = async (file: File) => {
    if (!examId) return
    if (file.size > SUBMISSION_LIMITS.maxBytes) return toast.error(`Ukuran berkas maksimal ${SUBMISSION_LIMITS.maxBytes / 1024 / 1024} MB.`)
    setUploading(true)
    const fd = new FormData()
    fd.append("file", file)
    const r = await uploadExamAttachment(examId, { ok: false, error: "" }, fd)
    setUploading(false)
    if (input.current) input.current.value = ""
    if (r.ok) toast.success(r.message)
    else toast.error(r.error)
  }

  if (!examId && items.length === 0) return null
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <Paperclip className="size-4" aria-hidden /> Lampiran dari pengajar
      </p>
      {items.length > 0 ? (
        <ul className="flex flex-col divide-y rounded-xl border">
          {items.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <a href={`/lampiran/${f.id}`} className="min-w-0 flex-1 truncate font-medium hover:text-primary hover:underline">
                {f.name}
              </a>
              <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(f.size)}</span>
              {examId && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Hapus ${f.name}`}
                  title="Hapus"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await removeExamAttachment(examId, f.id)
                      if (r.ok) toast.success(r.message)
                      else toast.error(r.error)
                    })
                  }
                >
                  <Trash2 className="text-destructive" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Belum ada lampiran.</p>
      )}
      {examId && (
        <div className="flex flex-wrap items-center gap-3">
          <input ref={input} type="file" accept={SUBMISSION_ACCEPT} className="hidden" id="attachment-file" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <Button type="button" variant="outline" disabled={uploading} onClick={() => input.current?.click()}>
            {uploading ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />} Tambah lampiran
          </Button>
          <span className="text-xs text-muted-foreground">
            {SUBMISSION_FORMATS_LABEL} · maks. {SUBMISSION_LIMITS.maxBytes / 1024 / 1024} MB
          </span>
        </div>
      )}
    </div>
  )
}
