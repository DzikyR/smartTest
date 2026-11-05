import "server-only"
import { db } from "@/lib/db"

/**
 * Cache soal ujian di memori proses (tanpa kunci jawaban). Saat ratusan peserta
 * membuka lembar ujian atau menyimpan otomatis bersamaan, hanya satu query per
 * ujian yang berjalan: permintaan serentak menunggu Promise yang sama.
 *
 * Dibuang langsung oleh aksi yang mengubah soal ujian (invalidateExamQuestions);
 * TTL hanya jaring pengaman bila kelak berjalan lebih dari satu proses.
 */
const TTL_MS = 30_000
const MAX_EXAMS = 200

const load = (examId: string) =>
  db.examQuestion.findMany({
    where: { examId },
    orderBy: [{ order: "asc" }, { id: "asc" }],
    select: { id: true, type: true, prompt: true, options: true, points: true },
  })

export type RunnerQuestion = Awaited<ReturnType<typeof load>>[number]
type Entry = { at: number; value: Promise<RunnerQuestion[]> }

// Disimpan di globalThis agar halaman dan Server Action (bundel terpisah) memakai cache yang sama.
const store = globalThis as unknown as { __examQuestionCache?: Map<string, Entry> }
const cache = (store.__examQuestionCache ??= new Map<string, Entry>())

/** Soal ujian berurutan (sebelum tata letak acak per percobaan). Jangan diubah: objeknya dipakai bersama. */
export function examQuestions(examId: string): Promise<RunnerQuestion[]> {
  const now = Date.now()
  const hit = cache.get(examId)
  if (hit && now - hit.at < TTL_MS) return hit.value
  const value = load(examId)
  // Gagal (mis. DB sibuk) tidak di-cache: permintaan berikutnya mencoba lagi.
  value.catch(() => cache.get(examId)?.value === value && cache.delete(examId))
  cache.delete(examId) // urutan Map = urutan sisip → yang paling lama dibuang lebih dulu
  cache.set(examId, { at: now, value })
  if (cache.size > MAX_EXAMS) cache.delete(cache.keys().next().value!)
  return value
}

/** ID soal yang sah untuk ujian ini (validasi jawaban simpan otomatis). */
export async function examQuestionIds(examId: string) {
  return new Set((await examQuestions(examId)).map((q) => q.id))
}

/** Panggil setelah soal ujian ditambah, diubah, diurutkan, atau dihapus. */
export function invalidateExamQuestions(examId: string) {
  cache.delete(examId)
}
