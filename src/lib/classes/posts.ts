/**
 * Aturan postingan kelas (tab Materi ala Google Classroom) — fungsi murni,
 * tanpa akses DB/disk, sehingga bisa diuji unit (tests/unit.mts).
 */

export const POST_KINDS = ["MATERI", "TUGAS", "TUGAS_KUIS", "PERTANYAAN"] as const
export type PostKindValue = (typeof POST_KINDS)[number]

export const POST_KIND_LABEL: Record<PostKindValue, string> = { MATERI: "Materi", TUGAS: "Tugas", TUGAS_KUIS: "Tugas Kuis", PERTANYAAN: "Pertanyaan" }

/** Jenis yang menautkan Exam (pengumpulan & nilai di mesin ujian). */
export const isWorkPost = (kind: PostKindValue) => kind !== "MATERI"

/** Pasangan jenis postingan ↔ Exam.workType. */
export const WORK_TYPE_OF: Record<Exclude<PostKindValue, "MATERI">, "ASSIGNMENT" | "QUIZ" | "QUESTION"> = { TUGAS: "ASSIGNMENT", TUGAS_KUIS: "QUIZ", PERTANYAAN: "QUESTION" }

/**
 * Batas lampiran per postingan. Satu berkas boleh lebih besar dari jawaban Tugas
 * (slide kuliah sering > 8 MB); total dibatasi agar muat di batas body Server
 * Action (next.config: serverActions.bodySizeLimit).
 */
export const POST_LIMITS = { maxFileBytes: 20 * 1024 * 1024, maxTotalBytes: 50 * 1024 * 1024, maxFiles: 10, maxLinks: 10, maxAttachments: 20 } as const

export type LinkAttachment = { type: "LINK" | "YOUTUBE"; name: string; url: string }

const YT_HOSTS = /(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be)$/i

/** ID video YouTube (11 karakter) dari berbagai bentuk tautan, atau null. */
export function youtubeId(value: string): string | null {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (!/^https?:$/.test(url.protocol) || !YT_HOSTS.test(url.hostname)) return null
  const id = /youtu\.be$/i.test(url.hostname)
    ? url.pathname.split("/")[1]
    : (url.searchParams.get("v") ?? url.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/)?.[1])
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null
}

/** Normalisasi satu tautan: hanya http(s), maks. 2000 karakter. Judul kosong → nama host. */
export function linkAttachment(rawUrl: string, rawTitle = ""): LinkAttachment | null {
  const value = rawUrl.trim()
  if (!value || value.length > 2000) return null
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null
  const title = rawTitle.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 150)
  const yt = youtubeId(url.href)
  return { type: yt ? "YOUTUBE" : "LINK", name: title || (yt ? "Video YouTube" : url.hostname), url: url.href }
}

/**
 * Tautan dari form (pasangan linkUrl[] & linkTitle[]). Mengembalikan error untuk
 * tautan tidak valid alih-alih membuangnya diam-diam. Duplikat digabung.
 */
export function parseLinks(urls: string[], titles: string[]): { links: LinkAttachment[]; error?: string } {
  const links: LinkAttachment[] = []
  for (const [i, raw] of urls.entries()) {
    if (!raw.trim()) continue
    const link = linkAttachment(raw, titles[i] ?? "")
    if (!link) return { links, error: `Tautan tidak valid: ${raw.slice(0, 80)}. Gunakan alamat yang diawali http:// atau https://.` }
    if (!links.some((l) => l.url === link.url)) links.push(link)
  }
  if (links.length > POST_LIMITS.maxLinks) return { links, error: `Maksimal ${POST_LIMITS.maxLinks} tautan per postingan.` }
  return { links }
}

/** Validasi jumlah & ukuran berkas baru (sebelum dibaca isinya). */
export function checkFileBatch(files: { name: string; size: number }[], existingCount = 0): string | null {
  if (files.length > POST_LIMITS.maxFiles) return `Maksimal ${POST_LIMITS.maxFiles} berkas sekali simpan.`
  const big = files.find((f) => f.size > POST_LIMITS.maxFileBytes)
  if (big) return `"${big.name}" melebihi ${POST_LIMITS.maxFileBytes / 1024 / 1024} MB.`
  if (files.reduce((n, f) => n + f.size, 0) > POST_LIMITS.maxTotalBytes) return `Total berkas maksimal ${POST_LIMITS.maxTotalBytes / 1024 / 1024} MB sekali simpan.`
  if (existingCount + files.length > POST_LIMITS.maxAttachments) return `Maksimal ${POST_LIMITS.maxAttachments} lampiran per postingan.`
  return null
}

/** Kunci berkas yang aman dihapus dari disk: tidak lagi direferensikan baris lampiran mana pun. */
export function orphanKeys(removed: (string | null)[], stillUsed: (string | null)[]) {
  const used = new Set(stillUsed.filter(Boolean))
  return [...new Set(removed.filter((k): k is string => !!k && !used.has(k)))]
}

/** Tenggat salinan (Gunakan kembali): hanya dipertahankan bila masih di masa depan. */
export const reusableDueAt = (dueAt: Date | null, now = new Date()) => (dueAt && dueAt > now ? dueAt : null)
