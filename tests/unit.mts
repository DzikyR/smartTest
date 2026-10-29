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

console.log(`\n${pass} lulus, ${fail} gagal`)
if (fail) process.exit(1)
