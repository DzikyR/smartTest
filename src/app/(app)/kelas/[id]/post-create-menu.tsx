"use client"

import { useState } from "react"
import { Plus, Repeat2 } from "lucide-react"
import { FieldError } from "@/components/forms/action-form"
import { FormDialog } from "@/components/forms/form-dialog"
import { NativeSelect } from "@/components/forms/native-select"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { POST_KIND_LABEL, type PostKindValue } from "@/lib/classes/posts"
import { createPost, reusePost } from "../material-actions"
import { PostFields, type QuizOption, type Topic } from "./material-fields"
import { KIND_ICON, TypeIcon } from "./post-icon"

export type ReuseSource = { id: string; name: string; term: string | null; archived: boolean; posts: { id: string; title: string; kind: PostKindValue; topic: string | null; attachments: number }[] }

const MENU: { kind: PostKindValue; hint: string }[] = [
  { kind: "TUGAS", hint: "Instruksi, lampiran, tenggat & poin; mahasiswa mengumpulkan berkas" },
  { kind: "TUGAS_KUIS", hint: "Tautkan ujian CBT yang sudah ada" },
  { kind: "PERTANYAAN", hint: "Jawaban singkat atau pilihan ganda cepat" },
  { kind: "MATERI", hint: "Bahan bacaan: berkas & tautan, tanpa tenggat" },
]

const DIALOG_DESC: Record<PostKindValue, string> = {
  TUGAS: "Pengumpulan, penilaian, dan Rekap memakai mesin Tugas SmartTest.",
  TUGAS_KUIS: "Ujian CBT tertaut akan ditujukan ke kelas ini.",
  PERTANYAAN: "Satu soal untuk diskusi atau presensi kelas.",
  MATERI: "Gabungkan banyak berkas dan tautan dalam satu postingan.",
}

/**
 * Tombol "+ Buat" ala Google Classroom. `workBlocked` berisi alasan bila
 * Tugas/Pertanyaan tidak bisa dibuat (mis. kelas belum punya mata uji).
 */
export function PostCreateMenu({ groupId, topics, quizzes, sources, workBlocked }: { groupId: string; topics: Topic[]; quizzes: QuizOption[]; sources: ReuseSource[]; workBlocked: string | null }) {
  const [open, setOpen] = useState<PostKindValue | "REUSE" | null>(null)
  const close = (next: boolean) => !next && setOpen(null)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button className="rounded-xl">
              <Plus aria-hidden /> Buat
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-72">
          {MENU.map(({ kind, hint }) => {
            const Icon = KIND_ICON[kind]
            const blocked = (kind === "TUGAS" || kind === "PERTANYAAN") && workBlocked
            return (
              <DropdownMenuItem key={kind} disabled={!!blocked} onClick={() => setOpen(kind)} className="items-start gap-3 py-2">
                <Icon className="mt-0.5 size-4" aria-hidden />
                <span className="min-w-0">
                  <span className="block font-medium">{POST_KIND_LABEL[kind]}</span>
                  <span className="block text-xs whitespace-normal text-muted-foreground">{blocked || hint}</span>
                </span>
              </DropdownMenuItem>
            )
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setOpen("REUSE")} className="items-start gap-3 py-2">
            <Repeat2 className="mt-0.5 size-4" aria-hidden />
            <span className="min-w-0">
              <span className="block font-medium">Gunakan kembali postingan</span>
              <span className="block text-xs whitespace-normal text-muted-foreground">Salin dari kelas lain yang Anda ajar</span>
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {MENU.map(({ kind }) => (
        <FormDialog
          key={kind}
          open={open === kind}
          onOpenChange={close}
          title={POST_KIND_LABEL[kind]}
          description={DIALOG_DESC[kind]}
          action={createPost.bind(null, groupId, kind)}
          submitLabel="Simpan"
          wide
        >
          <PostFields kind={kind} topics={topics} quizzes={quizzes} />
        </FormDialog>
      ))}

      <FormDialog
        open={open === "REUSE"}
        onOpenChange={close}
        title="Gunakan kembali postingan"
        description="Judul, deskripsi, dan lampiran disalin sebagai draf ke kelas ini. Berkas tidak diunggah ulang."
        action={reusePost.bind(null, groupId)}
        submitLabel="Gunakan kembali"
        wide
      >
        <ReuseFields sources={sources} />
      </FormDialog>
    </>
  )
}

function ReuseFields({ sources }: { sources: ReuseSource[] }) {
  const [classId, setClassId] = useState(sources[0]?.id ?? "")
  const cls = sources.find((s) => s.id === classId)
  if (!sources.length) return <p className="text-sm text-muted-foreground">Belum ada postingan di kelas lain yang Anda kelola.</p>
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="reuse-class" className="text-sm font-medium">
          Kelas sumber
        </label>
        <NativeSelect id="reuse-class" value={classId} onChange={(e) => setClassId(e.target.value)}>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {[s.name, s.term, s.archived ? "diarsipkan" : null].filter(Boolean).join(" · ")} ({s.posts.length})
            </option>
          ))}
        </NativeSelect>
      </div>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1.5 text-sm font-medium">Postingan</legend>
        <ul key={classId} className="max-h-80 divide-y overflow-y-auto rounded-xl border">
          {cls?.posts.map((p) => (
            <li key={p.id}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/40 has-checked:bg-primary/5">
                <input type="radio" name="sourceId" value={p.id} className="size-4 accent-primary" />
                <TypeIcon kind={p.kind} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{p.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[POST_KIND_LABEL[p.kind], p.topic, p.attachments ? `${p.attachments} lampiran` : null].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <FieldError name="sourceId" />
      </fieldset>
    </>
  )
}
