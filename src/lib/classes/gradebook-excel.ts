import "server-only"
import ExcelJS from "exceljs"
import { formatDateTime } from "@/lib/format"
import { WORK_TYPE_LABEL } from "@/lib/labels"
import { safeHref } from "@/lib/safe-url"
import { CELL_LABEL, toPoints } from "./gradebook-math"
import type { Gradebook } from "./gradebook"

type ClassInfo = { name: string; term: string | null; subject: { code: string; name: string } | null }

function sheet(wb: ExcelJS.Workbook, name: string, title: string, cls: ClassInfo, headers: string[]) {
  const ws = wb.addWorksheet(name)
  ws.addRow([title]).font = { bold: true, size: 13 }
  ws.addRow([[cls.name, cls.subject ? `${cls.subject.code} · ${cls.subject.name}` : null, cls.term, `diunduh ${formatDateTime(new Date())}`].filter(Boolean).join(" · ")])
  ws.addRow([])
  const header = ws.addRow(headers)
  header.font = { bold: true, color: { argb: "FFFFFFFF" } }
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF5B4FE9" } }
  header.alignment = { wrapText: true, vertical: "middle" }
  ws.views = [{ state: "frozen", xSplit: 3, ySplit: 4 }]
  return ws
}

/** Rekap seluruh pekerjaan kelas: satu kolom per Tugas/ujian + Rata-Rata Tugas + Rata-rata semua. */
export async function gradebookWorkbook(cls: ClassInfo, book: Gradebook) {
  const wb = new ExcelJS.Workbook()
  wb.creator = "SmartTest"
  const ws = sheet(wb, "Rekap Nilai", `Rekap Nilai — ${cls.name}`, cls, ["No", "NIM/Username", "Nama", ...book.works.map((w) => `${w.title} (${w.label})`), "Rata-Rata Tugas", "Rata-rata semua"])
  book.rows.forEach((r, i) => ws.addRow([i + 1, r.user.username ?? r.user.email, r.user.name, ...r.cells.map((c) => c.score ?? (c.state === "pending" ? "perlu dinilai" : "")), r.avgAssignment ?? "", r.avgAll ?? ""]))
  ws.columns.forEach((c, i) => (c.width = i === 0 ? 5 : i === 1 ? 16 : i === 2 ? 30 : 14))
  ws.addRow([])
  ws.addRow(["Nilai skala 0–100. Tidak mengumpulkan setelah tenggat/tutup = 0. \"Perlu dinilai\" belum dihitung di rata-rata. Rata-Rata Tugas hanya dari pekerjaan jenis Tugas."]).font = { italic: true, color: { argb: "FF6B7280" } }
  return Buffer.from(await wb.xlsx.writeBuffer())
}

/** Rekap satu pekerjaan: siapa sudah/belum mengumpulkan, waktu, status, nilai, feedback. */
export async function workWorkbook(cls: ClassInfo, book: Gradebook) {
  const w = book.works[0]
  const wb = new ExcelJS.Workbook()
  wb.creator = "SmartTest"
  const assignment = w.workType === "ASSIGNMENT"
  const ws = sheet(wb, "Nilai", `${WORK_TYPE_LABEL[w.workType]} · ${w.label} — ${w.title}`, cls, [
    "No",
    "NIM/Username",
    "Nama",
    "Waktu Kumpul",
    "Status",
    "Terlambat",
    "Nilai (0–100)",
    ...(assignment ? [`Poin (maks. ${w.maxPoints ?? 100})`, "Tautan jawaban"] : []),
    "Feedback",
  ])
  book.rows.forEach((r, i) => {
    const c = r.cells[0]
    ws.addRow([
      i + 1,
      r.user.username ?? r.user.email,
      r.user.name,
      c.submittedAt ? formatDateTime(c.submittedAt) : "",
      CELL_LABEL[c.state],
      c.isLate ? "Ya" : "",
      c.score ?? "",
      ...(assignment ? [toPoints(c.score, w.maxPoints) ?? "", safeHref(c.submissionUrl) ?? ""] : []),
      c.feedback ?? "",
    ])
  })
  ws.columns.forEach((col, i) => (col.width = [5, 16, 30, 20, 20, 10, 12][i] ?? (assignment && i === 7 ? 14 : 40)))
  return Buffer.from(await wb.xlsx.writeBuffer())
}

export function xlsxResponse(buffer: Buffer, name: string) {
  const filename = name.replace(/[^\w-]+/g, "_").slice(0, 80)
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
      "Cache-Control": "no-store",
    },
  })
}
