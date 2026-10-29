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
const get = async (jar, path) => fetch(BASE + path, { headers: { cookie: jar?.header ?? "" }, redirect: "manual" })
const html = async (jar, path) => (await get(jar, path)).text()
const K = "ujian-kelola/actions", B = "bank-soal/actions", P = "(app)/ujian/actions", U = "pengguna/actions", G = "kelompok/actions", F = "fitur/actions", S = "situs/actions"

;(async () => {
  const pg = new Client({ connectionString: process.env.DATABASE_URL }); await pg.connect()
  const one = async (q, p = []) => (await pg.query(q, p)).rows[0]
  const all = async (q, p = []) => (await pg.query(q, p)).rows
  const algo = await one(`select id from subjects where code='IF101'`)
  const ifa = await one(`select id from groups where name='IF-1A'`)

  const admin = await login("admin"), rina = await login("dosen.rina"), budi = await login("dosen.budi")
  const p1 = await login("2401001"), p1b = await login("2401001"), p5 = await login("2401005")
  const T = (x) => `/ujian/${x}`
  let r, savedFeatures, sa, siteTouched = false

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

    // ---------- Kontrol fitur (Super Admin) ----------
    // Pengaturan yang ada disimpan lalu dikosongkan lewat aksi (bukan SQL langsung) agar cache server ikut di-invalidate.
    sa = await login("superadmin")
    savedFeatures = { features: await all(`select * from features`), access: await all(`select * from feature_role_access`) }
    for (const f of savedFeatures.features) await act(sa, "/admin/fitur", F, "resetFeature", [f.key])
    const auditBefore = (await one(`select count(*)::int n from audit_logs where action in ('FEATURE_TOGGLED','FEATURE_RESET')`)).n
    const IMPOR_PAGE = "Periksa pratinjau sebelum disimpan", KELOMPOK_PAGE = "Kelompokkan peserta"
    res = await get(admin, "/admin/fitur")
    check("Admin membuka /admin/fitur → dialihkan (khusus Super Admin)", res.status >= 300 && res.status < 400, res.status)
    r = await act(rina, "/admin/fitur", F, "setFeatureRole", ["bank-soal.impor", "DOSEN", false])
    check("Dosen memanggil aksi toggle langsung → ditolak", r?.ok !== true && !(await one(`select 1 from features`)), JSON.stringify(r))
    check("Super Admin melihat matriks fitur", (await html(sa, "/admin/fitur")).includes("Impor Soal Word/Excel"))

    r = await act(sa, "/admin/fitur", F, "setFeatureRole", ["bank-soal.impor", "DOSEN", false])
    check("Matikan Impor untuk Dosen", r?.ok, JSON.stringify(r))
    check("Dosen: halaman impor tidak tampil", !(await html(rina, "/bank-soal/impor")).includes(IMPOR_PAGE))
    r = await act(rina, "/bank-soal/impor", B, "previewImport", [PREV, form({ source: "text", text: "1. E2E fitur?\nA. a\n*B. b" })])
    check("Dosen: aksi pratinjau impor ditolak", r?.ok === false && /dinonaktifkan/.test(r.error), JSON.stringify(r))
    check("Dosen: unduh templat soal → 403", (await get(rina, "/bank-soal/templat/excel")).status === 403)
    const rinaBank = await html(rina, "/bank-soal")
    check("Dosen: tombol & menu impor hilang, Buat massal tetap ada", !rinaBank.includes("/bank-soal/impor") && rinaBank.includes("/bank-soal/massal"))
    check("Admin tidak terdampak (impor tetap bisa)", (await html(admin, "/bank-soal/impor")).includes(IMPOR_PAGE))
    r = await act(sa, "/admin/fitur", F, "setFeatureRole", ["admin.kelompok", "DOSEN", true])
    check("Toggle tidak bisa menambah akses ke role yang tidak berhak", r?.ok === false, JSON.stringify(r))

    r = await act(sa, "/admin/fitur", F, "setFeatureGlobal", ["admin.kelompok", false])
    check("Matikan Kelompok Peserta secara global", r?.ok, JSON.stringify(r))
    check("Admin: halaman kelompok tidak tampil & menu hilang", !(await html(admin, "/admin/kelompok")).includes(KELOMPOK_PAGE) && !(await html(admin, "/dashboard")).includes('href="/admin/kelompok"'))
    r = await act(admin, "/admin/kelompok", G, "createGroup", [PREV, form({ name: "E2E Fitur" })])
    check("Admin: aksi buat kelompok ditolak", r?.ok === false && !(await one(`select 1 from groups where name='E2E Fitur'`)), JSON.stringify(r))
    check("Super Admin tetap bisa membuka kelompok", (await html(sa, "/admin/kelompok")).includes(KELOMPOK_PAGE))

    r = await act(sa, "/admin/fitur", F, "setFeatureRole", ["ujian.mulai", "PESERTA", false])
    check("Matikan Memulai Ujian untuk Peserta", r?.ok, JSON.stringify(r))
    r = await act(p1, T(exam.id), P, "startExam", [exam.id, PREV, form({ token: "ABC12" })])
    check("Peserta: mulai ujian baru ditolak + info di Ujian Saya", r?.ok === false && /dinonaktifkan/.test(r.error) && (await html(p1, "/ujian")).includes("Memulai ujian baru sedang dinonaktifkan"), JSON.stringify(r))

    r = await act(sa, "/admin/fitur", F, "resetFeature", ["bank-soal.impor"])
    check("Reset ke bawaan → Dosen bisa impor lagi", r?.ok && (await html(rina, "/bank-soal/impor")).includes(IMPOR_PAGE), JSON.stringify(r))
    check("Perubahan fitur tercatat di log audit", (await one(`select count(*)::int n from audit_logs where action in ('FEATURE_TOGGLED','FEATURE_RESET')`)).n - auditBefore === 4)

    // ---------- Tampilan situs: tema, teks, logo (Super Admin) ----------
    // Dilewati bila sudah ada pengaturan tampilan sungguhan, agar tidak tertimpa.
    const siteInUse = (await one(`select (select count(*) from site_settings) + (select count(*) from content_texts) + (select count(*) from brand_assets) n`)).n > 0
    if (siteInUse) console.log("SKIP  Tampilan situs: sudah ada pengaturan tampilan — uji dilewati")
    else {
      siteTouched = true
      r = await act(admin, "/admin/situs", S, "saveTheme", [{ light: { primary: "#0f766e" }, dark: {} }])
      check("Admin memanggil aksi tema langsung → ditolak", r?.ok !== true && !(await one(`select 1 from site_settings`)), JSON.stringify(r))
      r = await act(sa, "/admin/situs", S, "saveTheme", [{ light: { primary: "red}body{display:none" }, dark: {} }])
      check("Warna berisi CSS injection → ditolak", r?.ok === false, JSON.stringify(r))
      r = await act(sa, "/admin/situs", S, "saveTheme", [{ light: { primary: "#0F766E" }, dark: { background: "#0b1120" } }])
      let login = await html(null, "/login")
      check("Simpan tema → halaman masuk (statis) langsung memakai warna baru", r?.ok && login.includes('id="site-theme"') && login.includes("--primary:#0f766e") && login.includes(":root.dark{--background:#0b1120"), JSON.stringify(r))
      check("Tema juga tampil di halaman aplikasi", (await html(p1, "/dashboard")).includes("--primary:#0f766e"))

      r = await act(sa, "/admin/situs", S, "saveTexts", [{ "dashboard.staff.toGrade": "Ada {jumlah} esai" }])
      check("Teks dengan placeholder tak dikenal → ditolak per field", r?.ok === false && !!r.fieldErrors?.["dashboard.staff.toGrade"], JSON.stringify(r))
      r = await act(sa, "/admin/situs", S, "saveTexts", [{ "app.name": "UjianKu", "login.title": "Halo, peserta!", "login.cta": "Masuk" }])
      login = await html(null, "/login")
      check("Simpan teks → judul tab, nama, dan judul form berubah; teks = bawaan tidak disimpan", r?.ok && login.includes("<title>Masuk · UjianKu</title>") && login.includes("Halo, peserta!") && (await one(`select count(*)::int n from content_texts`)).n === 2, JSON.stringify(r))
      const version = async () => (await (await fetch(BASE + "/api/site/version")).json()).version
      const v1 = await version()
      check("Versi situs stabil selama tidak ada perubahan", typeof v1 === "string" && (await version()) === v1)
      r = await act(sa, "/admin/situs", S, "saveTexts", [{ "app.name": "UjianKu", "login.title": "Halo, peserta!", "nav.bank-soal": "Koleksi Soal" }])
      check("Simpan pengaturan → versi situs berubah (tab terbuka di-refresh)", r?.ok && (await version()) !== v1, JSON.stringify(r))
      const rinaDash = await html(rina, "/dashboard")
      check("Label menu ubahan tampil di sidebar staf", rinaDash.includes(">Koleksi Soal<") && !rinaDash.includes(">Bank Soal<"))

      const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64")
      r = await act(sa, "/admin/situs", S, "uploadBrandAsset", ["LOGO_LIGHT", PREV, form({ file: new File(['<svg onload="alert(1)"/>'], "logo.png", { type: "image/png" }) })])
      check("SVG yang menyamar sebagai .png → ditolak (cek isi berkas)", r?.ok === false && !!r.fieldErrors?.file, JSON.stringify(r))
      r = await act(sa, "/admin/situs", S, "uploadBrandAsset", ["LOGO_LIGHT", PREV, form({ file: new File([png], "logo.png", { type: "image/png" }) })])
      const r2 = await act(sa, "/admin/situs", S, "uploadBrandAsset", ["FAVICON", PREV, form({ file: new File([png], "favicon.png", { type: "image/png" }) })])
      login = await html(null, "/login")
      const logoUrl = login.match(/\/branding\/logo-light\?v=[0-9a-f]+/)?.[0]
      check("Unggah logo & favicon → tampil di halaman masuk", r?.ok && r2?.ok && !!logoUrl && /rel="icon" href="\/branding\/favicon\?v=/.test(login), JSON.stringify([r, r2]))
      const asset = await fetch(BASE + logoUrl)
      check("Aset logo: publik, image/png, cache immutable, CSP sandbox", asset.status === 200 && asset.headers.get("content-type") === "image/png" && /immutable/.test(asset.headers.get("cache-control")) && /sandbox/.test(asset.headers.get("content-security-policy")) && Buffer.from(await asset.arrayBuffer()).equals(png))

      r = await act(sa, "/admin/situs", S, "resetTheme", [])
      await act(sa, "/admin/situs", S, "deleteBrandAsset", ["LOGO_LIGHT"])
      await act(sa, "/admin/situs", S, "deleteBrandAsset", ["FAVICON"])
      await act(sa, "/admin/situs", S, "saveTexts", [{ "app.name": "", "login.title": "", "nav.bank-soal": "" }])
      login = await html(null, "/login")
      check("Kembalikan bawaan → tanpa CSS tema, logo/teks bawaan", r?.ok && !login.includes('id="site-theme"') && !login.includes("/branding/") && login.includes("<title>Masuk · SmartTest</title>"))
      siteTouched = false
    }
  } finally {
    if (siteTouched) {
      await act(sa, "/admin/situs", S, "resetTheme", [])
      for (const kind of ["LOGO_LIGHT", "LOGO_DARK", "FAVICON"]) await act(sa, "/admin/situs", S, "deleteBrandAsset", [kind])
      await act(sa, "/admin/situs", S, "saveTexts", [Object.fromEntries((await all(`select key from content_texts`)).map((x) => [x.key, ""]))])
    }
    if (savedFeatures) {
      for (const key of ["bank-soal.impor", "admin.kelompok", "ujian.mulai"]) await act(sa, "/admin/fitur", F, "resetFeature", [key])
      for (const a of savedFeatures.access) await act(sa, "/admin/fitur", F, "setFeatureRole", [a.featureKey, a.role, a.enabled])
      for (const f of savedFeatures.features) if (!f.enabled) await act(sa, "/admin/fitur", F, "setFeatureGlobal", [f.key, false])
    }
    await pg.query(`delete from groups where name like 'E2E%'`)
    await pg.query(`delete from exams where title like 'E2E%'`)
    await pg.query(`delete from questions where prompt like 'E2E%'`)
    await pg.query(`delete from group_members where "groupId"=$1 and "userId"=(select id from users where username='2401005')`, [ifa.id])
    await pg.query(`delete from users where email like 'e2e.%'`)
    await pg.end()
  }
  console.log(`\n${pass} lulus, ${fail} gagal`)
  if (fail) process.exit(1)
})()
