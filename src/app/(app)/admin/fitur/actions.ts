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
import { parseNetwork, parseNetworkList } from "@/lib/network/cidr"
import { getNetworkSettings, invalidateNetworkSettings, MULTIPLIER_RANGE, NETWORK_SETTING_KEY } from "@/lib/network/trusted"

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

// ---------------------------------------------------------------------------
// Jaringan kampus tepercaya: batas per IP dikalikan untuk IP publik kampus (NAT)
// ---------------------------------------------------------------------------

const MAX_NETWORKS = 50
/** Jaringan terlalu luas = praktis mematikan batas per IP untuk siapa saja. */
const MIN_PREFIX = { 4: 16, 6: 32 } as const

export async function saveTrustedNetworks(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const actor = await requireRole("SUPER_ADMIN")
  const { networks, invalid } = parseNetworkList(String(formData.get("networks") ?? "").slice(0, 10_000))
  const multiplier = Number(formData.get("multiplier"))
  const errors: Record<string, string> = {}
  if (invalid.length) errors.networks = `Bukan IP/CIDR yang sah: ${invalid.slice(0, 5).join(", ")}${invalid.length > 5 ? ", …" : ""}`
  else if (networks.length > MAX_NETWORKS) errors.networks = `Maksimal ${MAX_NETWORKS} jaringan`
  else {
    const broad = networks.filter((n) => {
      const p = parseNetwork(n)!
      return p.prefix < MIN_PREFIX[p.version]
    })
    if (broad.length) errors.networks = `Terlalu luas (minimal /${MIN_PREFIX[4]} untuk IPv4, /${MIN_PREFIX[6]} untuk IPv6): ${broad.join(", ")}`
  }
  if (!Number.isInteger(multiplier) || multiplier < MULTIPLIER_RANGE.min || multiplier > MULTIPLIER_RANGE.max)
    errors.multiplier = `Isi bilangan bulat ${MULTIPLIER_RANGE.min}–${MULTIPLIER_RANGE.max}`
  if (Object.keys(errors).length) return fail("Periksa kembali isian yang ditandai.", errors)

  const before = await getNetworkSettings()
  const value = { networks, multiplier }
  await db.siteSetting.upsert({ where: { key: NETWORK_SETTING_KEY }, create: { key: NETWORK_SETTING_KEY, value }, update: { value } })
  invalidateNetworkSettings()
  await audit("TRUSTED_NETWORKS_CHANGED", { userId: actor.id, entity: "SiteSetting", entityId: NETWORK_SETTING_KEY, severity: "WARNING", metadata: { before, after: value } })
  refresh()
  return ok(networks.length ? `${networks.length} jaringan tepercaya disimpan (batas per IP ×${multiplier}).` : "Daftar jaringan tepercaya dikosongkan; semua IP memakai batas bawaan.")
}
