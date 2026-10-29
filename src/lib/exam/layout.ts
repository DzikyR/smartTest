/**
 * Tata letak ujian per mahasiswa — fungsi murni (tanpa database).
 * Urutan soal/pilihan diacak sekali saat ujian dimulai lalu disimpan di
 * Submission.layout, sehingga tetap sama saat halaman dimuat ulang.
 * Id pilihan (a–f) tidak berubah, jadi koreksi otomatis tidak terpengaruh.
 */

export type ExamLayout = { questions: string[]; options: Record<string, string[]> }

type LayoutQuestion = { id: string; options: unknown }

function shuffled<T>(items: T[], random: () => number) {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

const optionIds = (q: LayoutQuestion) => ((q.options as { id: string }[] | null) ?? []).map((o) => o.id)

export function buildLayout(
  questions: LayoutQuestion[],
  settings: { shuffleQuestions: boolean; shuffleOptions: boolean },
  random: () => number = Math.random
): ExamLayout {
  const ids = questions.map((q) => q.id)
  const options: Record<string, string[]> = {}
  for (const q of questions) {
    const opts = optionIds(q)
    if (opts.length > 1) options[q.id] = settings.shuffleOptions ? shuffled(opts, random) : opts
  }
  return { questions: settings.shuffleQuestions ? shuffled(ids, random) : ids, options }
}

/**
 * Terapkan tata letak tersimpan. Soal yang tidak tercantum (mis. layout lama)
 * ditaruh di akhir; id yang sudah tidak ada diabaikan.
 */
export function applyLayout<Q extends { id: string; options: unknown }>(questions: Q[], layout: ExamLayout | null): Q[] {
  if (!layout) return questions
  const byId = new Map(questions.map((q) => [q.id, q]))
  const ordered = layout.questions.map((id) => byId.get(id)).filter((q): q is Q => !!q)
  const rest = questions.filter((q) => !layout.questions.includes(q.id))
  return [...ordered, ...rest].map((q) => {
    const order = layout.options[q.id]
    const opts = q.options as { id: string; text: string }[] | null
    if (!order || !opts) return q
    const sorted = [...opts].sort((a, b) => rank(order, a.id) - rank(order, b.id))
    return { ...q, options: sorted }
  })
}

const rank = (order: string[], id: string) => {
  const i = order.indexOf(id)
  return i === -1 ? Number.MAX_SAFE_INTEGER : i
}
