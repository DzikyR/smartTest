/**
 * Validasi soal berstruktur (baris Excel / editor soal massal) — fungsi murni.
 * Format sumber: jenis, pertanyaan, pilihan A–F, kunci, poin, topik, kesulitan.
 */

import { parseDifficulty, type ImportedQuestion } from "./import"
import { MAX_OPTIONS, OPTION_IDS } from "./question-input"
import type { QuestionType } from "@/generated/prisma/enums"

export type RawQuestion = {
  type: string
  prompt: string
  /** Teks pilihan A–F sesuai posisinya (kosong = tidak dipakai) */
  options?: string[]
  /** PG: huruf (A–F) · B/S: Benar/Salah · Isian: jawaban dipisah "|" · Esai: kosong */
  key?: string
  points?: number | string | null
  topic?: string | null
  difficulty?: number | string | null
}

const TYPE_ALIASES: Record<string, QuestionType> = {
  pg: "MULTIPLE_CHOICE",
  "pilihan ganda": "MULTIPLE_CHOICE",
  multiple_choice: "MULTIPLE_CHOICE",
  bs: "TRUE_FALSE",
  "b/s": "TRUE_FALSE",
  "benar salah": "TRUE_FALSE",
  "benar/salah": "TRUE_FALSE",
  true_false: "TRUE_FALSE",
  isian: "SHORT_ANSWER",
  "isian singkat": "SHORT_ANSWER",
  short_answer: "SHORT_ANSWER",
  esai: "ESSAY",
  essay: "ESSAY",
  uraian: "ESSAY",
}

export function normalizeType(value: string): QuestionType | null {
  return TYPE_ALIASES[value.trim().toLowerCase().replace(/\s+/g, " ")] ?? null
}

const TRUE_WORDS = new Set(["benar", "b", "true", "ya", "1"])
const FALSE_WORDS = new Set(["salah", "s", "false", "tidak", "0"])

export function buildQuestion(raw: RawQuestion): { question: ImportedQuestion; error?: undefined } | { error: string; question?: undefined } {
  const type = normalizeType(raw.type ?? "")
  if (!type) return { error: `jenis soal "${raw.type ?? ""}" tidak dikenal (PG, BS, Isian, Esai)` }
  const prompt = String(raw.prompt ?? "").trim()
  if (prompt.length < 5) return { error: "teks pertanyaan minimal 5 karakter" }
  if (prompt.length > 5000) return { error: "teks pertanyaan maksimal 5000 karakter" }

  const pointsRaw = raw.points === null || raw.points === undefined || raw.points === "" ? 1 : Number(String(raw.points).replace(",", "."))
  if (!Number.isFinite(pointsRaw) || pointsRaw < 0.5 || pointsRaw > 100) return { error: "poin harus 0,5–100" }
  const difficulty = parseDifficulty(raw.difficulty)
  if (difficulty === null) return { error: "kesulitan harus Mudah/Sedang/Sulit" }
  const topic = String(raw.topic ?? "").trim().slice(0, 100) || null
  const key = String(raw.key ?? "").trim()
  const base = { type, prompt, points: pointsRaw, topic, difficulty }

  if (type === "MULTIPLE_CHOICE") {
    const slots = (raw.options ?? []).slice(0, MAX_OPTIONS).map((o) => String(o ?? "").trim())
    const filled = slots.map((text, i) => ({ text, letter: String.fromCharCode(65 + i) })).filter((o) => o.text)
    if (filled.length < 2) return { error: "pilihan ganda butuh minimal 2 pilihan" }
    if (filled.some((o) => o.text.length > 500)) return { error: "tiap pilihan maksimal 500 karakter" }
    const letter = key.toUpperCase().replace(/[.)\s]/g, "")
    const correct = filled.findIndex((o) => o.letter === letter)
    if (correct === -1) return { error: key ? `kunci "${key}" tidak menunjuk pilihan yang terisi` : "kunci jawaban (A–F) wajib diisi" }
    const options = filled.map((o, i) => ({ id: OPTION_IDS[i], text: o.text }))
    return { question: { ...base, options, answerKey: { optionId: options[correct].id } } }
  }
  if (type === "TRUE_FALSE") {
    const k = key.toLowerCase()
    if (!TRUE_WORDS.has(k) && !FALSE_WORDS.has(k)) return { error: "kunci Benar/Salah wajib diisi" }
    return { question: { ...base, options: null, answerKey: { value: TRUE_WORDS.has(k) } } }
  }
  if (type === "SHORT_ANSWER") {
    const accepted = key
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20)
    if (accepted.length === 0) return { error: "isian singkat butuh minimal satu jawaban (pisahkan dengan |)" }
    if (accepted.some((a) => a.length > 200)) return { error: "tiap jawaban isian maksimal 200 karakter" }
    return { question: { ...base, options: null, answerKey: { accepted } } }
  }
  return { question: { ...base, options: null, answerKey: null } }
}

const TYPE_TO_RAW: Record<QuestionType, string> = { MULTIPLE_CHOICE: "PG", TRUE_FALSE: "BS", SHORT_ANSWER: "Isian", ESSAY: "Esai" }

/**
 * Validasi ulang soal hasil pratinjau impor yang dikirim balik oleh klien —
 * data dari browser tidak dipercaya, jadi diubah ke bentuk mentah lalu dicek lagi.
 */
export function revalidateImported(input: unknown): ReturnType<typeof buildQuestion> {
  const q = (input ?? {}) as Partial<ImportedQuestion>
  const type = typeof q.type === "string" && q.type in TYPE_TO_RAW ? (q.type as QuestionType) : null
  if (!type) return { error: "jenis soal tidak valid" }
  const options = Array.isArray(q.options) ? q.options.map((o) => String((o as { text?: unknown })?.text ?? "")) : []
  const key = q.answerKey as { optionId?: string; value?: boolean; accepted?: string[] } | null | undefined
  let rawKey = ""
  if (type === "MULTIPLE_CHOICE") {
    const idx = Array.isArray(q.options) ? q.options.findIndex((o) => (o as { id?: unknown })?.id === key?.optionId) : -1
    rawKey = idx >= 0 ? String.fromCharCode(65 + idx) : ""
  } else if (type === "TRUE_FALSE") rawKey = key?.value === true ? "Benar" : key?.value === false ? "Salah" : ""
  else if (type === "SHORT_ANSWER") rawKey = Array.isArray(key?.accepted) ? key.accepted.map(String).join("|") : ""
  return buildQuestion({ type: TYPE_TO_RAW[type], prompt: String(q.prompt ?? ""), options, key: rawKey, points: q.points as number, topic: q.topic, difficulty: q.difficulty })
}
