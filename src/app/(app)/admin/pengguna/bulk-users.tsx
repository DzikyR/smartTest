"use client"

import { useState, useTransition } from "react"
import { AlertTriangle, Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"
import type { Role } from "@/lib/auth/roles"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { deleteUsers, previewDeleteUsers, type DeletePreview, type DeleteTarget } from "./actions"

const checkboxes = (formId: string) => [...document.querySelectorAll<HTMLInputElement>(`input[name="ids"][form="${formId}"]:not(:disabled)`)]

/**
 * Super Admin: hapus akun terpilih di halaman ini, atau SEMUA hasil filter.
 * Dua langkah — pratinjau dampak dari server (jumlah, Super Admin, hasil ujian
 * yang ikut terhapus), lalu konfirmasi dengan jumlah yang sama persis.
 */
export function UsersBulkBar({ formId, total, filter }: { formId: string; total: number; filter: { role?: Role; q?: string } }) {
  const [all, setAll] = useState(false)
  const [preview, setPreview] = useState<{ target: DeleteTarget; data: DeletePreview } | null>(null)
  const [ack, setAck] = useState(false)
  const [pending, start] = useTransition()

  const ask = () => {
    const target: DeleteTarget = all ? { all: true, ...filter } : { ids: checkboxes(formId).filter((c) => c.checked).map((c) => c.value) }
    if ("ids" in target && target.ids.length === 0) return toast.info("Centang akun yang akan dihapus, atau pilih semua hasil filter.")
    start(async () => {
      const r = await previewDeleteUsers(target)
      if (!r.ok) return void toast.error(r.error)
      setAck(false)
      setPreview({ target, data: r.data! })
    })
  }

  const confirmDelete = () =>
    preview &&
    start(async () => {
      const r = await deleteUsers(preview.target, preview.data.count)
      if (!r.ok) return void toast.error(r.error)
      toast.success(r.message)
      setPreview(null)
      setAll(false)
      checkboxes(formId).forEach((c) => (c.checked = false))
    })

  const p = preview?.data
  const needsAck = !!p && (p.results > 0 || p.superAdmins > 0)

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input type="checkbox" className="size-4 accent-primary" disabled={all} onChange={(e) => checkboxes(formId).forEach((c) => (c.checked = e.target.checked))} />
        Pilih semua di halaman ini
      </label>
      {total > 0 && (
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" className="size-4 accent-primary" checked={all} onChange={(e) => setAll(e.target.checked)} />
          Pilih semua <strong className="text-foreground">{total}</strong> hasil filter
        </label>
      )}
      <Button variant="outline" size="sm" className="ml-auto rounded-lg" disabled={pending} onClick={ask}>
        {pending && !preview ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 className="text-destructive" aria-hidden />} Hapus terpilih
      </Button>

      <Dialog open={!!preview} onOpenChange={(o) => !o && !pending && setPreview(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus {p?.count} akun secara permanen?</DialogTitle>
            <DialogDescription>Tindakan ini tidak dapat dibatalkan. Bila hanya ingin mencabut akses sementara, gunakan tombol Nonaktifkan pada tiap akun.</DialogDescription>
          </DialogHeader>
          {p && (
            <ul className="flex flex-col gap-1.5 text-sm">
              {p.results > 0 && (
                <li className="flex gap-2 text-destructive">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {p.withResults} akun memiliki {p.results} hasil ujian — ikut terhapus dan hilang dari rekap nilai.
                </li>
              )}
              {p.superAdmins > 0 && (
                <li className="flex gap-2 text-destructive">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  Termasuk {p.superAdmins} akun Super Admin.
                </li>
              )}
              {p.selfExcluded && <li className="text-muted-foreground">Akun Anda sendiri tidak ikut dihapus.</li>}
              <li className="text-muted-foreground">Soal & ujian buatan akun ini tetap ada (pembuatnya dikosongkan).</li>
            </ul>
          )}
          {needsAck && (
            <label className="flex items-start gap-2 rounded-xl bg-destructive/5 p-3 text-sm">
              <input type="checkbox" className="mt-0.5 size-4 accent-destructive" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              Saya paham data di atas ikut terhapus permanen.
            </label>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreview(null)} disabled={pending}>
              Batal
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={pending || (needsAck && !ack)}>
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              Hapus {p?.count} akun
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
