/**
 * Impor soal massal dari teks — fungsi murni (tanpa database).
 *
 * Format (antar-soal dipisah satu baris kosong):
 *
 *   1. Hasil dari 2 + 3 * 2 adalah ...
 *   A. 10
 *   *B. 8          ← tanda * = jawaban benar (atau baris "Kunci: B")
 *   C. 7
 *   Poin: 2        ← opsional (bawaan 1)
 *   Topik: Operator  ← opsional (Bank Soal)
 *
 *   Jelaskan perbedaan while dan do-while!   ← tanpa pilihan & kunci = esai
 *   Poin: 10
 *
 *   Python bersifat case-sensitive.
 *   Kunci: Benar   ← Benar/Salah tanpa pilihan = soal Benar/Salah
 *
 *   Kata kunci untuk mendefinisikan fungsi di Python adalah ...
 *   Kunci: def | define   ← teks lain tanpa pilihan = isian singkat (pisahkan dengan |)
 *
 * Bila soal diberi nomor ("1.", "2)"), pemisahan memakai nomor soal dan baris
 * kosong diabaikan — cocok untuk teks dari Word yang memisah tiap paragraf.
 * Baris opsional "Kesulitan: Mudah|Sedang|Sulit" mengatur tingkat kesulitan.
 */

import { MAX_OPTIONS, OPTION_IDS, type QuestionAnswerKey, type QuestionOption } from "./question-input"
import type { QuestionType } from "@/generated/prisma/enums"

export type ImportedQuestion = {
  type: QuestionType
  prompt: string
  options: QuestionOption[] | null
  answerKey: QuestionAnswerKey
  points: number
  topic: string | null
  difficulty: number
}

export type ImportResult = { questions: ImportedQuestion[]; errors: string[] }

const OPTION_LINE = /^(\*)?\s*([A-Fa-f])\s*[.)]\s+(.+)$/
const META_LINE = /^(kunci|jawaban|poin|bobot|topik|kesulitan)\s*:\s*(.*)$/i
const NUMBER_PREFIX = /^\s*\d{1,3}\s*[.)]\s+/
const TRUE_WORDS = new Set(["benar", "b", "true", "ya"])
const FALSE_WORDS = new Set(["salah", "s", "false", "tidak"])

export const MAX_IMPORT_QUESTIONS = 200

/** Tingkat kesulitan dari teks/angka; null bila tidak dikenali. */
export function parseDifficulty(value: unknown): number | null {
  const v = String(value ?? "").trim().toLowerCase()
  if (!v) return 2
  if (["1", "mudah", "easy"].includes(v)) return 1
  if (["2", "sedang", "medium"].includes(v)) return 2
  if (["3", "sulit", "sukar", "hard"].includes(v)) return 3
  return null
}

/** Pisah teks menjadi blok soal: per nomor soal bila ada, selain itu per baris kosong. */
export function splitQuestionBlocks(text: string) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n")
  const numbered = lines.some((l) => NUMBER_PREFIX.test(l))
  if (!numbered) {
    return text
      .replace(/\r\n?/g, "\n")
      .split(/\n\s*\n/)
      .map((b) => b.split("\n").map((l) => l.trimEnd()).filter((l) => l.trim() !== ""))
      .filter((b) => b.length > 0)
  }
  // Mode bernomor (mis. dari Word, tiap paragraf dipisah baris kosong): soal baru dimulai
  // pada baris bernomor, atau setelah baris kosong bila soal sebelumnya sudah "lengkap"
  // (punya pilihan/kunci/poin) dan baris itu bukan pilihan/keterangan — agar soal tanpa
  // nomor yang dicampur tetap terpisah, sementara pertanyaan multi-paragraf tetap utuh.
  const isDetail = (l: string) => OPTION_LINE.test(l.trim()) || META_LINE.test(l.trim())
  const blocks: { lines: string[]; closed: boolean }[] = []
  let afterBlank = false
  for (const raw of lines) {
    if (raw.trim() === "") {
      afterBlank = true
      continue
    }
    const current = blocks[blocks.length - 1]
    if (NUMBER_PREFIX.test(raw) || !current || (afterBlank && current.closed && !isDetail(raw))) blocks.push({ lines: [], closed: false })
    const block = blocks[blocks.length - 1]
    block.lines.push(raw.trimEnd())
    if (isDetail(raw)) block.closed = true
    afterBlank = false
  }
  // Judul/petunjuk sebelum soal bernomor pertama (tanpa pilihan/kunci) diabaikan.
  if (blocks.length > 1 && !NUMBER_PREFIX.test(blocks[0].lines[0]) && !blocks[0].closed) blocks.shift()
  return blocks.map((b) => b.lines)
}

