import { z } from "zod"

/**
 * Tema dinamis: Super Admin memilih 4 warna dasar per mode; token turunan
 * (foreground, ring, sidebar) dihitung otomatis agar kontras tetap terbaca.
 * Hanya #RRGGBB yang diterima — nilai lain bisa menjadi CSS injection.
 */
export const THEME_TOKENS = [
  { key: "primary", label: "Primary", hint: "Tombol utama, menu aktif, tautan, kepala kartu" },
  { key: "secondary", label: "Secondary", hint: "Tombol sekunder & latar lembut" },
  { key: "accent", label: "Accent", hint: "Sorotan saat hover & item terpilih" },
  { key: "background", label: "Background", hint: "Kanvas halaman" },
] as const

export type ThemeToken = (typeof THEME_TOKENS)[number]["key"]
export type ThemeMode = "light" | "dark"
export type ThemeColors = Partial<Record<ThemeToken, string>>
export type SiteTheme = Record<ThemeMode, ThemeColors>

export const EMPTY_THEME: SiteTheme = { light: {}, dark: {} }

/** Padanan hex dari palet bawaan globals.css (untuk color picker & hitung kontras). */
export const DEFAULT_COLORS: Record<ThemeMode, Record<ThemeToken | "foreground" | "softForeground", string>> = {
  light: { primary: "#5b4fe9", secondary: "#eeedfa", accent: "#eeedfa", background: "#f5f5fb", foreground: "#1c1b2b", softForeground: "#3d348b" },
  dark: { primary: "#8a7ef0", secondary: "#2b2a3f", accent: "#2b2a3f", background: "#16141f", foreground: "#f3f3f7", softForeground: "#dcdaf5" },
}

const INK = "#15131f"
const WHITE = "#ffffff"

const hex = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Gunakan format #RRGGBB")
  .transform((s) => s.toLowerCase())
const colorsSchema = z.object({ primary: hex.optional(), secondary: hex.optional(), accent: hex.optional(), background: hex.optional() }).strict()
export const themeSchema = z.object({ light: colorsSchema, dark: colorsSchema })

/** Nilai dari DB divalidasi ulang; data rusak diabaikan (kembali ke bawaan). */
export function parseTheme(value: unknown): SiteTheme {
  const r = themeSchema.safeParse(value)
  return r.success ? r.data : EMPTY_THEME
}

// ---- Kontras WCAG ----
function luminance(color: string) {
  const n = parseInt(color.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

/** Kandidat pertama yang memenuhi kontras AA (4.5:1); bila tak ada, yang paling kontras. */
export function pickForeground(bg: string, candidates: string[]) {
  return candidates.find((c) => contrast(bg, c) >= 4.5) ?? candidates.reduce((best, c) => (contrast(bg, c) > contrast(bg, best) ? c : best))
}

/** Variabel CSS untuk satu mode — hanya token yang diubah (sisanya tetap dari globals.css). */
export function themeVars(mode: ThemeMode, colors: ThemeColors): Record<string, string> {
  const d = DEFAULT_COLORS[mode]
  const vars: Record<string, string> = {}
  if (colors.primary) {
    const fg = pickForeground(colors.primary, [WHITE, INK])
    Object.assign(vars, {
      "--primary": colors.primary,
      "--primary-foreground": fg,
      "--ring": colors.primary,
      "--sidebar-primary": colors.primary,
      "--sidebar-primary-foreground": fg,
      "--sidebar-ring": colors.primary,
      "--chart-1": colors.primary,
    })
  }
  if (colors.secondary) Object.assign(vars, { "--secondary": colors.secondary, "--secondary-foreground": pickForeground(colors.secondary, [d.softForeground, d.foreground, INK, WHITE]) })
  if (colors.accent) {
    const fg = pickForeground(colors.accent, [d.softForeground, d.foreground, INK, WHITE])
    Object.assign(vars, { "--accent": colors.accent, "--accent-foreground": fg, "--sidebar-accent": colors.accent, "--sidebar-accent-foreground": fg })
  }
  if (colors.background) Object.assign(vars, { "--background": colors.background, "--foreground": pickForeground(colors.background, [d.foreground, INK, WHITE]) })
  return vars
}

/**
 * CSS override yang disuntikkan di <head>. Selector berspesifisitas (0,2,0)
 * agar menang atas :root/.dark di globals.css tanpa bergantung urutan stylesheet.
 */
export function themeCss(theme: SiteTheme) {
  const block = (selector: string, vars: Record<string, string>) => {
    const body = Object.entries(vars)
      .map(([k, v]) => `${k}:${v}`)
      .join(";")
    return body ? `${selector}{${body}}` : ""
  }
  return block(":root:not(.dark)", themeVars("light", theme.light)) + block(":root.dark", themeVars("dark", theme.dark))
}

/** Peringatan kontras untuk editor (pasangan warna yang dihasilkan < 4.5:1). */
export function contrastWarnings(mode: ThemeMode, colors: ThemeColors) {
  const vars = themeVars(mode, colors)
  const pairs: [string, string, string][] = [
    ["Primary", "--primary", "--primary-foreground"],
    ["Secondary", "--secondary", "--secondary-foreground"],
    ["Accent", "--accent", "--accent-foreground"],
    ["Background", "--background", "--foreground"],
  ]
  return pairs.filter(([, bg, fg]) => vars[bg] && contrast(vars[bg], vars[fg]) < 4.5).map(([label, bg, fg]) => ({ label, ratio: Math.round(contrast(vars[bg], vars[fg]) * 10) / 10 }))
}
