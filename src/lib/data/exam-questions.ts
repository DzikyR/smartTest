import "server-only"
import { Prisma } from "@/generated/prisma/client"
import { db } from "@/lib/db"
import { fail } from "@/lib/action-result"
import { MAX_QUESTIONS_PER_TASK } from "@/lib/exam/question-input"
import type { CurrentUser } from "@/lib/auth/dal"
import { getManagedExam } from "./access"

type CopyableQuestion = { type: Prisma.ExamQuestionCreateManyInput["type"]; prompt: string; options: unknown; answerKey: unknown; points: number; sourceId?: string | null }

/** Ujian yang soalnya boleh diubah: dikelola pengguna & belum ada percobaan yang dikumpulkan. */
export async function editableExam(user: CurrentUser, examId: string) {
  const exam = await getManagedExam(user, examId)
  if (!exam) return { error: fail("Ujian tidak ditemukan atau di luar kewenangan Anda.") }
  const done = await db.attempt.count({ where: { examId, status: { not: "IN_PROGRESS" } } })
  if (done > 0) return { error: fail("Ujian sudah dikerjakan peserta; soal dikunci agar penilaian adil.") }
  return { exam }
}

/** Salin soal (snapshot) ke akhir daftar soal ujian. */
export async function appendExamQuestions(examId: string, questions: CopyableQuestion[]) {
  const existing = await db.examQuestion.count({ where: { examId } })
  if (existing + questions.length > MAX_QUESTIONS_PER_TASK) return fail(`Maksimal ${MAX_QUESTIONS_PER_TASK} soal per ujian (saat ini ${existing}).`)
  const start = (await db.examQuestion.aggregate({ where: { examId }, _max: { order: true } }))._max.order ?? 0
  await db.examQuestion.createMany({
    data: questions.map((q, i) => ({
      examId,
      type: q.type,
      prompt: q.prompt,
      options: (q.options as Prisma.InputJsonValue | null) ?? Prisma.DbNull,
      answerKey: (q.answerKey as Prisma.InputJsonValue | null) ?? Prisma.DbNull,
      points: q.points,
      order: start + i + 1,
      sourceId: q.sourceId ?? null,
    })),
  })
  return null
}
