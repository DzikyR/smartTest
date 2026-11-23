import { connection } from "next/server"
import { mobileConfig } from "@/lib/mobile/version"
import { json } from "@/lib/mobile/http"

/**
 * GET /api/v1/mobile/config — publik, dipanggil aplikasi saat dibuka: versi minimum
 * (force update), versi terbaru, tautan toko, mode perawatan, dan jam server (`now`)
 * untuk sinkronisasi waktu ujian (jam HP tidak dipercaya).
 */
export async function GET() {
  await connection()
  return json({ ...mobileConfig(), now: Date.now() })
}