export function parseQuestionImport(text: string): ImportResult {
  const blocks = splitQuestionBlocks(text)

  const questions: ImportedQuestion[] = []
  const errors: string[] = []
  if (blocks.length > MAX_IMPORT_QUESTIONS) {
    return { questions: [], errors: [`Maksimal ${MAX_IMPORT_QUESTIONS} soal per impor (terdeteksi ${blocks.length}).`] }
  }

  blocks.forEach((lines, index) => {
    const no = index + 1
    const promptLines: string[] = []
    const options: { letter: string; text: string; correct: boolean }[] = []
    let key: string | null = null
    let points = 1
    let topic: string | null = null
    let difficulty = 2
    let problem: string | null = null

    for (const raw of lines) {
      const line = raw.trim()
      const meta = META_LINE.exec(line)
      if (meta) {
        const field = meta[1].toLowerCase()
        const value = meta[2].trim()
        if (field === "kunci" || field === "jawaban") key = value
        else if (field === "topik") topic = value.slice(0, 100) || null
        else if (field === "kesulitan") {
          const d = parseDifficulty(value)
          if (d === null) problem = `Kesulitan harus Mudah/Sedang/Sulit (tertulis "${value}")`
          else difficulty = d
        } else {
          const n = Number(value.replace(",", "."))
          if (!Number.isFinite(n) || n < 0.5 || n > 100) problem = `Poin harus 0,5–100 (tertulis "${value}")`
          else points = n
        }
        continue
      }
      const opt = OPTION_LINE.exec(line)
      if (opt && promptLines.length > 0) {
        options.push({ letter: opt[2].toUpperCase(), text: opt[3].trim(), correct: !!opt[1] })
        continue
      }
      if (options.length > 0) {
        // Baris lanjutan dari pilihan sebelumnya.
        options[options.length - 1].text += ` ${line}`
        continue
      }
      promptLines.push(promptLines.length === 0 ? line.replace(NUMBER_PREFIX, "") : raw)
    }

    const prompt = promptLines.join("\n").trim()
    const head = `Soal ${no}${prompt ? ` ("${prompt.slice(0, 40)}${prompt.length > 40 ? "…" : ""}")` : ""}`
    if (problem) return void errors.push(`${head}: ${problem}.`)
    if (prompt.length < 5) return void errors.push(`${head}: teks pertanyaan minimal 5 karakter.`)
    if (prompt.length > 5000) return void errors.push(`${head}: teks pertanyaan maksimal 5000 karakter.`)

    if (options.length > 0) {
      if (options.length < 2) return void errors.push(`${head}: pilihan ganda butuh minimal 2 pilihan.`)
      if (options.length > MAX_OPTIONS) return void errors.push(`${head}: maksimal ${MAX_OPTIONS} pilihan.`)
      if (options.some((o) => o.text.length > 500)) return void errors.push(`${head}: tiap pilihan maksimal 500 karakter.`)
      let correct = options.findIndex((o) => o.correct)
      if (options.filter((o) => o.correct).length > 1) return void errors.push(`${head}: tandai hanya satu jawaban benar.`)
      if (correct === -1 && key) correct = options.findIndex((o) => o.letter === key!.trim().toUpperCase().replace(/[.)]$/, ""))
      if (correct === -1) return void errors.push(`${head}: jawaban benar belum ditandai (awali pilihan dengan * atau tulis "Kunci: B").`)
      const mapped = options.map((o, i) => ({ id: OPTION_IDS[i], text: o.text }))
      questions.push({ type: "MULTIPLE_CHOICE", prompt, options: mapped, answerKey: { optionId: mapped[correct].id }, points, topic, difficulty })
      return
    }

    if (key) {
      const k = key.toLowerCase()
      if (TRUE_WORDS.has(k) || FALSE_WORDS.has(k)) {
        questions.push({ type: "TRUE_FALSE", prompt, options: null, answerKey: { value: TRUE_WORDS.has(k) }, points, topic, difficulty })
        return
      }
      const accepted = key
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 20)
      if (accepted.length === 0 || accepted.some((a) => a.length > 200)) return void errors.push(`${head}: kunci isian singkat tidak valid.`)
      questions.push({ type: "SHORT_ANSWER", prompt, options: null, answerKey: { accepted }, points, topic, difficulty })
      return
    }

    questions.push({ type: "ESSAY", prompt, options: null, answerKey: null, points, topic, difficulty })
  })

  return { questions, errors }
}
