"use client"

import { useEffect, useRef } from "react"
import { usePathname, useRouter } from "next/navigation"

const INTERVAL_MS = 60_000

/** Lembar ujian peserta tidak pernah di-refresh otomatis. */
const isExamRunner = (pathname: string) => /^\/ujian\/(?!selesai$)[^/]+$/.test(pathname)

/**
 * Bila Super Admin mengubah fitur, tema, logo, atau teks, tab yang sedang
 * terbuka ikut diperbarui (router.refresh — state form di klien tetap). Cek
 * setiap 60 detik dan saat tab kembali aktif; tidak berjalan di tab tersembunyi.
 */
export function SiteSync() {
  const router = useRouter()
  const paused = isExamRunner(usePathname())
  const known = useRef<string | null>(null)

  useEffect(() => {
    if (paused) return
    let active = true
    const check = async () => {
      if (document.visibilityState !== "visible") return
      try {
        const res = await fetch("/api/site/version", { cache: "no-store" })
        if (!res.ok || !active) return
        const { version } = (await res.json()) as { version: string }
        if (known.current && known.current !== version) router.refresh()
        known.current = version
      } catch {
        // offline sementara — coba lagi di putaran berikutnya
      }
    }
    check()
    const timer = setInterval(check, INTERVAL_MS)
    document.addEventListener("visibilitychange", check)
    return () => {
      active = false
      clearInterval(timer)
      document.removeEventListener("visibilitychange", check)
    }
  }, [paused, router])

  return null
}
