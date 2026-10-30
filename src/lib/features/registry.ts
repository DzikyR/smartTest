import type { Role } from "@/lib/auth/roles"

/**
 * Katalog fitur yang dapat diaktifkan/dinonaktifkan Super Admin per role.
 * `roles` = role yang berhak (sesuai otorisasi role yang sudah ada) dan aktif
 * secara bawaan. Toggle hanya bisa mempersempit, tidak pernah menambah akses.
 * Fitur `critical` meminta konfirmasi sebelum dimatikan.
 */
export const FEATURES = {
  "kelas.kelola": {
    name: "Membuat & Mengelola Kelas",
    description: "Pengajar membuat kelas, membagikan kode kelas, dan mengelola anggota.",
    category: "Kelas",
    roles: ["ADMIN", "DOSEN"],
  },
  "kelas.gabung": {
    name: "Bergabung dengan Kode Kelas",
    description: "Peserta masuk ke kelas memakai kode dari pengajar. Anggota yang sudah bergabung tetap bisa membuka kelasnya.",
    category: "Kelas",
    roles: ["PESERTA"],
  },
  "bank-soal.impor": {
    name: "Impor Soal Word/Excel",
    description: "Halaman impor, pratinjau & simpan impor, unduh templat soal.",
    category: "Bank Soal",
    roles: ["ADMIN", "DOSEN"],
  },
  "bank-soal.massal": {
    name: "Buat Soal Massal",
    description: "Editor banyak soal sekaligus.",
    category: "Bank Soal",
    roles: ["ADMIN", "DOSEN"],
  },
  "ujian-kelola.ekspor": {
    name: "Ekspor Nilai (Excel)",
    description: "Unduh rekap nilai & analisis butir dari halaman hasil ujian.",
    category: "Kelola Ujian",
    roles: ["ADMIN", "DOSEN"],
  },
  "admin.kelompok": {
    name: "Kelompok Peserta",
    description: "Membuat, mengubah, dan mengisi kelompok peserta.",
    category: "Administrasi",
    roles: ["ADMIN"],
  },
  "ujian.mulai": {
    name: "Memulai Ujian Baru",
    description: "Peserta memulai percobaan baru. Percobaan yang sedang berjalan tetap bisa dilanjutkan & dikumpulkan.",
    category: "Peserta",
    roles: ["PESERTA"],
    critical: true,
  },
  "hasil.lihat": {
    name: "Halaman Hasil Ujian",
    description: "Riwayat nilai peserta di menu Hasil Ujian.",
    category: "Peserta",
    roles: ["PESERTA"],
  },
} as const satisfies Record<string, { name: string; description: string; category: string; roles: readonly Role[]; critical?: boolean }>

export type FeatureKey = keyof typeof FEATURES

export const FEATURE_KEYS = Object.keys(FEATURES) as FeatureKey[]

/** Role yang dapat diatur di matriks (SUPER_ADMIN selalu aktif). */
export const TOGGLEABLE_ROLES = ["ADMIN", "DOSEN", "PESERTA"] as const satisfies readonly Role[]

export const FEATURE_DISABLED = "Fitur ini sedang dinonaktifkan oleh Super Admin."

/** Override dari database: tanpa entri = bawaan registry. */
export type FeatureOverrides = Partial<Record<string, { enabled: boolean; roles: Partial<Record<Role, boolean>> }>>

export const isFeatureKey = (key: unknown): key is FeatureKey => typeof key === "string" && Object.hasOwn(FEATURES, key)

export const featureEligible = (key: FeatureKey, role: Role) => (FEATURES[key].roles as readonly Role[]).includes(role)

/** Aturan inti: SUPER_ADMIN lolos; role tak berhak ditolak; selain itu saklar global AND saklar role. */
export function resolveFeature(key: FeatureKey, role: Role, overrides: FeatureOverrides) {
  if (role === "SUPER_ADMIN") return true
  if (!featureEligible(key, role)) return false
  const o = overrides[key]
  if (!o) return true
  return o.enabled && (o.roles[role] ?? true)
}
