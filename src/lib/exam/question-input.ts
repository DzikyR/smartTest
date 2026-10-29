import { z } from "zod"
import { fail, formObject, zodFieldErrors } from "@/lib/action-result"
import { intIn } from "@/lib/validation"
import type { QuestionType } from "@/generated/prisma/enums"

/**
 * Validasi isian soal (dipakai soal ujian/kuis dan Bank Soal).
 * Pilihan ganda disimpan sebagai [{ id: "a".."f", text }] dengan kunci { optionId }.
 */

export const MAX_OPTIONS = 6
export const OPTION_IDS = "abcdef"
export const MAX_QUESTIONS_PER_TASK = 200
export const QUESTION_TYPES = ["MULTIPLE_CHOICE", "TRUE_FALSE", "SHORT_ANSWER", "ESSAY"] as const

export type QuestionOption = { id: string; text: string }
export type QuestionAnswerKey = { optionId?: string | null; value?: boolean; accepted?: string[] } | null

export const questionSchema = z.object({
  type: z.enum(QUESTION_TYPES, "Pilih jenis soal"),
  prompt: z.string().trim().min(5, "Minimal 5 karakter").max(5000),
  points: z.coerce.number("Poin harus angka").min(0.5, "Poin 0,5–100").max(100, "Poin 0,5–100"),
  order: intIn(0, 999, "Urutan").default(0),
})

const bankExtras = z.object({
  topic: z
    .string()
    .trim()
    .max(100, "Maksimal 100 karakter")
    .optional()
    .transform((v) => v || null),
  difficulty: z.coerce.number().int().min(1, "Pilih tingkat kesulitan").max(3, "Pilih tingkat kesulitan").default(2),
})

/** Bangun options & answerKey dari form sesuai jenis soal. */
export function parseAnswer(type: QuestionType, formData: FormData) {
  const errors: Record<string, string> = {}
  if (type === "MULTIPLE_CHOICE") {
    const options: QuestionOption[] = []
    let correctId: string | null = null
    const correctRaw = String(formData.get("correct") ?? "")
    for (let i = 0; i < MAX_OPTIONS; i++) {
      const text = String(formData.get(`option_${i}`) ?? "").trim()
      if (!text) continue
      if (text.length > 500) errors[`option_${i}`] = "Maksimal 500 karakter"
      const id = OPTION_IDS[options.length]
      options.push({ id, text })
      if (correctRaw === String(i)) correctId = id
    }
    if (options.length < 2) errors.options = "Isi minimal 2 pilihan jawaban"
    else if (!correctId) errors.options = "Tandai satu jawaban yang benar (pada pilihan yang terisi)"
    return { errors, options, answerKey: { optionId: correctId } }
  }
  if (type === "TRUE_FALSE") {
    const value = formData.get("tf")
    if (value !== "true" && value !== "false") errors.tf = "Pilih jawaban yang benar"
    return { errors, options: null, answerKey: { value: value === "true" } }
  }
  if (type === "SHORT_ANSWER") {
    const accepted = String(formData.get("accepted") ?? "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20)
    if (accepted.length === 0) errors.accepted = "Isi minimal satu jawaban yang diterima"
    if (accepted.some((a) => a.length > 200)) errors.accepted = "Tiap jawaban maksimal 200 karakter"
    return { errors, options: null, answerKey: { accepted } }
  }
  return { errors, options: null, answerKey: null } // ESSAY: dinilai manual
}

/** Soal ujian/kuis dari FormData. */
export function parseQuestionForm(formData: FormData) {
  const parsed = questionSchema.safeParse(formObject(formData))
  const type = parsed.success ? parsed.data.type : "ESSAY"
  const answer = parseAnswer(type, formData)
  if (!parsed.success || Object.keys(answer.errors).length) {
    return { error: fail("Periksa kembali isian yang ditandai.", { ...(parsed.success ? {} : zodFieldErrors(parsed.error)), ...answer.errors }) }
  }
  return { data: { ...parsed.data, options: answer.options ?? undefined, answerKey: answer.answerKey ?? undefined } }
}

/** Butir Bank Soal dari FormData (tambahan: topik & tingkat kesulitan). */
export function parseBankForm(formData: FormData) {
  const question = parseQuestionForm(formData)
  const extras = bankExtras.safeParse(formObject(formData))
  if (question.error || !extras.success) {
    const fieldErrors = { ...(question.error && !question.error.ok ? question.error.fieldErrors : {}), ...(extras.success ? {} : zodFieldErrors(extras.error)) }
    return { error: fail("Periksa kembali isian yang ditandai.", fieldErrors) }
  }
  // Butir bank tidak punya urutan.
  const { prompt, type, points, options, answerKey } = question.data
  return { data: { prompt, type, points, options, answerKey, ...extras.data } }
}
