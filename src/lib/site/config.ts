import "server-only"
import { cache } from "react"
import { cacheLife, cacheTag } from "next/cache"
import { unstable_rethrow } from "next/navigation"
import { db } from "@/lib/db"
import { DEFAULT_TEXTS, mergeTexts, type Texts } from "@/content/texts"
import { BRAND_ASSETS, type Brand } from "./branding"
import { EMPTY_THEME, parseTheme, type SiteTheme } from "./theme"

/** Tag cache tampilan situs — di-invalidate dengan updateTag() setiap kali Super Admin menyimpan. */
export const SITE_TAGS = { theme: "site:theme", branding: "site:branding", texts: "site:texts", auth: "site:auth" } as const

/**
 * Bila DB bermasalah saat runtime, tampilkan bawaan (error tidak ikut di-cache).
 * Saat `next build` error dilempar: halaman statis jangan sampai terbangun
 * dengan bawaan permanen tanpa tag cache.
 */
async function withFallback<T>(load: () => Promise<T>, fallback: T, what: string): Promise<T> {
  try {
    return await load()
  } catch (e) {
    unstable_rethrow(e) // sinyal internal prerender Next.js bukan kegagalan DB
    if (process.env.NEXT_PHASE === "phase-production-build") throw e
    console.error(`[site] gagal memuat ${what}, memakai bawaan`, e)
    return fallback
  }
}

async function loadTheme(): Promise<SiteTheme> {
  "use cache"
  cacheLife("hours")
  cacheTag(SITE_TAGS.theme)
  const row = await db.siteSetting.findUnique({ where: { key: "theme" }, select: { value: true } })
  return parseTheme(row?.value)
}

export type Branding = { logoLight: string | null; logoDark: string | null; favicon: string | null }

async function loadBranding(): Promise<Branding> {
  "use cache"
  cacheLife("hours")
  cacheTag(SITE_TAGS.branding)
  const rows = await db.brandAsset.findMany({ select: { kind: true, sha256: true } })
  const url = (kind: keyof typeof BRAND_ASSETS) => {
    const row = rows.find((r) => r.kind === kind)
    return row ? `/branding/${BRAND_ASSETS[kind].slug}?v=${row.sha256.slice(0, 16)}` : null
  }
  return { logoLight: url("LOGO_LIGHT"), logoDark: url("LOGO_DARK"), favicon: url("FAVICON") }
}

async function loadTexts(): Promise<Texts> {
  "use cache"
  cacheLife("hours")
  cacheTag(SITE_TAGS.texts)
  const rows = await db.contentText.findMany({ select: { key: true, value: true } })
  return mergeTexts(Object.fromEntries(rows.map((r) => [r.key, r.value])))
}

/** Akses publik yang diatur Super Admin. Bawaan: pendaftaran & login Google dibuka. */
export type AuthSettings = { registrationOpen: boolean; googleLogin: boolean }
const DEFAULT_AUTH: AuthSettings = { registrationOpen: true, googleLogin: true }

async function loadAuthSettings(): Promise<AuthSettings> {
  "use cache"
  cacheLife("hours")
  cacheTag(SITE_TAGS.auth)
  const row = await db.siteSetting.findUnique({ where: { key: "auth" }, select: { value: true } })
  const v = (row?.value ?? {}) as Partial<AuthSettings>
  return { registrationOpen: v.registrationOpen ?? DEFAULT_AUTH.registrationOpen, googleLogin: v.googleLogin ?? DEFAULT_AUTH.googleLogin }
}

/** Kredensial Google OAuth tersedia di environment. */
export const googleConfigured = () => !!(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET)

export const getAuthSettings = cache(async () => {
  const s = await withFallback(loadAuthSettings, DEFAULT_AUTH, "pengaturan akses")
  return { ...s, googleLogin: s.googleLogin && googleConfigured() }
})

export const getTheme = cache(() => withFallback(loadTheme, EMPTY_THEME, "tema"))
export const getBranding = cache(() => withFallback(loadBranding, { logoLight: null, logoDark: null, favicon: null }, "branding"))
export const getTexts = cache(() => withFallback(loadTexts, DEFAULT_TEXTS, "teks"))

/** Nama + logo untuk komponen Logo. */
export async function getBrand(): Promise<Brand> {
  const [t, b] = await Promise.all([getTexts(), getBranding()])
  return { name: t["app.name"], logoLight: b.logoLight, logoDark: b.logoDark }
}
