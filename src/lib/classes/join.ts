import "server-only"
import { db } from "@/lib/db"
import { audit } from "@/lib/audit"
import type { CurrentUser } from "@/lib/auth/dal"
import { isFeatureEnabled } from "@/lib/features/access"
import { FEATURE_DISABLED } from "@/lib/features/registry"
import { rateLimit } from "@/lib/rate-limit"
import { normalizeCode } from "./code-format"

export type JoinError = "INVALID" | "DISABLED" | "EXPIRED" | "LOCKED" | "FULL" | "REMOVED" | "ROLE" | "FEATURE" | "RATE_LIMITED" | "PROFILE_INCOMPLETE"
export type ProfileField = "studentId"

export type JoinResult =
  | { ok: true; kind: "class"; classId: string; name: string; status: "ACTIVE" | "PENDING"; already: boolean; href: string }
  | { ok: false; error: JoinError; message: string; missing?: ProfileField[] }

/** Kode tak ada & kode yang sudah diganti → pesan IDENTIK: tidak membocorkan kode mana yang pernah ada. */
const INVALID = "Kode tidak valid atau sudah tidak berlaku. Periksa kembali, atau minta kode terbaru ke pengajar."

const no = (error: JoinError, message: string, missing?: ProfileField[]): JoinResult => ({ ok: false, error, message, missing })

class CodeExhausted extends Error {}

/**
 * Bergabung lewat kode akses. Satu-satunya pintu masuk (Server Action & POST /api/v1/join).
 * Target kelas SELALU diturunkan dari kode — klien tidak pernah mengirim id kelas (anti-IDOR).
 */
export async function joinWithCode(user: CurrentUser, rawCode: unknown, ip: string): Promise<JoinResult> {
  // 1. Hanya peserta yang bergabung lewat kode; pengajar ditambahkan pemilik kelas.
  if (user.role !== "PESERTA") return no("ROLE", "Kode kelas untuk peserta. Pengajar dikelola dari halaman kelas.")
  if (!(await isFeatureEnabled("kelas.gabung", user.role))) return no("FEATURE", FEATURE_DISABLED)

  // 2. Rate limit per akun DAN per IP — menebak kode secara acak menjadi tidak realistis.
  if (!rateLimit(`join:u:${user.id}`, 10, 60_000).ok || !rateLimit(`join:ip:${ip}`, 30, 60_000).ok)
    return no("RATE_LIMITED", "Terlalu banyak percobaan. Coba lagi dalam satu menit.")

  // 3. Format salah ditolak tanpa menyentuh database.
  const code = normalizeCode(rawCode)
  if (!code) return no("INVALID", INVALID)

  // 4. Lookup lewat Prisma (query berparameter — aman dari SQL injection).
  const ac = await db.accessCode.findUnique({
    where: { code },
    include: { group: { select: { id: true, name: true, archivedAt: true, joinLocked: true, joinPolicy: true, requireStudentId: true } } },
  })
  if (!ac || ac.status === "REVOKED" || ac.type !== "CLASS" || !ac.group) {
    await audit("JOIN_CODE_INVALID", { userId: user.id, severity: "WARNING", metadata: { code } })
    return no("INVALID", INVALID)
  }

  // 5. Kode valid tapi tidak bisa dipakai → pesan spesifik (peserta perlu tahu harus menghubungi siapa).
  if (ac.status === "DISABLED") return no("DISABLED", "Kode kelas sedang dinonaktifkan pengajar.")
  if (ac.expiresAt && ac.expiresAt <= new Date()) return no("EXPIRED", "Kode kelas sudah kedaluwarsa. Minta kode baru ke pengajar.")
  const group = ac.group
  if (group.archivedAt) return no("LOCKED", "Kelas sudah diarsipkan.")
  const href = `/kelas/${group.id}`

  // 6. Sudah bergabung → idempoten (bukan error), langsung diarahkan ke kelas.
  const existing = await db.groupMember.findUnique({ where: { groupId_userId: { groupId: group.id, userId: user.id } }, select: { status: true, blockRejoin: true } })
  if (existing && existing.status !== "REMOVED") return { ok: true, kind: "class", classId: group.id, name: group.name, status: existing.status, already: true, href }
  if (existing?.blockRejoin) return no("REMOVED", "Anda telah dikeluarkan dari kelas ini. Hubungi pengajar bila ini keliru.")
  if (group.joinLocked) return no("LOCKED", "Kelas dikunci pengajar — tidak menerima anggota baru.")

  // 7. Kelengkapan profil: NIM wajib agar daftar anggota & rekap nilai bisa dicocokkan.
  if (group.requireStudentId && !user.username) return no("PROFILE_INCOMPLETE", "Kelas ini mewajibkan NIM. Lengkapi NIM Anda untuk melanjutkan.", ["studentId"])

  // 8. Transaksi: kuota kode dipotong ATOMIK (kondisi dievaluasi saat UPDATE), lalu daftar.
  const status = group.joinPolicy === "APPROVAL" ? "PENDING" : "ACTIVE"
  try {
    await db.$transaction(async (tx) => {
      const used = await tx.accessCode.updateMany({
        where: { id: ac.id, status: "ACTIVE", ...(ac.maxUses !== null ? { usesCount: { lt: ac.maxUses } } : {}) },
        data: { usesCount: { increment: 1 } },
      })
      if (used.count === 0) throw new CodeExhausted()
      await tx.groupMember.upsert({
        where: { groupId_userId: { groupId: group.id, userId: user.id } }, // PK gabungan = anti-duplikat di level DB
        create: { groupId: group.id, userId: user.id, status, joinedVia: ac.id },
        update: { status, role: "STUDENT", joinedVia: ac.id, joinedAt: new Date(), removedAt: null },
      })
    })
  } catch (e) {
    if (e instanceof CodeExhausted) return no("FULL", "Kuota kode ini sudah penuh. Hubungi pengajar.")
    throw e
  }

  await audit("CLASS_JOINED", { userId: user.id, entity: "Group", entityId: group.id, metadata: { via: ac.id, status } })
  return { ok: true, kind: "class", classId: group.id, name: group.name, status, already: false, href }
}
