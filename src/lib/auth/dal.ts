import "server-only"
import { cache } from "react"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { HOME, SESSION_EXPIRED_URL, type Role } from "@/lib/auth/roles"

/**
 * Data Access Layer — sumber kebenaran otorisasi. Selalu membaca ulang user
 * dari database, sehingga akun yang dinonaktifkan atau diganti role-nya
 * langsung kehilangan akses walau JWT-nya belum kedaluwarsa. Sesi yang dibuat
 * sebelum password terakhir diganti juga dicabut.
 */
export const getCurrentUser = cache(async () => {
  const session = await auth()
  if (!session?.user?.id) return null

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, username: true, role: true, isActive: true, mustChangePassword: true, passwordChangedAt: true },
  })
  if (!user || !user.isActive) return null
  if (user.passwordChangedAt && (session.user.authAt ?? 0) < user.passwordChangedAt.getTime()) return null

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    username: user.username,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  }
})

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>

/** Wajib login dengan salah satu role; pengguna berpassword sementara diarahkan menggantinya dulu. */
export async function requireRole(...roles: Role[]): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) redirect(SESSION_EXPIRED_URL)
  if (user.mustChangePassword) redirect("/ganti-password")
  if (roles.length > 0 && !roles.includes(user.role)) redirect(HOME)
  return user
}

export const isAdmin = (user: { role: Role }) => user.role === "SUPER_ADMIN" || user.role === "ADMIN"
