"use client"

import { useState } from "react"
import { Copy, Expand, Link2 } from "lucide-react"
import { toast } from "sonner"
import { formatCode } from "@/lib/classes/code-format"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

/** Kode kelas besar + salin kode/tautan + tampilan layar penuh untuk proyektor. */
export function CodeDisplay({ code, joinUrl, className }: { code: string; joinUrl: string; className: string }) {
  const [big, setBig] = useState(false)
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${what} disalin.`)
    } catch {
      toast.error("Tidak bisa menyalin — salin manual.")
    }
  }
  return (
    <>
      <p className="font-mono text-4xl font-bold tracking-[0.2em] text-primary sm:text-5xl" aria-label={`Kode kelas ${code.split("").join(" ")}`}>
        {formatCode(code)}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => copy(code, "Kode")}>
          <Copy aria-hidden /> Salin kode
        </Button>
        <Button variant="outline" size="sm" onClick={() => copy(joinUrl, "Tautan undangan")}>
          <Link2 aria-hidden /> Salin tautan
        </Button>
        <Button variant="outline" size="sm" onClick={() => setBig(true)}>
          <Expand aria-hidden /> Tampilkan di layar
        </Button>
      </div>
      <Dialog open={big} onOpenChange={setBig}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{className}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-6 py-10 text-center">
            <p className="text-muted-foreground">Gabung lewat menu Kelas → Gabung kelas, atau buka:</p>
            <p className="font-mono text-lg break-all">{joinUrl}</p>
            <p className="font-mono text-7xl font-bold tracking-[0.25em] text-primary sm:text-8xl">{formatCode(code)}</p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
