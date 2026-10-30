/**
 * Tata tertib ujian — fungsi murni. Aturan otomatis diturunkan dari pengaturan
 * ujian (selalu sesuai dengan yang ditegakkan sistem), lalu ditambah aturan
 * tertulis dari admin/dosen. Dipakai di halaman pengelola & peserta.
 */

import { formatDateTime } from "@/lib/format"

export type ExamRule = { text: string; source: "system" | "author" }

export const MAX_CUSTOM_RULES = 20

export type RuleExam = {
  durationMinutes: number
  endAt: Date | null
  timed?: boolean
  dueAt?: Date | null
  maxAttempts: number
  token?: string | null
  showScore: boolean
  passingScore?: number | null
  requireFullscreen: boolean
  blockCopyPaste: boolean
  lockDevice: boolean
  maxLeaves: number | null
  allowedIps: string | null
  requireSeb: boolean
  rules: string | null
  _count: { questions: number }
}

/** Aturan tambahan: satu per baris; baris kosong & penomoran/bullet di awal dibuang. */
export function parseCustomRules(text: string | null | undefined) {
  return (text ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/^(?:\d{1,2}[.)]|[-*•])\s*/, "").trim())
    .filter(Boolean)
    .slice(0, MAX_CUSTOM_RULES)
}

/** Pesan kesalahan untuk aturan tambahan, atau null bila valid. */
export function customRulesError(text: string | null | undefined) {
  const lines = (text ?? "").split(/\r?\n/).filter((l) => l.trim())
  if (lines.length > MAX_CUSTOM_RULES) return `Maksimal ${MAX_CUSTOM_RULES} aturan (satu per baris)`
  if (lines.some((l) => l.length > 500)) return "Tiap aturan maksimal 500 karakter"
  return null
}

export function examRules(exam: RuleExam): ExamRule[] {
  const sys: string[] = []
  sys.push(
    `Terdiri dari ${exam._count.questions} soal; ${exam.timed === false ? "tanpa batas durasi pengerjaan" : `waktu pengerjaan ${exam.durationMinutes} menit dihitung sejak tombol Mulai ditekan`}${exam.dueAt ? `; tenggat ${formatDateTime(exam.dueAt)} (setelahnya ditandai terlambat)` : ""}${exam.endAt ? `; ditutup ${formatDateTime(exam.endAt)}` : ""}.`
  )
  sys.push(exam.maxAttempts > 1 ? `Kesempatan mengerjakan ${exam.maxAttempts}×; nilai terbaik yang dipakai.` : "Hanya satu kali kesempatan mengerjakan.")
  if (exam.passingScore) sys.push(`Nilai minimal lulus: ${exam.passingScore}.`)
  if (exam.token) sys.push("Token ujian diumumkan pengawas saat ujian dimulai — jangan dibagikan.")
  if (exam.requireSeb) sys.push("Wajib memakai Safe Exam Browser di laptop/PC/iPad. Ponsel Android tidak dapat dipakai.")
  if (exam.allowedIps) sys.push("Hanya dapat dikerjakan dari jaringan yang ditentukan (mis. lab/kampus).")
  sys.push("Soal ditampilkan per halaman. Gunakan panel nomor soal untuk berpindah dan tandai “Ragu-ragu” bila ingin memeriksa ulang.")
  sys.push("Jawaban tersimpan otomatis. Bila koneksi terputus, buka kembali halaman ujian untuk melanjutkan — waktu tetap berjalan.")
  sys.push("Saat waktu habis, jawaban dikumpulkan otomatis.")
  if (exam.requireFullscreen) sys.push("Wajib layar penuh (laptop/PC). Soal ditutup saat keluar dari layar penuh.")
  sys.push(
    exam.maxLeaves
      ? `Keluar dari halaman/layar penuh ujian dicatat sebagai pelanggaran; setelah ${exam.maxLeaves}× jawaban dikumpulkan otomatis.`
      : "Berpindah tab/aplikasi selama ujian tercatat dan dapat dilihat pengawas."
  )
  if (exam.blockCopyPaste) sys.push("Salin, tempel, dan klik kanan dinonaktifkan.")
  if (exam.lockDevice) sys.push("Setelah dimulai, ujian hanya dapat dilanjutkan dari perangkat yang sama.")
  if (!exam.showScore) sys.push("Nilai diumumkan setelah dikoreksi.")

  return [...sys.map((text) => ({ text, source: "system" as const })), ...parseCustomRules(exam.rules).map((text) => ({ text, source: "author" as const }))]
}
