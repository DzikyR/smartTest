import type { Metadata, Viewport } from "next"
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google"
import { Providers } from "@/components/providers"
import "./globals.css"

const sans = Plus_Jakarta_Sans({ variable: "--font-sans", subsets: ["latin"], display: "swap" })
const mono = JetBrains_Mono({ variable: "--font-mono", subsets: ["latin"], display: "swap" })

export const metadata: Metadata = {
  title: { default: "SmartTest", template: "%s · SmartTest" },
  description: "SmartTest — platform ujian online (CBT) untuk kuis, UTS, UAS, dan tes umum.",
  applicationName: "SmartTest",
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5fb" },
    { media: "(prefers-color-scheme: dark)", color: "#16141f" },
  ],
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" suppressHydrationWarning className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-svh">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
