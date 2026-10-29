import type { NextAuthConfig } from "next-auth"
import { NextResponse } from "next/server"
import { HOME, findProtectedArea } from "@/lib/auth/roles"

/**
 * Konfigurasi ringan tanpa akses database — dipakai Proxy untuk pemeriksaan
 * optimis berbasis JWT. Otorisasi final tetap di Data Access Layer.
 */
export const authConfig = {
  pages: { signIn: "/login", error: "/login" },
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 }, // 8 jam
  trustHost: true,
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id!
        token.role = user.role
        token.authAt = Date.now()
      }
      return token
    },
    session({ session, token }) {
      session.user.id = token.id
      session.user.role = token.role
      session.user.authAt = token.authAt
      return session
    },
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl
      const role = auth?.user?.role

      // Halaman khusus tamu: pengguna yang sudah login langsung ke dashboard.
      if (pathname === "/login" || pathname === "/daftar" || pathname === "/lupa-password") {
        if (role) return NextResponse.redirect(new URL(HOME, request.nextUrl))
        return true
      }
      const area = findProtectedArea(pathname)
      if (!area) return true
      if (!role) return false // → /login?callbackUrl=...
      if (!area.roles.includes(role)) return NextResponse.redirect(new URL(HOME, request.nextUrl))
      return true
    },
  },
} satisfies NextAuthConfig
