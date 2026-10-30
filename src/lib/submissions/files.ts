/**
 * Aturan berkas jawaban Tugas (murni — tanpa akses disk, bisa diuji unit).
 * Format dikenali dari ISI berkas (magic bytes); ekstensi hanya membedakan
 * jenis di dalam keluarga yang sama (mis. .docx vs .xlsx — keduanya ZIP).
 */
export const SUBMISSION_LIMITS = { maxBytes: 8 * 1024 * 1024, maxFiles: 5, maxTextLength: 20_000 } as const

export const SUBMISSION_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.png,.jpg,.jpeg,.webp"
export const SUBMISSION_FORMATS_LABEL = "PDF, Word, Excel, PowerPoint, ZIP, PNG/JPG/WebP"

const ZIP_FAMILY: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  zip: "application/zip",
}
const OLE_FAMILY: Record<string, string> = { doc: "application/msword", xls: "application/vnd.ms-excel", ppt: "application/vnd.ms-powerpoint" }

const extOf = (name: string) => name.toLowerCase().match(/\.([a-z0-9]{1,5})$/)?.[1] ?? ""

/** MIME dari isi berkas + ekstensi, atau null bila tidak diizinkan (mis. HTML/SVG/EXE yang diberi nama .pdf). */
export function sniffSubmission(bytes: Uint8Array, fileName: string): string | null {
  const at = (i: number, ...sig: number[]) => sig.every((b, j) => bytes[i + j] === b)
  const ext = extOf(fileName)
  if (at(0, 0x25, 0x50, 0x44, 0x46, 0x2d)) return ext === "pdf" ? "application/pdf" : null // %PDF-
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return ext === "png" ? "image/png" : null
  if (at(0, 0xff, 0xd8, 0xff)) return ext === "jpg" || ext === "jpeg" ? "image/jpeg" : null
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return ext === "webp" ? "image/webp" : null
  if (at(0, 0x50, 0x4b, 0x03, 0x04)) return ZIP_FAMILY[ext] ?? null // PK.. (docx/xlsx/pptx/zip)
  if (at(0, 0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)) return OLE_FAMILY[ext] ?? null // Office lama
  return null
}

/** Nama berkas aman untuk ditampilkan/diunduh: tanpa path, karakter kontrol, maks. 120 karakter (ekstensi dipertahankan). */
export function safeFileName(name: string) {
  const base = name.split(/[\\/]/).pop() ?? ""
  const clean = base
    .replace(/[\u0000-\u001f\u007f"<>:|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim()
  if (!clean || /^\.+$/.test(clean)) return "berkas"
  if (clean.length <= 120) return clean
  const ext = extOf(clean)
  return ext ? `${clean.slice(0, 115 - ext.length)}….${ext}` : clean.slice(0, 120)
}

/** Header Content-Disposition yang aman untuk nama non-ASCII (RFC 6266/5987). */
export function attachmentHeader(name: string) {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_")
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`
}
