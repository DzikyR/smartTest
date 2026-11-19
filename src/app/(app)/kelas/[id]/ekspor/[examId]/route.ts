import { getCurrentUser } from "@/lib/auth/dal"
import { getManagedClass } from "@/lib/classes/access"
import { loadGradebook } from "@/lib/classes/gradebook"
import { workWorkbook, xlsxResponse } from "@/lib/classes/gradebook-excel"
import { isFeatureEnabled } from "@/lib/features/access"
import { FEATURE_DISABLED } from "@/lib/features/registry"

/** Ekspor nilai satu Tugas/ujian untuk mahasiswa kelas ini saja (termasuk yang belum mengumpulkan). */
export async function GET(_request: Request, { params }: RouteContext<"/kelas/[id]/ekspor/[examId]">) {
  const user = await getCurrentUser()
  if (!user || user.role === "PESERTA" || user.mustChangePassword) return new Response("Tidak diizinkan", { status: 403 })
  if (!(await isFeatureEnabled("ujian-kelola.ekspor", user.role))) return new Response(FEATURE_DISABLED, { status: 403 })
  const { id, examId } = await params
  const cls = await getManagedClass(user, id)
  // Ujian harus ditujukan ke kelas ini & sudah terbit (loadGradebook menyaring keduanya).
  const book = cls ? await loadGradebook(id, examId) : null
  if (!cls || !book?.works.length) return new Response("Tidak ditemukan", { status: 404 })
  return xlsxResponse(await workWorkbook(cls, book), `nilai-${book.works[0].title}-${cls.name}`)
}
