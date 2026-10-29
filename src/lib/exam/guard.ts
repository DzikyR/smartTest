import "server-only"
import { randomBytes } from "node:crypto"
import { cookies, headers } from "next/headers"
import { clientIp } from "@/lib/rate-limit"
import { ipAllowed, isSebUserAgent, parseConfigKeys, sebHashValid, sha256Hex } from "./security"

/**
 * Penjaga lingkungan ujian (dipanggil halaman ujian & setiap Server Action
 * mahasiswa): jaringan yang diizinkan, Safe Exam Browser, dan kunci perangkat.
 */

export type GuardedTask = {
  id: string
  allowedIps: string | null
  requireSeb: boolean
  sebConfigKeys: string | null
  lockDevice: boolean
}

export type EnvironmentCheck = { ok: true } | { ok: false; code: "IP" | "SEB"; message: string }

/** Config Key yang berlaku: milik ujian, atau bawaan kampus dari SEB_CONFIG_KEYS. */
export function effectiveSebKeys(task: Pick<GuardedTask, "sebConfigKeys">) {
  return parseConfigKeys(task.sebConfigKeys?.trim() ? task.sebConfigKeys : process.env.SEB_CONFIG_KEYS).keys
}

/** URL absolut halaman ujian yang mungkin di-hash oleh SEB (http/https × host yang terlihat). */
function examUrls(h: Headers, taskId: string) {
  const path = `/ujian/${taskId}`
  const hosts = new Set<string>()
  for (const v of [h.get("x-forwarded-host"), h.get("host")]) if (v) hosts.add(v.split(",")[0].trim())
  const origins = new Set<string>()
  for (const host of hosts) for (const proto of ["https", "http"]) origins.add(`${proto}://${host}`)
  for (const env of [process.env.AUTH_URL, process.env.NEXTAUTH_URL]) {
    try {
      if (env) origins.add(new URL(env).origin)
    } catch {}
  }
  return [...origins].map((o) => o + path)
}

export async function checkExamEnvironment(task: GuardedTask, jsHash?: string | null): Promise<EnvironmentCheck> {
  const h = await headers()
  if (!ipAllowed(clientIp(h), task.allowedIps)) {
    return { ok: false, code: "IP", message: "Ujian ini hanya dapat dikerjakan dari jaringan yang ditentukan dosen (mis. lab/kampus)." }
  }
  if (task.requireSeb) {
    const keys = effectiveSebKeys(task)
    const valid = keys.length
      ? sebHashValid([h.get("x-safeexambrowser-configkeyhash"), jsHash], examUrls(h, task.id), keys)
      : isSebUserAgent(h.get("user-agent"))
    if (!valid) return { ok: false, code: "SEB", message: "Ujian ini wajib dikerjakan menggunakan Safe Exam Browser dengan konfigurasi kampus." }
  }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Kunci perangkat: token acak di cookie HttpOnly, hash-nya di Submission
// ---------------------------------------------------------------------------

const deviceCookie = (attemptId: string) => `exam_dev_${attemptId}`

/** Ikat percobaan ke perangkat ini; kembalikan hash untuk disimpan di Submission.deviceTokenHash. */
export async function bindDevice(submissionId: string) {
  const token = randomBytes(24).toString("base64url")
  ;(await cookies()).set(deviceCookie(submissionId), token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/ujian",
    maxAge: 60 * 60 * 24,
  })
  return sha256Hex(token)
}

/** "match" = perangkat yang sama; "unbound" = belum/direset; "mismatch" = perangkat lain. */
export async function deviceState(submission: { id: string; deviceTokenHash: string | null }) {
  if (!submission.deviceTokenHash) return "unbound" as const
  const token = (await cookies()).get(deviceCookie(submission.id))?.value
  return token && sha256Hex(token) === submission.deviceTokenHash ? ("match" as const) : ("mismatch" as const)
}

export const OTHER_DEVICE = "Ujian ini sedang dikerjakan di perangkat lain. Minta pengawas mereset perangkat bila Anda berganti perangkat."
