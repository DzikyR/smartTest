import "server-only"
import { db } from "@/lib/db"
import { isRateLimited, rateLimit } from "@/lib/rate-limit"
import { ipInNetworks, ipKey, parseNetwork, type Network } from "./cidr"

/**
 * Batas per IP + JARINGAN KAMPUS TEPERCAYA (diatur Super Admin di Kontrol Fitur).
 *
 * Satu kampus/lab biasanya keluar lewat satu IP publik (NAT), sehingga ratusan
 * peserta ujian terlihat sebagai SATU IP. Untuk IP di daftar tepercaya, batas per
 * IP dikalikan `multiplier` — tidak dihapus, agar satu komputer kampus yang
 * disalahgunakan tetap tertahan. Batas per AKUN (kunci akun 5× salah password,
 * gabung 10×/menit per akun) tidak terpengaruh.
 */

export type NetworkSettings = { networks: string[]; multiplier: number }

export const DEFAULT_MULTIPLIER = 20
export const MULTIPLIER_RANGE = { min: 2, max: 100 } as const
export const DEFAULT_NETWORK_SETTINGS: NetworkSettings = { networks: [], multiplier: DEFAULT_MULTIPLIER }
export const NETWORK_SETTING_KEY = "network"

const MIN = 60_000
/** Batas dasar per IP (kunci IPv4 per alamat, IPv6 per /64). */
export const IP_LIMITS = {
  /** Login GAGAL (yang berhasil tidak dihitung) */
  loginFail: { base: 100, windowMs: 15 * MIN, label: "Login gagal" },
  /** Kode kelas/ujian SALAH (gabung yang berhasil tidak dihitung) */
  joinFail: { base: 100, windowMs: 15 * MIN, label: "Kode kelas/ujian salah" },
  register: { base: 5, windowMs: 60 * MIN, label: "Daftar akun" },
  resetRequest: { base: 5, windowMs: 15 * MIN, label: "Minta reset password" },
  resetSubmit: { base: 10, windowMs: 15 * MIN, label: "Kirim password baru (reset)" },
} as const
export type IpLimitKind = keyof typeof IP_LIMITS

export function normalizeSettings(raw: unknown): NetworkSettings {
  const v = (raw ?? {}) as Partial<NetworkSettings>
  const networks = Array.isArray(v.networks) ? v.networks.filter((n): n is string => typeof n === "string" && !!parseNetwork(n)) : []
  const m = Number(v.multiplier)
  const multiplier = Number.isInteger(m) && m >= MULTIPLIER_RANGE.min && m <= MULTIPLIER_RANGE.max ? m : DEFAULT_MULTIPLIER
  return { networks, multiplier }
}

// Cache di memori proses (dibaca di setiap login/gabung). Disimpan → dihapus seketika
// di proses ini; proses lain (bila ada) paling lama basi TTL.
const TTL_MS = 30_000
let cached: { at: number; settings: NetworkSettings; nets: Network[] } | null = null

export function invalidateNetworkSettings() {
  cached = null
}

async function load() {
  if (cached && Date.now() - cached.at < TTL_MS) return cached
  let settings = DEFAULT_NETWORK_SETTINGS
  try {
    const row = await db.siteSetting.findUnique({ where: { key: NETWORK_SETTING_KEY }, select: { value: true } })
    settings = normalizeSettings(row?.value)
  } catch (e) {
    // DB bermasalah: batas bawaan tetap berlaku (lebih ketat, bukan lebih longgar).
    console.error("[network] gagal memuat jaringan tepercaya", e)
    return { at: 0, settings, nets: [] }
  }
  cached = { at: Date.now(), settings, nets: settings.networks.map((n) => parseNetwork(n)!) }
  return cached
}

export async function getNetworkSettings() {
  return (await load()).settings
}

export async function isTrustedIp(ip: string) {
  return ipInNetworks(ip, (await load()).nets)
}

/** Kunci & batas efektif untuk satu IP. */
export async function ipLimit(ip: string, kind: IpLimitKind) {
  const { settings, nets } = await load()
  const trusted = ipInNetworks(ip, nets)
  const { base, windowMs } = IP_LIMITS[kind]
  return { key: `ip:${kind}:${ipKey(ip)}`, limit: trusted ? base * settings.multiplier : base, windowMs, trusted }
}

/** Hitung satu permintaan; false = melewati batas. */
export async function hitIpLimit(ip: string, kind: IpLimitKind) {
  const l = await ipLimit(ip, kind)
  return rateLimit(l.key, l.limit, l.windowMs).ok
}

/** Pola "hitung yang gagal saja": cek dulu (tanpa menambah), lalu panggil `fail()` bila gagal. */
export async function ipFailureGate(ip: string, kind: IpLimitKind) {
  const l = await ipLimit(ip, kind)
  return { blocked: isRateLimited(l.key, l.limit), fail: () => void rateLimit(l.key, l.limit, l.windowMs) }
}
