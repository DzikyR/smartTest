import type { NextConfig } from "next"

const isDev = process.env.NODE_ENV === "development"
const isHttps = (process.env.AUTH_URL ?? "").startsWith("https://")

/**
 * Content-Security-Policy tanpa nonce (nonce tidak kompatibel dengan Partial
 * Prerendering). Skrip inline milik Next.js diizinkan; sumber lain dikunci ke
 * 'self'. Risiko XSS ditekan di aplikasi: React escaping, tanpa HTML mentah.
 */
const csp = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: blob:`,
  `font-src 'self' data:`,
  `connect-src 'self'`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `frame-ancestors 'none'`,
  ...(isHttps ? ["upgrade-insecure-requests"] : []),
].join("; ")

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
]

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  // Pustaka Office (Excel/Word) berjalan di Node.js, tidak perlu dibundel.
  serverExternalPackages: ["exceljs", "mammoth", "docx"],
  experimental: {
    // Unggah berkas soal (≤ 5 MB) lewat Server Action.
    serverActions: { bodySizeLimit: "6mb" },
  },
  async headers() {
    return [
      { source: "/:path((?!branding/).*)", headers: securityHeaders },
      // Aset unggahan Super Admin: tidak boleh menjalankan apa pun walau dibuka langsung.
      { source: "/branding/:path*", headers: [...securityHeaders.filter((h) => h.key !== "Content-Security-Policy"), { key: "Content-Security-Policy", value: "default-src 'none'; sandbox" }] },
    ]
  },
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
}

export default nextConfig
