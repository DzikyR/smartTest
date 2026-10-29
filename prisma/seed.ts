import "dotenv/config"
import { randomBytes } from "node:crypto"
import { writeFileSync } from "node:fs"
import bcrypt from "bcryptjs"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient, type Role } from "../src/generated/prisma/client"

/**
 * Data contoh SmartTest. Aman dijalankan ulang (tidak menimpa data yang ada).
 * Password akun demo dibuat acak, ditampilkan sekali, dan disimpan ke
 * .akun-demo.txt (diabaikan git).
 */
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
const created: string[] = []

async function user(data: { email: string; username?: string; name: string; role: Role }) {
  const existing = await db.user.findUnique({ where: { email: data.email } })
  if (existing) return existing
  const password = randomBytes(9).toString("base64url")
  const u = await db.user.create({ data: { ...data, passwordHash: await bcrypt.hash(password, 12) } })
  created.push(`${data.role.padEnd(11)} ${(data.username ?? data.email).padEnd(28)} ${password}`)
  return u
}

const mc = (prompt: string, options: string[], correct: number, extra: { points?: number; topic?: string; difficulty?: number } = {}) => ({
  type: "MULTIPLE_CHOICE" as const,
  prompt,
  options: options.map((text, i) => ({ id: "abcdef"[i], text })),
  answerKey: { optionId: "abcdef"[correct] },
  points: extra.points ?? 1,
  topic: extra.topic ?? null,
  difficulty: extra.difficulty ?? 2,
})

