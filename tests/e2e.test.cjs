// Uji ujung-ke-ujung lewat HTTP (Server Action dipanggil seperti browser).
// Prasyarat: npm run build && npm run db:seed && npm start -- -p 3123
// Password akun demo dibaca dari .akun-demo.txt (hasil seed). Data uji berawalan "E2E" dihapus di akhir.
const ROOT = require("node:path").resolve(__dirname, "..")
const fs = require("node:fs")
require(`${ROOT}/node_modules/dotenv`).config({ path: `${ROOT}/.env`, quiet: true })
const { encodeReply } = require(`${ROOT}/node_modules/next/dist/compiled/react-server-dom-webpack/client.node.js`)
const { Client } = require(`${ROOT}/node_modules/pg`)
const ExcelJS = require(`${ROOT}/node_modules/exceljs`)
const manifest = require(`${ROOT}/.next/server/server-reference-manifest.json`).node
const BASE = process.env.TEST_BASE ?? "http://localhost:3123"

const pw = Object.fromEntries(
  fs.readFileSync(`${ROOT}/.akun-demo.txt`, "utf8").split("\n").slice(2).filter(Boolean).map((l) => l.trim().split(/\s+/).slice(1))
)
let pass = 0, fail = 0
const check = (n, ok, x = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${x && !ok ? "  — " + String(x).slice(0, 400) : ""}`) }
class Jar { c = new Map(); add(r) { for (const s of r.headers.getSetCookie()) { const [kv] = s.split(";"); const i = kv.indexOf("="); this.c.set(kv.slice(0, i), kv.slice(i + 1)) } } get header() { return [...this.c].map(([k, v]) => `${k}=${v}`).join("; ") } }
async function login(identifier) {
  const jar = new Jar(); const r1 = await fetch(`${BASE}/api/auth/csrf`); jar.add(r1); const { csrfToken } = await r1.json()
  jar.add(await fetch(`${BASE}/api/auth/callback/credentials`, { method: "POST", redirect: "manual", headers: { cookie: jar.header, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrfToken, identifier, password: pw[identifier] }) }))
  return jar
}
const id = (n, f) => { const e = Object.entries(manifest).find(([, v]) => v.exportedName === n && v.filename.includes(f)); if (!e) throw new Error(`action ${n} ${f}?`); return e[0] }
const form = (o) => { const fd = new FormData(); for (const [k, v] of Object.entries(o)) for (const x of [].concat(v)) fd.append(k, x instanceof Blob ? x : String(x)); return fd }
const PREV = { ok: false, error: "" }
async function act(jar, page, file, name, args) {
  const body = await encodeReply(args)
  const res = await fetch(BASE + page, { method: "POST", redirect: "manual", headers: { cookie: jar.header, origin: BASE, "next-action": id(name, file), ...(typeof body === "string" ? { "content-type": "text/plain;charset=UTF-8" } : {}) }, body })
  jar.add(res)
  let result; for (const l of (await res.text()).split("\n")) { const m = l.match(/^[0-9a-f]+:(.*)$/); if (m) try { const v = JSON.parse(m[1]); if (v && typeof v.ok === "boolean") result = v } catch {} }
  return result
}
const get = async (jar, path) => fetch(BASE + path, { headers: { cookie: jar.header }, redirect: "manual" })
const html = async (jar, path) => (await get(jar, path)).text()
const K = "ujian-kelola/actions", B = "bank-soal/actions", P = "(app)/ujian/actions", U = "pengguna/actions", G = "kelompok/actions"

;(async () => {
  const pg = new Client({ connectionString: process.env.DATABASE_URL }); await pg.connect()
  const one = async (q, p = []) => (await pg.query(q, p)).rows[0]
  const all = async (q, p = []) => (await pg.query(q, p)).rows
  const algo = await one(`select id from subjects where code='IF101'`)
  const ifa = await one(`select id from groups where name='IF-1A'`)

  const admin = await login("admin"), rina = await login("dosen.rina"), budi = await login("dosen.budi")
  const p1 = await login("2401001"), p1b = await login("2401001"), p5 = await login("2401005")
  const T = (x) => `/ujian/${x}`
  let r

  try {
    // ---------- RBAC dasar ----------
    let res = await get(p1, "/ujian-kelola")
    check("Peserta membuka /ujian-kelola → dialihkan", res.status >= 300 && res.status < 400, res.status)
    res = await get(rina, "/admin/pengguna")
    check("Dosen membuka /admin/pengguna → dialihkan", res.status >= 300 && res.status < 400, res.status)

    // ---------- Dosen: buat ujian (durasi diatur dosen) ----------
    const examForm = { subjectId: algo.id, title: "E2E Kuis Struktur Data", kind: "KUIS", durationMinutes: 30, maxAttempts: 1, questionsPerPage: 5, token: "abc12", lockDevice: "on", maxLeaves: 5, shuffleQuestions: "on", groupId: ifa.id }
    r = await act(rina, "/ujian-kelola/baru", K, "createExam", [PREV, form({ ...examForm, durationMinutes: 0 })])
    check("Durasi 0 menit → ditolak", r?.ok === false && !!r.fieldErrors?.durationMinutes, JSON.stringify(r))
    await act(rina, "/ujian-kelola/baru", K, "createExam", [PREV, form(examForm)])
    const exam = await one(`select * from exams where title='E2E Kuis Struktur Data'`)
    check("Ujian dibuat: durasi 30 mnt, 5 soal/halaman, token huruf besar, kelompok IF-1A", exam && exam.durationMinutes === 30 && exam.questionsPerPage === 5 && exam.token === "ABC12" && !!(await one(`select 1 from exam_groups where "examId"=$1`, [exam.id])))
    r = await act(budi, `/ujian-kelola/${exam.id}`, K, "setExamPublished", [exam.id, true])
    check("Dosen bukan pengelola mata uji → tidak bisa mengelola ujian", r?.ok === false)
    r = await act(rina, `/ujian-kelola/${exam.id}`, K, "setExamPublished", [exam.id, true])
    check("Terbitkan tanpa soal → ditolak", r?.ok === false && /soal/.test(r.error))

    // ---------- Buat soal massal (langsung ke bank + ujian) ----------
    const raws = [
      { type: "PG", prompt: "E2E Struktur LIFO adalah ...", options: ["Queue", "Stack", "Tree", ""], key: "B", points: "2", topic: "E2E", difficulty: "1" },
      { type: "BS", prompt: "E2E Queue bersifat FIFO.", options: [], key: "Benar", points: "1", topic: "E2E", difficulty: "1" },
      { type: "Esai", prompt: "E2E Jelaskan perbedaan stack dan queue!", options: [], key: "", points: "5", topic: "E2E", difficulty: "3" },
      { type: "PG", prompt: "E2E Soal rusak tanpa kunci", options: ["a", "b"], key: "", points: "1" },
    ]
    r = await act(rina, "/bank-soal/massal", B, "saveBulk", [algo.id, raws, exam.id])
    check("Simpan massal dengan 1 soal belum lengkap → ditolak, ditandai q3", r?.ok === false && !!r.fieldErrors?.q3, JSON.stringify(r))
    r = await act(rina, "/bank-soal/massal", B, "saveBulk", [algo.id, raws.slice(0, 3), exam.id])
    const bankE2E = (await one(`select count(*)::int n from questions where prompt like 'E2E%'`)).n
    check("Simpan massal 3 soal → masuk bank & ujian", r?.ok && bankE2E === 3 && (await one(`select count(*)::int n from exam_questions where "examId"=$1`, [exam.id])).n === 3, JSON.stringify(r))
    r = await act(budi, "/bank-soal/massal", B, "saveBulk", [algo.id, raws.slice(0, 1), null])
    check("Dosen lain menyimpan ke bank mata uji yang bukan miliknya → ditolak", r?.ok === false)

    // ---------- Impor Excel: pratinjau lalu simpan ----------
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("Soal")
    ws.addRow(["Jenis", "Pertanyaan", "A", "B", "C", "D", "E", "F", "Kunci", "Poin", "Topik", "Kesulitan"])
    ws.addRow(["PG", "E2E Excel: 2 + 2 = ...", "3", "4", "5", "", "", "", "B", 1, "E2E", "Mudah"])
    ws.addRow(["Isian", "E2E Excel: kata kunci fungsi Python?", "", "", "", "", "", "", "def | define", 1, "E2E", ""])
    const file = new File([await wb.xlsx.writeBuffer()], "soal.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
    r = await act(rina, "/bank-soal/impor", B, "previewImport", [PREV, form({ source: "excel", file })])
    check("Pratinjau Excel: 2 soal, tanpa error", r?.ok && r.data?.questions?.length === 2 && r.data.errors.length === 0, JSON.stringify(r))
    const previewed = r?.data?.questions ?? []
    r = await act(rina, "/bank-soal/impor", B, "saveImported", [algo.id, exam.id, [{ ...previewed[0], answerKey: { optionId: "z" } }]])
    check("Simpan data pratinjau yang dimanipulasi → ditolak", r?.ok === false)
    r = await act(rina, "/bank-soal/impor", B, "saveImported", [algo.id, exam.id, previewed])
    check("Simpan impor Excel → 5 soal di ujian", r?.ok && (await one(`select count(*)::int n from exam_questions where "examId"=$1`, [exam.id])).n === 5, JSON.stringify(r))
    r = await act(rina, "/bank-soal/impor", B, "previewImport", [PREV, form({ source: "text", text: "1. E2E teks: ibukota?\nA. Bandung\n*B. Jakarta" })])
    check("Pratinjau tempel teks", r?.ok && r.data?.questions?.length === 1)
    res = await get(rina, "/bank-soal/templat/excel")
    check("Unduh templat Excel (dosen)", res.status === 200 && /spreadsheetml/.test(res.headers.get("content-type") ?? ""))
    res = await get(rina, "/bank-soal/templat/word")
    check("Unduh templat Word (dosen)", res.status === 200 && /wordprocessingml/.test(res.headers.get("content-type") ?? ""))

    // ---------- Terbit & peserta ----------
    r = await act(rina, `/ujian-kelola/${exam.id}`, K, "setExamPublished", [exam.id, true])
    check("Terbitkan ujian", r?.ok, JSON.stringify(r))
    check("Peserta kelompok lain (IF-1B) tidak melihat ujian", !(await html(p5, "/ujian")).includes("E2E Kuis Struktur Data"))
    r = await act(p5, T(exam.id), P, "startExam", [exam.id, PREV, form({ token: "ABC12" })])
    check("Peserta kelompok lain tidak bisa mulai", r?.ok === false)
    let page = await html(p1, T(exam.id))
    check("Peserta IF-1A: halaman ujian + tata tertib, soal belum terkirim", page.includes("E2E Kuis Struktur Data") && page.includes("Tata tertib") && !page.includes("E2E Struktur LIFO"))
    r = await act(p1, T(exam.id), P, "startExam", [exam.id, PREV, form({ token: "salah" })])
    check("Token salah → ditolak", r?.ok === false && !!r.fieldErrors?.token)
    r = await act(p1, T(exam.id), P, "startExam", [exam.id, PREV, form({ token: "abc12" })])
    let attempt = await one(`select * from attempts where "examId"=$1`, [exam.id])
    check("Mulai ujian: tata letak 5 soal, perangkat terikat", r?.ok && attempt?.layout?.questions?.length === 5 && !!attempt.deviceTokenHash, JSON.stringify(r))
    page = await html(p1, T(exam.id))
    check("Lembar ujian tampil tanpa kunci jawaban", page.includes("E2E Struktur LIFO") && !page.includes("answerKey") && !page.includes("optionId"))

    const qids = Object.fromEntries((await all(`select id, prompt from exam_questions where "examId"=$1`, [exam.id])).map((q) => [q.prompt.slice(4, 20), q.id]))
    const qOf = (needle) => Object.entries(qids).find(([k]) => k.includes(needle))?.[1]
    const answers = { [qOf("Struktur LIFO")]: "b", [qOf("Queue bersifat")]: "true", [qOf("Jelaskan perbe")]: "Stack LIFO, queue FIFO.", [qOf("Excel: 2 + 2")]: "b", [qOf("Excel: kata ku")]: "DEF" }
    r = await act(p1, T(exam.id), P, "saveProgress", [attempt.id, answers, [], 1])
    const firstDeadline = r?.data?.deadline
    check("Simpan otomatis", r?.ok && !!r.data?.savedAt, JSON.stringify(r))

    // Tambah waktu oleh pengawas → batas waktu di klien ikut bertambah
    r = await act(rina, `/ujian-kelola/${exam.id}`, K, "extendTime", [attempt.id, PREV, form({ minutes: 10 })])
    const r2 = await act(p1, T(exam.id), P, "saveProgress", [attempt.id, answers, [], 1])
    check("Pengawas menambah 10 menit → batas waktu peserta +10 menit", r?.ok && r2?.data?.deadline - firstDeadline === 10 * 60_000, JSON.stringify({ r, d: r2?.data?.deadline - firstDeadline }))

    // Kunci perangkat
    r = await act(p1b, T(exam.id), P, "saveProgress", [attempt.id, answers, [], 1])
    check("Sesi/perangkat kedua akun yang sama → ditolak", r?.ok === false && /perangkat lain/.test(r.error))
    r = await act(rina, `/ujian-kelola/${exam.id}`, K, "resetDevice", [attempt.id])
    await act(p1b, T(exam.id), P, "startExam", [exam.id, PREV, form({})])
    r = await act(p1b, T(exam.id), P, "saveProgress", [attempt.id, answers, [], 1])
    const rOld = await act(p1, T(exam.id), P, "saveProgress", [attempt.id, answers, [], 1])
    check("Setelah reset perangkat: perangkat baru lanjut, perangkat lama ditolak", r?.ok && rOld?.ok === false)

    // Kumpulkan & koreksi esai
    r = await act(p1b, T(exam.id), P, "submitExam", [attempt.id, answers, []])
    attempt = await one(`select * from attempts where id=$1`, [attempt.id])
    check("Kumpul: PG/BS/isian dikoreksi otomatis (isian tidak peka huruf), esai menunggu", r?.ok && attempt.status === "SUBMITTED" && attempt.questionScores[qOf("Excel: kata ku")] === 1 && attempt.questionScores[qOf("Struktur LIFO")] === 2, JSON.stringify(attempt.questionScores))
    r = await act(p1b, T(exam.id), P, "startExam", [exam.id, PREV, form({ token: "ABC12" })])
    check("Kesempatan 1× habis → tidak bisa mulai lagi", r?.ok === false)
    r = await act(rina, `/ujian-kelola/${exam.id}/koreksi/${attempt.id}`, K, "gradeAttempt", [attempt.id, PREV, form({ [`essay_${qOf("Jelaskan perbe")}`]: 4, feedback: "Bagus" })])
    attempt = await one(`select * from attempts where id=$1`, [attempt.id])
    // Poin: 2 + 1 + 4 + 1 + 1 = 9 dari 2 + 1 + 5 + 1 + 1 = 10
    check("Nilai esai → GRADED, skor 90", r?.ok && attempt.status === "GRADED" && attempt.score === 90, JSON.stringify({ r, s: attempt.score }))
    r = await act(rina, `/ujian-kelola/${exam.id}`, K, "removeExamQuestions", [exam.id, [qOf("Excel: 2 + 2")]])
    check("Soal dikunci setelah ada yang mengumpulkan", r?.ok === false)

    // Rekap & ekspor
    page = await html(rina, `/ujian-kelola/${exam.id}?tab=hasil`)
    check("Tab hasil: statistik, sebaran nilai, analisis butir", page.includes("Sebaran nilai") && page.includes("Analisis butir soal") && page.includes("90"))
    res = await get(rina, `/ujian-kelola/${exam.id}/ekspor`)
    const xl = new ExcelJS.Workbook(); await xl.xlsx.load(await res.arrayBuffer())
    const rowsText = []; xl.getWorksheet("Nilai").eachRow((row) => rowsText.push(row.values.join("|")))
    check("Ekspor Excel: sheet Nilai berisi peserta & nilai 90", res.status === 200 && rowsText.some((t) => t.includes("2401001") && t.includes("90")) && !!xl.getWorksheet("Analisis Butir"), rowsText.slice(0, 6).join(" / "))
    res = await get(p1, `/ujian-kelola/${exam.id}/ekspor`)
    check("Ekspor oleh peserta → ditolak", res.status !== 200)
    page = await html(p1, "/hasil")
    check("Peserta melihat nilai di Hasil Ujian", page.includes("E2E Kuis Struktur Data") && page.includes("90"))

    // ---------- Admin: pengguna & kelompok ----------
    r = await act(admin, "/admin/pengguna", U, "createUser", [PREV, form({ name: "E2E Peserta Baru", email: "e2e.baru@smarttest.local", username: "e2e9001", role: "PESERTA", groupId: ifa.id })])
    check("Admin membuat peserta → password sementara dikembalikan", r?.ok && typeof r.data?.password === "string" && r.data.password.length >= 10, JSON.stringify(r))
    r = await act(admin, "/admin/pengguna", U, "createUser", [PREV, form({ name: "E2E Super", email: "e2e.super@smarttest.local", role: "SUPER_ADMIN" })])
    check("Admin tidak bisa membuat Super Admin", r?.ok === false)
    const uw = new ExcelJS.Workbook(); const us = uw.addWorksheet("Pengguna")
    us.addRow(["Nama", "Email", "Username/NIM", "Role", "Kelompok"])
    us.addRow(["E2E Impor Satu", "e2e.imp1@smarttest.local", "e2e9101", "Peserta", "IF-1A"])
    us.addRow(["E2E Impor Dua", "e2e.imp2@smarttest.local", "e2e9102", "Peserta", "Tidak Ada"])
    const ufile = new File([await uw.xlsx.writeBuffer()], "pengguna.xlsx")
    r = await act(admin, "/admin/pengguna", U, "importUsers", [PREV, form({ file: ufile })])
    check("Impor pengguna Excel: 1 dibuat, 1 ditolak (kelompok tidak ada)", r?.ok && r.data?.accounts?.length === 1 && r.data.errors.length === 1, JSON.stringify(r))
    r = await act(admin, `/admin/kelompok/${ifa.id}`, G, "addMembers", [ifa.id, PREV, form({ identifiers: "e2e9101\n2401005\ntidakada" })])
    check("Tambah anggota kelompok dari daftar NIM (yang tidak ada dilaporkan)", r?.ok && /tidak ditemukan: tidakada/.test(r.message), JSON.stringify(r))
  } finally {
    await pg.query(`delete from exams where title like 'E2E%'`)
    await pg.query(`delete from questions where prompt like 'E2E%'`)
    await pg.query(`delete from group_members where "groupId"=$1 and "userId"=(select id from users where username='2401005')`, [ifa.id])
    await pg.query(`delete from users where email like 'e2e.%'`)
    await pg.end()
  }
  console.log(`\n${pass} lulus, ${fail} gagal`)
  if (fail) process.exit(1)
})()
