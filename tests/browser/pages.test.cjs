// Uji browser halaman baru (Pengelolaan Web, Akun, Kelas): alur nyata + tangkapan layar → tests/shots/p-*.png
// Prasyarat: server di :3123 dengan data seed; sekali: cd tests/browser && npm install
const ROOT = require("node:path").resolve(__dirname, "../..")
const path = require("node:path")
const fs = require("node:fs")
require(`${ROOT}/node_modules/dotenv`).config({ path: `${ROOT}/.env`, quiet: true })
const puppeteer = require("puppeteer-core")
const { Client } = require(`${ROOT}/node_modules/pg`)
const BASE = "http://localhost:3123"
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
const SHOTS = path.join(__dirname, "..", "shots")
fs.mkdirSync(SHOTS, { recursive: true })
const pw = Object.fromEntries(fs.readFileSync(`${ROOT}/.akun-demo.txt`, "utf8").split("\n").slice(2).filter(Boolean).map((l) => l.trim().split(/\s+/).slice(1)))
const DESKTOP = { width: 1440, height: 900, deviceScaleFactor: 1 }
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true }
const CLASS_NAME = "E2E UI Kelas Algoritma"
const TASK_TITLE = "E2E UI Tugas Laporan Praktikum"

let pass = 0, fail = 0
const check = (n, ok, x = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${x && !ok ? "  — " + String(x).slice(0, 300) : ""}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const shot = (page, name, full = true) => page.screenshot({ path: path.join(SHOTS, `p-${name}.png`), fullPage: full })
const text = (page) => page.evaluate(() => document.body.innerText)
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
const clickText = (page, sel, t) => page.evaluate((s, t) => { const el = [...document.querySelectorAll(s)].find((e) => e.textContent.includes(t)); if (!el) return false; el.click(); return true }, sel, t)
const waitText = (page, t, timeout = 10000) => page.waitForFunction((t) => document.body.innerText.includes(t), { timeout }, t).then(() => true, () => false)

async function session(browser, identifier, { viewport = DESKTOP, dark = false } = {}) {
  const ctx = await browser.createBrowserContext()
  const page = await ctx.newPage()
  const errors = []
  page.on("pageerror", (e) => errors.push(e.message))
  if (dark) await page.evaluateOnNewDocument(() => localStorage.setItem("theme", "dark"))
  await page.setViewport(viewport)
  if (identifier) {
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" })
    await page.type("#identifier", identifier)
    await page.type("#password", pw[identifier])
    await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.click("button[type=submit]")])
    await waitText(page, "Halo,", 15000)
  }
  return { page, errors }
}

/** Buka halaman, tunggu teks, potret, dan pastikan tanpa scroll horizontal. */
async function visit(s, url, expect, name, { mobileCheck = s.page.viewport()?.width === MOBILE.width } = {}) {
  await s.page.goto(`${BASE}${url}`, { waitUntil: "networkidle0" })
  const ok = await waitText(s.page, expect)
  await shot(s.page, name)
  check(`${name}: tampil${mobileCheck ? " tanpa scroll horizontal" : ""}`, ok && (!mobileCheck || (await overflow(s.page)) <= 1), ok ? `overflow ${await overflow(s.page)}px` : `teks "${expect}" tidak ditemukan`)
}

/** Hapus tugas uji beserta berkasnya di disk. */
async function cleanTask(pg) {
  for (const f of (await pg.query(`select sf."storageKey" from submission_files sf join attempts a on a.id=sf."attemptId" where a."examId"='e2e_ui_task'`)).rows) fs.rmSync(path.join(ROOT, "uploads", f.storageKey), { force: true })
  await pg.query(`delete from exams where id='e2e_ui_task'`)
}

