import { z } from "zod"

/** Skema zod yang dipakai bersama oleh Server Action admin & dosen. */

export const code = (max = 20) =>
  z
    .string()
    .trim()
    .min(1, "Wajib diisi")
    .max(max, `Maksimal ${max} karakter`)
    .regex(/^[A-Za-z0-9.\-_]+$/, "Hanya huruf, angka, titik, strip, garis bawah")

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Maksimal ${max} karakter`)
    .optional()
    .transform((v) => v || null)

export const checkbox = z
  .string()
  .optional()
  .transform((v) => v === "on")

export const intIn = (min: number, max: number, label: string) =>
  z.coerce.number(`${label} harus angka`).int(`${label} harus bilangan bulat`).min(min, `Minimal ${min}`).max(max, `Maksimal ${max}`)

/** Angka opsional dari input form ("" → null). */
export const optionalNumber = (min: number, max: number, label: string, int = true) =>
  z
    .string()
    .trim()
    .optional()
    .transform((v, ctx) => {
      if (!v) return null
      const n = Number(v)
      if (!Number.isFinite(n) || (int && !Number.isInteger(n))) {
        ctx.addIssue({ code: "custom", message: `${label} harus ${int ? "bilangan bulat" : "angka"}` })
        return z.NEVER
      }
      if (n < min || n > max) {
        ctx.addIssue({ code: "custom", message: `${label} ${min}–${max}` })
        return z.NEVER
      }
      return n
    })

/**
 * URL opsional, hanya http/https — mencegah `javascript:`/`data:` yang bisa
 * menjadi XSS saat dirender sebagai tautan.
 */
export const optionalHttpUrl = z
  .string()
  .trim()
  .max(2000, "URL terlalu panjang")
  .optional()
  .transform((v) => v || null)
  .pipe(z.url({ protocol: /^https?$/, message: "URL harus diawali http:// atau https://" }).nullable())

/** Nilai <input type="datetime-local"> (zona Asia/Jakarta, UTC+7, tanpa DST). */
export const optionalLocalDateTime = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (!v) return null
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) {
      ctx.addIssue({ code: "custom", message: "Format tanggal/jam tidak valid" })
      return z.NEVER
    }
    const date = new Date(`${v}:00+07:00`)
    if (Number.isNaN(date.getTime())) {
      ctx.addIssue({ code: "custom", message: "Tanggal tidak valid" })
      return z.NEVER
    }
    return date
  })
