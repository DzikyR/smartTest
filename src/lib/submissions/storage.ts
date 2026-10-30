import "server-only"
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises"
import path from "node:path"

/**
 * Folder berkas jawaban: UPLOAD_DIR (default ./uploads), di LUAR public/ —
 * berkas hanya bisa diunduh lewat rute yang memeriksa izin. Wajib di-backup.
 */
// turbopackIgnore: folder data runtime — jangan ikut ditelusuri/dibundel saat build.
export const UPLOAD_ROOT = path.resolve(process.env.UPLOAD_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), "uploads"))

/** Kunci → path absolut; menolak kunci yang keluar dari UPLOAD_ROOT (pertahanan berlapis). */
function resolveKey(key: string) {
  const full = path.resolve(UPLOAD_ROOT, key)
  if (!full.startsWith(UPLOAD_ROOT + path.sep)) throw new Error("Kunci berkas tidak valid")
  return full
}

export async function saveStoredFile(key: string, bytes: Uint8Array) {
  const full = resolveKey(key)
  await mkdir(path.dirname(full), { recursive: true })
  await writeFile(full, bytes, { flag: "wx" }) // wx: tidak pernah menimpa berkas yang ada
}

export const readStoredFile = (key: string) => readFile(resolveKey(key))

/** Hapus berkas; yang sudah tidak ada diabaikan (idempoten). */
export async function removeStoredFiles(keys: string[]) {
  await Promise.all(keys.map((k) => unlink(resolveKey(k)).catch((e: NodeJS.ErrnoException) => (e.code === "ENOENT" ? undefined : console.error("[uploads] gagal menghapus", k, e)))))
}
