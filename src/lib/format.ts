const dateTime = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" })
const date = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" })

export function formatDateTime(value: Date | null | undefined) {
  return value ? dateTime.format(value) : "—"
}

const time = new Intl.DateTimeFormat("id-ID", { timeStyle: "short", timeZone: "Asia/Jakarta" })

export function formatTime(value: Date | null | undefined) {
  return value ? time.format(value) : "—"
}

export function formatDate(value: Date | null | undefined) {
  return value ? date.format(value) : "—"
}

/** Untuk <input type="date">: YYYY-MM-DD (UTC, sesuai kolom @db.Date). */
export function toDateInput(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : ""
}

/** Untuk <input type="datetime-local">: YYYY-MM-DDTHH:mm dalam zona Asia/Jakarta (UTC+7). */
export function toDateTimeInput(value: Date | null | undefined) {
  return value ? new Date(value.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 16) : ""
}

/** Ukuran file yang mudah dibaca (mis. "2,4 MB") — agar mahasiswa tahu biaya kuota. */
export function formatBytes(bytes: number | null | undefined) {
  if (!bytes) return null
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toLocaleString("id-ID", { maximumFractionDigits: 1 })} MB`
}

/** Waktu N jam yang lalu (untuk filter "24 jam terakhir"). */
export function hoursAgo(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000)
}

/** Inisial nama untuk avatar, mis. "Budi Santoso" → "BS". */
export function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("")
}
