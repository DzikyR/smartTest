import "server-only"
import type { Prisma } from "@/generated/prisma/client"
import { db } from "@/lib/db"
import { isAdmin, type CurrentUser } from "@/lib/auth/dal"

/**
 * Kelas yang boleh DIKELOLA: Admin → semua; Pengajar → miliknya atau tempat ia
 * menjadi co-teacher aktif. Semua halaman & aksi pengajar wajib lewat sini (anti-IDOR).
 */
export function managedClasses(user: CurrentUser): Prisma.GroupWhereInput {
  if (isAdmin(user)) return {}
  if (user.role === "PESERTA") return { id: "__none__" }
  return { OR: [{ ownerId: user.id }, { members: { some: { userId: user.id, role: "TEACHER", status: "ACTIVE" } } }] }
}

export async function getManagedClass(user: CurrentUser, id: string) {
  return db.group.findFirst({
    where: { AND: [{ id }, managedClasses(user)] },
    include: {
      owner: { select: { id: true, name: true } },
      subject: { select: { id: true, code: true, name: true } },
      codes: { where: { status: { not: "REVOKED" } }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  })
}

/** Keanggotaan peserta di kelas (termasuk PENDING/REMOVED — pemanggil yang menentukan aksesnya). */
export async function getMembership(user: CurrentUser, groupId: string) {
  return db.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: user.id } },
    select: {
      status: true,
      role: true,
      joinedAt: true,
      group: { include: { owner: { select: { name: true } }, subject: { select: { code: true, name: true } } } },
    },
  })
}

/** Filter anggota yang dihitung sebagai siswa kelas. */
export const ACTIVE_STUDENT = { status: "ACTIVE", role: "STUDENT" } as const satisfies Prisma.GroupMemberWhereInput
