import type { Role } from "@/generated/prisma/enums"

export type { Role }

export const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  DOSEN: "Pengajar",
  PESERTA: "Peserta",
}

/** Semua role masuk ke /dashboard; isinya menyesuaikan role. */
export const HOME = "/dashboard"

/** Kelompok role untuk otorisasi halaman & aksi. */
export const STAFF: Role[] = ["SUPER_ADMIN", "ADMIN", "DOSEN"]
export const ADMINS: Role[] = ["SUPER_ADMIN", "ADMIN"]

/**
 * Area terproteksi dan role yang boleh mengaksesnya (pemeriksaan optimis di Proxy).
 * Dicocokkan berurutan — prefix yang lebih spesifik harus di atas prefix induknya.
 */
export const PROTECTED_AREAS: { prefix: string; roles: Role[] }[] = [
  { prefix: "/admin/fitur", roles: ["SUPER_ADMIN"] },
  { prefix: "/admin/situs", roles: ["SUPER_ADMIN"] },
  { prefix: "/admin", roles: ADMINS },
  { prefix: "/mata-uji", roles: STAFF },
  { prefix: "/bank-soal", roles: STAFF },
  { prefix: "/ujian-kelola", roles: STAFF },
  { prefix: "/ujian", roles: ["PESERTA"] },
  { prefix: "/hasil", roles: ["PESERTA"] },
  { prefix: "/dashboard", roles: ["SUPER_ADMIN", "ADMIN", "DOSEN", "PESERTA"] },
  { prefix: "/kelas", roles: ["SUPER_ADMIN", "ADMIN", "DOSEN", "PESERTA"] },
  { prefix: "/gabung", roles: ["SUPER_ADMIN", "ADMIN", "DOSEN", "PESERTA"] },
  { prefix: "/sesi", roles: ["PESERTA"] },
  { prefix: "/profil", roles: ["SUPER_ADMIN", "ADMIN", "DOSEN", "PESERTA"] },
]

export function findProtectedArea(pathname: string) {
  return PROTECTED_AREAS.find((area) => pathname === area.prefix || pathname.startsWith(`${area.prefix}/`))
}

/**
 * Cegah open redirect lewat callbackUrl: hanya path internal, atau URL absolut
 * yang origin-nya sama dengan AUTH_URL (Proxy mengirim callbackUrl absolut).
 */
export function safeCallbackUrl(value: unknown, fallback: string) {
  if (typeof value !== "string" || value === "") return fallback
  if (value.startsWith("/")) {
    return value.startsWith("//") || value.startsWith("/\\") ? fallback : value
  }
  try {
    const url = new URL(value)
    const appOrigin = process.env.AUTH_URL ? new URL(process.env.AUTH_URL).origin : null
    return url.origin === appOrigin ? url.pathname + url.search : fallback
  } catch {
    return fallback
  }
}
