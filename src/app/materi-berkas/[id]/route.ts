import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth/dal"
import { getMaterialAccess } from "@/lib/classes/materials"
import { attachmentHeader } from "@/lib/submissions/files"
import { readStoredFile } from "@/lib/submissions/storage"

/**
 * Unduh lampiran berkas postingan kelas (`id` = MaterialAttachment.id). Izin
 * mengikuti postingannya: pengelola kelas (termasuk draf), atau mahasiswa anggota
 * aktif untuk postingan terbit. Selain itu 404. Selalu attachment + CSP sandbox (next.config).
 */
export async function GET(_request: Request, { params }: RouteContext<"/materi-berkas/[id]">) {
  const user = await getCurrentUser()
  if (!user || user.mustChangePassword) return new Response("Tidak diizinkan", { status: 401 })
  const { id } = await params
  const row = await db.materialAttachment.findFirst({
    where: { id, type: "FILE" },
    select: { storageKey: true, name: true, mimeType: true, materialId: true, material: { select: { groupId: true } } },
  })
  const allowed = row ? await getMaterialAccess(user, row.material.groupId, row.materialId) : null
  if (!row?.storageKey || !allowed) return new Response("Tidak ditemukan", { status: 404 })

  const bytes = await readStoredFile(row.storageKey).catch(() => null)
  if (!bytes) return new Response("Berkas tidak tersedia di server", { status: 410 })
  return new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": row.mimeType ?? "application/octet-stream", "Content-Disposition": attachmentHeader(row.name), "Cache-Control": "private, no-store" },
  })
}
