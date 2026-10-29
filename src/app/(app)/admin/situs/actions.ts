"use server"

import { createHash } from "node:crypto"
import { refresh, updateTag } from "next/cache"
import { db } from "@/lib/db"
import { audit } from "@/lib/audit"
import { requireRole } from "@/lib/auth/dal"
import type { BrandAssetKind } from "@/generated/prisma/enums"
import { SITE_TAGS } from "@/lib/site/config"
import { themeSchema } from "@/lib/site/theme"
import { BRAND_ASSETS, BRAND_KINDS, sniffImage } from "@/lib/site/branding"
import { isTextKey, TEXTS, textError } from "@/content/texts"
import { fail, ok, type ActionResult } from "@/lib/action-result"

function invalidate(tag: string) {
  updateTag(tag)
  refresh()
}

// ---------------------------------------------------------------------------
// Tema warna
// ---------------------------------------------------------------------------

export async function saveTheme(input: unknown): Promise<ActionResult> {
  const actor = await requireRole("SUPER_ADMIN")
  const parsed = themeSchema.safeParse(input)
  if (!parsed.success) return fail("Warna tidak valid — gunakan format #RRGGBB.")
  await db.siteSetting.upsert({ where: { key: "theme" }, create: { key: "theme", value: parsed.data }, update: { value: parsed.data } })
  await audit("SITE_THEME_UPDATED", { userId: actor.id, entity: "SiteSetting", entityId: "theme", metadata: parsed.data })
  invalidate(SITE_TAGS.theme)
  return ok("Tema warna disimpan dan diterapkan ke seluruh situs.")
}

export async function resetTheme(): Promise<ActionResult> {
  const actor = await requireRole("SUPER_ADMIN")
  await db.siteSetting.deleteMany({ where: { key: "theme" } })
  await audit("SITE_THEME_RESET", { userId: actor.id, entity: "SiteSetting", entityId: "theme" })
  invalidate(SITE_TAGS.theme)
  return ok("Tema dikembalikan ke warna bawaan.")
}

// ---------------------------------------------------------------------------
// Logo & favicon
// ---------------------------------------------------------------------------

const isKind = (kind: unknown): kind is BrandAssetKind => typeof kind === "string" && (BRAND_KINDS as string[]).includes(kind)

export async function uploadBrandAsset(kind: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const actor = await requireRole("SUPER_ADMIN")
  if (!isKind(kind)) return fail("Jenis aset tidak dikenal.")
  const spec = BRAND_ASSETS[kind]
  const file = formData.get("file")
  if (!(file instanceof File) || file.size === 0) return fail("Pilih berkas terlebih dahulu.", { file: "Wajib diisi" })
  if (file.size > spec.maxBytes) return fail(`Ukuran berkas maksimal ${spec.maxBytes / 1024} KB.`, { file: "Terlalu besar" })

  const bytes = new Uint8Array(await file.arrayBuffer())
  const mimeType = sniffImage(bytes)
  if (!mimeType || !spec.types.includes(mimeType)) {
    const allowed = spec.types.map((t) => t.replace("image/", "").replace("x-icon", "ico").toUpperCase()).join("/")
    return fail(`Format tidak didukung. Gunakan ${allowed}.`, { file: "Format tidak didukung" })
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex")
  await db.brandAsset.upsert({ where: { kind }, create: { kind, mimeType, data: bytes, sha256 }, update: { mimeType, data: bytes, sha256 } })
  await audit("BRAND_ASSET_UPDATED", { userId: actor.id, entity: "BrandAsset", entityId: kind, metadata: { mimeType, bytes: bytes.length } })
  invalidate(SITE_TAGS.branding)
  return ok(`${spec.label} diperbarui.`)
}

export async function deleteBrandAsset(kind: string): Promise<ActionResult> {
  const actor = await requireRole("SUPER_ADMIN")
  if (!isKind(kind)) return fail("Jenis aset tidak dikenal.")
  await db.brandAsset.deleteMany({ where: { kind } })
  await audit("BRAND_ASSET_DELETED", { userId: actor.id, entity: "BrandAsset", entityId: kind })
  invalidate(SITE_TAGS.branding)
  return ok(`${BRAND_ASSETS[kind].label} dikembalikan ke bawaan.`)
}

// ---------------------------------------------------------------------------
// Teks
// ---------------------------------------------------------------------------

/** Simpan semua teks sekaligus. Kosong atau sama dengan bawaan = override dihapus. */
export async function saveTexts(values: unknown): Promise<ActionResult> {
  const actor = await requireRole("SUPER_ADMIN")
  if (typeof values !== "object" || values === null) return fail("Permintaan tidak valid.")

  const errors: Record<string, string> = {}
  const overrides: { key: string; value: string }[] = []
  const defaults: string[] = []
  for (const [key, raw] of Object.entries(values)) {
    if (!isTextKey(key) || typeof raw !== "string") continue
    const value = raw.trim()
    if (!value || value === TEXTS[key].default) {
      defaults.push(key)
      continue
    }
    const error = textError(key, value)
    if (error) errors[key] = error
    else overrides.push({ key, value })
  }
  if (Object.keys(errors).length) return fail("Periksa kembali teks yang ditandai.", errors)

  await db.$transaction([
    db.contentText.deleteMany({ where: { key: { in: defaults } } }),
    ...overrides.map(({ key, value }) => db.contentText.upsert({ where: { key }, create: { key, value }, update: { value } })),
  ])
  await audit("SITE_TEXTS_UPDATED", { userId: actor.id, entity: "ContentText", metadata: { overrides: overrides.map((o) => o.key) } })
  invalidate(SITE_TAGS.texts)
  return ok(overrides.length ? `Teks disimpan — ${overrides.length} teks memakai versi ubahan.` : "Teks disimpan — semua memakai teks bawaan.")
}
