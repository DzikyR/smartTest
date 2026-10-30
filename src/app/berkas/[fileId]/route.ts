import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth/dal"
import { getManagedExam } from "@/lib/data/access"
import { attachmentHeader } from "@/lib/submissions/files"
import { readStoredFile } from "@/lib/submissions/storage"

/**
 * Unduh berkas jawaban Tugas. Izin: pemilik jawaban, atau pengajar yang mengelola
 * ujiannya. Selain itu 404 (tidak membocorkan berkas ada). Selalu sebagai lampiran
 * (attachment) + CSP sandbox di next.config → tidak pernah dirender di origin aplikasi.
 */
export async function GET(_request: Request, { params }: RouteContext<"/berkas/[fileId]">) {
  const user = await getCurrentUser()
  if (!user || user.mustChangePassword) return new Response("Tidak diizinkan", { status: 401 })
  const { fileId } = await params

  const file = await db.submissionFile.findUnique({
    where: { id: fileId },
    select: { fileName: true, mimeType: true, storageKey: true, attempt: { select: { userId: true, examId: true } } },
  })
  const allowed = !!file && (file.attempt.userId === user.id || (user.role !== "PESERTA" && !!(await getManagedExam(user, file.attempt.examId))))
  if (!file || !allowed) return new Response("Tidak ditemukan", { status: 404 })

  const bytes = await readStoredFile(file.storageKey).catch(() => null)
  if (!bytes) return new Response("Berkas tidak tersedia di server", { status: 410 })
  return new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": file.mimeType, "Content-Disposition": attachmentHeader(file.fileName), "Cache-Control": "private, no-store" },
  })
}
