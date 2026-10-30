// Unit test fungsi murni SmartTest: impor teks/Word, validasi baris Excel, pengacakan,
// pengamanan (IP/SEB), tata tertib. Jalankan: npm run test:unit
const src = (p: string) => new URL(`../src/lib/${p}`, import.meta.url).href
const { parseQuestionImport, splitQuestionBlocks, parseDifficulty } = await import(src("exam/import.ts"))
const { buildQuestion, revalidateImported, normalizeType } = await import(src("exam/question-build.ts"))
const { buildLayout, applyLayout } = await import(src("exam/layout.ts"))
const { ipAllowed, parseIpList, sebKeyHash, sebHashValid } = await import(src("exam/security.ts"))
const { examRules, parseCustomRules, customRulesError } = await import(src("exam/rules.ts"))
const { autoGradeQuiz, quizPercent } = await import(src("exam/grading.ts"))

let pass = 0, fail = 0
const check = (n: string, ok: boolean, x: unknown = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${!ok ? "  — " + JSON.stringify(x) : ""}`) }

// ---- Impor teks: mode bernomor (Word) & campuran ----
const word = "Templat Soal SmartTest\n\nPetunjuk: hapus bagian ini\n\n1. Ibukota Indonesia adalah ...\n\nA. Bandung\n\n*B. Jakarta\n\nC. Surabaya\n\nKesulitan: Mudah\n\n2. Jelaskan konsep rekursi\n\ndengan contoh singkat.\n\nPoin: 10\n\n3. Python case-sensitive.\n\nKunci: Benar"
let r = parseQuestionImport(word)
check("Word (tiap paragraf dipisah baris kosong): 3 soal, judul/petunjuk diabaikan", r.questions.length === 3 && r.errors.length === 0, r)
check("Word: PG kunci B & kesulitan Mudah", r.questions[0].answerKey.optionId === "b" && r.questions[0].difficulty === 1, r.questions[0])
check("Word: esai dua paragraf tetap satu soal, poin 10", r.questions[1].type === "ESSAY" && r.questions[1].prompt.includes("contoh singkat") && r.questions[1].points === 10, r.questions[1])
const mixed = "1. Soal bernomor satu?\nA. ya\n*B. tidak\n\nSoal tanpa nomor ini benar.\nKunci: Salah\n\n2. Soal nomor dua apa?\nKunci: x | y"
r = parseQuestionImport(mixed)
check("Campuran bernomor & tanpa nomor: 3 soal terpisah", r.questions.length === 3 && r.questions.map((q: { type: string }) => q.type).join() === "MULTIPLE_CHOICE,TRUE_FALSE,SHORT_ANSWER", r)
check("Tanpa nomor sama sekali: dipisah baris kosong", splitQuestionBlocks("Soal satu?\nA. a\n*B. b\n\nSoal dua?\nKunci: Benar").length === 2)
check("Kesulitan tidak dikenal → error", parseQuestionImport("Soal apa ini ya?\nKesulitan: ekstrem").errors.length === 1)
check("parseDifficulty: teks/angka/kosong", parseDifficulty("Sulit") === 3 && parseDifficulty("1") === 1 && parseDifficulty("") === 2 && parseDifficulty("??") === null)

// ---- Validasi baris Excel / editor massal ----
const ok1 = buildQuestion({ type: "PG", prompt: "Ibukota Indonesia?", options: ["Bandung", "", "Jakarta"], key: "C", points: "2", topic: "Umum", difficulty: "Mudah" })
check("PG dengan pilihan B kosong: id dipadatkan, kunci tetap menunjuk 'Jakarta'", ok1.question?.options.length === 2 && ok1.question.options[1].text === "Jakarta" && ok1.question.answerKey.optionId === "b" && ok1.question.points === 2, ok1)
check("PG kunci menunjuk pilihan kosong → error", !!buildQuestion({ type: "PG", prompt: "Ibukota Indonesia?", options: ["A", "", "C"], key: "B" }).error)
check("Jenis tidak dikenal → error", !!buildQuestion({ type: "Matching", prompt: "Pasangkan berikut ini" }).error)
check("Alias jenis: 'Pilihan Ganda', 'b/s', 'uraian'", normalizeType("Pilihan Ganda") === "MULTIPLE_CHOICE" && normalizeType("b/s") === "TRUE_FALSE" && normalizeType("Uraian") === "ESSAY")
check("BS kunci 'salah' / Isian 'a | b' / Esai", buildQuestion({ type: "BS", prompt: "Bumi itu datar.", key: "salah" }).question?.answerKey.value === false && buildQuestion({ type: "Isian", prompt: "Kata kunci fungsi?", key: "def | define" }).question?.answerKey.accepted.length === 2 && buildQuestion({ type: "Esai", prompt: "Jelaskan rekursi!" }).question?.type === "ESSAY")
check("Poin di luar 0,5–100 → error", !!buildQuestion({ type: "Esai", prompt: "Jelaskan rekursi!", points: 500 }).error)
check("Poin desimal berkoma '2,5'", buildQuestion({ type: "Esai", prompt: "Jelaskan rekursi!", points: "2,5" }).question?.points === 2.5)

// ---- Validasi ulang data pratinjau dari klien ----
check("Revalidasi: data utuh lolos", !!revalidateImported(ok1.question).question)
check("Revalidasi: kunci dimanipulasi ke pilihan yang tidak ada → ditolak", !!revalidateImported({ ...ok1.question, answerKey: { optionId: "z" } }).error)
check("Revalidasi: jenis palsu → ditolak", !!revalidateImported({ type: "HACK", prompt: "xxxxxx" }).error)
check("Revalidasi: poin dimanipulasi 9999 → ditolak", !!revalidateImported({ ...ok1.question, points: 9999 }).error)

// ---- Koreksi & pengacakan ----
const qs = [
  { id: "a", type: "MULTIPLE_CHOICE", points: 2, answerKey: { optionId: "b" } },
  { id: "b", type: "TRUE_FALSE", points: 1, answerKey: { value: false } },
  { id: "c", type: "ESSAY", points: 5, answerKey: null },
]
const g = autoGradeQuiz(qs, { a: "b", b: "false", c: "esai" })
check("Koreksi otomatis PG+BS, esai menunggu", g.scores.a === 2 && g.scores.b === 1 && g.pendingEssay)
check("Persentase (2+1+4)/8 = 87.5", quizPercent(qs, { a: 2, b: 1, c: 4 }) === 87.5)
let seed = 11
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
const lq = Array.from({ length: 8 }, (_, i) => ({ id: `q${i}`, options: [{ id: "a", text: "A" }, { id: "b", text: "B" }, { id: "c", text: "C" }] }))
const layout = buildLayout(lq, { shuffleQuestions: true, shuffleOptions: true }, rand)
check("Acak: permutasi lengkap & tersimpan", [...layout.questions].sort().join() === lq.map((q) => q.id).join() && applyLayout(lq, layout).map((q: { id: string }) => q.id).join() === layout.questions.join())

// ---- Pengamanan ----
check("IP: CIDR lab /24", ipAllowed("10.1.2.3", "10.1.2.0/24") && !ipAllowed("10.1.3.3", "10.1.2.0/24") && ipAllowed("::ffff:10.1.2.9", "10.1.2.0/24"))
check("IP: daftar tidak valid dilaporkan", parseIpList("1.2.3.4/40, abc").invalid.length === 2)
const KEY = "f".repeat(64), URL1 = "https://ujian.kampus.ac.id/ujian/x1"
check("SEB: hash Config Key cocok / URL lain ditolak", sebHashValid([sebKeyHash(URL1, KEY)], [URL1], [KEY]) && !sebHashValid([sebKeyHash(URL1 + "2", KEY)], [URL1], [KEY]))

// ---- Tata tertib ----
const rules = examRules({ durationMinutes: 90, endAt: null, maxAttempts: 1, token: "X", showScore: false, passingScore: 70, requireFullscreen: true, blockCopyPaste: true, lockDevice: true, maxLeaves: 3, allowedIps: "10.0.0.0/8", requireSeb: true, rules: "1. Kamera menyala\n- Dilarang mencontek", _count: { questions: 40 } })
const text = rules.map((r: { text: string }) => r.text).join(" | ")
check("Aturan otomatis sesuai pengaturan", ["40 soal", "90 menit", "Nilai minimal lulus: 70", "Token", "Safe Exam Browser", "jaringan", "layar penuh", "setelah 3×", "Salin", "perangkat yang sama", "diumumkan"].every((k) => text.includes(k)), text)
check("Aturan tambahan: bullet/nomor dibuang, di akhir", rules.at(-1).source === "author" && rules.at(-1).text === "Dilarang mencontek" && parseCustomRules("  \n• satu").join() === "satu")
check("Aturan > 20 baris → error", !!customRulesError(Array.from({ length: 21 }, () => "x").join("\n")))

// ---- Kontrol fitur (feature toggle) ----
const { resolveFeature, FEATURE_KEYS, FEATURES } = await import(src("features/registry.ts"))
check("Fitur: tanpa override = bawaan (role berhak aktif, role lain ditolak)", resolveFeature("bank-soal.impor", "DOSEN", {}) && !resolveFeature("bank-soal.impor", "PESERTA", {}))
check("Fitur: SUPER_ADMIN selalu lolos walau dimatikan global", resolveFeature("bank-soal.impor", "SUPER_ADMIN", { "bank-soal.impor": { enabled: false, roles: {} } }))
check("Fitur: saklar role mati hanya untuk role itu", !resolveFeature("bank-soal.impor", "DOSEN", { "bank-soal.impor": { enabled: true, roles: { DOSEN: false } } }) && resolveFeature("bank-soal.impor", "ADMIN", { "bank-soal.impor": { enabled: true, roles: { DOSEN: false } } }))
check("Fitur: saklar global mati menimpa saklar role aktif", !resolveFeature("hasil.lihat", "PESERTA", { "hasil.lihat": { enabled: false, roles: { PESERTA: true } } }))
check("Fitur: override tidak bisa menambah akses ke role tak berhak", !resolveFeature("admin.kelompok", "DOSEN", { "admin.kelompok": { enabled: true, roles: { DOSEN: true } } }))
check("Fitur: registry tidak pernah menyebut SUPER_ADMIN", FEATURE_KEYS.every((k: string) => !FEATURES[k].roles.includes("SUPER_ADMIN")))

// ---- Tampilan situs: tema, teks, aset ----
const { parseTheme, themeCss, contrast, pickForeground, contrastWarnings } = await import(src("site/theme.ts"))
const { sniffImage } = await import(src("site/branding.ts"))
const { mergeTexts, fill, textError, DEFAULT_TEXTS } = await import(new URL("../src/content/texts.ts", import.meta.url).href)
check("Tema: data DB rusak/berbahaya → diabaikan (bawaan)", JSON.stringify(parseTheme({ light: { primary: "red}body{display:none" }, dark: {} })) === JSON.stringify({ light: {}, dark: {} }) && Object.keys(parseTheme(null).light).length === 0)
check("Tema: key asing ditolak, hex dinormalisasi huruf kecil", parseTheme({ light: { primary: "#AABBCC", evil: "#000000" }, dark: {} }).light.primary === undefined && parseTheme({ light: { primary: "#AABBCC" }, dark: {} }).light.primary === "#aabbcc")
const css = themeCss({ light: { primary: "#0f766e" }, dark: { background: "#000000" } })
check("Tema: CSS per mode dengan selector (0,2,0), token turunan ikut", css.startsWith(":root:not(.dark){") && css.includes("--ring:#0f766e") && css.includes("--sidebar-primary:#0f766e") && css.includes(":root.dark{--background:#000000;--foreground:"), css)
check("Tema: tanpa override → tidak ada CSS", themeCss({ light: {}, dark: {} }) === "")
check("Kontras: putih/hitam 21:1, warna sama 1:1", Math.round(contrast("#ffffff", "#000000")) === 21 && contrast("#5b4fe9", "#5b4fe9") === 1)
check("Foreground otomatis: primary terang → teks gelap, gelap → putih", pickForeground("#fde047", ["#ffffff", "#15131f"]) === "#15131f" && pickForeground("#1e3a8a", ["#ffffff", "#15131f"]) === "#ffffff")
check("Peringatan kontras untuk warna tengah yang sulit dibaca", contrastWarnings("light", { primary: "#777777" }).length === 1 && contrastWarnings("light", { primary: "#1e3a8a" }).length === 0)
check("Teks: override digabung, key asing & kosong diabaikan", mergeTexts({ "app.name": "UjianKu", "x.y": "z", "login.cta": "  " })["app.name"] === "UjianKu" && mergeTexts({ "login.cta": "  " })["login.cta"] === DEFAULT_TEXTS["login.cta"] && !("x.y" in mergeTexts({ "x.y": "z" })))
check("Teks: placeholder diisi", fill("Ada {n} esai, {x} tetap", { n: 3 }) === "Ada 3 esai, {x} tetap")
check("Teks: validasi panjang, baris, placeholder", !!textError("app.name", "x".repeat(41)) && !!textError("login.cta", "a\nb") && !!textError("dashboard.staff.toGrade", "Ada {jumlah}") && textError("dashboard.staff.toGrade", "Tersisa {n} esai") === null && !!textError("login.title", "Halo {n}"))
check("Aset: format dikenali dari isi berkas, SVG/HTML ditolak", sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) === "image/png" && sniffImage(new TextEncoder().encode("<svg onload=alert(1)>")) === null && sniffImage(new Uint8Array([0, 0, 1, 0, 1])) === "image/x-icon")

// ---- Menu navigasi: label dari CMS ----
type NavOut = { title?: string; items: { href: string; label: string; textKey?: string }[] }[]
const { navFor } = await import(new URL("../src/components/shell/nav.ts", import.meta.url).href)
const pesertaNav: NavOut = navFor("PESERTA", [], { "nav.ujian": "Tes Saya", "nav.section.akun": "" })
const labels = pesertaNav.flatMap((s) => s.items.map((i) => i.label))
check("Menu: label ubahan dipakai, kosong → bawaan, fitur nonaktif → menu hilang", labels.includes("Tes Saya") && !labels.includes("Hasil Ujian") && pesertaNav.some((s) => s.title === "Akun"), labels)
const saItems = (navFor("SUPER_ADMIN", [], {}) as NavOut).flatMap((s) => s.items).filter((i) => ["/admin/fitur", "/admin/situs", "/admin/log"].includes(i.href))
check("Menu: item khusus Super Admin tidak bisa diganti labelnya", saItems.length === 3 && saItems.every((i) => !i.textKey))

// ---- Kode kelas (Class Code) ----
const { normalizeCode, formatCode, sanitizeCodeInput, CODE_ALPHABET } = await import(src("classes/code-format.ts"))
check("Kode: huruf kecil, spasi & strip dinormalisasi", normalizeCode(" k7m-qx2p ") === "K7MQX2P" && normalizeCode("K7M QX2P") === "K7MQX2P")
check("Kode: karakter ambigu (0/O/1/I/L) & panjang salah ditolak sebelum ke DB", [normalizeCode("K7MQX2O"), normalizeCode("K7M0X2P"), normalizeCode("ABC12"), normalizeCode("ABCDEFGHJ"), normalizeCode("ILLEGAL"), normalizeCode(42), normalizeCode("x".repeat(500))].every((v) => v === null))
check("Kode: tanpa karakter ambigu di alfabet (31 karakter)", CODE_ALPHABET.length === 31 && !/[01OIL]/.test(CODE_ALPHABET))
check("Kode: injeksi SQL/HTML ditolak", normalizeCode("' OR 1=1--") === null && normalizeCode("<script>") === null)
check("Kode: tampilan berkelompok & input dibersihkan", formatCode("K7MQX2P") === "K7M-QX2P" && sanitizeCodeInput("k7m-qx2p!@#") === "K7M-QX2P")

// ---- Berkas jawaban Tugas ----
const { sniffSubmission, safeFileName, attachmentHeader } = await import(src("submissions/files.ts"))
const enc = (s: string) => new TextEncoder().encode(s)
const PK = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0])
check("Berkas: PDF/DOCX/PNG dikenali dari isi + ekstensi", sniffSubmission(enc("%PDF-1.7 ..."), "laporan.pdf") === "application/pdf" && sniffSubmission(PK, "tugas.DOCX")?.includes("wordprocessingml") && sniffSubmission(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "a.png") === "image/png")
check("Berkas: HTML/SVG/EXE menyamar sebagai .pdf/.docx ditolak", sniffSubmission(enc("<html><script>alert(1)</script>"), "x.pdf") === null && sniffSubmission(enc("<svg onload=alert(1)>"), "x.png") === null && sniffSubmission(enc("MZ\x90\x00"), "x.docx") === null)
check("Berkas: isi & ekstensi tidak cocok ditolak (PDF bernama .png, ZIP bernama .exe)", sniffSubmission(enc("%PDF-1.4"), "x.png") === null && sniffSubmission(PK, "x.exe") === null)
check("Berkas: nama dibersihkan dari path & karakter berbahaya", safeFileName("../../etc/passwd.pdf") === "passwd.pdf" && safeFileName('C:\\Users\\a\\"tugas"<1>.pdf') === "tugas1.pdf" && safeFileName("..") === "berkas" && safeFileName("x".repeat(300) + ".pdf").length <= 121 && safeFileName("x".repeat(300) + ".pdf").endsWith(".pdf"))
check("Berkas: Content-Disposition attachment aman untuk nama non-ASCII", attachmentHeader('Laporan "akhir" é.pdf') === `attachment; filename="Laporan _akhir_ _.pdf"; filename*=UTF-8''Laporan%20%22akhir%22%20%C3%A9.pdf`)

// ---- Daftar NIM (roster) ----
const { parseRoster } = await import(src("classes/roster.ts"))
const ros = parseRoster("NIM\tNama\n2401001\tAndi Pratama\n2401002, Bunga\n\n2401003;Citra Maharani\n2401001 \nBAD NIM!!\n24A-01.x")
check("Roster: tab/koma/titik koma, baris judul & kosong dilewati, NIM huruf kecil, duplikat digabung", ros.entries.length === 4 && ros.entries[0].studentId === "2401001" && ros.entries.find((e: { studentId: string }) => e.studentId === "2401003")?.name === "Citra Maharani" && ros.entries.some((e: { studentId: string }) => e.studentId === "24a-01.x"), ros)
check("Roster: baris tidak valid dilaporkan", ros.invalid.length === 1 && ros.invalid[0] === "BAD NIM!!", ros.invalid)

check("Peringatan: primary terlalu pucat untuk dipakai sebagai teks (mis. #e3f2fd di mode terang)", contrastWarnings("light", { primary: "#e3f2fd" }).some((w: { label: string }) => w.label.includes("teks")) && !contrastWarnings("light", { primary: "#1e3a8a" }).some((w: { label: string }) => w.label.includes("teks")))

// ---- Login & daftar dengan Google (keputusan murni) ----
const { decideGoogleLogin } = await import(src("auth/google.ts"))
const ON = { googleLogin: true, registrationOpen: true }
const NONE = { byGoogleId: null, byEmail: null }
const gp = { sub: "g-123", email: " Andi@Gmail.com ", email_verified: true, name: "Andi Pratama" }
let gd = decideGoogleLogin(gp, ON, NONE)
check("Google: email belum terdaftar → buat akun (email dinormalisasi, nama dari Google)", gd.action === "create" && gd.email === "andi@gmail.com" && gd.name === "Andi Pratama", gd)
check("Google: tanpa nama → nama dari bagian depan email", decideGoogleLogin({ ...gp, name: "" }, ON, NONE).name === "andi")
check("Google: email belum diverifikasi Google → ditolak (cegah ambil alih akun)", decideGoogleLogin({ ...gp, email_verified: false }, ON, NONE).error === "google_unverified" && decideGoogleLogin({ ...gp, email_verified: undefined }, ON, NONE).error === "google_unverified")
gd = decideGoogleLogin(gp, ON, { byGoogleId: null, byEmail: { id: "u1", isActive: true, googleId: null } })
check("Google: email sudah terdaftar (akun lama) → masuk & ditautkan", gd.action === "login" && gd.userId === "u1" && gd.link === true, gd)
gd = decideGoogleLogin(gp, ON, { byGoogleId: { id: "u1", isActive: true, googleId: "g-123" }, byEmail: null })
check("Google: sudah tertaut → masuk tanpa tautan ulang (walau email Google berubah)", gd.action === "login" && gd.link === false, gd)
check("Google: email sudah tertaut ke akun Google lain → ditolak", decideGoogleLogin(gp, ON, { byGoogleId: null, byEmail: { id: "u1", isActive: true, googleId: "g-LAIN" } }).error === "google_conflict")
check("Google: akun dinonaktifkan → ditolak", decideGoogleLogin(gp, ON, { byGoogleId: null, byEmail: { id: "u1", isActive: false, googleId: null } }).error === "google_inactive")
check("Google: pendaftaran ditutup → akun baru ditolak, akun lama tetap bisa masuk", decideGoogleLogin(gp, { googleLogin: true, registrationOpen: false }, NONE).error === "google_closed" && decideGoogleLogin(gp, { googleLogin: true, registrationOpen: false }, { byGoogleId: null, byEmail: { id: "u1", isActive: true, googleId: null } }).action === "login")
check("Google: dimatikan Super Admin → ditolak", decideGoogleLogin(gp, { googleLogin: false, registrationOpen: true }, NONE).error === "google_disabled")

console.log(`\n${pass} lulus, ${fail} gagal`)
if (fail) process.exit(1)
