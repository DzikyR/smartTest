"use client"

import { useState, useTransition } from "react"
import { Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"
import type { QuestionType } from "@/generated/prisma/enums"
import { DIFFICULTY_LABEL, QUESTION_TYPE_LABEL } from "@/lib/labels"
import { FormField } from "@/components/forms/action-form"
import { NativeSelect } from "@/components/forms/native-select"
import { DifficultySelect } from "@/components/question/question-fields"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { removeExamQuestions } from "../actions"

export type BankPick = { id: string; type: QuestionType; prompt: string; points: number; topic: string | null; difficulty: number; used: boolean }

/** Pilih soal dari bank: centang manual atau ambil acak N soal menurut topik/jenis/kesulitan. */
export function BankPickerFields({ items, topics }: { items: BankPick[]; topics: string[] }) {
  const [mode, setMode] = useState<"pick" | "random">("pick")
  const [filter, setFilter] = useState("")
  const [topic, setTopic] = useState("")
  const [type, setType] = useState("")
  const shown = items.filter((i) => (!topic || i.topic === topic) && (!type || i.type === type) && (!filter || i.prompt.toLowerCase().includes(filter.toLowerCase())))

  return (
    <>
      <div className="flex gap-1 rounded-xl bg-muted p-1 text-sm" role="tablist">
        {(
          [
            ["pick", "Pilih manual"],
            ["random", "Ambil acak"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={mode === key}
            onClick={() => setMode(key)}
            className={mode === key ? "flex-1 rounded-lg bg-background px-3 py-1.5 font-medium shadow-sm" : "flex-1 rounded-lg px-3 py-1.5 text-muted-foreground"}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === "pick" ? (
        <>
          <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr]">
            <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Cari teks soal…" aria-label="Cari soal" />
            <NativeSelect value={type} onChange={(e) => setType(e.target.value)} aria-label="Saring jenis">
              <option value="">Semua jenis</option>
              {(Object.keys(QUESTION_TYPE_LABEL) as QuestionType[]).map((t) => (
                <option key={t} value={t}>
                  {QUESTION_TYPE_LABEL[t]}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect value={topic} onChange={(e) => setTopic(e.target.value)} aria-label="Saring topik">
              <option value="">Semua topik</option>
              {topics.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </NativeSelect>
          </div>
          <ul className="flex max-h-80 flex-col divide-y overflow-y-auto rounded-xl border">
            {items.map((i) => (
              <li key={i.id} hidden={!shown.includes(i)}>
                <label className="flex cursor-pointer items-start gap-2 p-2.5 text-sm hover:bg-muted/50 has-disabled:cursor-not-allowed has-disabled:opacity-50">
                  <input type="checkbox" name="bankId" value={i.id} disabled={i.used} className="mt-0.5 size-4 shrink-0 accent-primary" />
                  <span className="min-w-0">
                    <span className="line-clamp-2">{i.prompt}</span>
                    <span className="text-xs text-muted-foreground">
                      {QUESTION_TYPE_LABEL[i.type]} · {i.points} poin · {DIFFICULTY_LABEL[i.difficulty]}
                      {i.topic && ` · ${i.topic}`}
                      {i.used && " · sudah di ujian"}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Menampilkan {shown.length} dari {items.length} soal. Soal disalin ke ujian — perubahan bank tidak memengaruhi ujian ini.
          </p>
        </>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField name="count" label="Jumlah soal">
            <Input id="count" name="count" type="number" inputMode="numeric" min={1} max={200} defaultValue={10} />
          </FormField>
          <FormField name="type" label="Jenis">
            <NativeSelect id="type" name="type" defaultValue="">
              <option value="">Semua jenis</option>
              {(Object.keys(QUESTION_TYPE_LABEL) as QuestionType[]).map((t) => (
                <option key={t} value={t}>
                  {QUESTION_TYPE_LABEL[t]}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField name="topic" label="Topik">
            <NativeSelect id="topic" name="topic" defaultValue="">
              <option value="">Semua topik</option>
              {topics.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <DifficultySelect allowAny />
        </div>
      )}
    </>
  )
}

/** Keluarkan soal yang dicentang (checkbox name="qid" di form `formId`) dari ujian. */
export function RemoveQuestionsButton({ examId, formId }: { examId: string; formId: string }) {
  const [pending, start] = useTransition()
  return (
    <Button
      variant="outline"
      size="sm"
      className="rounded-lg"
      disabled={pending}
      onClick={() => {
        const form = document.getElementById(formId) as HTMLFormElement | null
        const ids = form ? new FormData(form).getAll("qid").map(String) : []
        if (ids.length === 0) return toast.info("Centang soal yang akan dikeluarkan.")
        if (!confirm(`Keluarkan ${ids.length} soal dari ujian? Soal di bank tidak terhapus.`)) return
        start(async () => {
          const r = await removeExamQuestions(examId, ids)
          if (r.ok) toast.success(r.message)
          else toast.error(r.error)
        })
      }}
    >
      {pending ? <Loader2 className="animate-spin" /> : <Trash2 className="text-destructive" />} Keluarkan terpilih
    </Button>
  )
}
