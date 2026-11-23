// Uji ujung-ke-ujung API aplikasi mobile (/api/v1/mobile/*) lewat HTTP.
// Prasyarat sama dengan e2e.test.cjs: npm run build && npm run db:seed && npm start -- -p 3123 (server baru).
// Data uji dibuat langsung di database (berawalan "E2E-M") dan dihapus di akhir.
// Kolom waktu Prisma = timestamp tanpa zona berisi UTC → SQL memakai (now() at time zone 'utc'), bukan now().
const ROOT = require("node:path").resolve(__dirname, "..")
const fs = require("node:fs")
const crypto = require("node:crypto")
const zlib = require("node:zlib")
require(`${ROOT}/node_modules/dotenv`).config({ path: `${ROOT}/.env`, quiet: true })
const { Client } = require(`${ROOT}/node_modules/pg`)
const bcrypt = require(`${ROOT}/node_modules/bcryptjs`)
const BASE = process.env.TEST_BASE ?? "http://localhost:3123"
const API = `${BASE}/api/v1/mobile`

const pw = Object.fromEntries(
  fs.readFileSync(`${ROOT}/.akun-demo.txt`, "utf8").split("\n").slice(2).filter(Boolean).map((l) => l.trim().split(/\s+/).slice(1))
)
let pass = 0, fail = 0
const check = (n, ok, x = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${x && !ok ? "  — " + String(typeof x === "string" ? x : JSON.stringify(x)).slice(0, 400) : ""}`) }
const rid = (p) => `${p}${crypto.randomBytes(10).toString("hex")}`

/** Klien satu perangkat: id perangkat rahasia + token. */
function device(name, platform = "android") {
  const dev = { id: `dev-${name}-${crypto.randomBytes(12).toString("hex")}`, platform, access: null, refresh: null }
  dev.call = async (method, path, body, headers = {}) => {
    const res = await fetch(API + path, {
      method,
      headers: {
        "x-device-id": dev.id,
        "x-platform": dev.platform,
        "x-app-version": "1.0.0",
        ...(dev.access ? { authorization: `Bearer ${dev.access}` } : {}),
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    const type = res.headers.get("content-type") ?? ""
    const data = type.includes("json") ? await res.json() : type.includes("octet-stream") ? Buffer.from(await res.arrayBuffer()) : await res.text()
    return { status: res.status, data, headers: res.headers }
  }
  dev.login = async (identifier, password = pw[identifier]) => {
    const r = await dev.call("POST", "/auth/login", { identifier, password })
    if (r.status === 200) { dev.access = r.data.accessToken; dev.refresh = r.data.refreshToken }
    return r
  }
  return dev
}

function openPackage(blob, keyB64) {
  const key = Buffer.from(keyB64, "base64")
  const d = crypto.createDecipheriv("aes-256-gcm", key, blob.subarray(0, 12))
  d.setAuthTag(blob.subarray(blob.length - 16))
  return JSON.parse(zlib.gunzipSync(Buffer.concat([d.update(blob.subarray(12, blob.length - 16)), d.final()])).toString("utf8"))
}

;(async () => {
  const pg = new Client({ connectionString: process.env.DATABASE_URL }); await pg.connect()
  const one = async (q, p = []) => (await pg.query(q, p)).rows[0]
  const algo = await one(`select id from subjects where code='IF101'`)
  const ifa = await one(`select id from groups where name='IF-1A'`)
  const student = await one(`select id from users where username='2401001'`)
  const created = { exams: [], materials: [], users: [] }

  /** Ujian uji: MC (kunci b), BS (true), isian (def). */
  async function makeExam(title, opts = {}) {
    const id = rid("e2em")
    await pg.query(
      `insert into exams (id, title, kind, "durationMinutes", "subjectId", "publishedAt", "updatedAt", token, "lockDevice", "maxLeaves", "requireSeb", "allowMobileApp", "shuffleQuestions", "shuffleOptions")
       values ($1, $2, 'KUIS', 30, $3, (now() at time zone 'utc'), (now() at time zone 'utc'), $4, $5, $6, $7, $8, true, true)`,
      [id, title, algo.id, opts.token ?? null, opts.lockDevice ?? true, opts.maxLeaves ?? null, opts.requireSeb ?? false, opts.allowMobileApp ?? true]
    )
    await pg.query(`insert into exam_groups ("examId", "groupId") values ($1, $2)`, [id, ifa.id])
    const qs = [
      { id: rid("q"), type: "MULTIPLE_CHOICE", prompt: "E2E-M LIFO adalah ...", options: [{ id: "a", text: "Queue" }, { id: "b", text: "Stack" }], key: { optionId: "b" } },
      { id: rid("q"), type: "TRUE_FALSE", prompt: "E2E-M Queue bersifat FIFO.", options: null, key: { value: true } },
      { id: rid("q"), type: "SHORT_ANSWER", prompt: "E2E-M Kata kunci fungsi Python?", options: null, key: { accepted: ["def"] } },
    ]
    for (const [i, q] of qs.entries()) {
      await pg.query(`insert into exam_questions (id, type, prompt, options, "answerKey", points, "order", "examId") values ($1, $2, $3, $4, $5, 1, $6, $7)`, [q.id, q.type, q.prompt, q.options && JSON.stringify(q.options), JSON.stringify(q.key), i + 1, id])
    }
    created.exams.push(id)
    return { id, qs }
  }

  const A = device("A"), B = device("B")
  try {
    // ---------- Konfigurasi & login ----------
    let r = await A.call("GET", "/config")
    check("GET /config publik: jam server & struktur force update", r.status === 200 && typeof r.data.now === "number" && "minVersion" in r.data && r.headers.get("cache-control") === "no-store", r.data)
    r = await fetch(`${API}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ identifier: "2401001", password: pw["2401001"] }) })
    check("Login tanpa X-Device-Id/X-Platform → 400 DEVICE_REQUIRED", r.status === 400 && (await r.json()).error === "DEVICE_REQUIRED")
    r = await A.login("2401001", "salah-sekali")
    check("Login password salah → 401 INVALID_CREDENTIALS", r.status === 401 && r.data.error === "INVALID_CREDENTIALS", r.data)
    r = await A.call("POST", "/auth/login", { identifier: "2401001" })
    check("Login body tidak lengkap → 400 VALIDATION", r.status === 400 && r.data.error === "VALIDATION", r.data)
    r = await A.login("2401001")
    check("Login benar → access + refresh token, profil tanpa hash password", r.status === 200 && !!r.data.accessToken && r.data.refreshToken?.startsWith("rt_") && r.data.expiresIn === 900 && r.data.user.username === "2401001" && !("passwordHash" in r.data.user), r.data)
    check("Login tercatat di audit log & perangkat terdaftar", !!(await one(`select 1 from audit_logs where action='LOGIN_SUCCESS' and "userId"=$1 and "createdAt" > (now() at time zone 'utc') - interval '1 minute'`, [student.id])) && !!(await one(`select 1 from mobile_devices where "userId"=$1 and "deviceId"=$2`, [student.id, A.id])))
    await B.login("2401001")

    r = await A.call("GET", "/me")
    check("GET /me dengan Bearer → profil & kelas", r.status === 200 && r.data.user.id === student.id && r.data.classes.some((c) => c.id === ifa.id), r.data)
    r = await A.call("GET", "/me", undefined, { authorization: "Bearer " + A.access.slice(0, -2) + "xx" })
    check("Access token diubah → 401", r.status === 401 && r.data.error === "UNAUTHENTICATED")
    r = await fetch(`${API}/me`)
    check("Tanpa token → 401", r.status === 401)
    const staff = device("staff")
    await staff.login("dosen.rina")
    r = await staff.call("GET", "/exams")
    check("Dosen membuka endpoint peserta → 403 FORBIDDEN", r.status === 403 && r.data.error === "FORBIDDEN")

    // ---------- Refresh token: rotasi, toleransi respons hilang, deteksi pemakaian ulang ----------
    const R = device("R")
    await R.login("2401002")
    const rt1 = R.refresh
    r = await R.call("POST", "/auth/refresh", { refreshToken: rt1 })
    check("Refresh → token baru (rotasi)", r.status === 200 && r.data.refreshToken !== rt1 && !!r.data.accessToken, r.data)
    const rt2 = r.data.refreshToken
    r = await R.call("POST", "/auth/refresh", { refreshToken: rt1 })
    check("Token lama dipakai lagi < 60 dtk & pengganti belum dipakai (respons hilang) → tetap dilayani", r.status === 200, r.data)
    const rt3 = r.data.refreshToken
    r = await R.call("POST", "/auth/refresh", { refreshToken: rt2 })
    check("Pengganti yang dibatalkan dipakai → 401 (pemakaian ulang)", r.status === 401 && r.data.error === "SESSION_INVALID")
    r = await R.call("POST", "/auth/refresh", { refreshToken: rt3 })
    check("Pemakaian ulang mencabut seluruh family → token terbaru ikut tidak berlaku", r.status === 401)
    check("Pemakaian ulang tercatat CRITICAL di audit log", !!(await one(`select 1 from audit_logs where action='MOBILE_TOKEN_REUSED' and "createdAt" > (now() at time zone 'utc') - interval '1 minute'`)))
    const R2 = device("R2")
    await R2.login("2401002")
    r = await device("pencuri").call("POST", "/auth/refresh", { refreshToken: R2.refresh })
    check("Refresh token dipakai dari perangkat lain → 401 & family dicabut", r.status === 401 && (await R2.call("POST", "/auth/refresh", { refreshToken: R2.refresh })).status === 401)

    // ---------- Ujian: daftar, detail, paket soal ----------
    const ex = await makeExam("E2E-M Kuis Mobile", { token: "MOB1", maxLeaves: 5 })
    r = await A.call("GET", "/exams")
    const listed = r.data.exams?.find((e) => e.id === ex.id)
    check("Daftar ujian memuat ujian kelas peserta, status tersedia di aplikasi", r.status === 200 && listed?.state === "available" && listed.mobile === "ok" && listed.questionCount === 3, listed)
    r = await A.call("GET", `/exams/${ex.id}`)
    check("Detail ujian: perlu token (nilai token tidak dibocorkan), tata tertib, versi paket", r.status === 200 && r.data.exam.needsToken === true && !JSON.stringify(r.data).includes("MOB1") && r.data.exam.rules.length > 0 && !!r.data.package?.version, r.data)
    const version = r.data.package.version
    r = await A.call("GET", `/exams/${ex.id}/package`)
    check("Paket soal terenkripsi (octet-stream, ETag = versi), teks soal tidak terbaca", r.status === 200 && Buffer.isBuffer(r.data) && r.headers.get("etag") === `"${version}"` && !r.data.includes(Buffer.from("LIFO")), r.status)
    const blob = r.data
    r = await A.call("GET", `/exams/${ex.id}/package`, undefined, { "if-none-match": `"${version}"` })
    check("Paket tidak berubah → 304 tanpa unduh ulang", r.status === 304)
    const outsider = device("out")
    await outsider.login("2401005")
    r = await outsider.call("GET", `/exams/${ex.id}/package`)
    check("Peserta kelas lain tidak bisa mengunduh paket → 404", r.status === 404)

    // ---------- Mulai ----------
    r = await A.call("POST", `/exams/${ex.id}/start`, {})
    check("Mulai tanpa token → 400 TOKEN", r.status === 400 && r.data.error === "TOKEN" && !!r.data.fields?.token, r.data)
    r = await A.call("POST", `/exams/${ex.id}/start`, { token: "mob1" })
    check("Mulai dengan token (huruf kecil diterima) → layout, batas waktu, kunci paket", r.status === 200 && r.data.resumed === false && r.data.layout?.questions?.length === 3 && typeof r.data.deadline === "number" && r.data.deadline > Date.now() && !!r.data.package?.key && r.data.seq === 0, r.data)
    const attemptId = r.data.attemptId
    const pkg = openPackage(blob, r.data.package.key)
    check("Kunci membuka paket yang diunduh sebelumnya; tanpa kunci jawaban", pkg.v === version && pkg.questions.length === 3 && pkg.questions.every((q) => ex.qs.some((x) => x.id === q.id)) && !JSON.stringify(pkg).includes("answerKey") && !JSON.stringify(pkg).includes("accepted"), pkg)
    const att = await one(`select client, "deviceTokenHash", layout from attempts where id=$1`, [attemptId])
    check("Percobaan tercatat dari android & terkunci ke perangkat", att.client === "android" && !!att.deviceTokenHash)
    r = await A.call("POST", `/exams/${ex.id}/start`, { token: "MOB1" })
    check("Mulai lagi di perangkat yang sama → dilanjutkan (resumed)", r.status === 200 && r.data.resumed === true && r.data.attemptId === attemptId)
    r = await B.call("POST", `/exams/${ex.id}/start`, { token: "MOB1" })
    check("Mulai dari perangkat lain → 423 OTHER_DEVICE", r.status === 423 && r.data.error === "OTHER_DEVICE", r.data)

    // ---------- Simpan otomatis (delta bernomor urut) ----------
    const [q1, q2, q3] = ex.qs
    r = await A.call("PUT", `/attempts/${attemptId}/answers`, { seq: 1, answers: { [q1.id]: "b" }, flagged: [q2.id] })
    check("Simpan delta seq 1 → tersimpan", r.status === 200 && r.data.seq === 1 && r.data.duplicate === false && typeof r.data.deadline === "number", r.data)
    r = await A.call("PUT", `/attempts/${attemptId}/answers`, { seq: 1, answers: { [q1.id]: "a" } })
    check("Seq yang sama dikirim ulang → respons sama, TIDAK menimpa", r.status === 200 && r.data.duplicate === true && (await one(`select answers from attempts where id=$1`, [attemptId])).answers[q1.id] === "b", r.data)
    r = await A.call("PUT", `/attempts/${attemptId}/answers`, { seq: 2, answers: { [q2.id]: "true", [q3.id]: "print", bukan_soal: "x" } })
    let row = await one(`select answers, flagged, "clientSeq", "lastSavedAt" from attempts where id=$1`, [attemptId])
    check("Delta seq 2 digabung dengan yang lama; id soal asing dibuang", r.status === 200 && row.answers[q1.id] === "b" && row.answers[q2.id] === "true" && row.answers[q3.id] === "print" && !("bukan_soal" in row.answers) && row.clientSeq === 2, row)
    check("Ragu-ragu dipertahankan bila tidak dikirim; lastSavedAt (monitoring) diperbarui", JSON.stringify(row.flagged) === JSON.stringify([q2.id]) && !!row.lastSavedAt, row)
    r = await A.call("PUT", `/attempts/${attemptId}/answers`, { seq: 1, answers: { [q1.id]: "a" } })
    check("Seq lama → 409 STALE_SEQ (tidak menimpa)", r.status === 409 && r.data.error === "STALE_SEQ" && r.data.seq === 2, r.data)
    r = await A.call("PUT", `/attempts/${attemptId}/answers`, { seq: 3, cleared: [q3.id], answers: {}, leaveCount: 1 })
    row = await one(`select answers, "leaveCount" from attempts where id=$1`, [attemptId])
    check("Jawaban dihapus lewat `cleared`; pelanggaran bertambah", r.status === 200 && !(q3.id in row.answers) && row.leaveCount === 1, row)
    r = await A.call("PUT", `/attempts/${attemptId}/answers`, { seq: 4, answers: {}, leaveCount: 0 })
    check("Jumlah pelanggaran tidak bisa dikurangi aplikasi", (await one(`select "leaveCount" from attempts where id=$1`, [attemptId])).leaveCount === 1)
    r = await B.call("PUT", `/attempts/${attemptId}/answers`, { seq: 9, answers: { [q1.id]: "a" } })
    check("Simpan dari perangkat lain → 423", r.status === 423)
    r = await A.call("PUT", `/attempts/${attemptId}/answers`, { seq: 5, answers: { [q1.id]: "x".repeat(5001) } })
    check("Jawaban terlalu panjang → 400 VALIDATION", r.status === 400 && r.data.error === "VALIDATION")
    const before = (await A.call("PUT", `/attempts/${attemptId}/answers`, { seq: 6, answers: {} })).data.deadline
    await pg.query(`update attempts set "extraMinutes" = 10 where id=$1`, [attemptId])
    r = await A.call("PUT", `/attempts/${attemptId}/answers`, { seq: 7, answers: {} })
    check("Tambah waktu dari pengawas terbaca pada simpan berikutnya (+10 menit)", r.data.deadline - before === 10 * 60_000, [before, r.data.deadline])

    // ---------- Kumpulkan ----------
    r = await A.call("POST", `/attempts/${attemptId}/submit`, { answers: { [q1.id]: "b", [q2.id]: "true", [q3.id]: "def" }, flagged: [] })
    check("Kumpulkan → dikoreksi otomatis, nilai 100", r.status === 200 && r.data.status === "GRADED" && r.data.score === 100 && r.data.duplicate === false, r.data)
    r = await A.call("POST", `/attempts/${attemptId}/submit`, { answers: {} })
    check("Kumpul dikirim ulang → 200 hasil sama (idempotent), nilai tidak berubah", r.status === 200 && r.data.duplicate === true && r.data.score === 100, r.data)
    r = await A.call("PUT", `/attempts/${attemptId}/answers`, { seq: 8, answers: {} })
    check("Simpan setelah dikumpulkan → 409 ATTEMPT_CLOSED + hasil", r.status === 409 && r.data.error === "ATTEMPT_CLOSED" && r.data.result?.status === "GRADED", r.data)
    check("Audit: ATTEMPT_SUBMITTED & EXAM_STARTED (client android)", !!(await one(`select 1 from audit_logs where action='EXAM_STARTED' and "entityId"=$1 and metadata->>'client'='android'`, [ex.id])) && !!(await one(`select 1 from audit_logs where action='ATTEMPT_SUBMITTED' and "entityId"=$1`, [ex.id])))

    // ---------- Batas waktu (aturan web: lewat batas + toleransi → jawaban tersimpan yang dinilai) ----------
    const late = await makeExam("E2E-M Waktu Habis", { lockDevice: false })
    r = await A.call("POST", `/exams/${late.id}/start`, {})
    const lateId = r.data.attemptId
    await A.call("PUT", `/attempts/${lateId}/answers`, { seq: 1, answers: { [late.qs[0].id]: "b" } })
    await pg.query(`update attempts set "startedAt" = (now() at time zone 'utc') - interval '40 minutes' where id=$1`, [lateId])
    r = await A.call("PUT", `/attempts/${lateId}/answers`, { seq: 2, answers: { [late.qs[1].id]: "true" } })
    check("Simpan setelah waktu habis → 409 TIME_UP", r.status === 409 && r.data.error === "TIME_UP", r.data)
    r = await A.call("POST", `/attempts/${lateId}/submit`, { answers: { [late.qs[0].id]: "b", [late.qs[1].id]: "true", [late.qs[2].id]: "def" } })
    check("Kumpul terlambat → hanya jawaban tersimpan yang dinilai (1 dari 3)", r.status === 200 && r.data.late === true && Math.round(r.data.score) === 33, r.data)

    // ---------- Batas pelanggaran ----------
    const leave = await makeExam("E2E-M Pelanggaran", { lockDevice: false, maxLeaves: 2 })
    r = await A.call("POST", `/exams/${leave.id}/start`, {})
    r = await A.call("PUT", `/attempts/${r.data.attemptId}/answers`, { seq: 1, answers: {}, leaveCount: 2 })
    check("Batas keluar aplikasi tercapai → dikumpulkan otomatis (LEAVE_LIMIT)", r.status === 409 && r.data.error === "ATTEMPT_CLOSED" && r.data.result?.reason === "LEAVE_LIMIT", r.data)

    // ---------- Pengaturan ujian: larang aplikasi & tingkat 2 ----------
    const blocked = await makeExam("E2E-M Tanpa Aplikasi", { allowMobileApp: false })
    r = await A.call("POST", `/exams/${blocked.id}/start`, {})
    check("Ujian dilarang dari aplikasi → 403 MOBILE_NOT_ALLOWED", r.status === 403 && r.data.error === "MOBILE_NOT_ALLOWED", r.data)
    check("…dan paket soalnya tidak bisa diunduh", (await A.call("GET", `/exams/${blocked.id}/package`)).status === 403)
    const seb = await makeExam("E2E-M Tingkat 2", { requireSeb: true })
    r = await A.call("POST", `/exams/${seb.id}/start`, { integrityToken: "palsu" })
    check("Ujian tingkat 2 (SEB) tanpa verifikasi integritas → 403 INTEGRITY_REQUIRED", r.status === 403 && r.data.error === "INTEGRITY_REQUIRED", r.data)
    check("…tidak ada percobaan yang dibuat", !(await one(`select 1 from attempts where "examId"=$1`, [seb.id])))
    r = await A.call("GET", "/exams")
    check("Daftar ujian menandai ketersediaan di aplikasi", r.data.exams.find((e) => e.id === blocked.id)?.mobile === "not_allowed" && r.data.exams.find((e) => e.id === seb.id)?.mobile === "integrity_required")

    // ---------- LMS: dashboard, postingan kelas, materi ----------
    const matId = rid("m"), draftId = rid("m")
    await pg.query(`insert into materials (id, title, content, kind, status, "publishedAt", "groupId", "updatedAt") values ($1, 'E2E-M Materi Rekursi', 'Baca bab 3', 'MATERI', 'PUBLISHED', (now() at time zone 'utc'), $2, (now() at time zone 'utc')), ($3, 'E2E-M Draf', null, 'MATERI', 'DRAFT', null, $2, (now() at time zone 'utc'))`, [matId, ifa.id, draftId])
    created.materials.push(matId, draftId)
    r = await A.call("GET", "/dashboard")
    const etag = r.headers.get("etag")
    check("Dashboard: kelas, ujian aktif, postingan terbaru (draf tidak tampil), ber-ETag", r.status === 200 && !!etag && r.data.classes.some((c) => c.id === ifa.id) && r.data.posts.some((p) => p.id === matId) && !r.data.posts.some((p) => p.id === draftId), r.data)
    r = await A.call("GET", "/dashboard", undefined, { "if-none-match": etag })
    check("Dashboard tidak berubah → 304", r.status === 304)
    r = await A.call("GET", `/classes/${ifa.id}/posts`)
    check("Postingan kelas: hanya yang terbit", r.status === 200 && r.data.posts.some((p) => p.id === matId && p.done === false) && !r.data.posts.some((p) => p.id === draftId))
    r = await outsider.call("GET", `/classes/${ifa.id}/posts`)
    check("Bukan anggota kelas → 404", r.status === 404)
    r = await A.call("GET", `/materials/${matId}`)
    check("Detail materi", r.status === 200 && r.data.title === "E2E-M Materi Rekursi" && r.data.done === false && r.data.classId === ifa.id, r.data)
    check("Materi draf / kelas lain → 404", (await A.call("GET", `/materials/${draftId}`)).status === 404 && (await outsider.call("GET", `/materials/${matId}`)).status === 404)
    r = await A.call("POST", `/materials/${matId}`, { done: true })
    check("Tandai selesai dibaca", r.status === 200 && !!(await one(`select 1 from material_progress where "materialId"=$1 and "userId"=$2`, [matId, student.id])))
    r = await A.call("GET", "/dashboard", undefined, { "if-none-match": etag })
    check("Isi berubah (ujian dikumpulkan / materi baru) → ETag baru, 200", r.status === 200 || r.status === 304)

    // ---------- Notifikasi (FCM tidak dikonfigurasi di server uji) ----------
    r = await A.call("POST", "/devices", { fcmToken: "fcm-token-uji-" + "x".repeat(30) })
    check("Daftar token FCM: tersimpan; tanpa FCM_CREDENTIALS tidak ada topik", r.status === 200 && r.data.enabled === false && Array.isArray(r.data.topics) && !!(await one(`select 1 from mobile_devices where "deviceId"=$1 and "fcmToken" is not null`, [A.id])), r.data)

    // ---------- Password sementara wajib diganti ----------
    const tmpPass = "Sementara123"
    const tmpId = rid("u")
    await pg.query(`insert into users (id, email, username, name, "passwordHash", role, "mustChangePassword", "updatedAt") values ($1, $2, $3, 'E2E-M Peserta Baru', $4, 'PESERTA', true, (now() at time zone 'utc'))`, [tmpId, `${tmpId}@e2e.local`, tmpId, bcrypt.hashSync(tmpPass, 10)])
    created.users.push(tmpId)
    const T = device("tmp", "ios")
    r = await T.login(tmpId, tmpPass)
    check("Login password sementara → token + mustChangePassword", r.status === 200 && r.data.user.mustChangePassword === true)
    r = await T.call("GET", "/exams")
    check("Sebelum ganti password → 403 PASSWORD_CHANGE_REQUIRED", r.status === 403 && r.data.error === "PASSWORD_CHANGE_REQUIRED")
    r = await T.call("POST", "/auth/password", { currentPassword: tmpPass, newPassword: "pendek" })
    check("Password baru lemah → 400 dengan pesan field", r.status === 400 && !!r.data.fields?.newPassword, r.data)
    const oldAccess = T.access, oldRefresh = T.refresh
    r = await T.call("POST", "/auth/password", { currentPassword: tmpPass, newPassword: "BaruSekali2026" })
    check("Ganti password → sesi baru untuk perangkat ini", r.status === 200 && !!r.data.accessToken && r.data.refreshToken !== oldRefresh, r.data)
    T.access = r.data.accessToken; T.refresh = r.data.refreshToken
    check("Akses dengan sesi baru lolos; token lama (sebelum ganti password) ditolak", (await T.call("GET", "/exams")).status === 200 && (await T.call("GET", "/me", undefined, { authorization: `Bearer ${oldAccess}` })).status === 401 && (await T.call("POST", "/auth/refresh", { refreshToken: oldRefresh })).status === 401)

    // ---------- Logout ----------
    r = await A.call("POST", "/auth/logout", { refreshToken: A.refresh })
    check("Logout → refresh token tidak berlaku, notifikasi perangkat dilepas", r.status === 200 && (await A.call("POST", "/auth/refresh", { refreshToken: A.refresh })).status === 401 && !!(await one(`select 1 from mobile_devices where "deviceId"=$1 and "fcmToken" is null`, [A.id])))
  } catch (e) {
    check("Tanpa exception", false, e.stack)
  } finally {
    if (created.exams.length) {
      await pg.query(`delete from audit_logs where "entityId" = any($1)`, [created.exams])
      await pg.query(`delete from exams where id = any($1)`, [created.exams])
    }
    if (created.materials.length) await pg.query(`delete from materials where id = any($1)`, [created.materials])
    if (created.users.length) await pg.query(`delete from users where id = any($1)`, [created.users])
    await pg.query(`delete from mobile_refresh_tokens where "deviceId" like 'dev-%'`)
    await pg.query(`delete from mobile_devices where "deviceId" like 'dev-%'`)
    await pg.end()
  }
  console.log(`\n${pass} lulus, ${fail} gagal`)
  if (fail) process.exit(1)
})()
