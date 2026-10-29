import "server-only"
import ExcelJS from "exceljs"
import mammoth from "mammoth"
import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx"
import { MAX_IMPORT_QUESTIONS, parseQuestionImport, type ImportResult } from "./import"
import { buildQuestion } from "./question-build"

/**
 * Impor soal dari Microsoft Excel (.xlsx) & Word (.docx), serta templatnya.
 *
 *  - Excel: satu soal per baris dengan kolom Jenis | Pertanyaan | A–F | Kunci | Poin | Topik | Kesulitan.
 *  - Word : teks bebas bernomor (format sama dengan tempel teks), dibaca sebagai teks polos.
 */

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

const HEADER_ALIASES: Record<string, string> = {
  jenis: "type",
  tipe: "type",
  "jenis soal": "type",
  pertanyaan: "prompt",
  soal: "prompt",
  a: "A",
  b: "B",
  c: "C",
  d: "D",
  e: "E",
  f: "F",
  "pilihan a": "A",
  "pilihan b": "B",
  "pilihan c": "C",
  "pilihan d": "D",
  "pilihan e": "E",
  "pilihan f": "F",
  kunci: "key",
  "kunci jawaban": "key",
  jawaban: "key",
  poin: "points",
  bobot: "points",
  topik: "topic",
  kesulitan: "difficulty",
  "tingkat kesulitan": "difficulty",
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ")

export async function parseExcel(buffer: ArrayBuffer): Promise<ImportResult> {
  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.load(buffer)
  } catch {
    return { questions: [], errors: ["Berkas bukan Excel (.xlsx) yang valid."] }
  }
  const ws = wb.worksheets.find((w) => norm(w.name) === "soal") ?? wb.worksheets[0]
  if (!ws) return { questions: [], errors: ["Berkas Excel tidak memiliki sheet."] }

  // Baris judul kolom: salah satu dari 10 baris pertama yang memuat "Pertanyaan".
  let headerRow = 0
  const columns: Record<string, number> = {}
  for (let r = 1; r <= Math.min(10, ws.rowCount) && !headerRow; r++) {
    const row = ws.getRow(r)
    const found: Record<string, number> = {}
    row.eachCell((cell, col) => {
      const key = HEADER_ALIASES[norm(cell.text)]
      if (key && !(key in found)) found[key] = col
    })
    if (found.prompt && found.type) {
      headerRow = r
      Object.assign(columns, found)
    }
  }
  if (!headerRow) return { questions: [], errors: ['Kolom "Jenis" dan "Pertanyaan" tidak ditemukan. Gunakan templat Excel SmartTest.'] }

  const questions: ImportResult["questions"] = []
  const errors: string[] = []
  const text = (row: ExcelJS.Row, key: string) => (columns[key] ? row.getCell(columns[key]).text.trim() : "")

  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const prompt = text(row, "prompt")
    const type = text(row, "type")
    if (!prompt && !type) continue // baris kosong
    if (questions.length + errors.length >= MAX_IMPORT_QUESTIONS) {
      errors.push(`Maksimal ${MAX_IMPORT_QUESTIONS} soal per impor.`)
      break
    }
    const result = buildQuestion({
      type,
      prompt,
      options: ["A", "B", "C", "D", "E", "F"].map((k) => text(row, k)),
      key: text(row, "key"),
      points: text(row, "points"),
      topic: text(row, "topic"),
      difficulty: text(row, "difficulty"),
    })
    if (result.question) questions.push(result.question)
    else errors.push(`Baris ${r}: ${result.error}.`)
  }
  return { questions, errors }
}

export async function parseWord(buffer: ArrayBuffer): Promise<ImportResult> {
  try {
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(buffer) })
    return parseQuestionImport(value)
  } catch {
    return { questions: [], errors: ["Berkas bukan Word (.docx) yang valid."] }
  }
}

// ---------------------------------------------------------------------------
// Templat
// ---------------------------------------------------------------------------

const EXCEL_EXAMPLES = [
  ["PG", "Ibukota Indonesia adalah ...", "Bandung", "Jakarta", "Surabaya", "Medan", "", "", "B", 2, "Pengetahuan Umum", "Mudah"],
  ["PG", "Kompleksitas waktu pencarian biner adalah ...", "O(1)", "O(log n)", "O(n)", "O(n log n)", "O(n²)", "", "B", 2, "Algoritma", "Sedang"],
  ["BS", "Python membedakan huruf besar dan kecil.", "", "", "", "", "", "", "Benar", 1, "Pemrograman", "Mudah"],
  ["Isian", "Kata kunci untuk mendefinisikan fungsi di Python adalah ...", "", "", "", "", "", "", "def", 1, "Pemrograman", "Sedang"],
  ["Esai", "Jelaskan perbedaan perulangan while dan for beserta contohnya!", "", "", "", "", "", "", "", 10, "Pemrograman", "Sulit"],
]

