"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"

/**
 * Hitung mundur ruang tunggu. Halaman di-refresh tiap ±20 detik (pengawas bisa
 * menghentikan/melanjutkan sesi) dan saat waktu mulai tiba, sehingga tombol
 * "Masuk ruang ujian" muncul tanpa peserta menekan reload. Keduanya diberi jeda
 * acak agar ratusan peserta di ruang tunggu tidak memuat ulang pada detik yang sama.
 */
const POLL_MS = 20_000
const POLL_JITTER_MS = 5_000
const START_SPREAD_MS = 3_000

export function LobbyCountdown({ target }: { target: number | null }) {
  const router = useRouter()
  const [now, setNow] = useState<number | null>(null) // null di server → tanpa hydration mismatch
  const refreshedAtTarget = useRef(false)
  // Di luar efek per-detik: bila disimpan di cleanup efek itu, jeda acak terbatal sebelum sempat jalan.
  const startTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(startTimer.current), [])

  useEffect(() => {
    const first = setTimeout(() => setNow(Date.now()), 0)
    const tick = setInterval(() => setNow(Date.now()), 1000)
    let poll: ReturnType<typeof setTimeout>
    const next = () => {
      poll = setTimeout(() => {
        router.refresh()
        next()
      }, POLL_MS + (Math.random() * 2 - 1) * POLL_JITTER_MS)
    }
    next()
    return () => {
      clearTimeout(first)
      clearInterval(tick)
      clearTimeout(poll)
    }
  }, [router])

  useEffect(() => {
    if (target && now !== null && now >= target && !refreshedAtTarget.current) {
      refreshedAtTarget.current = true
      startTimer.current = setTimeout(() => router.refresh(), Math.random() * START_SPREAD_MS)
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
