import "server-only"
import { db } from "@/lib/db"
import { isAdmin, type CurrentUser } from "@/lib/auth/dal"

/**
 * Cakupan akses. Admin/Super Admin mengelola semua mata uji; dosen hanya mata
 * uji yang ia kelola (SubjectLecturer). Peserta hanya melihat ujian terbit yang
 * terbuka untuk semua, atau ditujukan ke kelompoknya.
 *
 * Loader mengembalikan null bila data tidak ada ATAU di luar cakupan, sehingga
 * halaman memanggil notFound() tanpa membocorkan keberadaannya.
 */

/** Filter Prisma untuk mata uji yang dapat dikelola pengguna. */
export function managedSubjects(user: CurrentUser) {
  return isAdmin(user) ? {} : { lecturers: { some: { userId: user.id } } }
}

export async function canManageSubject(user: CurrentUser, subjectId: string) {
  return (await db.subject.count({ where: { id: subjectId, ...managedSubjects(user) } })) > 0
}

export async function listManagedSubjects(user: CurrentUser) {
  return db.subject.findMany({
    where: { ...managedSubjects(user), isActive: true },
    orderBy: [{ type: "asc" }, { code: "asc" }],
    select: { id: true, code: true, name: true, type: true },
  })
}

export async function getManagedQuestion(user: CurrentUser, id: string) {
  return db.question.findFirst({ where: { id, subject: managedSubjects(user) }, select: { id: true, subjectId: true } })
}

export async function getManagedExam(user: CurrentUser, examId: string) {
  return db.exam.findFirst({
    where: { id: examId, subject: managedSubjects(user) },
    include: {
      subject: { select: { id: true, code: true, name: true, type: true } },
      category: { select: { name: true } },
      groups: { select: { group: { select: { id: true, name: true } } } },
      _count: { select: { questions: true, attempts: true } },
    },
  })
}

/** Filter ujian yang terlihat oleh peserta. */
export function visibleExams(user: CurrentUser) {
  return {
    publishedAt: { not: null },
    subject: { isActive: true },
    // Hanya keanggotaan ACTIVE: peserta PENDING (menunggu persetujuan) / REMOVED (dikeluarkan) tidak melihat ujian kelas.
    OR: [{ openToAll: true }, { groups: { some: { group: { members: { some: { userId: user.id, status: "ACTIVE" as const } } } } } }],
  }
}

export async function getParticipantExam(user: CurrentUser, examId: string) {
  return db.exam.findFirst({
    where: { id: examId, ...visibleExams(user) },
    include: { subject: { select: { code: true, name: true, type: true } }, category: { select: { name: true } }, _count: { select: { questions: true } } },
  })
}

/** Jendela waktu ujian. */
export function examWindow(exam: { startAt: Date | null; endAt: Date | null }, now = new Date()) {
  if (exam.startAt && now < exam.startAt) return "upcoming" as const
  if (exam.endAt && now > exam.endAt) return "closed" as const
  return "open" as const
}
