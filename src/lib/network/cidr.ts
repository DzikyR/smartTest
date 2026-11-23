import { isIP } from "node:net"

/**
 * Utilitas alamat IP murni (tanpa DB) untuk batas per IP & jaringan tepercaya.
 * IPv4 dihitung per alamat; IPv6 per prefiks /64 (satu perangkat/rumah bisa
 * berganti alamat sesuka hati di dalam /64-nya, jadi per alamat mudah diakali).
 */

export type Network = { version: 4 | 6; base: bigint; prefix: number }

const BITS = { 4: 32, 6: 128 } as const

/** "::ffff:1.2.3.4" (IPv4 lewat soket IPv6) → "1.2.3.4". */
function unmap(ip: string) {
  const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip)
  return m ? m[1] : ip
}

function v4ToBig(ip: string) {
  return ip.split(".").reduce((acc, part) => (acc << BigInt(8)) | BigInt(Number(part)), BigInt(0))
}

function v6ToBig(ip: string) {
  let s = ip.toLowerCase().split("%")[0]
  // IPv4 di ekor (mis. 64:ff9b::1.2.3.4) → dua hextet
  const tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(s)
  if (tail) {
    const v = v4ToBig(tail[1])
    s = s.slice(0, -tail[1].length) + `${(v >> BigInt(16)).toString(16)}:${(v & BigInt(0xffff)).toString(16)}`
  }
  const [head, rest] = s.split("::")
  const left = head ? head.split(":") : []
  const right = rest !== undefined && rest ? rest.split(":") : []
  const fill = rest !== undefined ? Array(8 - left.length - right.length).fill("0") : []
  return [...left, ...fill, ...right].reduce((acc, h) => (acc << BigInt(16)) | BigInt(parseInt(h || "0", 16)), BigInt(0))
}

/** Alamat → {versi, nilai}; null bila bukan IP yang sah. */
export function parseIp(raw: string): { version: 4 | 6; value: bigint } | null {
  const ip = unmap(raw.trim())
  const v = isIP(ip)
  if (v === 4) return { version: 4, value: v4ToBig(ip) }
  if (v === 6) return { version: 6, value: v6ToBig(ip) }
  return null
}

const mask = (version: 4 | 6, prefix: number) => {
  const bits = BigInt(BITS[version])
  return prefix === 0 ? BigInt(0) : ((BigInt(1) << BigInt(prefix)) - BigInt(1)) << (bits - BigInt(prefix))
}

/** "1.2.3.4", "10.0.0.0/8", "2001:db8::/48" → Network; null bila tidak sah. */
export function parseNetwork(raw: string): Network | null {
  const [addr, len, ...extra] = raw.trim().split("/")
  if (extra.length) return null
  const ip = parseIp(addr ?? "")
  if (!ip) return null
  const max = BITS[ip.version]
  if (len !== undefined && !/^\d{1,3}$/.test(len)) return null
  const prefix = len === undefined ? max : Number(len)
  if (prefix > max) return null
  return { version: ip.version, base: ip.value & mask(ip.version, prefix), prefix }
}

/** Tulisan baku sebuah jaringan (alamat dasar/prefiks), untuk disimpan & ditampilkan. */
export function formatNetwork(n: Network) {
  if (n.version === 4) {
    const parts = [BigInt(24), BigInt(16), BigInt(8), BigInt(0)].map((s) => String((n.base >> s) & BigInt(255)))
    return `${parts.join(".")}/${n.prefix}`
  }
  const hextets = Array.from({ length: 8 }, (_, i) => ((n.base >> BigInt(112 - i * 16)) & BigInt(0xffff)).toString(16))
  // Persingkat deret nol terpanjang menjadi "::"
  let best = { at: -1, len: 0 }
  for (let i = 0; i < 8; ) {
    if (hextets[i] !== "0") { i++; continue }
    let j = i
    while (j < 8 && hextets[j] === "0") j++
    if (j - i > best.len && j - i > 1) best = { at: i, len: j - i }
    i = j
  }
  const text = best.at < 0 ? hextets.join(":") : `${hextets.slice(0, best.at).join(":")}::${hextets.slice(best.at + best.len).join(":")}`
  return `${text}/${n.prefix}`
}

export function ipInNetwork(ip: string, n: Network) {
  const p = parseIp(ip)
  return !!p && p.version === n.version && (p.value & mask(n.version, n.prefix)) === n.base
}

export const ipInNetworks = (ip: string, nets: Network[]) => nets.some((n) => ipInNetwork(ip, n))

/** Kunci rate limit: IPv4 per alamat, IPv6 per /64; selain IP sah dikembalikan apa adanya. */
export function ipKey(ip: string) {
  const p = parseIp(ip)
  if (!p) return ip
  if (p.version === 4) return unmap(ip.trim())
  return formatNetwork({ version: 6, base: p.value & mask(6, 64), prefix: 64 })
}

/**
 * Daftar jaringan dari teks (satu per baris, atau dipisah koma/spasi; "#" = komentar).
 * Mengembalikan jaringan baku tanpa duplikat, atau daftar entri yang tidak sah.
 */
export function parseNetworkList(text: string): { networks: string[]; invalid: string[] } {
  const entries = text
    .split("\n")
    .map((line) => line.replace(/#.*/, ""))
    .flatMap((line) => line.split(/[\s,;]+/))
    .map((s) => s.trim())
    .filter(Boolean)
  const networks: string[] = []
  const invalid: string[] = []
  for (const e of entries) {
    const n = parseNetwork(e)
    if (!n) invalid.push(e)
    else if (!networks.includes(formatNetwork(n))) networks.push(formatNetwork(n))
  }
  return { networks, invalid }
}
