import "server-only"
import { db } from "@/lib/db"
import type { CurrentUser } from "@/lib/auth/dal"
import { getManagedClass, getMembership } from "@/lib/classes/access"
import { orphanKeys } from "@/lib/classes/posts"
import { removeStoredFiles } from "@/lib/submissions/storage"

export const attachmentSelect = { id: true, type: true, name: true, url: true, mimeType: true, size: true } as const

/**
 * Akses satu postingan: pengelola kelas → semua (termasuk draf), `manage: true`;
 * mahasiswa anggota AKTIF → hanya yang terbit (dan bila menautkan pekerjaan,
 * pekerjaannya juga sudah terbit). Selain itu null (pemanggil membalas 404,
 * tidak membocorkan postingan ada). Semua halaman, aksi, dan unduhan wajib lewat sini (anti-IDOR).
 */
export async function getMaterialAccess(user: CurrentUser, groupId: string, materialId: string) {
  const material = await db.material.findFirst({
    where: { id: materialId, groupId },
    select: {
      id: true,
      groupId: true,
      title: true,
      content: true,
      kind: true,
      status: true,
      publishedAt: true,
      createdAt: true,
      examId: true,
      exam: { select: { id: true, title: true, workType: true, dueAt: true, maxPoints: true, publishedAt: true, startAt: true, endAt: true } },
      topic: { select: { name: true } },
      attachments: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: attachmentSelect },
    },
  })
  if (!material) return null
  if (user.role !== "PESERTA") return (await getManagedClass(user, groupId)) ? { material, manage: true as const } : null
  if (material.status !== "PUBLISHED" || (material.exam && !material.exam.publishedAt)) return null
  const m = await getMembership(user, groupId)
  return m?.role === "STUDENT" && m.status === "ACTIVE" ? { material, manage: false as const } : null
}

/**
 * Hapus berkas di disk setelah baris lampirannya dihapus — HANYA bila tidak ada
 * lampiran lain (mis. salinan "Gunakan kembali" di kelas lain) yang memakainya.
 */
export async function removeUnusedFiles(keys: (string | null)[]) {
  const candidates = [...new Set(keys.filter((k): k is string => !!k))]
  if (!candidates.length) return
  const still = await db.materialAttachment.findMany({ where: { storageKey: { in: candidates } }, select: { storageKey: true } })
  await removeStoredFiles(orphanKeys(candidates, still.map((s) => s.storageKey)))
}