async function main() {
  if (await db.subject.findUnique({ where: { code: "IF101" } })) {
    console.log("Data contoh sudah ada — seed dilewati.")
    return
  }

  await user({ email: "superadmin@smarttest.local", username: "superadmin", name: "Super Admin", role: "SUPER_ADMIN" })
  await user({ email: "admin@smarttest.local", username: "admin", name: "Admin Akademik", role: "ADMIN" })
  const d1 = await user({ email: "rina@smarttest.local", username: "dosen.rina", name: "Dr. Rina Kartika", role: "DOSEN" })
  const d2 = await user({ email: "budi@smarttest.local", username: "dosen.budi", name: "Budi Hartono, M.Kom.", role: "DOSEN" })
  const names = ["Andi Pratama", "Bunga Lestari", "Citra Maharani", "Dimas Saputra", "Eka Wulandari", "Fajar Nugroho", "Gita Permata", "Hadi Kurniawan"]
  const students = []
  for (const [i, name] of names.entries()) {
    const nim = `24010${String(i + 1).padStart(2, "0")}`
    students.push(await user({ email: `${nim}@mhs.smarttest.local`, username: nim, name, role: "PESERTA" }))
  }

  const ifa = await db.group.create({ data: { name: "IF-1A", description: "Informatika angkatan 2024 kelas A", members: { create: students.slice(0, 4).map((s) => ({ userId: s.id })) } } })
  await db.group.create({ data: { name: "IF-1B", description: "Informatika angkatan 2024 kelas B", members: { create: students.slice(4).map((s) => ({ userId: s.id })) } } })

  const algo = await db.subject.create({
    data: { code: "IF101", name: "Algoritma & Pemrograman", type: "MATA_KULIAH", description: "Dasar algoritma, struktur kontrol, dan pemrograman Python.", lecturers: { create: [{ userId: d1.id }] } },
  })
  await db.subject.create({ data: { code: "IF102", name: "Basis Data", type: "MATA_KULIAH", lecturers: { create: [{ userId: d2.id }] } } })
  const tpa = await db.subject.create({
    data: { code: "UMUM-TPA", name: "Tes Potensi Akademik", type: "UMUM", description: "Tes umum: verbal, numerik, dan logika.", lecturers: { create: [{ userId: d1.id }] } },
  })

  const algoQuestions = [
    mc("Kompleksitas waktu pencarian biner pada array terurut berukuran n adalah ...", ["O(1)", "O(log n)", "O(n)", "O(n log n)", "O(n²)"], 1, { points: 2, topic: "Kompleksitas", difficulty: 2 }),
    mc("Struktur data yang menerapkan prinsip LIFO adalah ...", ["Queue", "Stack", "Linked list", "Tree"], 1, { topic: "Struktur data", difficulty: 1 }),
    mc("Hasil dari 7 // 2 di Python adalah ...", ["3.5", "3", "4", "1"], 1, { topic: "Python", difficulty: 1 }),
    mc("Perulangan yang paling tepat untuk mengulang sebanyak jumlah elemen list adalah ...", ["while True", "for item in list", "do-while", "if-else"], 1, { topic: "Perulangan", difficulty: 1 }),
    mc("Algoritma pengurutan dengan kompleksitas rata-rata O(n log n) adalah ...", ["Bubble sort", "Insertion sort", "Merge sort", "Selection sort"], 2, { points: 2, topic: "Pengurutan", difficulty: 2 }),
    mc("Nilai akhir variabel x setelah: x = 1; for i in range(3): x *= 2 adalah ...", ["4", "6", "8", "16"], 2, { topic: "Perulangan", difficulty: 2 }),
    { type: "TRUE_FALSE" as const, prompt: "Python membedakan huruf besar dan kecil (case-sensitive).", options: undefined, answerKey: { value: true }, points: 1, topic: "Python", difficulty: 1 },
    { type: "TRUE_FALSE" as const, prompt: "Rekursi selalu lebih cepat daripada iterasi.", options: undefined, answerKey: { value: false }, points: 1, topic: "Rekursi", difficulty: 2 },
    { type: "SHORT_ANSWER" as const, prompt: "Kata kunci untuk mendefinisikan fungsi di Python adalah ...", options: undefined, answerKey: { accepted: ["def"] }, points: 1, topic: "Python", difficulty: 1 },
    { type: "ESSAY" as const, prompt: "Jelaskan perbedaan rekursi dan iterasi, sertakan satu contoh kasus!", options: undefined, answerKey: undefined, points: 5, topic: "Rekursi", difficulty: 3 },
  ]
  const tpaQuestions = [
    mc("Sinonim kata 'EFISIEN' adalah ...", ["Boros", "Berdaya guna", "Lambat", "Rumit"], 1, { topic: "Verbal", difficulty: 1 }),
    mc("2, 6, 12, 20, 30, ... Bilangan berikutnya adalah ...", ["40", "42", "44", "36"], 1, { topic: "Numerik", difficulty: 2 }),
    mc("Semua dokter pandai. Sebagian dokter adalah penulis. Maka ...", ["Semua penulis pandai", "Sebagian penulis pandai", "Tidak ada penulis yang pandai", "Semua yang pandai adalah dokter"], 1, { topic: "Logika", difficulty: 2 }),
    mc("Antonim kata 'FANA' adalah ...", ["Baka", "Sementara", "Rapuh", "Hilang"], 0, { topic: "Verbal", difficulty: 2 }),
    mc("Jika 3x + 5 = 20, maka nilai x adalah ...", ["3", "5", "6", "15"], 1, { topic: "Numerik", difficulty: 1 }),
  ]
  await db.question.createMany({ data: algoQuestions.map((q) => ({ ...q, subjectId: algo.id, createdById: d1.id })) })
  await db.question.createMany({ data: tpaQuestions.map((q) => ({ ...q, subjectId: tpa.id, createdById: d1.id })) })

  // Soal ujian = salinan soal bank (tanpa topik/kesulitan).
  const copy = (qs: typeof algoQuestions) => qs.map((q, i) => ({ type: q.type, prompt: q.prompt, options: q.options, answerKey: q.answerKey, points: q.points, order: i + 1 }))
  const now = Date.now()
  await db.exam.create({
    data: {
      subjectId: algo.id,
      createdById: d1.id,
      title: "Kuis 1 — Dasar Algoritma",
      kind: "KUIS",
      instructions: "Kerjakan secara mandiri. Bacalah setiap soal dengan teliti.",
      durationMinutes: 30,
      startAt: new Date(now - 60 * 60 * 1000),
      endAt: new Date(now + 7 * 24 * 60 * 60 * 1000),
      passingScore: 70,
      requireFullscreen: true,
      blockCopyPaste: true,
      lockDevice: true,
      maxLeaves: 3,
      publishedAt: new Date(),
      groups: { create: [{ groupId: ifa.id }] },
      questions: { create: copy(algoQuestions) },
    },
  })
  await db.exam.create({
    data: {
      subjectId: algo.id,
      createdById: d1.id,
      title: "UTS Algoritma & Pemrograman",
      kind: "UTS",
      durationMinutes: 90,
      showScore: false,
      requireFullscreen: true,
      blockCopyPaste: true,
      lockDevice: true,
      maxLeaves: 3,
      requireSeb: true,
      token: "UTS24",
      rules: "Dilarang bekerja sama atau membuka catatan.\nHadir di ruang ujian 10 menit sebelum dimulai.",
      groups: { create: [{ groupId: ifa.id }] },
    },
  })
  await db.exam.create({
    data: {
      subjectId: tpa.id,
      createdById: d1.id,
      title: "Try Out Tes Potensi Akademik",
      kind: "TRYOUT",
      instructions: "Try out terbuka untuk semua peserta. Soal ditampilkan 5 per halaman.",
      durationMinutes: 20,
      maxAttempts: 3,
      questionsPerPage: 5,
      openToAll: true,
      shuffleQuestions: true,
      publishedAt: new Date(),
      questions: { create: copy(tpaQuestions) },
    },
  })

  if (created.length) {
    const text = ["Akun demo SmartTest (login dengan username/NIM atau email):", "ROLE        LOGIN                        PASSWORD", ...created].join("\n")
    writeFileSync(".akun-demo.txt", text + "\n")
    console.log(text)
    console.log("\nDisimpan juga ke .akun-demo.txt (diabaikan git).")
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
