"use client"

import { useState } from "react"
import { Copy, Expand, Link2, QrCode } from "lucide-react"
import { toast } from "sonner"
import { formatCode } from "@/lib/classes/code-format"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

/** Kode besar + QR + salin kode/tautan + tampilan layar penuh untuk proyektor. */
export function CodeDisplay({ code, joinUrl, className, qr }: { code: string; joinUrl: string; className: string; qr: string }) {
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
      <div className="flex flex-wrap items-center gap-5">
        <p className="font-mono text-4xl font-bold tracking-[0.2em] text-primary sm:text-5xl" aria-label={`Kode ${code.split("").join(" ")}`}>
          {formatCode(code)}
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element -- QR SVG data URL dari server */}
        <img src={qr} alt={`QR tautan gabung ${formatCode(code)}`} className="size-24 rounded-lg bg-white p-1 ring-1 ring-border" />
      </div>
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
        <a href={qr} download={`qr-${code}.svg`} className="inline-flex h-7 items-center gap-1 rounded-lg border px-2.5 text-[0.8rem] font-medium hover:bg-muted">
          <QrCode className="size-3.5" aria-hidden /> Unduh QR
        </a>
      </div>
      <Dialog open={big} onOpenChange={setBig}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{className}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-6 py-10 text-center">
            <p className="text-muted-foreground">Pindai QR, atau buka menu Gabung dan masukkan kode:</p>
            <div className="flex flex-col items-center gap-8 sm:flex-row">
              {/* eslint-disable-next-line @next/next/no-img-element -- QR SVG data URL dari server */}
              <img src={qr} alt={`QR tautan gabung ${formatCode(code)}`} className="size-64 rounded-xl bg-white p-2" />
              <p className="font-mono text-5xl font-bold tracking-[0.2em] whitespace-nowrap text-primary sm:text-6xl lg:text-7xl">{formatCode(code)}</p>
            </div>
            <p className="font-mono text-sm break-all text-muted-foreground">{joinUrl}</p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
