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
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode(CODE_LENGTH.CLASS)
    if (await tx.accessCode.findUnique({ where: { code }, select: { id: true } })) continue
    return tx.accessCode.create({ data: { code, type: "CLASS", groupId, createdById } })
  }
  throw new Error("Gagal membuat kode kelas unik")
}
