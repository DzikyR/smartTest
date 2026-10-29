"use server"

import { refresh, updateTag } from "next/cache"
import { z } from "zod"
import { db } from "@/lib/db"
import { audit } from "@/lib/audit"
import { requireRole } from "@/lib/auth/dal"
import { FEATURES_TAG } from "@/lib/features/access"
import { getTexts, SITE_TAGS } from "@/lib/site/config"
import { roleLabels } from "@/content/texts"
import { FEATURES, featureEligible, isFeatureKey, TOGGLEABLE_ROLES, type FeatureKey } from "@/lib/features/registry"
import { fail, ok, type ActionResult } from "@/lib/action-result"

const roleSchema = z.enum(TOGGLEABLE_ROLES)

/** Status fitur berubah → cache semua instance halaman langsung kedaluwarsa. */
function invalidate() {
  updateTag(FEATURES_TAG)
  refresh()
}

const severity = (key: FeatureKey, enabled: boolean) => ("critical" in FEATURES[key] && !enabled ? "WARNING" : "INFO")

/** Saklar satu fitur untuk satu role. */
export async function setFeatureRole(key: string, role: string, enabled: boolean): Promise<ActionResult> {
  const actor = await requireRole("SUPER_ADMIN")
  const parsedRole = roleSchema.safeParse(role)
  if (!isFeatureKey(key) || !parsedRole.success || typeof enabled !== "boolean") return fail("Permintaan tidak valid.")
  const r = parsedRole.data
  const label = roleLabels(await getTexts())[r]
  if (!featureEligible(key, r)) return fail(`${label} memang tidak memiliki akses ke fitur ini.`)

  await db.$transaction([
    db.feature.upsert({ where: { key }, create: { key }, update: {} }),
    db.featureRoleAccess.upsert({ where: { featureKey_role: { featureKey: key, role: r } }, create: { featureKey: key, role: r, enabled }, update: { enabled } }),
  ])
  await audit("FEATURE_TOGGLED", { userId: actor.id, entity: "Feature", entityId: key, severity: severity(key, enabled), metadata: { role: r, enabled } })
  invalidate()
  return ok(`${FEATURES[key].name} ${enabled ? "diaktifkan" : "dinonaktifkan"} untuk ${label}.`)
}

/** Saklar global: mematikan fitur untuk semua role tanpa menghapus pengaturan per role. */
export async function setFeatureGlobal(key: string, enabled: boolean): Promise<ActionResult> {
  const actor = await requireRole("SUPER_ADMIN")
  if (!isFeatureKey(key) || typeof enabled !== "boolean") return fail("Permintaan tidak valid.")
  await db.feature.upsert({ where: { key }, create: { key, enabled }, update: { enabled } })
  await audit("FEATURE_TOGGLED", { userId: actor.id, entity: "Feature", entityId: key, severity: severity(key, enabled), metadata: { role: "ALL", enabled } })
  invalidate()
  return ok(`${FEATURES[key].name} ${enabled ? "diaktifkan" : "dinonaktifkan"} untuk semua role.`)
}

/** Hapus override → kembali ke perilaku bawaan (aktif untuk semua role yang berhak). */
export async function resetFeature(key: string): Promise<ActionResult> {
  const actor = await requireRole("SUPER_ADMIN")
  if (!isFeatureKey(key)) return fail("Permintaan tidak valid.")
  await db.feature.deleteMany({ where: { key } })
  await audit("FEATURE_RESET", { userId: actor.id, entity: "Feature", entityId: key })
  invalidate()
  return ok(`${FEATURES[key].name} dikembalikan ke pengaturan bawaan.`)
}

// ---------------------------------------------------------------------------
// Akses publik: pendaftaran mandiri & login Google
// ---------------------------------------------------------------------------

const AUTH_KEYS = ["registrationOpen", "googleLogin"] as const

export async function setAuthSetting(key: string, enabled: boolean): Promise<ActionResult> {
  const actor = await requireRole("SUPER_ADMIN")
  if (!(AUTH_KEYS as readonly string[]).includes(key) || typeof enabled !== "boolean") return fail("Permintaan tidak valid.")
  const row = await db.siteSetting.findUnique({ where: { key: "auth" }, select: { value: true } })
  const value = { ...((row?.value as Record<string, boolean> | null) ?? {}), [key]: enabled }
  await db.siteSetting.upsert({ where: { key: "auth" }, create: { key: "auth", value }, update: { value } })
  await audit("AUTH_SETTING_CHANGED", { userId: actor.id, entity: "SiteSetting", entityId: "auth", severity: "WARNING", metadata: { [key]: enabled } })
  updateTag(SITE_TAGS.auth)
  refresh()
  return ok(`${key === "registrationOpen" ? "Pendaftaran mandiri" : "Masuk dengan Google"} ${enabled ? "dibuka" : "ditutup"}.`)
}
