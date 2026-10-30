import "server-only"
import { randomInt } from "node:crypto"
import type { Prisma } from "@/generated/prisma/client"
import { CODE_ALPHABET, CODE_LENGTH } from "./code-format"

/** Kode acak kriptografis (CSPRNG — bukan Math.random). */
export const generateCode = (length: number) => Array.from({ length }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("")

/**
 * Buat kode kelas aktif baru di dalam transaksi. Kandidat yang sudah dipakai
 * dilewati lebih dulu (error di dalam transaksi Postgres membatalkan seluruh
 * transaksi, jadi tidak bisa "coba lagi setelah P2002"). UNIQUE index tetap
 * menjadi penjamin akhir; 31^7 ≈ 27 miliar kombinasi.
 */
export async function createClassCode(tx: Prisma.TransactionClient, groupId: string, createdById: string) {
  return createCode(tx, CODE_LENGTH.CLASS, (code) => tx.accessCode.create({ data: { code, type: "CLASS", groupId, createdById } }))
}

/** Kode sesi ujian publik: 6 karakter (cepat diketik saat event; 31^6 ≈ 887 juta + rate limit). */
export async function createSessionCode(tx: Prisma.TransactionClient, sessionId: string, createdById: string) {
  return createCode(tx, CODE_LENGTH.SESSION, (code) => tx.accessCode.create({ data: { code, type: "SESSION", sessionId, createdById } }))
}

async function createCode<T>(tx: Prisma.TransactionClient, length: number, create: (code: string) => Promise<T>) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode(length)
    if (await tx.accessCode.findUnique({ where: { code }, select: { id: true } })) continue
    return create(code)
  }
  throw new Error("Gagal membuat kode unik")
}
