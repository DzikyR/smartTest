import { getCurrentUser } from "@/lib/auth/dal"
import { getManagedClass } from "@/lib/classes/access"
import { loadGradebook } from "@/lib/classes/gradebook"
import { gradebookWorkbook, xlsxResponse } from "@/lib/classes/gradebook-excel"
import { isFeatureEnabled } from "@/lib/features/access"
import { FEATURE_DISABLED } from "@/lib/features/registry"

/** Ekspor rekap nilai seluruh Tugas/ujian kelas (matriks + Rata-Rata Tugas). Hanya pengelola kelas. */
export async function GET(_request: Request, { params }: RouteContext<"/kelas/[id]/ekspor">) {
  const user = await getCurrentUser()
  if (!user || user.role === "PESERTA" || user.mustChangePassword) return new Response("Tidak diizinkan", { status: 403 })
  if (!(await isFeatureEnabled("ujian-kelola.ekspor", user.role))) return new Response(FEATURE_DISABLED, { status: 403 })
  const { id } = await params
  const cls = await getManagedClass(user, id)
  if (!cls) return new Response("Tidak ditemukan", { status: 404 })
  return xlsxResponse(await gradebookWorkbook(cls, await loadGradebook(id)), `rekap-nilai-${cls.name}`)
}
