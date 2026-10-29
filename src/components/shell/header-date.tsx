"use client"

import { useSyncExternalStore } from "react"

const subscribe = () => () => {}
const today = () => new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date())

/** Tanggal hari ini (dirender di klien agar halaman tetap dapat di-prerender). */
export function HeaderDate({ className }: { className?: string }) {
  const value = useSyncExternalStore(subscribe, today, () => "")
  return <p className={className ? `${className} text-sm text-muted-foreground` : "text-sm text-muted-foreground"}>{value}</p>
}
