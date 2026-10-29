import { getCurrentUser } from "@/lib/auth/dal"
import { buildExcelTemplate, buildWordTemplate } from "@/lib/exam/office"

const FILES = {
  excel: { build: buildExcelTemplate, name: "templat-soal-smarttest.xlsx", type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  word: { build: buildWordTemplate, name: "templat-soal-smarttest.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
} as const

/** Unduh templat soal (Excel/Word) untuk impor. */
export async function GET(_request: Request, { params }: RouteContext<"/bank-soal/templat/[format]">) {
  const user = await getCurrentUser()
  if (!user || user.role === "PESERTA") return new Response("Tidak diizinkan", { status: 403 })
  const { format } = await params
  const file = FILES[format as keyof typeof FILES]
  if (!file) return new Response("Tidak ditemukan", { status: 404 })
  const buffer = await file.build()
  return new Response(new Uint8Array(buffer), {
    headers: { "Content-Type": file.type, "Content-Disposition": `attachment; filename="${file.name}"`, "Cache-Control": "no-store" },
  })
}
