import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth/dal"
import { getMaterialAccess } from "@/lib/classes/materials"
import { attachmentHeader } from "@/lib/submissions/files"
import { readStoredFile } from "@/lib/submissions/storage"

/**
 * Unduh berkas materi kelas. Izin: pengelola kelas (termasuk draf), atau
 * mahasiswa anggota aktif untuk materi yang sudah terbit. Selain itu 404.
 * Selalu attachment + CSP sandbox (next.config).
 */
export async function GET(_request: Request, { params }: RouteContext<"/materi-berkas/[id]">) {
  const user = await getCurrentUser()
  if (!user || user.mustChangePassword) return new Response("Tidak diizinkan", { status: 401 })
  const { id } = await params
  const row = await db.material.findUnique({ where: { id }, select: { groupId: true } })
  const m = row ? (await getMaterialAccess(user, row.groupId, id))?.material : null
  if (!m?.storageKey) return new Response("Tidak ditemukan", { status: 404 })

  const bytes = await readStoredFile(m.storageKey).catch(() => null)
  if (!bytes) return new Response("Berkas tidak tersedia di server", { status: 410 })
  return new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": m.mimeType ?? "application/octet-stream", "Content-Disposition": attachmentHeader(m.fileName ?? "materi"), "Cache-Control": "private, no-store" },
  })
}
