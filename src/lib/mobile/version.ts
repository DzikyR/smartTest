/**
 * Versi aplikasi mobile & force update — fungsi murni agar mudah diuji.
 * Versi berformat semver sederhana "1.4.2" (suffix build "+12" / "-beta" diabaikan).
 */

export function parseVersion(v: string | null | undefined): [number, number, number] | null {
  const m = /^(\d{1,4})\.(\d{1,4})\.(\d{1,6})(?:[-+].*)?$/.exec((v ?? "").trim())
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

/** true bila `a` lebih lama dari `b`. Versi tidak sah dianggap paling lama. */
export function versionLess(a: string | null | undefined, b: string) {
  const x = parseVersion(a)
  const y = parseVersion(b)
  if (!y) return false
  if (!x) return true
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i]
  return false
}

export type MobileConfig = {
  minVersion: string | null
  latestVersion: string | null
  storeUrl: { android: string | null; ios: string | null }
  maintenance: boolean
  message: string | null
}

/** Pengaturan dari environment (tanpa database): ubah .env lalu restart untuk memaksa update. */
export function mobileConfig(env: Record<string, string | undefined> = process.env): MobileConfig {
  const v = (s: string | undefined) => (parseVersion(s) ? s!.trim() : null)
  return {
    minVersion: v(env.MOBILE_MIN_VERSION),
    latestVersion: v(env.MOBILE_LATEST_VERSION),
    storeUrl: { android: env.MOBILE_ANDROID_URL || null, ios: env.MOBILE_IOS_URL || null },
    maintenance: env.MOBILE_MAINTENANCE === "1" || env.MOBILE_MAINTENANCE === "true",
    message: env.MOBILE_MESSAGE || null,
  }
}
