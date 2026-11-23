// Data trial untuk mencoba aplikasi mobile di SERVER LOKAL / UJI — JANGAN dijalankan ke database produksi.
// Membuat (atau mengatur ulang) akun peserta "trial.mobile" di kelas IF-1A, ujian latihan yang bisa diulang,
// dan satu postingan Materi berlampiran. Aman dijalankan berkali-kali: percobaan ujian selalu dihapus;
// password hanya dibuat saat akun baru atau bila diminta.
//   node scripts/trial-mobile.cjs                       (password lama tetap)
//   node scripts/trial-mobile.cjs --password Rahasia123 (atur password)
const ROOT = require("node:path").resolve(__dirname, "..")
const fs = require("node:fs")
const path = require("node:path")
const crypto = require("node:crypto")
require(`${ROOT}/node_modules/dotenv`).config({ path: `${ROOT}/.env`, quiet: true })
const { Client } = require(`${ROOT}/node_modules/pg`)
const bcrypt = require(`${ROOT}/node_modules/bcryptjs`)

const USERNAME = "trial.mobile"
const EXAM_TITLE = "Uji Coba Aplikasi Mobile"
const POST_TITLE = "Materi Uji Coba Aplikasi"
const UTC_NOW = `(now() at time zone 'utc')`
const id = (p) => `${p}${crypto.randomBytes(10).toString("hex")}`

