/**
 * Katalog teks yang dapat diubah Super Admin. `default` adalah teks bawaan
 * (fallback bila DB kosong/bermasalah). `vars` = placeholder yang boleh dipakai,
 * mis. "{n}". Menambah teks dinamis baru: tambahkan entri di sini, lalu ganti
 * teks hardcoded dengan `t["key"]` dari getTexts().
 */
import type { Role } from "@/lib/auth/roles"

type TextDef = { group: string; label: string; default: string; max?: number; multiline?: boolean; vars?: readonly string[] }

export const TEXTS = {
  "app.name": { group: "Umum", label: "Nama aplikasi (judul tab, logo teks, menu)", default: "SmartTest", max: 40 },
  "app.tagline": { group: "Umum", label: "Deskripsi singkat (meta description)", default: "Platform ujian online (CBT) untuk kuis, UTS, UAS, dan tes umum.", max: 160, multiline: true },

  "login.hero.title": { group: "Halaman Masuk", label: "Judul panel kiri", default: "Ujian online yang rapi, cepat, dan aman.", max: 80 },
  "login.hero.subtitle": {
    group: "Halaman Masuk",
    label: "Deskripsi panel kiri",
    default: "Kelola mata uji, bank soal, dan jadwal ujian — peserta mengerjakan dengan tampilan CBT yang nyaman.",
    max: 200,
    multiline: true,
  },
  "login.point1": { group: "Halaman Masuk", label: "Poin keunggulan 1", default: "Kuis, UTS, UAS, dan tes umum dalam satu tempat", max: 90 },
  "login.point2": { group: "Halaman Masuk", label: "Poin keunggulan 2", default: "Impor soal dari Word & Excel, buat puluhan soal sekaligus", max: 90 },
  "login.point3": { group: "Halaman Masuk", label: "Poin keunggulan 3", default: "Pengamanan ujian: layar penuh, satu perangkat, Safe Exam Browser", max: 90 },
  "login.footnote": { group: "Halaman Masuk", label: "Catatan bawah panel kiri", default: "Jawaban tersimpan otomatis selama ujian", max: 90 },
  "login.title": { group: "Halaman Masuk", label: "Judul form", default: "Selamat datang 👋", max: 60 },
  "login.subtitle": { group: "Halaman Masuk", label: "Subjudul form", default: "Masuk untuk mengelola atau mengerjakan ujian.", max: 120 },
  "login.cta": { group: "Halaman Masuk", label: "Tombol masuk", default: "Masuk", max: 30 },

  "dashboard.greeting": { group: "Dashboard", label: "Sapaan di atas nama", default: "Selamat datang kembali", max: 60 },
  "dashboard.staff.toGrade": { group: "Dashboard", label: "Staf: ada esai menunggu dinilai", default: "Ada {n} jawaban esai yang menunggu dinilai.", max: 140, vars: ["n"] },
  "dashboard.staff.idle": { group: "Dashboard", label: "Staf: tidak ada yang perlu dinilai", default: "Kelola bank soal dan jadwalkan ujian berikutnya.", max: 140 },
  "dashboard.staff.cta": { group: "Dashboard", label: "Staf: tombol buat ujian", default: "Buat ujian", max: 30 },
  "dashboard.participant.available": { group: "Dashboard", label: "Peserta: ada ujian dibuka", default: "Ada {n} ujian yang bisa Anda kerjakan sekarang. Semoga sukses!", max: 140, vars: ["n"] },
  "dashboard.participant.idle": { group: "Dashboard", label: "Peserta: tidak ada ujian dibuka", default: "Belum ada ujian yang dibuka saat ini.", max: 140 },
  "dashboard.participant.cta": { group: "Dashboard", label: "Peserta: tombol kerjakan", default: "Kerjakan sekarang", max: 30 },

  "role.SUPER_ADMIN": { group: "Peran Pengguna", label: "Super Admin", default: "Super Admin", max: 30 },
  "role.ADMIN": { group: "Peran Pengguna", label: "Admin", default: "Admin", max: 30 },
  "role.DOSEN": { group: "Peran Pengguna", label: "Dosen / praktisi / penyelenggara", default: "Pengajar", max: 30 },
  "role.PESERTA": { group: "Peran Pengguna", label: "Peserta / mahasiswa", default: "Peserta", max: 30 },

  "nav.dashboard": { group: "Menu Navigasi", label: "Dashboard", default: "Dashboard", max: 30 },
  "nav.section.ujian": { group: "Menu Navigasi", label: "Judul bagian: Ujian", default: "Ujian", max: 30 },
  "nav.ujian": { group: "Menu Navigasi", label: "Peserta: Ujian Saya", default: "Ujian Saya", max: 30 },
  "nav.hasil": { group: "Menu Navigasi", label: "Peserta: Hasil Ujian", default: "Hasil Ujian", max: 30 },
  "nav.ujian-kelola": { group: "Menu Navigasi", label: "Staf: Kelola Ujian", default: "Kelola Ujian", max: 30 },
  "nav.bank-soal": { group: "Menu Navigasi", label: "Staf: Bank Soal", default: "Bank Soal", max: 30 },
  "nav.mata-uji": { group: "Menu Navigasi", label: "Staf: Mata Uji", default: "Mata Uji", max: 30 },
  "nav.section.admin": { group: "Menu Navigasi", label: "Judul bagian: Administrasi", default: "Administrasi", max: 30 },
  "nav.pengguna": { group: "Menu Navigasi", label: "Admin: Pengguna", default: "Pengguna", max: 30 },
  "nav.kelompok": { group: "Menu Navigasi", label: "Admin: Kelompok Peserta", default: "Kelompok Peserta", max: 30 },
  "nav.section.akun": { group: "Menu Navigasi", label: "Judul bagian: Akun", default: "Akun", max: 30 },
  "nav.profil": { group: "Menu Navigasi", label: "Profil & Password", default: "Profil & Password", max: 30 },

  "sidebar.staff.title": { group: "Kartu Sidebar", label: "Staf: judul", default: "Impor soal sekaligus", max: 50 },
  "sidebar.staff.text": { group: "Kartu Sidebar", label: "Staf: deskripsi", default: "Unggah dari Word atau Excel memakai templat SmartTest.", max: 120, multiline: true },
  "sidebar.staff.cta": { group: "Kartu Sidebar", label: "Staf: tombol", default: "Impor sekarang", max: 30 },
  "sidebar.participant.title": { group: "Kartu Sidebar", label: "Peserta: judul", default: "Siap ujian?", max: 50 },
  "sidebar.participant.text": { group: "Kartu Sidebar", label: "Peserta: deskripsi", default: "Pastikan koneksi stabil dan baca tata tertib sebelum mulai.", max: 120, multiline: true },
  "sidebar.participant.cta": { group: "Kartu Sidebar", label: "Peserta: tombol", default: "Lihat ujian", max: 30 },
} as const satisfies Record<string, TextDef>

