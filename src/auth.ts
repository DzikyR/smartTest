import NextAuth, { CredentialsSignin } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import Google from "next-auth/providers/google"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { authConfig } from "@/auth.config"
import { db } from "@/lib/db"
import { clientIp, rateLimit } from "@/lib/rate-limit"
import { linkGoogleAccount, type GoogleProfile } from "@/lib/auth/account"

/** Google aktif bila AUTH_GOOGLE_ID & AUTH_GOOGLE_SECRET diisi (redirect URI: {AUTH_URL}/api/auth/callback/google). */
const googleEnabled = !!(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET)

const MAX_FAILED_ATTEMPTS = 5
const LOCK_DURATION_MS = 15 * 60 * 1000

// Hash dummy agar waktu respons sama saat akun tidak ada (cegah user enumeration).
const DUMMY_HASH = bcrypt.hashSync("smarttest-dummy-password", 12)

const credentialsSchema = z.object({
  /** Email atau username (NIM/NIP/nomor peserta) */
  identifier: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(128),
})

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
      async authorize(raw, request) {
        const parsed = credentialsSchema.safeParse(raw)
        if (!parsed.success) return null
        const identifier = parsed.data.identifier.toLowerCase()
        const { password } = parsed.data

        const ip = clientIp(request.headers)
        const userAgent = request.headers.get("user-agent")?.slice(0, 255) ?? null
        if (!rateLimit(`login:${ip}`, 20, 15 * 60 * 1000).ok) throw new RateLimitedError()

        const user = await db.user.findFirst({
          where: identifier.includes("@") ? { email: identifier } : { username: { equals: identifier, mode: "insensitive" } },
        })

        if (!user || !user.isActive) {
          await bcrypt.compare(password, DUMMY_HASH)
          await db.auditLog.create({
            data: { action: "LOGIN_FAILED", severity: "WARNING", userId: user?.id, ipAddress: ip, userAgent, metadata: { identifier, reason: user ? "inactive" : "unknown" } },
          })
          return null
        }
        if (user.lockedUntil && user.lockedUntil > new Date()) throw new AccountLockedError()

        if (!(await bcrypt.compare(password, user.passwordHash))) {
          const failed = user.failedLoginCount + 1
          const lock = failed >= MAX_FAILED_ATTEMPTS
          await db.$transaction([
            db.user.update({
              where: { id: user.id },
              data: { failedLoginCount: lock ? 0 : failed, lockedUntil: lock ? new Date(Date.now() + LOCK_DURATION_MS) : null },
            }),
            db.auditLog.create({ data: { action: lock ? "ACCOUNT_LOCKED" : "LOGIN_FAILED", severity: lock ? "CRITICAL" : "WARNING", userId: user.id, ipAddress: ip, userAgent } }),
          ])
          if (lock) throw new AccountLockedError()
          return null
        }

        await db.$transaction([
          db.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } }),
          db.auditLog.create({ data: { action: "LOGIN_SUCCESS", userId: user.id, ipAddress: ip, userAgent } }),
        ])
        return { id: user.id, name: user.name, email: user.email, role: user.role }
      },
    }),
  ],
})
