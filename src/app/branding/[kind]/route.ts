import { db } from "@/lib/db"
import { kindFromSlug } from "@/lib/site/branding"

/**
 * Logo & favicon (publik — dipakai juga di halaman masuk). URL ber-versi
 * (?v=hash) di-cache browser selamanya; perubahan aset menghasilkan URL baru.
 */
export async function GET(request: Request, { params }: RouteContext<"/branding/[kind]">) {
  const kind = kindFromSlug((await params).kind)
  if (!kind) return new Response("Tidak ditemukan", { status: 404 })
  const asset = await db.brandAsset.findUnique({ where: { kind } })
  if (!asset) return new Response("Tidak ditemukan", { status: 404 })

  const etag = `"${asset.sha256}"`
  const version = new URL(request.url).searchParams.get("v")
  const headers = {
    ETag: etag,
    "Cache-Control": version && asset.sha256.startsWith(version) ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate",
  } // CSP sandbox untuk /branding diatur di next.config.ts (header config menimpa header Route Handler)
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers })
  return new Response(new Uint8Array(asset.data), { headers: { ...headers, "Content-Type": asset.mimeType } })
}