export type TextKey = keyof typeof TEXTS
export type Texts = Record<TextKey, string>

export const TEXT_KEYS = Object.keys(TEXTS) as TextKey[]
export const DEFAULT_TEXTS = Object.fromEntries(TEXT_KEYS.map((k) => [k, TEXTS[k].default])) as Texts

/** Label role yang tampil di UI (nilai di database tetap SUPER_ADMIN/ADMIN/DOSEN/PESERTA). */
export const roleLabels = (t: Texts): Record<Role, string> => ({ SUPER_ADMIN: t["role.SUPER_ADMIN"], ADMIN: t["role.ADMIN"], DOSEN: t["role.DOSEN"], PESERTA: t["role.PESERTA"] })

/** Label menu (dikirim ke klien — hanya bagian ini, bukan seluruh katalog). */
export const NAV_TEXT_KEYS = TEXT_KEYS.filter((k) => k.startsWith("nav."))

export const isTextKey = (key: unknown): key is TextKey => typeof key === "string" && Object.hasOwn(TEXTS, key)

/** Gabungkan override DB dengan bawaan; key yang tidak dikenal/ kosong diabaikan. */
export function mergeTexts(overrides: Record<string, string>): Texts {
  const merged = { ...DEFAULT_TEXTS }
  for (const [k, v] of Object.entries(overrides)) if (isTextKey(k) && v.trim()) merged[k] = v
  return merged
}

/** Isi placeholder {nama}; placeholder tanpa nilai dibiarkan apa adanya. */
export function fill(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m))
}

/** Validasi satu teks; null = valid. Teks kosong berarti kembali ke bawaan. */
export function textError(key: TextKey, value: string): string | null {
  const def: TextDef = TEXTS[key]
  const max = def.max ?? 200
  if (value.length > max) return `Maksimal ${max} karakter`
  if (!def.multiline && /[\r\n]/.test(value)) return "Tidak boleh lebih dari satu baris"
  const allowed: readonly string[] = def.vars ?? []
  const unknown = [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((v) => !allowed.includes(v))
  if (unknown.length) return allowed.length ? `Placeholder yang tersedia hanya ${allowed.map((v) => `{${v}}`).join(", ")}` : "Teks ini tidak mendukung placeholder {…}"
  return null
}
