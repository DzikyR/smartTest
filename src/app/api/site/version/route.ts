import { connection } from "next/server"
import { getSiteVersion } from "@/lib/site/version"

/** Versi pengaturan situs untuk sinkronisasi tab yang terbuka (publik, tanpa data sensitif). */
export async function GET() {
  await connection() // selalu dievaluasi per permintaan, jangan di-prerender saat build
  return Response.json({ version: await getSiteVersion() }, { headers: { "Cache-Control": "no-store" } })
}
