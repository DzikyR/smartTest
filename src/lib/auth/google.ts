/**
 * Keputusan login/daftar dengan Google (murni — bisa diuji unit tanpa Google).
 * Akses database ada di linkGoogleAccount (src/lib/auth/account.ts).
 */
export type GoogleProfile = { sub?: string; email?: string | null; email_verified?: boolean; name?: string | null }
export type GoogleUserRow = { id: string; isActive: boolean; googleId: string | null }
export type GoogleError = "google_disabled" | "google_unverified" | "google_inactive" | "google_conflict" | "google_closed"

export type GoogleDecision =
  | { action: "deny"; error: GoogleError }
  /** Masuk ke akun yang ada; `link` = tautkan googleId untuk pertama kali (akun lama dengan email yang sama). */
  | { action: "login"; userId: string; link: boolean }
  /** Email belum terdaftar → buat akun baru dengan role Peserta. */
  | { action: "create"; email: string; name: string }

export const normalizeGoogleEmail = (email: string | null | undefined) => email?.toLowerCase().trim() || null

export function decideGoogleLogin(
  profile: GoogleProfile,
  settings: { googleLogin: boolean; registrationOpen: boolean },
  /** Akun yang sudah tertaut ke sub Google ini, lalu akun dengan email yang sama. */
  existing: { byGoogleId: GoogleUserRow | null; byEmail: GoogleUserRow | null }
): GoogleDecision {
  if (!settings.googleLogin) return { action: "deny", error: "google_disabled" }
  const email = normalizeGoogleEmail(profile.email)
  // Email hanya dipercaya bila sudah diverifikasi Google — mencegah pengambilalihan akun lewat email palsu.
  if (!profile.sub || !email || profile.email_verified !== true) return { action: "deny", error: "google_unverified" }

  const user = existing.byGoogleId ?? existing.byEmail
  if (user) {
    if (!user.isActive) return { action: "deny", error: "google_inactive" }
    // Email ini sudah tertaut ke akun Google LAIN (mis. alamat dipindahtangankan di Google Workspace).
    if (user.googleId && user.googleId !== profile.sub) return { action: "deny", error: "google_conflict" }
    return { action: "login", userId: user.id, link: !user.googleId }
  }

  if (!settings.registrationOpen) return { action: "deny", error: "google_closed" }
  return { action: "create", email, name: (profile.name?.trim() || email.split("@")[0]).slice(0, 120) }
}
