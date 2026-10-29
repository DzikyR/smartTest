import ExcelJS from "exceljs"
import { getCurrentUser } from "@/lib/auth/dal"
import { isFeatureEnabled } from "@/lib/features/access"
import { FEATURE_DISABLED } from "@/lib/features/registry"
import { getManagedExam } from "@/lib/data/access"
import { loadExamReport } from "@/lib/data/exam-report"
import { formatDateTime } from "@/lib/format"
import { EXAM_KIND_LABEL } from "@/lib/labels"

/** Ekspor rekap nilai ujian ke Excel: sheet Nilai + sheet Analisis Butir. */
export async function GET(_request: Request, { params }: RouteContext<"/ujian-kelola/[id]/ekspor">) {
  const user = await getCurrentUser()
  if (!user || user.role === "PESERTA" || user.mustChangePassword) return new Response("Tidak diizinkan", { status: 403 })
  if (!(await isFeatureEnabled("ujian-kelola.ekspor", user.role))) return new Response(FEATURE_DISABLED, { status: 403 })
  const { id } = await params
  const exam = await getManagedExam(user, id)
  if (!exam) return new Response("Tidak ditemukan", { status: 404 })
  const report = await loadExamReport(exam)

  const wb = new ExcelJS.Workbook()
  wb.creator = "SmartTest"
  const ws = wb.addWorksheet("Nilai")
  ws.addRow([`${EXAM_KIND_LABEL[exam.kind]} — ${exam.title}`]).font = { bold: true, size: 13 }
  ws.addRow([`${exam.subject.code} · ${exam.subject.name} · durasi ${exam.durationMinutes} menit`])
  ws.addRow([])
  const header = ws.addRow(["No", "Nama", "Username/NIM", "Email", "Status", "Percobaan", "Nilai terbaik", ...(exam.passingScore !== null ? ["Lulus"] : []), "Keluar halaman", "Dikumpulkan"])
  header.font = { bold: true, color: { argb: "FFFFFFFF" } }
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF5B4FE9" } }
  report.rows.forEach((r, i) => {
    const status = r.running ? "Sedang mengerjakan" : !r.latest ? "Belum mengerjakan" : r.latest.status === "SUBMITTED" ? "Perlu dinilai" : "Selesai"
    ws.addRow([
      i + 1,
      r.user.name,
      r.user.username ?? "",
      r.user.email,
      status,
      r.attempts,
      r.best ?? "",
      ...(exam.passingScore !== null ? [r.passed === null ? "" : r.passed ? "Ya" : "Tidak"] : []),
      r.leaveCount,
      r.latest ? formatDateTime(r.latest.submittedAt) : "",
    ])
  })
  ws.columns.forEach((c, i) => (c.width = [5, 30, 16, 30, 18, 10, 12, 8, 14, 20][i] ?? 14))

  const items = wb.addWorksheet("Analisis Butir")
  const ih = items.addRow(["No", "Soal", "Jenis", "Poin", "Jawaban masuk", "% poin penuh"])
  ih.font = { bold: true }
  report.items.forEach((q, i) => items.addRow([i + 1, q.prompt, q.type, q.points, q.responses, q.correctRate ?? ""]))
  items.getColumn(2).width = 70
  items.getColumn(2).alignment = { wrapText: true, vertical: "top" }

  const buffer = Buffer.from(await wb.xlsx.writeBuffer())
  const filename = `nilai-${exam.title}`.replace(/[^\w-]+/g, "_").slice(0, 80)
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
      "Cache-Control": "no-store",
    },
  })
}
