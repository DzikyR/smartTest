import ExcelJS from "exceljs"
import { getCurrentUser, isAdmin } from "@/lib/auth/dal"

/** Templat Excel impor pengguna. */
export async function GET() {
  const user = await getCurrentUser()
  if (!user || !isAdmin(user)) return new Response("Tidak diizinkan", { status: 403 })
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet("Pengguna", { views: [{ state: "frozen", ySplit: 1 }] })
  ws.columns = [
    { header: "Nama", width: 30 },
    { header: "Email", width: 32 },
    { header: "Username/NIM", width: 18 },
    { header: "Role", width: 12 },
    { header: "Kelompok", width: 18 },
  ]
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } }
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF5B4FE9" } }
  ws.addRow(["Budi Santoso", "budi@kampus.ac.id", "2401001", "Peserta", "IF-1A"])
  ws.addRow(["Dr. Sari Dewi", "sari@kampus.ac.id", "", "Dosen", ""])
  for (let r = 2; r <= 1001; r++) ws.getCell(r, 4).dataValidation = { type: "list", allowBlank: true, formulae: ['"Peserta,Dosen"'] }
  const buffer = Buffer.from(await wb.xlsx.writeBuffer())
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="templat-pengguna-smarttest.xlsx"',
      "Cache-Control": "no-store",
    },
  })
}
