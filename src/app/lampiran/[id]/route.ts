import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth/dal"
import { getManagedExam, getParticipantExam } from "@/lib/data/access"
import { attachmentHeader } from "@/lib/submissions/files"
import { readStoredFile } from "@/lib/submissions/storage"

/**
 * Unduh lampiran referensi ujian/Tugas. Izin: pengajar yang mengelola ujian, atau
 * peserta yang dapat melihat ujian itu (kelas aktif / sesi / terbuka untuk semua).
 * Selain itu 404. Selalu attachment + CSP sandbox (next.config).
 */
export async function GET(_request: Request, { params }: RouteContext<"/lampiran/[id]">) {
  const user = await getCurrentUser()
  if (!user || user.mustChangePassword) return new Response("Tidak diizinkan", { status: 401 })
  const { id } = await params
  const att = await db.examAttachment.findUnique({ where: { id }, select: { fileName: true, mimeType: true, storageKey: true, examId: true } })
  const allowed = !!att && !!(user.role === "PESERTA" ? await getParticipantExam(user, att.examId) : await getManagedExam(user, att.examId))
  if (!att || !allowed) return new Response("Tidak ditemukan", { status: 404 })

  const bytes = await readStoredFile(att.storageKey).catch(() => null)
  if (!bytes) return new Response("Berkas tidak tersedia di server", { status: 410 })
  return new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": att.mimeType, "Content-Disposition": attachmentHeader(att.fileName), "Cache-Control": "private, no-store" },
  })
}
