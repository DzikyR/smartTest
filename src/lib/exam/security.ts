/**
 * Pengamanan ujian — fungsi murni (tanpa database/request) agar mudah diuji.
 *
 *  - Daftar IP/CIDR: membatasi ujian ke jaringan tertentu (mis. lab kampus).
 *  - Safe Exam Browser (SEB): setiap permintaan dari SEB membawa header
 *    `X-SafeExamBrowser-ConfigKeyHash` = SHA-256(URL absolut tanpa fragmen + Config Key).
 *    Config Key diperoleh dari SEB Config Tool untuk berkas .seb kampus; server
 *    mencocokkan hash tersebut sehingga browser biasa tidak dapat menyamar.
 */

import { createHash } from "node:crypto"

// ---------------------------------------------------------------------------
// IP / CIDR
// ---------------------------------------------------------------------------

type IpRule = { kind: 4; base: number; mask: number } | { kind: 6; value: string }

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".")
  if (parts.length !== 4) return null
  let n = 0
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null
    const v = Number(p)
    if (v > 255) return null
    n = n * 256 + v
  }
  return n
}

/** Normalisasi IP klien: buang prefiks IPv4-mapped (::ffff:1.2.3.4) dan zona IPv6. */
export function normalizeIp(ip: string) {
  const s = ip.trim().toLowerCase().replace(/%.*$/, "")
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(s)
  return mapped ? mapped[1] : s
}

/** Urai daftar IP/CIDR (dipisah koma, spasi, atau baris). */
export function parseIpList(text: string | null | undefined) {
  const rules: IpRule[] = []
  const invalid: string[] = []
  for (const raw of (text ?? "").split(/[\s,;]+/).filter(Boolean)) {
    const [addr, bitsRaw] = raw.split("/")
    const v4 = ipv4ToInt(addr)
    if (v4 !== null) {
      const bits = bitsRaw === undefined ? 32 : Number(bitsRaw)
      if (!Number.isInteger(bits) || bits < 0 || bits > 32) {
        invalid.push(raw)
        continue
      }
      const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
      rules.push({ kind: 4, base: (v4 & mask) >>> 0, mask })
    } else if (bitsRaw === undefined && /^[0-9a-f:]+$/i.test(addr) && addr.includes(":")) {
      rules.push({ kind: 6, value: normalizeIp(addr) })
    } else {
      invalid.push(raw)
    }
  }
  return { rules, invalid }
}

/** true bila daftar kosong (tanpa batasan) atau IP cocok salah satu aturan. */
export function ipAllowed(ip: string, list: string | null | undefined) {
  const { rules } = parseIpList(list)
  if (rules.length === 0) return true
  const norm = normalizeIp(ip)
  const v4 = ipv4ToInt(norm)
  return rules.some((r) => (r.kind === 4 ? v4 !== null && ((v4 & r.mask) >>> 0) === r.base : r.value === norm))
}

// ---------------------------------------------------------------------------
// Safe Exam Browser
// ---------------------------------------------------------------------------

/** Config Key SEB: 64 karakter heksadesimal, satu per baris/koma. */
export function parseConfigKeys(text: string | null | undefined) {
  const keys: string[] = []
  const invalid: string[] = []
  for (const raw of (text ?? "").split(/[\s,;]+/).filter(Boolean)) {
    if (/^[0-9a-f]{64}$/i.test(raw)) keys.push(raw.toLowerCase())
    else invalid.push(raw)
  }
  return { keys, invalid }
}

export const sha256Hex = (s: string) => createHash("sha256").update(s).digest("hex")

/** Hash yang dikirim SEB untuk URL tertentu. */
export function sebKeyHash(url: string, configKey: string) {
  return sha256Hex(url.replace(/#.*$/, "") + configKey)
}

/** Cocokkan hash dari SEB terhadap kombinasi URL kandidat × Config Key yang diterima. */
export function sebHashValid(hashes: (string | null | undefined)[], urls: string[], keys: string[]) {
  const given = new Set(hashes.filter((h): h is string => !!h).map((h) => h.trim().toLowerCase()))
  if (given.size === 0 || keys.length === 0) return false
  return urls.some((url) => keys.some((key) => given.has(sebKeyHash(url, key))))
}

/** Penanda User-Agent SEB (dapat dipalsukan — hanya dipakai bila Config Key belum diatur). */
export const isSebUserAgent = (ua: string | null | undefined) => /\bSEB\/\d/i.test(ua ?? "")
