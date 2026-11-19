import "server-only"
import { db } from "@/lib/db"
import type { CurrentUser } from "@/lib/auth/dal"
import { getManagedClass, getMembership } from "@/lib/classes/access"

/**
 * Akses satu materi: pengelola kelas → semua materi (termasuk draf), `manage: true`;
 * mahasiswa anggota AKTIF → hanya materi terbit. Selain itu null (pemanggil
 * membalas 404/"tidak ditemukan", tidak membocorkan materi ada). Semua halaman,
 * aksi, dan unduhan materi wajib lewat sini (anti-IDOR).
 */
export async function getMaterialAccess(user: CurrentUser, groupId: string, materialId: string) {
  const material = await db.material.findFirst({
    where: { id: materialId, groupId },
    select: {
      id: true,
      groupId: true,
      title: true,
      content: true,
      type: true,
      url: true,
      fileName: true,
      mimeType: true,
      size: true,
      storageKey: true,
      status: true,
      publishedAt: true,
      createdAt: true,
      examId: true,
      topic: { select: { name: true } },
    },
  })
  if (!material) return null
  if (user.role !== "PESERTA") return (await getManagedClass(user, groupId)) ? { material, manage: true as const } : null
  if (material.status !== "PUBLISHED") return null
  const m = await getMembership(user, groupId)
  return m?.role === "STUDENT" && m.status === "ACTIVE" ? { material, manage: false as const } : null
}
