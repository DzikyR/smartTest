/**
 * Monitoring ujian langsung: status koneksi peserta dari simpan berkala.
 * Lembar ujian menyimpan otomatis tiap 30 detik (lihat exam-runner), jadi
 * `lastSavedAt` berfungsi sebagai detak (heartbeat) tanpa beban tambahan.
 */

/** Batas "online": dua kali interval simpan berkala ditambah toleransi jaringan. */
export const ONLINE_MS = 90_000
/** Lewat batas ini peserta dianggap terputus (tutup tab, mati lampu, jaringan hilang). */
export const STALLED_MS = 3 * 60_000
/** Peserta yang baru selesai tetap tampil sekian lama (nilai, pelanggaran, reset bila perlu). */
export const RECENT_FINISHED_MS = 3 * 60 * 60_000

export type LiveState = "online" | "lambat" | "putus" | "habis" | "selesai"

export const LIVE_STATES: { key: LiveState; label: string; hint: string }[] = [
  { key: "online", label: "Online", hint: "aktif ≤ 1,5 menit terakhir" },
  { key: "lambat", label: "Tersendat", hint: "tidak ada sinyal 1,5–3 menit" },
  { key: "putus", label: "Terputus", hint: "tidak ada sinyal > 3 menit" },
  { key: "habis", label: "Waktu habis", hint: "menunggu dikumpulkan otomatis" },
  { key: "selesai", label: "Selesai", hint: "dikumpulkan ≤ 3 jam terakhir" },
]

/** Status yang masih mengerjakan (bukan selesai). */
export const isRunningState = (s: LiveState) => s !== "selesai"

export function liveState(opts: { lastSeen: number; expired: boolean }, now: number): LiveState {
  if (opts.expired) return "habis"
  const idle = now - opts.lastSeen
  if (idle <= ONLINE_MS) return "online"
  if (idle <= STALLED_MS) return "lambat"
  return "putus"
}

/** Urutan tampil: yang perlu perhatian lebih dulu. */
export const STATE_ORDER: Record<LiveState, number> = { putus: 0, lambat: 1, habis: 2, online: 3, selesai: 4 }

/** "baru saja", "40 dtk lalu", "5 mnt lalu", "2 j 10 mnt lalu". */
export function formatAgo(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 10) return "baru saja"
  if (s < 60) return `${s} dtk lalu`
  return `${formatMinutes(Math.floor(s / 60))} lalu`
}

/** Sisa waktu pengerjaan; Infinity = tanpa batas. */
export function formatRemaining(ms: number) {
  if (!Number.isFinite(ms)) return "tanpa batas"
  if (ms <= 0) return "habis"
  if (ms < 60_000) return "< 1 mnt"
  return formatMinutes(Math.floor(ms / 60_000))
}

function formatMinutes(m: number) {
  if (m < 60) return `${m} mnt`
  const h = Math.floor(m / 60)
  return m % 60 ? `${h} j ${m % 60} mnt` : `${h} j`
}

/** Jumlah soal yang sudah diisi (jawaban kosong tidak dihitung). */
export function countAnswered(answers: unknown) {
  if (!answers || typeof answers !== "object") return 0
  return Object.values(answers as Record<string, unknown>).filter((v) => String(v ?? "").trim()).length
}
