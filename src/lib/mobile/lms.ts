import "server-only"
import { createHash } from "node:crypto"
import { db } from "@/lib/db"
import type { CurrentUser } from "@/lib/auth/dal"
import { ACTIVE_STUDENT } from "@/lib/classes/access"
import { attachmentSelect } from "@/lib/classes/materials"
import { ms } from "./http"

/**
 * Data LMS untuk aplikasi mobile (mahasiswa): kelas, postingan, materi. Aturan visibilitas
 * sama dengan halaman kelas web: hanya postingan TERBIT, dan bila menautkan pekerjaan,
 * pekerjaannya juga harus sudah terbit.
 */

/** Postingan terbit yang terlihat mahasiswa (filter Prisma). */
const visiblePost = { status: "PUBLISHED" as const, OR: [{ examId: null }, { exam: { publishedAt: { not: null } } }] }

export type MobileAttachment = { id: string; type: string; name: string; url: string | null; mimeType: string | null; size: number | null }

/** Berkas diunduh lewat API mobile (Bearer), tautan/YouTube apa adanya. */
export function attachmentOut(a: { id: string; type: string; name: string; url: string | null; mimeType: string | null; size: number | null }): MobileAttachment {
  return { id: a.id, type: a.type, name: a.name, url: a.type === "FILE" ? `/api/v1/mobile/files/${a.id}` : a.url, mimeType: a.mimeType, size: a.size }
}

export async function studentClasses(user: CurrentUser) {
  const rows = await db.groupMember.findMany({
    where: { userId: user.id, role: "STUDENT", status: { in: ["ACTIVE", "PENDING"] }, group: { archivedAt: null } },
    orderBy: { joinedAt: "desc" },
    select: { status: true, group: { select: { id: true, name: true, description: true, term: true, owner: { select: { name: true } }, subject: { select: { code: true, name: true } }, _count: { select: { members: { where: ACTIVE_STUDENT } } } } } },
  })
  return rows.map(({ status, group: g }) => ({ id: g.id, name: g.name, description: g.description, term: g.term, owner: g.owner?.name ?? null, subject: g.subject, members: g._count.members, status }))
}

export async function recentPosts(user: CurrentUser, take = 20) {
  const rows = await db.material.findMany({
    where: { ...visiblePost, group: { archivedAt: null, members: { some: { userId: user.id, ...ACTIVE_STUDENT } } } },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take,
    select: { id: true, kind: true, title: true, groupId: true, publishedAt: true, group: { select: { name: true } }, exam: { select: { id: true, dueAt: true, workType: true } } },
  })
  return rows.map((m) => ({ id: m.id, kind: m.kind, title: m.title, classId: m.groupId, className: m.group.name, publishedAt: ms(m.publishedAt), examId: m.exam?.id ?? null, dueAt: ms(m.exam?.dueAt) }))
}

/** Keanggotaan siswa aktif — syarat melihat isi kelas. */
export async function isActiveStudent(user: CurrentUser, groupId: string) {
  const m = await db.groupMember.findUnique({ where: { groupId_userId: { groupId, userId: user.id } }, select: { role: true, status: true } })
  return !!m && m.role === "STUDENT" && m.status === "ACTIVE"
}

export async function classPosts(user: CurrentUser, groupId: string) {
  const [topics, rows] = await Promise.all([
    db.materialTopic.findMany({ where: { groupId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, name: true } }),
    db.material.findMany({
      where: { groupId, ...visiblePost },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        kind: true,
        title: true,
        content: true,
        topicId: true,
        publishedAt: true,
        attachments: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: attachmentSelect },
        exam: { select: { id: true, workType: true, dueAt: true, maxPoints: true, attempts: { where: { userId: user.id }, select: { status: true } } } },
        _count: { select: { comments: true, progress: { where: { userId: user.id } } } },
      },
    }),
  ])
  return {
    topics,
    posts: rows.map((m) => ({
      id: m.id,
      kind: m.kind,
      title: m.title,
      content: m.content,
      topicId: m.topicId,
      publishedAt: ms(m.publishedAt),
      attachments: m.attachments.map(attachmentOut),
      work: m.exam ? { examId: m.exam.id, workType: m.exam.workType, dueAt: ms(m.exam.dueAt), maxPoints: m.exam.maxPoints, statuses: m.exam.attempts.map((a) => a.status) } : null,
      comments: m._count.comments,
      done: m._count.progress > 0,
    })),
  }
}

/** ETag lemah dari isi JSON: dashboard yang tidak berubah → 304 tanpa body (hemat kuota). */
export function weakEtag(data: unknown) {
  return `W/"${createHash("sha1").update(JSON.stringify(data)).digest("base64url").slice(0, 22)}"`
}
