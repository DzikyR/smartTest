"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"

/**
 * Hitung mundur ruang tunggu. Halaman di-refresh tiap 20 detik (pengawas bisa
 * menghentikan/melanjutkan sesi) dan tepat saat waktu mulai tiba, sehingga
 * tombol "Masuk ruang ujian" muncul tanpa peserta menekan reload.
 */
export function LobbyCountdown({ target }: { target: number | null }) {
  const router = useRouter()
  const [now, setNow] = useState<number | null>(null) // null di server → tanpa hydration mismatch
  const refreshedAtTarget = useRef(false)

  useEffect(() => {
    const first = setTimeout(() => setNow(Date.now()), 0)
    const tick = setInterval(() => setNow(Date.now()), 1000)
    const poll = setInterval(() => router.refresh(), 20_000)
    return () => {
      clearTimeout(first)
      clearInterval(tick)
      clearInterval(poll)
    }
  }, [router])

  useEffect(() => {
    if (target && now !== null && now >= target && !refreshedAtTarget.current) {
      refreshedAtTarget.current = true
      router.refresh()
    }
  }, [now, target, router])

  if (!target || now === null) return null
  const left = Math.max(0, Math.round((target - now) / 1000))
  const pad = (n: number) => String(n).padStart(2, "0")
  return (
    <p className="font-mono text-5xl font-bold tracking-wider text-primary tabular-nums sm:text-6xl" role="timer" aria-label="Waktu menuju mulai">
      {left >= 86400 && `${Math.floor(left / 86400)}h `}
      {pad(Math.floor((left % 86400) / 3600))}:{pad(Math.floor((left % 3600) / 60))}:{pad(left % 60)}
    </p>
  )
}