;(async () => {
  const pg = new Client({ connectionString: process.env.DATABASE_URL }); await pg.connect()
  await cleanTask(pg)
  await pg.query(`delete from groups where name=$1`, [CLASS_NAME])
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: true })
  try {
    // ---------- Tamu: daftar, lupa password, reset ----------
    const guest = await session(browser, null)
    await visit(guest, "/login", "Belum punya akun?", "01-login")
    await visit(guest, "/daftar", "Buat akun", "02-daftar")
    await visit(guest, "/lupa-password", "Kirim tautan reset", "03-lupa-password")
    await visit(guest, `/reset-password?token=${"x".repeat(43)}`, "Minta tautan baru", "04-reset-tidak-valid")
    const guestM = await session(browser, null, { viewport: MOBILE })
    await visit(guestM, "/daftar", "Buat akun", "02b-daftar-ponsel")
    await visit(guestM, "/lupa-password", "Kirim tautan reset", "03b-lupa-ponsel")

    // ---------- Super Admin ----------
    const sa = await session(browser, "superadmin")
    await visit(sa, "/admin/fitur", "Akses publik", "10-kontrol-fitur")
    await visit(sa, "/admin/situs", "Mode gelap", "11-tema")
    await visit(sa, "/admin/situs?tab=branding", "Favicon", "12-branding")
    await visit(sa, "/admin/situs?tab=teks", "Peran Pengguna", "13-teks")
    await visit(sa, "/admin/pengguna", "Pilih semua", "14-pengguna")
    check("Pengguna: kolom centang untuk Super Admin", (await sa.page.$$('input[name="ids"]')).length > 0)
    await clickText(sa.page, "button", "Buat akun massal")
    check("Dialog Buat Akun Massal terbuka dengan pratinjau", await waitText(sa.page, "Akan dibuat:"))
    await shot(sa.page, "15-akun-massal", false)
    const saM = await session(browser, "superadmin", { viewport: MOBILE })
    await visit(saM, "/admin/fitur", "Akses publik", "10b-kontrol-fitur-ponsel")
    await visit(saM, "/admin/situs", "Mode gelap", "11b-tema-ponsel")
    await visit(saM, "/admin/pengguna", "Pilih semua", "14b-pengguna-ponsel")

    // ---------- Pengajar: buat kelas lewat dialog ----------
    const rina = await session(browser, "dosen.rina")
    await visit(rina, "/kelas", "Buat kelas", "20-kelas-pengajar")
    await clickText(rina.page, "button", "Buat kelas")
    await rina.page.waitForSelector('input[name="name"]', { visible: true })
    await shot(rina.page, "21-dialog-buat-kelas", false)
    await rina.page.type('input[name="name"]', CLASS_NAME)
    await rina.page.type('input[name="term"]', "2026/2027 Ganjil")
    await clickText(rina.page, '[role="dialog"] button[type=submit]', "Simpan")
    // Navigasi klien (router.push) → tunggu URL berubah, bukan event navigasi.
    const created = await rina.page
      .waitForFunction(() => location.pathname.startsWith("/kelas/") && location.search.includes("tab=pengaturan"), { timeout: 15000 })
      .then(() => waitText(rina.page, "Salin tautan"), () => false)
    const cls = (await pg.query(`select g.id, c.code from groups g join access_codes c on c."groupId"=g.id and c.status='ACTIVE' where g.name=$1`, [CLASS_NAME])).rows[0]
    check("Buat kelas lewat dialog → diarahkan ke Kode & Pengaturan", created && !!cls && rina.page.url().includes(`/kelas/${cls?.id}`), rina.page.url())
    await shot(rina.page, "22-kode-pengaturan")
    const cta = await rina.page.evaluate(() => [...document.querySelectorAll("a")].filter((a) => a.textContent.includes("Buat ujian")).map((a) => [getComputedStyle(a).color, getComputedStyle(a).backgroundColor]))
    check("Tombol putih di banner: teks tidak sewarna latar (buttonVariants + className)", cta.length > 0 && cta.every(([fg, bg]) => fg !== bg), JSON.stringify(cta))
    await clickText(rina.page, "button", "Tampilkan di layar")
    check("Kode tampil besar untuk proyektor", await waitText(rina.page, "Gabung lewat menu Kelas"))
    await shot(rina.page, "23-kode-layar-penuh", false)

    // ---------- Peserta (IF-1B, mode gelap): gabung lewat dialog ----------
    const stu = await session(browser, "2401007", { dark: true })
    check("Dashboard peserta: tombol Gabung kelas & bagian Kelas Saya", (await text(stu.page)).includes("Kelas Saya") && (await clickText(stu.page, "button", "Gabung")))
    await stu.page.waitForSelector("#class-code", { visible: true })
    await stu.page.type("#class-code", `${cls.code.slice(0, 3)}-${cls.code.slice(3)}`.toLowerCase())
    const typed = await stu.page.$eval("#class-code", (el) => el.value)
    check("Input kode otomatis huruf besar", typed === `${cls.code.slice(0, 3)}-${cls.code.slice(3)}`, typed)
    await shot(stu.page, "30-dialog-gabung-gelap", false)
    await clickText(stu.page, '[role="dialog"] button[type=submit]', "Gabung")
    const joined = await stu.page.waitForFunction((id) => location.pathname === `/kelas/${id}`, { timeout: 15000 }, cls.id).then(() => waitText(stu.page, "Ujian & Tugas"), () => false)
    check("Gabung → masuk halaman kelas", joined, stu.page.url())
    await shot(stu.page, "31-kelas-peserta-gelap")
    await visit(stu, `/kelas/${cls.id}?tab=anggota`, "Teman sekelas", "32-anggota-peserta-gelap")
    const stuM = await session(browser, "2401007", { viewport: MOBILE })
    await visit(stuM, `/kelas/${cls.id}`, CLASS_NAME, "33-kelas-peserta-ponsel")
    await visit(stuM, "/kelas", "Kelas Saya", "34-daftar-kelas-ponsel")

    await visit(rina, `/kelas/${cls.id}?tab=anggota`, "Mahasiswa (1)", "24-anggota-pengajar")
    const rinaM = await session(browser, "dosen.rina", { viewport: MOBILE })
    await visit(rinaM, `/kelas/${cls.id}?tab=pengaturan`, "Kode kelas", "25-pengaturan-ponsel")

    // ---------- Tugas (ASSIGNMENT): unggah berkas → serahkan → halaman penilaian ----------
    const subject = (await pg.query(`select id from subjects where code='IF101'`)).rows[0]
    const task = (
      await pg.query(
        `insert into exams (id, title, kind, "workType", "categoryId", instructions, "durationMinutes", timed, "maxPoints", "maxAttempts", "openToAll", "publishedAt", "dueAt", "endAt", "subjectId", "updatedAt")
         values ('e2e_ui_task', $1, 'LAINNYA', 'ASSIGNMENT', 'cat_tes', 'Unggah laporan praktikum dalam PDF.', 60, false, 20, 1, true, now(), now() + interval '1 day', now() + interval '3 day', $2, now()) returning id`,
        [TASK_TITLE, subject.id]
      )
    ).rows[0]
    const pdf = path.join(SHOTS, "laporan-praktikum.pdf")
    fs.writeFileSync(pdf, "%PDF-1.4\n% E2E UI\n%%EOF\n")
    await visit(stu, `/ujian/${task.id}`, "Tugas Anda", "40-tugas-peserta-gelap")
    await stu.page.type("#assignment-text", "Ringkasan: rekursi memanggil dirinya sendiri sampai kasus dasar.")
    const input = await stu.page.$("#assignment-file")
    await input.uploadFile(pdf)
    check("Unggah berkas lewat browser → tampil di daftar", await waitText(stu.page, "laporan-praktikum.pdf", 15000))
    await shot(stu.page, "41-tugas-draf-gelap")
    await clickText(stu.page, "button", "Serahkan")
    check("Serahkan → status Diserahkan & tombol Batalkan pengiriman", (await waitText(stu.page, "Batalkan pengiriman", 15000)) && (await text(stu.page)).includes("Diserahkan"))
    await shot(stu.page, "42-tugas-diserahkan-gelap")
    const stuM2 = await session(browser, "2401007", { viewport: MOBILE })
    await visit(stuM2, `/ujian/${task.id}`, "Tugas Anda", "43-tugas-ponsel")
    const att = (await pg.query(`select id from attempts where "examId"=$1`, [task.id])).rows[0]
    await visit(rina, `/ujian-kelola/${task.id}/koreksi/${att.id}`, "Penilaian", "26-penilaian-tugas")
    check("Halaman penilaian: jawaban & berkas tampil", (await text(rina.page)).includes("laporan-praktikum.pdf") && (await text(rina.page)).includes("Ringkasan: rekursi"))

    const errors = [guest, guestM, sa, saM, rina, rinaM, stu, stuM, stuM2].flatMap((s) => s.errors)
    check("Tanpa error JavaScript di semua halaman", errors.length === 0, errors.join(" | "))
  } finally {
    await browser.close()
    await cleanTask(pg)
    await pg.query(`delete from groups where name=$1`, [CLASS_NAME])
    await pg.end()
  }
  console.log(`\n${pass} lulus, ${fail} gagal — tangkapan layar di tests/shots/p-*.png`)
  if (fail) process.exit(1)
})()
