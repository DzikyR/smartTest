import type { Prisma, Role } from "@/generated/prisma/client"

/** Batas akun per operasi massal (bcrypt cost 10 ≈ 60 ms/akun → ±18 detik untuk 300). */
export const MAX_GENERATE = 300
export const MAX_DELETE = 1000

export const ROLES = ["SUPER_ADMIN", "ADMIN", "DOSEN", "PESERTA"] as const satisfies readonly Role[]

/** Tab role di halaman Pengguna (key URL → role). */
export const USER_ROLE_TABS: { key: string; role?: Role }[] = [{ key: "semua" }, { key: "peserta", role: "PESERTA" }, { key: "dosen", role: "DOSEN" }, { key: "admin", role: "ADMIN" }, { key: "super", role: "SUPER_ADMIN" }]

/**
 * Filter daftar pengguna. Dipakai halaman Pengguna DAN aksi "hapus semua hasil
 * filter" — keduanya wajib memakai aturan yang sama agar yang terhapus = yang terlihat.
 */
export function userWhere(role: Role | undefined, q: string | undefined): Prisma.UserWhereInput {
  return {
    ...(role ? { role } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { username: { contains: q, mode: "insensitive" } }] } : {}),
  }
}
