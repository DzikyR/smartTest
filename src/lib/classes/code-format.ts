/**
 * Format kode akses (kelas & sesi). Aman dipakai di klien — tanpa node:crypto.
 *
 * Tidak peka huruf besar-kecil, dan tanpa karakter yang mudah tertukar
 * (0/O, 1/I/L) agar mudah diketik dari HP atau disalin dari proyektor.
 */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
export const CODE_LENGTH = { CLASS: 7, SESSION: 6 } as const
const CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6,8}$/

/** "k7m-qx2p " → "K7MQX2P"; null bila format salah (ditolak sebelum menyentuh database). */
export function normalizeCode(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 20) return null
  const code = input.toUpperCase().replace(/[\s-]/g, "")
  return CODE_PATTERN.test(code) ? code : null
}

/** Tampilan berkelompok: "K7MQX2P" → "K7M-QX2P". */
export function formatCode(code: string) {
  return code.length > 4 ? `${code.slice(0, 3)}-${code.slice(3)}` : code
}

/** Bersihkan ketikan di input secara langsung: huruf besar, buang karakter di luar alfabet. */
export function sanitizeCodeInput(input: string) {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9-\s]/g, "")
    .slice(0, 12)
}
