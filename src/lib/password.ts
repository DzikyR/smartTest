import "server-only"
import { randomInt } from "node:crypto"
import bcrypt from "bcryptjs"

// Tanpa karakter yang mudah tertukar (0/O, 1/l/I).
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"

/** Password sementara 12 karakter acak (kriptografis) untuk akun baru / reset. */
export function generateTempPassword(length = 12) {
  let out = ""
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)]
  return out
}

/**
 * Cost 12 untuk password pilihan pengguna. Password sementara (wajib diganti saat
 * login pertama) boleh cost 10 agar pembuatan akun massal tetap cepat (±60 ms/akun).
 */
export function hashPassword(password: string, cost: 10 | 12 = 12) {
  return bcrypt.hash(password, cost)
}

const COMMON = ["password", "123456", "qwerty", "admin", "letmein", "welcome", "rahasia", "bismillah", "indonesia"]

/**
 * Kebijakan password pengguna. Mengembalikan pesan kesalahan, atau null bila lolos.
 * Batas 72 byte mengikuti batas bcrypt (byte setelahnya diabaikan diam-diam).
 */
export function passwordPolicyError(password: string, email: string) {
  if (password.length < 10) return "Minimal 10 karakter"
  if (Buffer.byteLength(password, "utf8") > 72) return "Maksimal 72 byte"
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Gunakan kombinasi huruf dan angka"
  const lower = password.toLowerCase()
  const local = email.split("@")[0]?.toLowerCase() ?? ""
  if (local.length >= 4 && lower.includes(local)) return "Jangan memuat nama email Anda"
  if (COMMON.some((w) => lower.includes(w))) return "Terlalu mudah ditebak"
  if (/^(.)\1+$/.test(password)) return "Terlalu mudah ditebak"
  return null
}
