import "server-only"
import { db } from "@/lib/db"
import { audit } from "@/lib/audit"
import type { CurrentUser } from "@/lib/auth/dal"
import { isFeatureEnabled } from "@/lib/features/access"
import { FEATURE_DISABLED } from "@/lib/features/registry"
import { rateLimit } from "@/lib/rate-limit"
import { normalizeCode } from "./code-format"

export type JoinError = "INVALID" | "DISABLED" | "EXPIRED" | "LOCKED" | "FULL" | "REMOVED" | "ROLE" | "FEATURE" | "RATE_LIMITED" | "PROFILE_INCOMPLETE" | "NOT_ON_ROSTER"
export type ProfileField = "studentId"

export type JoinResult =
  | { ok: true; kind: "class"; classId: string; name: string; status: "ACTIVE" | "PENDING"; already: boolean; href: string }
  | { ok: true; kind: "session"; sessionId: string; name: string; already: boolean; href: string }
  | { ok: false; error: JoinError; message: string; missing?: ProfileField[] }

/** Kode tak ada & kode yang sudah diganti → pesan IDENTIK: tidak membocorkan kode mana yang pernah ada. */
const INVALID = "Kode tidak valid atau sudah tidak berlaku. Periksa kembali, atau minta kode terbaru ke pengajar/panitia."

const no = (error: JoinError, message: string, missing?: ProfileField[]): JoinResult => ({ ok: false, error, message, missing })

class CodeExhausted extends Error {}

/**
 * Bergabung lewat kode akses. Satu-satunya pintu masuk (Server Action & POST /api/v1/join).
 * Target kelas/sesi SELALU diturunkan dari kode — klien tidak pernah mengirim id-nya (anti-IDOR).
 * Kode kelas → halaman kelas; kode sesi (ujian publik) → ruang tunggu, tanpa modul perkuliahan.
 */
