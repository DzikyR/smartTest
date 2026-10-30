import "server-only"
import { db } from "@/lib/db"
import type { CurrentUser } from "@/lib/auth/dal"

export type SessionWindow = "stopped" | "upcoming" | "open" | "closed"

/** Jendela MULAI sesi: dihentikan pengawas, belum dibuka, dibuka, atau batas masuk lewat. */
export function sessionWindow(session: { isActive: boolean; opensAt: Date | null; closesAt: Date | null }, now = new Date()): SessionWindow {
  if (!session.isActive) return "stopped"
  if (session.opensAt && now < session.opensAt) return "upcoming"
  if (session.closesAt && now > session.closesAt) return "closed"
  return "open"
}

/** Sesi aktif tempat peserta terdaftar untuk ujian ini (null = akses lewat kelas/terbuka untuk semua). */
export async function participantSession(user: CurrentUser, examId: string) {
  const p = await db.sessionParticipant.findFirst({
    where: { userId: user.id, status: "ACTIVE", session: { examId } },
    orderBy: { joinedAt: "desc" },
    select: { session: true },
  })
  return p?.session ?? null
}
