import { connection } from "next/server"
import { getAuthSettings, getBranding, getTexts, getTheme } from "@/lib/site/config"
import { weakEtag } from "@/lib/mobile/lms"

/** Teks situs yang dipakai aplikasi (diubah Super Admin di Administrasi → Tampilan Situs). */
const APP_TEXTS = [
  "app.name",
  "app.tagline",
  "login.title",
  "login.subtitle",
  "login.cta",
  "dashboard.greeting",
  "dashboard.participant.available",
  "dashboard.participant.idle",
  "dashboard.participant.cta",
  "nav.dashboard",
  "nav.kelas",
  "nav.section.ujian",
  "nav.ujian",
  "nav.hasil",
  "nav.section.akun",
  "nav.profil",
  "role.PESERTA",
] as const

/**
 * GET /api/v1/mobile/site — publik (dipakai juga di layar masuk). Tampilan aplikasi mengikuti
 * Tampilan Situs di web: nama, warna tema (terang/gelap), logo, dan teks. Ber-ETag; aplikasi
 * menyimpan salinan terakhir sehingga tampilan tetap sama saat offline.
 * Logo berupa path relatif (/branding/…?v=hash) — gambar di-cache selamanya per versi.
 */
export async function GET(request: Request) {
  await connection()
  const [texts, theme, branding, auth] = await Promise.all([getTexts(), getTheme(), getBranding(), getAuthSettings()])
  const body = {
    name: texts["app.name"],
    theme,
    logo: { light: branding.logoLight, dark: branding.logoDark },
    texts: Object.fromEntries(APP_TEXTS.map((k) => [k, texts[k]])),
    registrationOpen: auth.registrationOpen,
  }
  const etag = weakEtag(body)
  const headers = { ETag: etag, "Cache-Control": "public, no-cache" }
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers })
  return Response.json(body, { headers })
}
