import type { Metadata, Viewport } from "next"
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google"
import { Providers } from "@/components/providers"
import { getBranding, getTexts, getTheme } from "@/lib/site/config"
import { DEFAULT_COLORS, themeCss } from "@/lib/site/theme"
import "./globals.css"

const sans = Plus_Jakarta_Sans({ variable: "--font-sans", subsets: ["latin"], display: "swap" })
const mono = JetBrains_Mono({ variable: "--font-mono", subsets: ["latin"], display: "swap" })

export async function generateMetadata(): Promise<Metadata> {
  const [t, branding] = await Promise.all([getTexts(), getBranding()])
  const name = t["app.name"]
  return {
    title: { default: name, template: `%s · ${name}` },
    description: t["app.tagline"],
    applicationName: name,
    ...(branding.favicon && { icons: { icon: branding.favicon } }),
  }
}

export async function generateViewport(): Promise<Viewport> {
  const theme = await getTheme()
  return {
    width: "device-width",
    initialScale: 1,
    themeColor: [
      { media: "(prefers-color-scheme: light)", color: theme.light.background ?? DEFAULT_COLORS.light.background },
      { media: "(prefers-color-scheme: dark)", color: theme.dark.background ?? DEFAULT_COLORS.dark.background },
    ],
  }
}

/** Warna tema dari Super Admin, disuntikkan inline (tanpa request tambahan, tanpa kedip warna). */
async function ThemeStyle() {
  const css = themeCss(await getTheme())
  return css ? <style id="site-theme">{css}</style> : null
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" suppressHydrationWarning className={`${sans.variable} ${mono.variable}`}>
      <head>
        <ThemeStyle />
      </head>
      <body className="min-h-svh">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
