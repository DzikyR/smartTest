import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto"
import { gunzipSync, gzipSync } from "node:zlib"

/**
 * Paket soal terenkripsi untuk aplikasi mobile — fungsi murni (tanpa database).
 *
 * Aplikasi mengunduh paket SEBELUM ujian dimulai (tersebar dengan jitter), sehingga saat
 * ratusan peserta menekan Mulai bersamaan server hanya mengirim kunci 32 byte, bukan
 * seluruh soal. Isi paket = soal tanpa kunci jawaban (sama dengan yang dilihat web).
 *
 * Format biner: [12 byte IV][ciphertext AES-256-GCM dari gzip(JSON)][16 byte tag].
 * Versi = hash isi soal → berubah otomatis bila soal diedit; dipakai sebagai ETag.
 * Kunci = HMAC(kunci server, examId:versi) → tidak perlu disimpan di database.
 */

export type PackageQuestion = { id: string; type: string; prompt: string; options: unknown; points: number }

export type ExamPackage = { version: string; blob: Buffer; key: Buffer }

export function packageVersion(examId: string, questions: PackageQuestion[]) {
  return createHash("sha256").update(examId).update("\0").update(JSON.stringify(questions)).digest("hex").slice(0, 24)
}

export function packageKey(serverKey: Buffer, examId: string, version: string) {
  return createHmac("sha256", serverKey).update(`${examId}:${version}`).digest()
}

export function sealPackage(examId: string, questions: PackageQuestion[], serverKey: Buffer): ExamPackage {
  const version = packageVersion(examId, questions)
  const key = packageKey(serverKey, examId, version)
  const plain = gzipSync(JSON.stringify({ v: version, examId, questions: questions.map(({ id, type, prompt, options, points }) => ({ id, type, prompt, options, points })) }), { level: 9 })
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const blob = Buffer.concat([iv, cipher.update(plain), cipher.final(), cipher.getAuthTag()])
  return { version, blob, key }
}

/** Kebalikan sealPackage — dipakai uji (aplikasi melakukan hal yang sama di Dart). */
export function openPackage(blob: Buffer, key: Buffer) {
  const iv = blob.subarray(0, 12)
  const tag = blob.subarray(blob.length - 16)
  const decipher = createDecipheriv("aes-256-gcm", key, iv)
  decipher.setAuthTag(tag)
  const plain = Buffer.concat([decipher.update(blob.subarray(12, blob.length - 16)), decipher.final()])
  return JSON.parse(gunzipSync(plain).toString("utf8")) as { v: string; examId: string; questions: PackageQuestion[] }
}