export async function joinWithCode(user: CurrentUser, rawCode: unknown, ip: string): Promise<JoinResult> {
  // 1. Hanya peserta yang bergabung lewat kode; pengajar ditambahkan pemilik kelas.
  if (user.role !== "PESERTA") return no("ROLE", "Kode kelas/ujian untuk peserta. Pengajar dikelola dari halaman kelas.")

  // 2. Rate limit per akun DAN per IP — menebak kode secara acak menjadi tidak realistis.
  if (!rateLimit(`join:u:${user.id}`, 10, 60_000).ok || !rateLimit(`join:ip:${ip}`, 30, 60_000).ok)
    return no("RATE_LIMITED", "Terlalu banyak percobaan. Coba lagi dalam satu menit.")

  // 3. Format salah ditolak tanpa menyentuh database.
  const code = normalizeCode(rawCode)
  if (!code) return no("INVALID", INVALID)

  // 4. Lookup lewat Prisma (query berparameter — aman dari SQL injection).
  const ac = await db.accessCode.findUnique({
    where: { code },
    include: {
      group: { select: { id: true, name: true, archivedAt: true, joinLocked: true, joinPolicy: true, requireStudentId: true, rosterOnly: true } },
      session: { include: { exam: { select: { id: true, title: true, publishedAt: true, endAt: true } } } },
    },
  })
  if (!ac || ac.status === "REVOKED" || (ac.type === "CLASS" ? !ac.group : !ac.session)) {
    await audit("JOIN_CODE_INVALID", { userId: user.id, severity: "WARNING", metadata: { code } })
    return no("INVALID", INVALID)
  }

  // 5. Fitur per jalur (Kontrol Fitur), lalu kode valid tapi tidak bisa dipakai → pesan spesifik.
  if (!(await isFeatureEnabled(ac.type === "CLASS" ? "kelas.gabung" : "sesi.gabung", user.role))) return no("FEATURE", FEATURE_DISABLED)
  const what = ac.type === "CLASS" ? "Kode kelas" : "Kode ujian"
  if (ac.status === "DISABLED") return no("DISABLED", `${what} sedang dinonaktifkan.`)
  if (ac.expiresAt && ac.expiresAt <= new Date()) return no("EXPIRED", `${what} sudah kedaluwarsa. Minta kode baru.`)
  if (ac.type === "SESSION") return joinSession(user, ac.id, ac.maxUses, ac.session!)
  const group = ac.group!
  if (group.archivedAt) return no("LOCKED", "Kelas sudah diarsipkan.")
  const href = `/kelas/${group.id}`

  // 6. Sudah bergabung → idempoten (bukan error), langsung diarahkan ke kelas.
  const existing = await db.groupMember.findUnique({ where: { groupId_userId: { groupId: group.id, userId: user.id } }, select: { status: true, blockRejoin: true } })
  if (existing && existing.status !== "REMOVED") return { ok: true, kind: "class", classId: group.id, name: group.name, status: existing.status, already: true, href }
  if (existing?.blockRejoin) return no("REMOVED", "Anda telah dikeluarkan dari kelas ini. Hubungi pengajar bila ini keliru.")
  if (group.joinLocked) return no("LOCKED", "Kelas dikunci pengajar — tidak menerima anggota baru.")

  // 7. Kelengkapan profil: NIM wajib agar daftar anggota & rekap nilai bisa dicocokkan.
  if ((group.requireStudentId || group.rosterOnly) && !user.username) return no("PROFILE_INCOMPLETE", "Kelas ini mewajibkan NIM. Lengkapi NIM Anda untuk melanjutkan.", ["studentId"])
  // Daftar NIM resmi: hanya NIM yang diunggah pengajar yang boleh masuk (mencegah salah kamar / kode tersebar).
  if (group.rosterOnly && !(await db.classRoster.findUnique({ where: { groupId_studentId: { groupId: group.id, studentId: user.username!.toLowerCase() } }, select: { studentId: true } })))
    return no("NOT_ON_ROSTER", `NIM Anda (${user.username}) tidak ada di daftar kelas ini. Hubungi pengajar bila seharusnya terdaftar.`)

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

type JoinableSession = {
  id: string
  name: string
  isActive: boolean
  closesAt: Date | null
  capacity: number | null
  requireStudentId: boolean
  exam: { id: string; title: string; publishedAt: Date | null; endAt: Date | null }
}

/** Jalur umum: masuk ke ruang tunggu sesi ujian publik. */
async function joinSession(user: CurrentUser, codeId: string, maxUses: number | null, s: JoinableSession): Promise<JoinResult> {
  const now = new Date()
  const href = `/sesi/${s.id}`
  const name = `${s.exam.title} — ${s.name}`
  if (!s.isActive) return no("LOCKED", "Sesi ujian sedang dihentikan penyelenggara.")
  if (!s.exam.publishedAt) return no("LOCKED", "Ujian belum diterbitkan penyelenggara.")
  if ((s.closesAt && s.closesAt <= now) || (s.exam.endAt && s.exam.endAt <= now)) return no("EXPIRED", "Sesi ujian sudah ditutup.")

  const existing = await db.sessionParticipant.findUnique({ where: { sessionId_userId: { sessionId: s.id, userId: user.id } }, select: { status: true } })
  if (existing?.status === "ACTIVE") return { ok: true, kind: "session", sessionId: s.id, name, already: true, href }
  if (existing?.status === "REMOVED") return no("REMOVED", "Anda telah dikeluarkan dari sesi ini. Hubungi penyelenggara bila ini keliru.")
  if (s.requireStudentId && !user.username) return no("PROFILE_INCOMPLETE", "Sesi ini mewajibkan NIM/nomor peserta. Lengkapi untuk melanjutkan.", ["studentId"])

  try {
    await db.$transaction(async (tx) => {
      // Kunci baris sesi: pendaftar bersamaan diantrikan, kuota tidak bisa terlampaui.
      await tx.$executeRaw`SELECT 1 FROM "test_sessions" WHERE "id" = ${s.id} FOR UPDATE`
      if (s.capacity !== null && (await tx.sessionParticipant.count({ where: { sessionId: s.id, status: "ACTIVE" } })) >= s.capacity) throw new CodeExhausted()
      const used = await tx.accessCode.updateMany({
        where: { id: codeId, status: "ACTIVE", ...(maxUses !== null ? { usesCount: { lt: maxUses } } : {}) },
        data: { usesCount: { increment: 1 } },
      })
      if (used.count === 0) throw new CodeExhausted()
      await tx.sessionParticipant.create({ data: { sessionId: s.id, userId: user.id } })
    })
  } catch (e) {
    if (e instanceof CodeExhausted) return no("FULL", "Kuota peserta sesi ini sudah penuh. Hubungi penyelenggara.")
    throw e
  }
  await audit("SESSION_JOINED", { userId: user.id, entity: "ExamSession", entityId: s.id, metadata: { via: codeId, exam: s.exam.id } })
  return { ok: true, kind: "session", sessionId: s.id, name, already: false, href }
}
