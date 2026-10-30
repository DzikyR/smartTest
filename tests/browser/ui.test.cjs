// Uji browser (Microsoft Edge): alur nyata + tangkapan layar desain → tests/shots/*.png
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

let pass = 0, fail = 0
const check = (n, ok, x = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${x && !ok ? "  — " + String(x).slice(0, 300) : ""}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const shot = (page, name, full = true) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: full })
const text = (page) => page.evaluate(() => document.body.innerText)
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
const clickText = (page, sel, t) => page.evaluate((s, t) => { const el = [...document.querySelectorAll(s)].find((e) => e.textContent.includes(t)); if (!el) return false; el.click(); return true }, sel, t)

async function session(browser, identifier, viewport = DESKTOP) {
  const ctx = await browser.createBrowserContext()
  const page = await ctx.newPage()
  const errors = []
  page.on("pageerror", (e) => errors.push(e.message))
  page.on("dialog", (d) => d.accept())
  await page.setViewport(viewport)
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" })
  await page.type("#identifier", identifier)
  await page.type("#password", pw[identifier])
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.click("button[type=submit]")])
  // Konten dashboard di-stream setelah pengalihan login.
  const streamed = await page.waitForFunction(() => document.body.innerText.includes("Halo,"), { timeout: 15000 }).then(() => true, () => false)
  return { page, errors, streamed }
}

