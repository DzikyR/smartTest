"use client"

import { useTransition } from "react"
import { Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { deleteQuestions } from "./actions"

/** Hapus soal yang dicentang pada form `formId` (checkbox name="ids"). */
export function BulkDeleteButton({ formId }: { formId: string }) {
  const [pending, start] = useTransition()
  return (
    <Button
      variant="outline"
      size="sm"
      className="rounded-lg"
      disabled={pending}
      onClick={() => {
        const form = document.getElementById(formId) as HTMLFormElement | null
        const ids = form ? new FormData(form).getAll("ids").map(String) : []
        if (ids.length === 0) return toast.info("Centang soal yang akan dihapus.")
        if (!confirm(`Hapus ${ids.length} soal dari bank? Ujian yang sudah memakai soal ini tidak terpengaruh.`)) return
        start(async () => {
          const r = await deleteQuestions(ids)
          if (r.ok) toast.success(r.message)
          else toast.error(r.error)
        })
      }}
    >
      {pending ? <Loader2 className="animate-spin" /> : <Trash2 className="text-destructive" />} Hapus terpilih
    </Button>
  )
}

/** Centang/hapus centang semua soal di halaman ini. */
export function SelectAll({ formId }: { formId: string }) {
  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      <input
        type="checkbox"
        className="size-4 accent-primary"
        onChange={(e) => {
          document.querySelectorAll<HTMLInputElement>(`#${formId} input[name=ids]`).forEach((c) => (c.checked = e.target.checked))
        }}
      />
      Pilih semua
    </label>
  )
}
