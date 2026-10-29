/** Status tampilan ujian bagi pengelola. */
export type ExamStatus = "draft" | "stopped" | "upcoming" | "open" | "closed"

export function examStatus(exam: { publishedAt: Date | null; sessionActive: boolean; startAt: Date | null; endAt: Date | null }, now = new Date()): ExamStatus {
  if (!exam.publishedAt) return "draft"
  if (exam.endAt && now > exam.endAt) return "closed"
  if (exam.startAt && now < exam.startAt) return "upcoming"
  if (!exam.sessionActive) return "stopped"
  return "open"
}

export const EXAM_STATUS: Record<ExamStatus, { label: string; className: string }> = {
  draft: { label: "Draf", className: "bg-muted text-muted-foreground" },
  stopped: { label: "Sesi dihentikan", className: "bg-tint-orange text-tint-orange-fg" },
  upcoming: { label: "Terjadwal", className: "bg-tint-sky text-tint-sky-fg" },
  open: { label: "Berlangsung", className: "bg-tint-green text-tint-green-fg" },
  closed: { label: "Selesai", className: "bg-tint-violet text-tint-violet-fg" },
}
