import NextAuth from "next-auth"
import { authConfig } from "@/auth.config"

// Proxy (Next.js 16): pemeriksaan optimis dari JWT tanpa query database.
export default NextAuth(authConfig).auth

export const config = {
  matcher: ["/login", "/dashboard/:path*", "/admin/:path*", "/mata-uji/:path*", "/bank-soal/:path*", "/ujian-kelola/:path*", "/ujian/:path*", "/hasil/:path*", "/profil/:path*"],
}