;(async () => {
  const url = process.env.DATABASE_URL ?? ""
  if (!/smarttest_mobile_e2e|_e2e|_dev|localhost/.test(url) || /\/smarttest(\?|$)/.test(url)) {
    console.error("Ditolak: DATABASE_URL bukan database uji. Skrip ini hanya untuk server lokal/uji.")
    process.exit(1)
  }
  const pg = new Client({ connectionString: url })
  await pg.connect()
  const one = async (q, p = []) => (await pg.query(q, p)).rows[0]
  try {
    await pg.query("BEGIN")
    const group = await one(`select id from groups where name='IF-1A'`)
    const subject = await one(`select id from subjects where code='IF101'`)
    const source = await one(`select id from exams where title like 'Kuis 1 %Dasar Algoritma'`)
    if (!group || !subject || !source) throw new Error("Data seed tidak ditemukan — jalankan npm run db:seed dulu.")

    // ---- Akun peserta trial ----
    const i = process.argv.indexOf("--password")
    const given = i > -1 ? process.argv[i + 1] : null
    let user = await one(`select id from users where username=$1`, [USERNAME])
    const password = given ?? (user ? null : `Trial-${crypto.randomBytes(4).toString("hex")}`)
    if (user && password) {
      await pg.query(`update users set "passwordHash"=$2, "isActive"=true, "mustChangePassword"=false, "failedLoginCount"=0, "lockedUntil"=null, "passwordChangedAt"=${UTC_NOW}, "updatedAt"=${UTC_NOW} where id=$1`, [user.id, bcrypt.hashSync(password, 10)])
    } else if (!user) {
      user = { id: id("u") }
      await pg.query(
        `insert into users (id, email, username, name, "passwordHash", role, "updatedAt") values ($1, 'trial.mobile@smarttest.local', $2, 'Peserta Uji Coba', $3, 'PESERTA', ${UTC_NOW})`,
        [user.id, USERNAME, bcrypt.hashSync(password, 10)]
      )
    }
    await pg.query(`insert into group_members ("groupId", "userId") values ($1, $2) on conflict ("groupId", "userId") do update set status='ACTIVE', role='STUDENT', "removedAt"=null`, [group.id, user.id])
    // Password baru → sesi aplikasi lama tidak berlaku lagi.
    if (password) await pg.query(`update mobile_refresh_tokens set "revokedAt"=${UTC_NOW} where "userId"=$1 and "revokedAt" is null`, [user.id])

    // ---- Ujian latihan (bisa diulang 20×) — salinan soal Kuis 1 ----
    let exam = await one(`select id from exams where title=$1`, [EXAM_TITLE])
    if (!exam) {
      exam = { id: id("ex") }
      await pg.query(
        `insert into exams (id, title, kind, instructions, "durationMinutes", "startAt", "endAt", "maxAttempts", "questionsPerPage", "passingScore",
            "shuffleQuestions", "shuffleOptions", "showScore", "lockDevice", "maxLeaves", "publishedAt", "subjectId", "updatedAt")
         values ($1, $2, 'LATIHAN', 'Ujian latihan untuk mencoba aplikasi: matikan data seluler saat mengerjakan, keluar aplikasi, lalu kembali.',
            20, ${UTC_NOW} - interval '1 hour', ${UTC_NOW} + interval '30 days', 20, 2, 70, true, true, true, true, 5, ${UTC_NOW}, $3, ${UTC_NOW})`,
        [exam.id, EXAM_TITLE, subject.id]
      )
      await pg.query(
        `insert into exam_questions (id, type, prompt, options, "answerKey", points, "order", "examId")
         select 'tq' || md5(random()::text), type, prompt, options, "answerKey", points, "order", $1 from exam_questions where "examId"=$2`,
        [exam.id, source.id]
      )
      await pg.query(`insert into exam_groups ("examId", "groupId") values ($1, $2)`, [exam.id, group.id])
    }
    // Percobaan sebelumnya dihapus agar trial selalu bisa mulai dari awal.
    await pg.query(`delete from attempts where "userId"=$1`, [user.id])

    // ---- Postingan Materi + lampiran berkas & tautan ----
    let post = await one(`select id from materials where title=$1 and "groupId"=$2`, [POST_TITLE, group.id])
    if (!post) {
      post = { id: id("m") }
      await pg.query(
        `insert into materials (id, title, content, kind, status, "publishedAt", "groupId", "updatedAt")
         values ($1, $2, 'Contoh materi untuk mencoba aplikasi: buka lampiran berkas (diunduh & di-cache), buka tautan, lalu tandai selesai dibaca.', 'MATERI', 'PUBLISHED', ${UTC_NOW}, $3, ${UTC_NOW})`,
        [post.id, POST_TITLE, group.id]
      )
      const uploadRoot = path.resolve(process.env.UPLOAD_DIR || path.join(ROOT, "uploads"))
      const key = `materials/trial/${crypto.randomBytes(8).toString("hex")}`
      const body = Buffer.from("Ringkasan Rekursi\n\nRekursi adalah fungsi yang memanggil dirinya sendiri sampai mencapai kasus dasar.\n", "utf8")
      fs.mkdirSync(path.join(uploadRoot, path.dirname(key)), { recursive: true })
      fs.writeFileSync(path.join(uploadRoot, key), body)
      await pg.query(
        `insert into material_attachments (id, type, name, "storageKey", "mimeType", size, sha256, "sortOrder", "materialId") values ($1, 'FILE', 'ringkasan-rekursi.txt', $2, 'text/plain', $3, $4, 0, $5)`,
        [id("ma"), key, body.length, crypto.createHash("sha256").update(body).digest("hex"), post.id]
      )
      await pg.query(
        `insert into material_attachments (id, type, name, url, "sortOrder", "materialId") values ($1, 'LINK', 'Dokumentasi Python: Fungsi', 'https://docs.python.org/3/tutorial/controlflow.html#defining-functions', 1, $2)`,
        [id("ma"), post.id]
      )
    }
    await pg.query("COMMIT")
    console.log(`Akun trial siap.\n  Login   : ${USERNAME}\n  Password: ${password ?? "(tidak diubah)"}\n  Kelas   : IF-1A\n  Ujian   : ${EXAM_TITLE} (20 menit, 10 soal, boleh diulang)\n  Materi  : ${POST_TITLE}`)
  } catch (e) {
    await pg.query("ROLLBACK")
    throw e
  } finally {
    await pg.end()
  }
})()
