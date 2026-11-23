import "server-only"
import { randomBytes } from "node:crypto"
import type { Prisma } from "@/generated/prisma/client"
import { db } from "@/lib/db"
import { isAdmin, type CurrentUser } from "@/lib/auth/dal"
import { managedClasses } from "@/lib/classes/access"
import { prismaCode } from "@/lib/action-result"

/**
 * Cakupan akses. Admin/Super Admin mengelola semua mata uji; dosen hanya mata
 * uji yang ia kelola (SubjectLecturer). Peserta hanya melihat ujian terbit yang
 * terbuka untuk semua, atau ditujukan ke kelompoknya.
 *
 * RUANG AJAR (`Subject.isPersonalSpace`): mata uji bayangan milik satu pengajar,
 * wadah Tugas/Pertanyaan yang dibuat dari "+ Buat" di kelas. Ruang ajar TIDAK
 * PERNAH ikut `managedSubjects` (tersembunyi dari daftar mata uji, dropdown, dan
 * statistik). Ujian di dalamnya dikelola menurut KELAS TUJUAN-nya (pemilik /
 * co-teacher aktif kelas itu), lewat `managedExams` — bukan menurut pemilik ruang.
 *
 * Loader mengembalikan null bila data tidak ada ATAU di luar cakupan, sehingga
 * halaman memanggil notFound() tanpa membocorkan keberadaannya.
 */

/** Filter Prisma untuk mata uji RESMI yang dapat dikelola pengguna (ruang ajar tidak pernah ikut). */
export function managedSubjects(user: CurrentUser): Prisma.SubjectWhereInput {
  return isAdmin(user) ? { isPersonalSpace: false } : { isPersonalSpace: false, lecturers: { some: { userId: user.id } } }
}

/**
 * Filter Prisma untuk ujian/pekerjaan yang dapat dikelola pengguna: ujian di mata
 * uji resmi yang ia kelola, ATAU ujian di ruang ajar yang ditujukan ke kelas yang
 * sedang ia kelola. Semua pemeriksaan akses ujian (staf) wajib lewat sini.
 */
export function managedExams(user: CurrentUser): Prisma.ExamWhereInput {
  if (isAdmin(user)) return {}
  return {
    OR: [
      { subject: managedSubjects(user) },
      { subject: { isPersonalSpace: true }, groups: { some: { group: managedClasses(user) } } },
    ],
  }
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

/**
 * Ruang ajar milik pengguna; dibuat otomatis saat pertama dibutuhkan (satu per
 * pengguna, aman terhadap balapan lewat `ownerId @unique`).
 */
export async function ensurePersonalSpace(user: Pick<CurrentUser, "id" | "name">) {
  const found = await db.subject.findUnique({ where: { ownerId: user.id }, select: { id: true } })
  if (found) return found.id
  try {
    const created = await db.subject.create({
      data: { code: `RA-${randomBytes(4).toString("hex").toUpperCase()}`, name: `Ruang ajar — ${user.name}`.slice(0, 150), type: "UMUM", isPersonalSpace: true, ownerId: user.id },
      select: { id: true },
    })
    return created.id
  } catch (e) {
    if (prismaCode(e) !== "P2002") throw e
    return (await db.subject.findUniqueOrThrow({ where: { ownerId: user.id }, select: { id: true } })).id
  }
}

// ---------------------------------------------------------------------------
// Bank soal: mata uji resmi yang dikelola + "Bank soal saya" (soal di ruang ajar MILIK SENDIRI).
// Bank pribadi hanya untuk pemiliknya — juga tidak terlihat oleh Admin atau co-teacher.
// ---------------------------------------------------------------------------

/** Nilai `subject` di URL/form untuk "Bank soal saya" (ruang ajar dibuat saat pertama diisi). */
export const MY_BANK = "saya"

/** Filter mata uji yang bank soalnya boleh dikelola pengguna. */
export function bankSubjects(user: CurrentUser): Prisma.SubjectWhereInput {
  return { OR: [managedSubjects(user), { isPersonalSpace: true, ownerId: user.id }] }
}

export async function canManageBank(user: CurrentUser, subjectId: string) {
  return (await db.subject.count({ where: { AND: [{ id: subjectId }, bankSubjects(user)] } })) > 0
}

/** Id ruang ajar pengguna tanpa membuatnya (null = bank soal saya masih kosong). */
export async function personalSpaceId(userId: string) {
  return (await db.subject.findUnique({ where: { ownerId: userId }, select: { id: true } }))?.id ?? null
}

/** `MY_BANK` → id ruang ajar pengguna (dibuat bila belum ada); id lain dikembalikan apa adanya. */
export async function resolveBankSubject(user: Pick<CurrentUser, "id" | "name">, subjectId: string) {
  return subjectId === MY_BANK ? ensurePersonalSpace(user) : subjectId
}

export async function getManagedQuestion(user: CurrentUser, id: string) {
  return db.question.findFirst({ where: { id, subject: bankSubjects(user) }, select: { id: true, subjectId: true } })
}

export async function getManagedExam(user: CurrentUser, examId: string) {
  return db.exam.findFirst({
    where: { AND: [{ id: examId }, managedExams(user)] },
    include: {
      subject: { select: { id: true, code: true, name: true, type: true, isPersonalSpace: true } },
      category: { select: { name: true } },
      groups: { select: { group: { select: { id: true, name: true } } } },
      _count: { select: { questions: true, attempts: true, sessions: true } },
    },
  })
}

/** Filter ujian yang terlihat oleh peserta. */
export function visibleExams(user: CurrentUser) {
  return {
    publishedAt: { not: null },
    subject: { isActive: true },
    // Hanya keanggotaan ACTIVE: peserta PENDING (menunggu persetujuan) / REMOVED (dikeluarkan) tidak melihat ujian kelas.
    OR: [
      { openToAll: true },
      { groups: { some: { group: { members: { some: { userId: user.id, status: "ACTIVE" as const } } } } } },
      // Jalur umum (Fase 4): peserta yang bergabung lewat kode sesi
      { sessions: { some: { participants: { some: { userId: user.id, status: "ACTIVE" as const } } } } },
    ],
  }
}

export async function getParticipantExam(user: CurrentUser, examId: string) {
  return db.exam.findFirst({
    where: { id: examId, ...visibleExams(user) },
    include: { subject: { select: { code: true, name: true, type: true, isPersonalSpace: true } }, category: { select: { name: true } }, _count: { select: { questions: true } } },
  })
}

/** Jendela waktu ujian. */
export function examWindow(exam: { startAt: Date | null; endAt: Date | null }, now = new Date()) {
  if (exam.startAt && now < exam.startAt) return "upcoming" as const
  if (exam.endAt && now > exam.endAt) return "closed" as const
  return "open" as const
}
