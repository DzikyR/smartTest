"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Pause, Play, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatTime } from "@/lib/format"

const INTERVAL_MS = 15_000

/** Segarkan data monitoring berkala; berhenti saat tab tidak terlihat agar tidak membebani server. */
export function AutoRefresh({ updatedAt }: { updatedAt: number }) {
  const router = useRouter()
  const [paused, setPaused] = useState(false)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (paused) return
    const tick = () => {
      if (document.visibilityState === "visible") startTransition(() => router.refresh())
    }
    const timer = setInterval(tick, INTERVAL_MS)
    // Kembali ke tab: langsung segarkan, jangan tunggu interval berikutnya.
    const onVisible = () => document.visibilityState === "visible" && tick()
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [paused, router])

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span aria-live="polite">
        {pending ? <Loader2 className="inline size-3.5 animate-spin" aria-hidden /> : null} Diperbarui {formatTime(new Date(updatedAt))}
        {paused ? " · dijeda" : ` · otomatis tiap ${INTERVAL_MS / 1000} detik`}
      </span>
      <Button type="button" variant="ghost" size="sm" onClick={() => setPaused((p) => !p)} aria-pressed={paused}>
        {paused ? <Play aria-hidden /> : <Pause aria-hidden />} {paused ? "Lanjutkan" : "Jeda"}
      </Button>
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => startTransition(() => router.refresh())}>
        <RefreshCw aria-hidden /> Segarkan
      </Button>
    </div>
  )
}
