import "server-only"
import { db } from "@/lib/db"
import { ACTIVE_STUDENT } from "@/lib/classes/access"
import { examLabel } from "@/lib/labels"
import { averageScore, gradeCell, type GradeCell } from "./gradebook-math"

/**
 * Buku nilai kelas: semua ujian/Tugas TERBIT yang ditujukan ke kelas × mahasiswa
 * aktif. Pemanggil wajib sudah memastikan actor mengelola kelas (getManagedClass).
 */
export async function loadGradebook(groupId: string, onlyExamId?: string) {
  const [works, members] = await Promise.all([
    db.exam.findMany({
      where: { groups: { some: { groupId } }, publishedAt: { not: null }, ...(onlyExamId ? { id: onlyExamId } : {}) },
      orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      select: { id: true, title: true, kind: true, workType: true, maxPoints: true, dueAt: true, endAt: true, category: { select: { name: true } } },
    }),
    db.groupMember.findMany({ where: { groupId, ...ACTIVE_STUDENT }, orderBy: { user: { name: "asc" } }, select: { user: { select: { id: true, name: true, username: true, email: true } } } }),
  ])
  const students = members.map((m) => m.user)
  const attempts = works.length
    ? await db.attempt.findMany({
        where: { examId: { in: works.map((w) => w.id) }, userId: { in: students.map((s) => s.id) }, status: { not: "IN_PROGRESS" } },
        select: { examId: true, userId: true, status: true, score: true, submittedAt: true, isLate: true, feedback: true, submissionUrl: true },
      })
    : []

  const now = new Date()
  const rows = students.map((user) => {
    const cells: GradeCell[] = works.map((w) =>
      gradeCell(
        attempts.filter((a) => a.examId === w.id && a.userId === user.id),
        w.dueAt ?? w.endAt,
        now
      )
    )
    return {
      user,
      cells,
      avgAssignment: averageScore(cells.filter((_, i) => works[i].workType === "ASSIGNMENT")),
      avgAll: averageScore(cells),
    }
  })
  return { works: works.map((w) => ({ ...w, label: examLabel(w) })), rows }
}

export type Gradebook = Awaited<ReturnType<typeof loadGradebook>>
