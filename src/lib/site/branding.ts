import type { BrandAssetKind } from "@/generated/prisma/enums"

/** Aset branding: slug URL, batas ukuran, dan format yang diizinkan (tanpa SVG — bisa berisi skrip). */
export const BRAND_ASSETS: Record<BrandAssetKind, { slug: string; label: string; hint: string; maxBytes: number; types: readonly string[] }> = {
  LOGO_LIGHT: { slug: "logo-light", label: "Logo — mode terang", hint: "Tampil di sidebar & header pada latar terang. PNG/WebP/JPEG transparan, tinggi ±72 px, maks. 512 KB.", maxBytes: 512 * 1024, types: ["image/png", "image/webp", "image/jpeg"] },
  LOGO_DARK: { slug: "logo-dark", label: "Logo — mode gelap", hint: "Tampil pada mode gelap & panel berwarna di halaman masuk. Kosong = memakai logo mode terang.", maxBytes: 512 * 1024, types: ["image/png", "image/webp", "image/jpeg"] },
  FAVICON: { slug: "favicon", label: "Favicon", hint: "Ikon tab browser. PNG persegi (32–512 px) atau ICO, maks. 128 KB.", maxBytes: 128 * 1024, types: ["image/png", "image/x-icon"] },
}

export const BRAND_KINDS = Object.keys(BRAND_ASSETS) as BrandAssetKind[]

export const kindFromSlug = (slug: string) => BRAND_KINDS.find((k) => BRAND_ASSETS[k].slug === slug) ?? null

/** Kenali format dari isi berkas (magic bytes), bukan dari nama atau MIME kiriman klien. */
export function sniffImage(bytes: Uint8Array): string | null {
  const at = (i: number, ...sig: number[]) => sig.every((b, j) => bytes[i + j] === b)
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png"
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg"
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp"
  if (at(0, 0x00, 0x00, 0x01, 0x00)) return "image/x-icon"
  return null
}

/** Nama + URL logo untuk komponen Logo (aman dikirim ke klien). */
export type Brand = { name: string; logoLight: string | null; logoDark: string | null }