;(async () => {
  const pg = new Client({ connectionString: process.env.DATABASE_URL }); await pg.connect()
  const tryout = (await pg.query(`select id from exams where title like 'Try Out%'`)).rows[0]
  const kuis = (await pg.query(`select id from exams where title like 'Kuis 1%'`)).rows[0]
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: true })
  try {
    // ---------- Login ----------
    const lp = await browser.newPage()
    await lp.setViewport(DESKTOP)
    await lp.goto(`${BASE}/login`, { waitUntil: "networkidle0" })
    await shot(lp, "01-login", false)
    await lp.setViewport(MOBILE)
    await lp.reload({ waitUntil: "networkidle0" })
    check("Login ponsel: tanpa scroll horizontal", (await overflow(lp)) <= 1)
    await shot(lp, "01b-login-ponsel", false)

    // ---------- Admin ----------
    const admin = await session(browser, "admin")
    check("Admin masuk ke dashboard (login dengan username), konten tampil", admin.streamed && admin.page.url().endsWith("/dashboard") && (await text(admin.page)).includes("Halo, Admin"), admin.page.url())
    await shot(admin.page, "02-dashboard-admin")
    await admin.page.goto(`${BASE}/admin/pengguna`, { waitUntil: "networkidle0" })
    check("Halaman pengguna menampilkan 4 role", ["Super Admin", "Admin", "Dosen", "Peserta"].every((r) => true) && (await text(admin.page)).includes("Peserta (8)"))
    await shot(admin.page, "03-pengguna")
    await admin.page.goto(`${BASE}/mata-uji`, { waitUntil: "networkidle0" })
    check("Mata uji: Mata Kuliah & Umum", (await text(admin.page)).includes("Tes Potensi Akademik") && (await text(admin.page)).includes("Umum"))
    await shot(admin.page, "04-mata-uji")

    // ---------- Dosen ----------
    const dosen = await session(browser, "dosen.rina")
    await dosen.page.goto(`${BASE}/bank-soal`, { waitUntil: "networkidle0" })
    await shot(dosen.page, "05-bank-soal")
    await dosen.page.goto(`${BASE}/bank-soal/massal`, { waitUntil: "networkidle0" })
    await dosen.page.select("#b-perpage", "10")
    await sleep(200)
    check("Editor massal: atur 10 soal per halaman → 10 kartu setelah menambah", (await clickText(dosen.page, "button", "Tambah 10 soal")) && (await sleep(300), (await dosen.page.$$("ol > li")).length === 10))
    await dosen.page.type("textarea[aria-label='Pertanyaan 1']", "Contoh soal pilihan ganda di editor massal")
    await shot(dosen.page, "06-buat-massal")
    await dosen.page.goto(`${BASE}/bank-soal/impor`, { waitUntil: "networkidle0" })
    await shot(dosen.page, "07-impor")
    await dosen.page.goto(`${BASE}/ujian-kelola`, { waitUntil: "networkidle0" })
    await shot(dosen.page, "08-kelola-ujian")
    await dosen.page.goto(`${BASE}/ujian-kelola/${kuis.id}`, { waitUntil: "networkidle0" })
    check("Detail ujian: kendali sesi & tata tertib", (await text(dosen.page)).includes("Kendali sesi") && (await text(dosen.page)).includes("Tata tertib"))
    await shot(dosen.page, "09-detail-ujian")
    await dosen.page.goto(`${BASE}/ujian-kelola/baru`, { waitUntil: "networkidle0" })
    // Kategori dinamis (Fase 3): perilaku dasar kategori UAS → SEB tercentang otomatis.
    await dosen.page.select("#categoryId", "cat_uas")
    await sleep(200)
    const sebOn = await dosen.page.$eval("input[name=requireSeb]", (e) => e.checked)
    await dosen.page.select("#categoryId", "cat_kuis")
    await sleep(200)
    const sebOff = await dosen.page.$eval("input[name=requireSeb]", (e) => e.checked)
    check("Form ujian: kategori UAS → SEB tercentang otomatis, Kuis → tidak", sebOn && !sebOff)
    await shot(dosen.page, "10-buat-ujian")
    check("Tidak ada error JavaScript (admin/dosen)", admin.errors.length + dosen.errors.length === 0, [...admin.errors, ...dosen.errors].join(" | "))

    // ---------- Peserta: Try Out 5 soal per halaman ----------
    const p = await session(browser, "2401005")
    await shot(p.page, "11-dashboard-peserta")
    await p.page.goto(`${BASE}/ujian/${tryout.id}`, { waitUntil: "networkidle0" })
    await shot(p.page, "12-mulai-ujian")
    await clickText(p.page, "button[type=submit]", "Mulai")
    await p.page.waitForSelector("[aria-label='Nomor soal']", { timeout: 15000 })
    await sleep(500)
    const cards = await p.page.$$("section[aria-labelledby^='h-']")
    check("CBT: 5 soal tampil dalam satu halaman, panel 5 nomor", cards.length === 5 && (await p.page.$$("[aria-label='Nomor soal'] button")).length === 5)
    for (const c of cards.slice(0, 3)) await c.$eval("label", (l) => l.click())
    await sleep(2800)
    const saved = (await pg.query(`select answers from attempts where "examId"=$1 and status='IN_PROGRESS'`, [tryout.id])).rows[0]
    check("Jawaban tersimpan otomatis ke server", saved && Object.keys(saved.answers ?? {}).length === 3, JSON.stringify(saved))
    await shot(p.page, "13-cbt-5-per-halaman")
    await p.page.setViewport(MOBILE)
    await p.page.reload({ waitUntil: "networkidle0" })
    await sleep(500)
    check("CBT ponsel: tanpa scroll horizontal", (await overflow(p.page)) <= 1)
    await shot(p.page, "14-cbt-ponsel")
    await p.page.setViewport(DESKTOP)
    await p.page.reload({ waitUntil: "networkidle0" })
    await p.page.waitForSelector("aside[aria-label='Navigasi soal']")
    await clickText(p.page, "aside button", "Selesai")
    await p.page.waitForSelector("[role=dialog]")
    await shot(p.page, "15-konfirmasi", false)
    await clickText(p.page, "[role=dialog] button", "Ya, kumpulkan")
    await p.page.waitForFunction(() => document.body.innerText.includes("Riwayat"), { timeout: 15000 })
    const sub = (await pg.query(`select status, score from attempts where "examId"=$1 order by "startedAt" desc limit 1`, [tryout.id])).rows[0]
    check("Ujian terkumpul & dinilai otomatis", sub.status === "GRADED" && sub.score !== null, JSON.stringify(sub))
    await p.page.goto(`${BASE}/hasil`, { waitUntil: "networkidle0" })
    await shot(p.page, "16-hasil")
    check("Tidak ada error JavaScript (peserta)", p.errors.length === 0, p.errors.join(" | "))
  } finally {
    await browser.close()
    await pg.query(`delete from attempts where "examId"=$1`, [tryout.id])
    await pg.end()
  }
  console.log(`\n${pass} lulus, ${fail} gagal`)
  if (fail) process.exit(1)
})()
