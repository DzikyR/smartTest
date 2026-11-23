import NextAuth, { CredentialsSignin } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import Google from "next-auth/providers/google"
import { authConfig } from "@/auth.config"
import { db } from "@/lib/db"
import { clientIp } from "@/lib/rate-limit"
import { linkGoogleAccount, type GoogleProfile } from "@/lib/auth/account"
import { verifyCredentials } from "@/lib/auth/credentials"

/** Google aktif bila AUTH_GOOGLE_ID & AUTH_GOOGLE_SECRET diisi (redirect URI: {AUTH_URL}/api/auth/callback/google). */
const googleEnabled = !!(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET)

class AccountLockedError extends CredentialsSignin {
  code = "account_locked"
}
class RateLimitedError extends CredentialsSignin {
  code = "rate_limited"
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    /** Google: tautkan ke akun yang ada (email terverifikasi) atau buat akun peserta baru. */
    async signIn({ account, profile }) {
      if (account?.provider !== "google") return true
      return linkGoogleAccount(profile as GoogleProfile)
    },
    /** Token memakai id & role dari database — bukan id profil Google. */
    async jwt(params) {
      if (params.account?.provider === "google") {
        const user = await db.user.findUnique({ where: { googleId: params.account.providerAccountId }, select: { id: true, name: true, email: true, role: true } })
        if (!user) throw new Error("Akun Google belum tertaut")
        params.user = user
      }
      return authConfig.callbacks.jwt(params)
    },
  },
  providers: [
    ...(googleEnabled ? [Google({ profile: (p) => ({ id: p.sub, name: p.name, email: p.email, role: "PESERTA" as const }) })] : []),
    Credentials({
      credentials: { identifier: {}, password: {} },
      // Logika login (rate limit, kunci akun, audit) dipakai bersama aplikasi mobile: src/lib/auth/credentials.ts
      async authorize(raw, request) {
        const result = await verifyCredentials(raw, { ip: clientIp(request.headers), userAgent: request.headers.get("user-agent")?.slice(0, 255) ?? null })
        if (result.ok) return result.user
        if (result.reason === "rate_limited") throw new RateLimitedError()
        if (result.reason === "locked") throw new AccountLockedError()
        return null
      },
    }),
  ],
})
