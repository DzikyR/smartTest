import { z } from "zod"
import { endSession } from "@/lib/mobile/session"
import { forgetDevicePush } from "@/lib/mobile/push"
import { json, readJson } from "@/lib/mobile/http"

const schema = z.object({ refreshToken: z.string().min(20).max(200) })

/** POST /api/v1/mobile/auth/logout  { refreshToken } — cabut sesi perangkat ini & hentikan notifikasinya. */
export async function POST(request: Request) {
  const body = await readJson(request, schema)
  if (body instanceof Response) return body
  const session = await endSession(body.refreshToken)
  if (session) await forgetDevicePush(session.userId, session.deviceId)
  // Selalu 200: logout tidak membocorkan apakah token pernah ada.
  return json({ ok: true })
}