export async function buildExcelTemplate() {
  const wb = new ExcelJS.Workbook()
  wb.creator = "SmartTest"
  const ws = wb.addWorksheet("Soal", { views: [{ state: "frozen", ySplit: 1 }] })
  ws.columns = [
    { header: "Jenis", key: "type", width: 9 },
    { header: "Pertanyaan", key: "prompt", width: 60 },
    { header: "A", width: 18 },
    { header: "B", width: 18 },
    { header: "C", width: 18 },
    { header: "D", width: 18 },
    { header: "E", width: 18 },
    { header: "F", width: 18 },
    { header: "Kunci", width: 12 },
    { header: "Poin", width: 7 },
    { header: "Topik", width: 20 },
    { header: "Kesulitan", width: 11 },
  ]
  const header = ws.getRow(1)
  header.font = { bold: true, color: { argb: "FFFFFFFF" } }
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF5B4FE9" } }
  header.alignment = { vertical: "middle" }
  header.height = 22
  for (const ex of EXCEL_EXAMPLES) ws.addRow(ex)
  for (let r = 2; r <= 500; r++) {
    ws.getCell(r, 1).dataValidation = { type: "list", allowBlank: true, formulae: ['"PG,BS,Isian,Esai"'] }
    ws.getCell(r, 12).dataValidation = { type: "list", allowBlank: true, formulae: ['"Mudah,Sedang,Sulit"'] }
    ws.getCell(r, 2).alignment = { wrapText: true, vertical: "top" }
  }

  const help = wb.addWorksheet("Petunjuk")
  help.getColumn(1).width = 110
  ;[
    "PETUNJUK PENGISIAN TEMPLAT SOAL SMARTTEST",
    "",
    "• Isi sheet \"Soal\": satu baris = satu soal. Hapus baris contoh sebelum mengunggah.",
    "• Jenis: PG (pilihan ganda), BS (benar/salah), Isian (isian singkat), Esai (dinilai manual).",
    "• PG: isi pilihan di kolom A–F (minimal 2), lalu tulis huruf jawaban benar di kolom Kunci (mis. B).",
    "• BS: kolom Kunci diisi Benar atau Salah.",
    "• Isian: kolom Kunci berisi jawaban yang diterima; pisahkan beberapa jawaban dengan | (mis. def | define).",
    "• Esai: kolom Kunci dikosongkan.",
    "• Poin: 0,5–100 (kosong = 1). Kesulitan: Mudah / Sedang / Sulit (kosong = Sedang). Topik opsional.",
    `• Maksimal ${MAX_IMPORT_QUESTIONS} soal per unggahan. Soal dengan kesalahan akan ditampilkan nomor barisnya.`,
  ].forEach((line, i) => {
    const cell = help.getCell(i + 1, 1)
    cell.value = line
    if (i === 0) cell.font = { bold: true, size: 13 }
  })
  return Buffer.from(await wb.xlsx.writeBuffer())
}

const WORD_EXAMPLE = [
  "1. Ibukota Indonesia adalah ...",
  "A. Bandung",
  "*B. Jakarta",
  "C. Surabaya",
  "D. Medan",
  "Poin: 2",
  "Topik: Pengetahuan Umum",
  "Kesulitan: Mudah",
  "",
  "2. Struktur data yang menerapkan prinsip LIFO adalah ...",
  "A. Queue",
  "B. Stack",
  "C. Tree",
  "Kunci: B",
  "",
  "3. Python membedakan huruf besar dan kecil.",
  "Kunci: Benar",
  "",
  "4. Kata kunci untuk mendefinisikan fungsi di Python adalah ...",
  "Kunci: def | define",
  "",
  "5. Jelaskan perbedaan perulangan while dan for beserta contohnya!",
  "Poin: 10",
  "Kesulitan: Sulit",
]

export async function buildWordTemplate() {
  const p = (text: string, opts: { bold?: boolean; italic?: boolean; color?: string } = {}) =>
    new Paragraph({ children: [new TextRun({ text, ...opts, font: "Calibri", size: 22 })] })
  const doc = new Document({
    creator: "SmartTest",
    title: "Templat Soal SmartTest",
    sections: [
      {
        children: [
          new Paragraph({ text: "Templat Soal SmartTest", heading: HeadingLevel.HEADING_1, alignment: AlignmentType.LEFT }),
          p("Petunjuk (hapus bagian petunjuk ini sebelum mengunggah):", { bold: true }),
          p("• Awali setiap soal dengan nomor yang DIKETIK manual, mis. \"1.\", \"2.\" — matikan penomoran otomatis Word.", { italic: true }),
          p("• Pilihan ganda: baris A. sampai F.; tandai jawaban benar dengan * di depan (*B.) atau baris \"Kunci: B\".", { italic: true }),
          p("• Benar/Salah: tanpa pilihan, tulis \"Kunci: Benar\" atau \"Kunci: Salah\".", { italic: true }),
          p("• Isian singkat: tanpa pilihan, \"Kunci: jawaban1 | jawaban2\". Esai: tanpa pilihan dan tanpa kunci.", { italic: true }),
          p("• Opsional: \"Poin: 2\", \"Topik: ...\", \"Kesulitan: Mudah/Sedang/Sulit\".", { italic: true }),
          p(""),
          ...WORD_EXAMPLE.map((line) => p(line)),
        ],
      },
    ],
  })
  return Packer.toBuffer(doc)
}
