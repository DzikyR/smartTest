import { db } from "@/lib/db"
import { getMaterialAccess } from "@/lib/classes/materials"
import { attachmentHeader } from "@/lib/submissions/files"
import { readStoredFile } from "@/lib/submissions/storage"
import { authenticate, error } from "@/lib/mobile/http"

/**
 * GET /api/v1/mobile/files/[id] — unduh lampiran berkas postingan kelas (`id` = MaterialAttachment.id).
 * Izin sama dengan /materi-berkas/[id] di web. Isi lampiran tidak pernah berubah untuk id yang
 * sama, jadi aplikasi boleh menyimpannya (cache 7 hari + ETag = sha256 → 304 tanpa unduh ulang).
 */
export async function GET(request: Request, { params }: RouteContext<"/api/v1/mobile/files/[id]">) {
  const ctx = await authenticate(request)
  if (ctx instanceof Response) return ctx
  const { id } = await params
  const row = await db.materialAttachment.findFirst({
    where: { id, type: "FILE" },
    select: { storageKey: true, name: true, mimeType: true, sha256: true, materialId: true, material: { select: { groupId: true } } },
  })
  const allowed = row ? await getMaterialAccess(ctx.user, row.material.groupId, row.materialId) : null
  if (!row?.storageKey || !allowed) return error(404, "NOT_FOUND", "Berkas tidak ditemukan.")

  const etag = row.sha256 ? `"${row.sha256}"` : null
  const cache = { "Cache-Control": "private, max-age=604800", ...(etag ? { ETag: etag } : {}) }
  if (etag && request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: cache })
  const bytes = await readStoredFile(row.storageKey).catch(() => null)
  if (!bytes) return error(410, "GONE", "Berkas tidak tersedia di server.")
  return new Response(new Uint8Array(bytes), {
    headers: {
      ...cache,
      "Content-Type": row.mimeType ?? "application/octet-stream",
      "Content-Disposition": attachmentHeader(row.name),
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
