import { BookOpen, CirclePlay, ClipboardCheck, ClipboardList, FileText, Link2, MessageCircleQuestionMark } from "lucide-react"
import type { PostKindValue } from "@/lib/classes/posts"
import { cn } from "@/lib/utils"

/** Ikon pembeda tiap jenis postingan (seperti Google Classroom). Dipakai komponen server & klien. */
export const KIND_ICON = { MATERI: BookOpen, TUGAS: ClipboardList, TUGAS_KUIS: ClipboardCheck, PERTANYAAN: MessageCircleQuestionMark } as const
export const KIND_TINT: Record<PostKindValue, string> = {
  MATERI: "bg-tint-sky text-tint-sky-fg",
  TUGAS: "bg-tint-orange text-tint-orange-fg",
  TUGAS_KUIS: "bg-tint-violet text-tint-violet-fg",
  PERTANYAAN: "bg-tint-green text-tint-green-fg",
}

export function TypeIcon({ kind, size = "md" }: { kind: PostKindValue; size?: "sm" | "md" }) {
  const Icon = KIND_ICON[kind]
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-xl", size === "sm" ? "size-8" : "size-10", KIND_TINT[kind])}>
      <Icon className={size === "sm" ? "size-4" : "size-5"} aria-hidden />
    </span>
  )
}

export const ATTACHMENT_ICON = { FILE: FileText, LINK: Link2, YOUTUBE: CirclePlay } as const
