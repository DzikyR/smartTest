// Uji ujung-ke-ujung lewat HTTP (Server Action dipanggil seperti browser).
// Prasyarat: npm run build && npm run db:seed && MAIL_TRANSPORT=file npm start -- -p 3123 (server baru: rate limit login/reset disimpan di memori)
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
async function login(identifier, password = pw[identifier]) {
  const jar = new Jar(); const r1 = await fetch(`${BASE}/api/auth/csrf`); jar.add(r1); const { csrfToken } = await r1.json()
  jar.add(await fetch(`${BASE}/api/auth/callback/credentials`, { method: "POST", redirect: "manual", headers: { cookie: jar.header, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrfToken, identifier, password }) }))
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
const K = "ujian-kelola/actions", B = "bank-soal/actions", P = "(app)/ujian/actions", U = "pengguna/actions", G = "kelompok/actions", F = "fitur/actions", S = "situs/actions", R = "auth/public-actions"

;(async () => {
  const pg = new Client({ connectionString: process.env.DATABASE_URL }); await pg.connect()
  const one = async (q, p = []) => (await pg.query(q, p)).rows[0]
  const all = async (q, p = []) => (await pg.query(q, p)).rows
  const algo = await one(`select id from subjects where code='IF101'`)
  const ifa = await one(`select id from groups where name='IF-1A'`)

  const admin = await login("admin"), rina = await login("dosen.rina"), budi = await login("dosen.budi")
  const p1 = await login("2401001"), p1b = await login("2401001"), p5 = await login("2401005")
  const T = (x) => `/ujian/${x}`
  let r, savedFeatures, sa, siteTouched = false, authBefore

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
    const siteInUse = (await one(`select (select count(*) from site_settings where key <> 'auth') + (select count(*) from content_texts) + (select count(*) from brand_assets) n`)).n > 0
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

    // ---------- Akun: daftar, lupa password, akun massal, hapus massal ----------
    authBefore = (await one(`select value from site_settings where key='auth'`))?.value ?? null
    await act(sa, "/admin/fitur", F, "setAuthSetting", ["registrationOpen", true])
    const sessionOf = async (jar) => (await (await fetch(`${BASE}/api/auth/session`, { headers: { cookie: jar.header } })).json())?.user ?? null
    const NEW = { name: "E2E Pendaftar", email: "e2e.daftar@smarttest.local", password: "Kuat12345abc" }
    let guest = new Jar()
    r = await act(guest, "/daftar", R, "registerAction", [PREV, form({ ...NEW, password: "pendek1", confirm: "pendek1" })])
    check("Daftar: password lemah → ditolak per field", r?.ok === false && !!r.fieldErrors?.password, JSON.stringify(r))
    r = await act(guest, "/daftar", R, "registerAction", [PREV, form({ ...NEW, confirm: NEW.password, website: "http://spam" })])
    check("Daftar: honeypot terisi (bot) → ditolak", r?.ok === false && !(await one(`select 1 from users where email=$1`, [NEW.email])), JSON.stringify(r))
    r = await act(guest, "/daftar", R, "registerAction", [PREV, form({ ...NEW, confirm: NEW.password })])
    const regUser = await one(`select id, role, "mustChangePassword" from users where email=$1`, [NEW.email])
    check("Daftar: akun peserta dibuat & langsung masuk", regUser?.role === "PESERTA" && !regUser.mustChangePassword && (await sessionOf(guest))?.email === NEW.email, JSON.stringify(r))
    r = await act(new Jar(), "/daftar", R, "registerAction", [PREV, form({ ...NEW, confirm: NEW.password })])
    check("Daftar: email sudah terdaftar → ditolak per field", r?.ok === false && !!r.fieldErrors?.email, JSON.stringify(r))
    res = await get(guest, "/daftar")
    check("Sudah masuk membuka /daftar → dialihkan ke dashboard", res.status >= 300 && res.status < 400, res.status)

    r = await act(sa, "/admin/fitur", F, "setAuthSetting", ["registrationOpen", false])
    const closedLogin = await html(null, "/login")
    const rc = await act(new Jar(), "/daftar", R, "registerAction", [PREV, form({ name: "E2E Tutup", email: "e2e.tutup@smarttest.local", password: NEW.password, confirm: NEW.password })])
    check("Pendaftaran ditutup Super Admin → form & aksi ditolak, tautan Daftar hilang", r?.ok && rc?.ok === false && /ditutup/.test(rc.error) && !closedLogin.includes('href="/daftar"') && (await html(null, "/daftar")).includes("sedang ditutup"), JSON.stringify(rc))
    r = await act(admin, "/admin/fitur", F, "setAuthSetting", ["registrationOpen", true])
    check("Admin (bukan Super Admin) mengubah akses publik → ditolak", r?.ok !== true && (await one(`select value from site_settings where key='auth'`))?.value?.registrationOpen === false)
    await act(sa, "/admin/fitur", F, "setAuthSetting", ["registrationOpen", true])
    check("Pendaftaran dibuka lagi → tautan Daftar tampil", (await html(null, "/login")).includes('href="/daftar"'))

    const OUTBOX = `${ROOT}/.mail-outbox`
    const mailTo = async (to, since) => {
      for (let i = 0; i < 30; i++) {
        const files = fs.existsSync(OUTBOX) ? fs.readdirSync(OUTBOX).filter((f) => Number(f.split("-")[0]) >= since).sort().reverse() : []
        for (const f of files) { const m = JSON.parse(fs.readFileSync(`${OUTBOX}/${f}`, "utf8")); if (m.to === to) return m }
        await new Promise((ok) => setTimeout(ok, 100))
      }
      return null
    }
    let since = Date.now()
    const rUnknown = await act(new Jar(), "/lupa-password", R, "requestPasswordReset", [PREV, form({ email: "tidak.ada@smarttest.local" })])
    r = await act(new Jar(), "/lupa-password", R, "requestPasswordReset", [PREV, form({ email: NEW.email.toUpperCase() })])
    check("Lupa password: email terdaftar & tidak terdaftar → pesan identik", r?.ok && rUnknown?.ok && r.message === rUnknown.message, JSON.stringify([r, rUnknown]))
    let mail = await mailTo(NEW.email, since)
    const token = mail?.text.match(/reset-password\?token=([A-Za-z0-9_-]{43})/)?.[1]
    check("Email reset terkirim berisi tautan ber-token (origin dari AUTH_URL)", !!token && mail.text.includes(`${new URL(process.env.AUTH_URL || "http://localhost:3000").origin}/reset-password?token=`) && !(await mailTo("tidak.ada@smarttest.local", since)), mail?.text)
    check("Token disimpan sebagai hash, bukan token asli", !(await one(`select 1 from password_reset_tokens where "tokenHash"=$1`, [token])) && !!(await one(`select 1 from password_reset_tokens where "userId"=$1 and "usedAt" is null`, [regUser.id])))
    check("Halaman reset: token salah → ditolak, token benar → form untuk email itu", (await html(null, "/reset-password?token=" + "x".repeat(43))).includes("tidak valid") && (await html(null, `/reset-password?token=${token}`)).includes(NEW.email))
    r = await act(new Jar(), "/reset-password", R, "resetPasswordWithToken", [token, PREV, form({ password: "lemah", confirm: "lemah" })])
    check("Reset: password lemah → ditolak, token belum terpakai", r?.ok === false && !!r.fieldErrors?.password && !!(await one(`select 1 from password_reset_tokens where "userId"=$1 and "usedAt" is null`, [regUser.id])), JSON.stringify(r))
    const NEW_PW = "BaruSekali2026x"
    await act(new Jar(), "/reset-password", R, "resetPasswordWithToken", [token, PREV, form({ password: NEW_PW, confirm: NEW_PW })])
    check("Reset berhasil → password baru bisa dipakai, password lama tidak", !!(await sessionOf(await login(NEW.email, NEW_PW))) && !(await sessionOf(await login(NEW.email, NEW.password))))
    check("Reset mencabut sesi lama di perangkat lain", !(await html(guest, "/profil")).includes(NEW.email))
    r = await act(new Jar(), "/reset-password", R, "resetPasswordWithToken", [token, PREV, form({ password: "LagiLagi2026xyz", confirm: "LagiLagi2026xyz" })])
    check("Token yang sudah dipakai → ditolak", r?.ok === false && /tidak valid|kedaluwarsa|dipakai/.test(r.error), JSON.stringify(r))
    since = Date.now()
    await act(new Jar(), "/lupa-password", R, "requestPasswordReset", [PREV, form({ email: NEW.email })])
    const token2 = (await mailTo(NEW.email, since))?.text.match(/token=([A-Za-z0-9_-]{43})/)?.[1]
    await pg.query(`update password_reset_tokens set "expiresAt" = now() - interval '1 day' where "userId"=$1 and "usedAt" is null`, [regUser.id])
    r = await act(new Jar(), "/reset-password", R, "resetPasswordWithToken", [token2, PREV, form({ password: "LagiLagi2026xyz", confirm: "LagiLagi2026xyz" })])
    check("Token kedaluwarsa (lewat 30 menit) → ditolak", !!token2 && r?.ok === false, JSON.stringify(r))

    const GEN = { count: 3, prefix: "e2egen", start: 7, namePrefix: "E2E Gen", domain: "e2e.test", role: "PESERTA" }
    r = await act(admin, "/admin/pengguna", U, "generateAccounts", [PREV, form(GEN)])
    check("Admin (bukan Super Admin) buat akun massal → ditolak", r?.ok !== true && !(await one(`select 1 from users where username like 'e2egen%'`)), JSON.stringify(r))
    r = await act(sa, "/admin/pengguna", U, "generateAccounts", [PREV, form({ ...GEN, count: 301 })])
    check("Akun massal di atas batas 300 → ditolak", r?.ok === false && !!r.fieldErrors?.count, JSON.stringify(r))
    r = await act(sa, "/admin/pengguna", U, "generateAccounts", [PREV, form(GEN)])
    const gen = r?.data?.accounts ?? []
    check("Super Admin buat 3 akun berurutan dengan password acak", r?.ok && gen.map((a) => a.username).join() === "e2egen007,e2egen008,e2egen009" && gen[0].email === "e2egen007@e2e.test" && new Set(gen.map((a) => a.password)).size === 3, JSON.stringify(r))
    const genUser = await one(`select "mustChangePassword" from users where username='e2egen008'`)
    check("Akun massal bisa login & wajib ganti password", genUser?.mustChangePassword === true && (await sessionOf(await login("e2egen008", gen[1].password)))?.email === "e2egen008@e2e.test")
    r = await act(sa, "/admin/pengguna", U, "generateAccounts", [PREV, form({ ...GEN, start: 9 })])
    check("Bentrok username yang sudah ada → seluruh batch dibatalkan", r?.ok === false && !!r.fieldErrors?.prefix && (await one(`select count(*)::int n from users where username like 'e2egen%'`)).n === 3, JSON.stringify(r))

    const saUser = await one(`select id from users where username='superadmin'`)
    const p1User = await one(`select id from users where username='2401001'`)
    r = await act(admin, "/admin/pengguna", U, "previewDeleteUsers", [{ all: true, q: "e2egen" }])
    check("Admin (bukan Super Admin) hapus massal → ditolak", r?.ok !== true, JSON.stringify(r))
    r = await act(sa, "/admin/pengguna", U, "previewDeleteUsers", [{ ids: [saUser.id] }])
    check("Super Admin memilih akunnya sendiri → tidak bisa dihapus", r?.ok === false && /sendiri/.test(r.error), JSON.stringify(r))
    r = await act(sa, "/admin/pengguna", U, "previewDeleteUsers", [{ ids: [p1User.id, saUser.id] }])
    check("Pratinjau hapus: hasil ujian yang ikut terhapus terhitung, akun sendiri dikecualikan", r?.ok && r.data.count === 1 && r.data.results > 0 && r.data.selfExcluded, JSON.stringify(r))
    r = await act(sa, "/admin/pengguna", U, "previewDeleteUsers", [{ all: true, q: "e2egen" }])
    check("Pratinjau 'semua hasil filter' = 3 akun", r?.ok && r.data.count === 3 && r.data.results === 0, JSON.stringify(r))
    r = await act(sa, "/admin/pengguna", U, "deleteUsers", [{ all: true, q: "e2egen" }, 2])
    check("Jumlah berbeda dari pratinjau → tidak ada yang dihapus", r?.ok === false && (await one(`select count(*)::int n from users where username like 'e2egen%'`)).n === 3, JSON.stringify(r))
    r = await act(sa, "/admin/pengguna", U, "deleteUsers", [{ all: true, q: "e2egen" }, 3])
    check("Hapus semua hasil filter → 3 akun terhapus & tercatat CRITICAL", r?.ok && (await one(`select count(*)::int n from users where username like 'e2egen%'`)).n === 0 && !!(await one(`select 1 from audit_logs where action='USERS_DELETED' and severity='CRITICAL' and metadata->>'count'='3'`)), JSON.stringify(r))
    check("Label role DOSEN tampil sebagai 'Pengajar'", (await html(admin, "/admin/pengguna?role=dosen")).includes("Pengajar ("))
    // ---------- Fase 2: Kelas & Class Code ----------
    const KL = "kelas/actions"
    const join = (jar, code) => act(jar, "/kelas", KL, "joinClassAction", [code])
    const codeOf = async (groupId) => (await one(`select code from access_codes where "groupId"=$1 and status <> 'REVOKED' order by "createdAt" desc limit 1`, [groupId]))?.code
    const memberOf = async (groupId, username) => (await one(`select m.status, m."blockRejoin" from group_members m join users u on u.id=m."userId" where m."groupId"=$1 and u.username=$2`, [groupId, username])) ?? null
    const CLS = { name: "E2E Kelas Algoritma", subjectId: algo.id, term: "2026/2027 Ganjil", joinPolicy: "AUTO", requireStudentId: "on" }

    r = await act(p1, "/kelas", KL, "createClass", [PREV, form(CLS)])
    check("Peserta membuat kelas → ditolak", r?.ok !== true && !(await one(`select 1 from groups where name=$1`, [CLS.name])), JSON.stringify(r))
    r = await act(rina, "/kelas", KL, "createClass", [PREV, form(CLS)])
    const cls = await one(`select id, "ownerId" from groups where name=$1`, [CLS.name])
    const rinaId = (await one(`select id from users where username='dosen.rina'`)).id
    let code = await codeOf(cls?.id)
    check("Pengajar membuat kelas → kode 7 karakter otomatis (tanpa 0/O/1/I/L)", r?.ok && cls?.ownerId === rinaId && /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{7}$/.test(code ?? "") && r.data?.href === `/kelas/${cls.id}?tab=pengaturan`, JSON.stringify(r))
    check("Nama kelas bentrok → ditolak per field", (await act(rina, "/kelas", KL, "createClass", [PREV, form(CLS)]))?.fieldErrors?.name !== undefined)
    check("Pengajar lain (IDOR): halaman & aksi kelas orang lain → tidak ditemukan", !(await html(budi, `/kelas/${cls.id}`)).includes(CLS.name) && (await act(budi, `/kelas/${cls.id}`, KL, "rotateClassCode", [cls.id]))?.ok === false && (await codeOf(cls.id)) === code)

    const fmt = `${code.slice(0, 3)}-${code.slice(3)}`.toLowerCase()
    r = await join(p1, ` ${fmt} `)
    check("Peserta gabung dengan kode huruf kecil + strip + spasi → masuk kelas", r?.ok && r.status === "ACTIVE" && !r.already && r.href === `/kelas/${cls.id}` && (await memberOf(cls.id, "2401001"))?.status === "ACTIVE", JSON.stringify(r))
    r = await join(p1, code)
    check("Gabung ulang → idempoten (already), kuota tidak bertambah", r?.ok && r.already && (await one(`select "usesCount" from access_codes where code=$1`, [code])).usesCount === 1, JSON.stringify(r))
    check("Anggota melihat kelas; bukan anggota → tidak ditemukan", (await html(p1, `/kelas/${cls.id}`)).includes(CLS.name) && !(await html(p5, `/kelas/${cls.id}`)).includes(CLS.name))
    const rInvalid = await join(p5, "ZZZZZZZ"), rFormat = await join(p5, "' OR 1=1--")
    check("Kode tidak ada / format berbahaya → INVALID (tanpa bocor detail)", rInvalid?.error === "INVALID" && rFormat?.error === "INVALID" && rInvalid.message === rFormat.message, JSON.stringify([rInvalid, rFormat]))
    check("Pengajar memakai kode kelas → ROLE", (await join(rina, code))?.error === "ROLE")

    const nimUser = await login(NEW.email, NEW_PW)
    r = await join(nimUser, code)
    check("Akun tanpa NIM → PROFILE_INCOMPLETE, belum terdaftar", r?.error === "PROFILE_INCOMPLETE" && r.missing?.includes("studentId") && !(await one(`select 1 from group_members where "groupId"=$1 and "userId"=$2`, [cls.id, regUser.id])), JSON.stringify(r))
    r = await act(nimUser, "/kelas", KL, "completeStudentId", ["2401001"])
    check("NIM milik akun lain → ditolak", r?.ok === false && !!r.fieldErrors?.studentId, JSON.stringify(r))
    r = await act(nimUser, "/kelas", KL, "completeStudentId", ["E2ENIM001"])
    const rJoinNim = await join(nimUser, code)
    check("Lengkapi NIM lalu gabung → berhasil; NIM tidak bisa diganti sendiri", r?.ok && rJoinNim?.ok && (await act(nimUser, "/kelas", KL, "completeStudentId", ["e2enim002"]))?.ok === false && (await one(`select username from users where id=$1`, [regUser.id])).username === "e2enim001", JSON.stringify([r, rJoinNim]))

    await pg.query(`insert into exam_groups ("examId", "groupId") values ($1, $2) on conflict do nothing`, [exam.id, cls.id])
    check("Ujian yang ditujukan ke kelas tampil untuk anggota", (await html(nimUser, `/kelas/${cls.id}`)).includes("E2E Kuis Struktur Data") && (await html(nimUser, "/ujian")).includes("E2E Kuis Struktur Data"))
    r = await act(budi, `/kelas/${cls.id}`, KL, "removeMember", [cls.id, regUser.id, false])
    check("IDOR: pengajar lain mengeluarkan anggota kelas ini → ditolak", r?.ok === false && (await memberOf(cls.id, "e2enim001"))?.status === "ACTIVE", JSON.stringify(r))
    r = await act(rina, `/kelas/${cls.id}`, KL, "removeMember", [cls.id, regUser.id, false])
    check("Dikeluarkan → ujian kelas & halaman kelas tidak terlihat lagi", r?.ok && !(await html(nimUser, "/ujian")).includes("E2E Kuis Struktur Data") && !(await html(nimUser, `/kelas/${cls.id}`)).includes(CLS.name), JSON.stringify(r))
    check("Dikeluarkan tanpa blokir → boleh gabung lagi", (await join(nimUser, code))?.ok === true && (await memberOf(cls.id, "e2enim001"))?.status === "ACTIVE")
    await act(rina, `/kelas/${cls.id}`, KL, "removeMember", [cls.id, regUser.id, true])
    r = await join(nimUser, code)
    check("Dikeluarkan + diblokir → tidak bisa gabung lagi", r?.error === "REMOVED", JSON.stringify(r))
    r = await act(rina, `/kelas/${cls.id}`, KL, "restoreMember", [cls.id, regUser.id])
    check("Pulihkan anggota → aktif lagi & blokir dicabut", r?.ok && (await memberOf(cls.id, "e2enim001"))?.status === "ACTIVE" && (await memberOf(cls.id, "e2enim001"))?.blockRejoin === false, JSON.stringify(r))

    const oldCode = code
    r = await act(rina, `/kelas/${cls.id}`, KL, "rotateClassCode", [cls.id])
    code = await codeOf(cls.id)
    const rOldCode = await join(p5, oldCode)
    check("Ganti kode (bocor): kode lama → INVALID (pesan sama seperti kode tak ada), anggota lama tetap", r?.ok && code !== oldCode && rOldCode?.error === "INVALID" && rOldCode.message === rInvalid.message && (await memberOf(cls.id, "2401001"))?.status === "ACTIVE", JSON.stringify(rOldCode))
    await act(rina, `/kelas/${cls.id}`, KL, "setClassCodeEnabled", [cls.id, false])
    check("Kode dinonaktifkan → DISABLED", (await join(p5, code))?.error === "DISABLED")
    await act(rina, `/kelas/${cls.id}`, KL, "setClassCodeEnabled", [cls.id, true])
    await act(rina, `/kelas/${cls.id}`, KL, "setClassCodeLimits", [cls.id, PREV, form({ expiresAt: "2020-01-01T08:00", maxUses: "" })])
    check("Kode kedaluwarsa → EXPIRED", (await join(p5, code))?.error === "EXPIRED")
    await act(rina, `/kelas/${cls.id}`, KL, "setClassCodeLimits", [cls.id, PREV, form({ expiresAt: "", maxUses: "1" })])
    r = await join(p5, code)
    const p3 = await login("2401007")
    const rFull = await join(p3, code)
    check("Kuota kode 1 → peserta pertama masuk, berikutnya FULL", r?.ok && rFull?.error === "FULL" && !(await memberOf(cls.id, "2401007")), JSON.stringify([r, rFull]))
    await act(rina, `/kelas/${cls.id}`, KL, "setClassCodeLimits", [cls.id, PREV, form({ expiresAt: "", maxUses: "" })])

    r = await act(rina, `/kelas/${cls.id}`, KL, "updateClass", [cls.id, PREV, form({ ...CLS, joinLocked: "on" })])
    check("Kelas dikunci → anggota baru LOCKED, anggota lama tetap bisa membuka", r?.ok && (await join(p3, code))?.error === "LOCKED" && (await join(p1, code))?.already === true, JSON.stringify(r))
    await act(rina, `/kelas/${cls.id}`, KL, "updateClass", [cls.id, PREV, form({ ...CLS, joinPolicy: "APPROVAL" })])
    r = await join(p3, code)
    check("Mode persetujuan → PENDING, belum melihat ujian kelas", r?.ok && r.status === "PENDING" && !(await html(p3, "/ujian")).includes("E2E Kuis Struktur Data") && (await html(p3, `/kelas/${cls.id}`)).includes("Menunggu persetujuan"), JSON.stringify(r))
    r = await act(rina, `/kelas/${cls.id}`, KL, "approveMember", [cls.id, (await one(`select id from users where username='2401007'`)).id])
    check("Pengajar menyetujui → ACTIVE & ujian kelas terlihat", r?.ok && (await memberOf(cls.id, "2401007"))?.status === "ACTIVE" && (await html(p3, "/ujian")).includes("E2E Kuis Struktur Data"), JSON.stringify(r))

    const api = (jar, body, headers = {}) => fetch(`${BASE}/api/v1/join`, { method: "POST", headers: { cookie: jar?.header ?? "", "content-type": "application/json", ...headers }, body: JSON.stringify(body) })
    const a1 = await api(p1, { code }), a2 = await api(null, { code }), a3 = await api(p1, { code }, { origin: "https://jahat.example" }), a4 = await api(p1, { code: "ZZZZZZZ" })
    check("API /api/v1/join: 200 (already) · 401 tanpa login · 403 origin asing · 404 kode salah", a1.status === 200 && (await a1.json()).already === true && a2.status === 401 && a3.status === 403 && a4.status === 404, [a1.status, a2.status, a3.status, a4.status].join())

    await act(sa, "/admin/fitur", F, "setFeatureRole", ["kelas.gabung", "PESERTA", false])
    check("Fitur 'Bergabung dengan Kode Kelas' dimatikan → FEATURE", (await join(p5, code))?.error === "FEATURE")
    await act(sa, "/admin/fitur", F, "resetFeature", ["kelas.gabung"])
    await act(rina, `/kelas/${cls.id}`, KL, "setClassArchived", [cls.id, true])
    check("Kelas diarsipkan → kode menolak anggota baru", /diarsipkan/.test((await join(await login("2401002"), code))?.message ?? ""))
    check("Rekap ujian tetap memuat anggota yang sudah mengerjakan walau kelasnya diarsipkan", (await html(rina, `/ujian-kelola/${exam.id}?tab=peserta`)).includes("Andi Pratama"))
  } finally {
    if (authBefore !== undefined) {
      await act(sa, "/admin/fitur", F, "resetFeature", ["kelas.gabung"])
      await act(sa, "/admin/fitur", F, "setAuthSetting", ["registrationOpen", authBefore?.registrationOpen ?? true])
      if (!authBefore) await pg.query(`delete from site_settings where key='auth'`) // nilai = bawaan, cache tetap konsisten
    }
    await pg.query(`delete from users where username like 'e2egen%'`)
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
