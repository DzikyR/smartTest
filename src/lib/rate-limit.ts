import "server-only"

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

/**
 * Rate limiter fixed-window di memori. Cukup untuk satu instance server;
 * untuk multi-instance ganti dengan Redis (Laragon sudah menyediakan Redis).
 */
export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now()
  const bucket = buckets.get(key)

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    if (buckets.size > 10_000) sweep(now)
    return { ok: true, remaining: limit - 1, resetAt: now + windowMs }
  }

  bucket.count++
  return { ok: bucket.count <= limit, remaining: Math.max(0, limit - bucket.count), resetAt: bucket.resetAt }
}

function sweep(now: number) {
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key)
}

/**
 * IP klien yang tidak bisa dipalsukan, untuk rate limit & audit log.
 *
 * X-Forwarded-For berformat "klien, proxy1, proxy2". Bagian KIRI bisa diisi
 * siapa saja (penyerang cukup mengirim header palsu untuk lolos rate limit),
 * jadi yang dipercaya hanya entri yang ditambahkan reverse proxy kita sendiri,
 * dihitung dari KANAN. TRUSTED_PROXY_COUNT = jumlah reverse proxy di depan
 * aplikasi (default 1, mis. nginx/Apache dengan $proxy_add_x_forwarded_for).
 *
 * Tanpa reverse proxy, Next.js hanya mengisi header ini dari soket bila klien
 * tidak mengirimnya — sehingga produksi WAJIB di belakang reverse proxy.
 * Header X-Real-IP tidak dipakai karena juga bisa dipalsukan.
 */
export function clientIp(headers: Headers) {
  const hops = Math.max(1, Number.parseInt(process.env.TRUSTED_PROXY_COUNT ?? "1", 10) || 1)
  const chain = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
  return chain[Math.max(0, chain.length - hops)] ?? "unknown"
}
