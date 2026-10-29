import "server-only"
import { cache } from "react"
import { cacheLife, cacheTag } from "next/cache"
import { redirect, unstable_rethrow } from "next/navigation"
import { db } from "@/lib/db"
import { requireRole, type CurrentUser } from "@/lib/auth/dal"
import { HOME, type Role } from "@/lib/auth/roles"
import { FEATURE_KEYS, resolveFeature, type FeatureKey, type FeatureOverrides } from "./registry"

/** Tag cache status fitur — di-invalidate dengan updateTag() setiap kali Super Admin mengubah toggle. */
export const FEATURES_TAG = "site:features"

/** Seluruh override dalam satu query (tabel kecil), disimpan di cache aplikasi. */
async function loadOverrides(): Promise<FeatureOverrides> {
  "use cache"
  cacheLife("hours") // updateTag membuat perubahan dari aplikasi langsung terlihat; ini batas basi untuk perubahan langsung di DB
  cacheTag(FEATURES_TAG)
  const rows = await db.feature.findMany({ select: { key: true, enabled: true, roles: { select: { role: true, enabled: true } } } })
  return Object.fromEntries(rows.map((f) => [f.key, { enabled: f.enabled, roles: Object.fromEntries(f.roles.map((r) => [r.role, r.enabled])) }]))
}

/**
 * Override per request (dedupe antara sidebar, header, dan halaman). Bila
 * database bermasalah, kembali ke bawaan registry — error tidak ikut di-cache.
 */
export const getFeatureOverrides = cache(async (): Promise<FeatureOverrides> => {
  try {
    return await loadOverrides()
  } catch (e) {
    unstable_rethrow(e) // sinyal internal prerender Next.js bukan kegagalan DB
    console.error("[features] gagal memuat status fitur, memakai bawaan", e)
    return {}
  }
})

export async function isFeatureEnabled(key: FeatureKey, role: Role) {
  return resolveFeature(key, role, await getFeatureOverrides())
}

/** Daftar fitur aktif untuk role (untuk menyaring menu & tombol). */
export async function enabledFeatures(role: Role): Promise<FeatureKey[]> {
  const overrides = await getFeatureOverrides()
  return FEATURE_KEYS.filter((k) => resolveFeature(k, role, overrides))
}

/** Untuk halaman: wajib role tertentu DAN fitur aktif; bila nonaktif diarahkan ke dashboard. */
export async function requireFeature(key: FeatureKey, ...roles: Role[]): Promise<CurrentUser> {
  const user = await requireRole(...roles)
  if (!(await isFeatureEnabled(key, user.role))) redirect(HOME)
  return user
}
