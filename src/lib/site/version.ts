import "server-only"
import { cacheLife, cacheTag } from "next/cache"
import { FEATURES_TAG } from "@/lib/features/access"
import { SITE_TAGS } from "./config"

/**
 * Penanda versi pengaturan situs (fitur, tema, logo, teks). Nilainya dibuat
 * ulang setiap kali salah satu tag di-invalidate lewat updateTag() — tanpa
 * query database. Klien membandingkannya untuk me-refresh tab yang terbuka.
 */
export async function getSiteVersion() {
  "use cache"
  cacheLife("max")
  cacheTag(FEATURES_TAG, ...Object.values(SITE_TAGS))
  return Date.now().toString(36)
}
