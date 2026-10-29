// Uji pulang-pergi Office: templat Excel/Word yang dibuat aplikasi harus terbaca kembali
// tanpa error, dan berkas rusak ditolak dengan pesan jelas.
// Jalankan: npx tsx --conditions=react-server tests/office.test.mts
import ExcelJS from "exceljs"
const office = await import(new URL("../src/lib/exam/office.ts", import.meta.url).href)

let pass = 0, fail = 0
const check = (n: string, ok: boolean, x: unknown = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${!ok ? "  — " + JSON.stringify(x).slice(0, 400) : ""}`) }
const ab = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer

const xlsx: Buffer = await office.buildExcelTemplate()
let r = await office.parseExcel(ab(xlsx))
check("Templat Excel → 5 soal contoh terbaca tanpa error", r.questions.length === 5 && r.errors.length === 0, r)
check("Excel: jenis PG/PG/BS/Isian/Esai sesuai urutan", r.questions.map((q: { type: string }) => q.type).join() === "MULTIPLE_CHOICE,MULTIPLE_CHOICE,TRUE_FALSE,SHORT_ANSWER,ESSAY", r.questions.map((q: { type: string }) => q.type))
check("Excel: PG kedua punya 5 pilihan, kunci B, kesulitan Sedang", r.questions[1].options.length === 5 && r.questions[1].answerKey.optionId === "b" && r.questions[1].difficulty === 2)

// Excel buatan pengguna: baris salah dilaporkan dengan nomor barisnya.
const wb = new ExcelJS.Workbook()
const ws = wb.addWorksheet("Soal")
ws.addRow(["Jenis", "Pertanyaan", "A", "B", "C", "D", "E", "F", "Kunci", "Poin", "Topik", "Kesulitan"])
ws.addRow(["PG", "Soal valid pertama?", "x", "y", "", "", "", "", "A", 1, "", ""])
ws.addRow(["PG", "Soal tanpa kunci?", "x", "y", "", "", "", "", "", 1, "", ""])
ws.addRow([])
ws.addRow(["Esai", "Esai valid kedua apa?", "", "", "", "", "", "", "", 4, "", "Sulit"])
r = await office.parseExcel(ab(Buffer.from(await wb.xlsx.writeBuffer())))
check("Excel pengguna: 2 valid, 1 error 'Baris 3', baris kosong dilewati", r.questions.length === 2 && r.errors.length === 1 && r.errors[0].startsWith("Baris 3"), r)

const docx: Buffer = await office.buildWordTemplate()
r = await office.parseWord(ab(docx))
check("Templat Word → 5 soal contoh, petunjuk diabaikan", r.questions.length === 5 && r.errors.length === 0, r)
check("Word: PG pertama kunci B (tanda *), topik & kesulitan terbaca", r.questions[0].answerKey.optionId === "b" && r.questions[0].topic === "Pengetahuan Umum" && r.questions[0].difficulty === 1, r.questions[0])

r = await office.parseExcel(ab(Buffer.from("bukan excel")))
check("Berkas rusak (.xlsx palsu) → pesan jelas", r.questions.length === 0 && /bukan Excel/.test(r.errors[0]), r)
r = await office.parseWord(ab(Buffer.from("bukan word")))
check("Berkas rusak (.docx palsu) → pesan jelas", r.questions.length === 0 && /bukan Word/.test(r.errors[0]), r)

console.log(`\n${pass} lulus, ${fail} gagal`)
if (fail) process.exit(1)
