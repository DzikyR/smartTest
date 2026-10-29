"use client"

import { useState } from "react"
import { FieldError, FormField } from "@/components/forms/action-form"
import { NativeSelect } from "@/components/forms/native-select"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { DIFFICULTY_LABEL, QUESTION_TYPE_LABEL } from "@/lib/labels"
import type { QuestionType } from "@/generated/prisma/enums"

export type QuestionDefaults = {
  type: QuestionType
  prompt: string
  points: number
  order?: number
  topic?: string | null
  difficulty?: number
  options: { id: string; text: string }[] | null
  answerKey: { optionId?: string; value?: boolean; accepted?: string[] } | null
}

export function DifficultySelect({ defaultValue, allowAny }: { defaultValue?: number; allowAny?: boolean }) {
  return (
    <FormField name="difficulty" label="Tingkat kesulitan">
      <NativeSelect id="difficulty" name="difficulty" defaultValue={String(defaultValue ?? (allowAny ? "" : 2))}>
        {allowAny && <option value="">Semua</option>}
        {[1, 2, 3].map((d) => (
          <option key={d} value={d}>
            {DIFFICULTY_LABEL[d]}
          </option>
        ))}
      </NativeSelect>
    </FormField>
  )
}

/** Isian satu soal. `bank` = Bank Soal (topik & kesulitan); selain itu soal ujian (urutan). */
export function QuestionFields({ defaults, nextOrder = 0, bank }: { defaults?: QuestionDefaults; nextOrder?: number; bank?: boolean }) {
  const [type, setType] = useState<QuestionType>(defaults?.type ?? "MULTIPLE_CHOICE")
  const options = defaults?.options ?? []
  const correctIndex = options.findIndex((o) => o.id === defaults?.answerKey?.optionId)

  return (
    <>
      <div className={bank ? "grid gap-4 sm:grid-cols-[2fr_1fr]" : "grid gap-4 sm:grid-cols-[2fr_1fr_1fr]"}>
        <FormField name="type" label="Jenis soal">
          <NativeSelect id="type" name="type" value={type} onChange={(e) => setType(e.target.value as QuestionType)}>
            {(Object.keys(QUESTION_TYPE_LABEL) as QuestionType[]).map((t) => (
              <option key={t} value={t}>
                {QUESTION_TYPE_LABEL[t]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField name="points" label="Poin">
          <Input id="points" name="points" type="number" inputMode="decimal" min={0.5} max={100} step="any" defaultValue={defaults?.points ?? 1} />
        </FormField>
        {!bank && (
          <FormField name="order" label="Urutan">
            <Input id="order" name="order" type="number" inputMode="numeric" min={0} max={999} defaultValue={defaults?.order ?? nextOrder} />
          </FormField>
        )}
      </div>
      {bank && (
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <FormField name="topic" label="Topik / pokok bahasan" hint="Opsional, untuk penyaringan & pengambilan soal acak.">
            <Input id="topic" name="topic" defaultValue={defaults?.topic ?? ""} maxLength={100} />
          </FormField>
          <DifficultySelect defaultValue={defaults?.difficulty} />
        </div>
      )}
      <FormField name="prompt" label="Pertanyaan">
        <Textarea id="prompt" name="prompt" defaultValue={defaults?.prompt} rows={3} maxLength={5000} required />
      </FormField>

      {type === "MULTIPLE_CHOICE" && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Pilihan jawaban</legend>
          <p className="-mt-1 mb-1 text-xs text-muted-foreground">Isi 2–6 pilihan, tandai satu yang benar. Pilihan kosong diabaikan.</p>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  name="correct"
                  value={i}
                  defaultChecked={i === (correctIndex >= 0 ? correctIndex : 0)}
                  className="size-4 shrink-0 accent-primary"
                  aria-label={`Pilihan ${String.fromCharCode(65 + i)} benar`}
                />
                <span className="w-4 text-sm font-medium text-muted-foreground">{String.fromCharCode(65 + i)}</span>
                <Input name={`option_${i}`} defaultValue={options[i]?.text ?? ""} maxLength={500} aria-label={`Pilihan ${String.fromCharCode(65 + i)}`} />
              </div>
              <FieldError name={`option_${i}`} />
            </div>
          ))}
          <FieldError name="options" />
        </fieldset>
      )}

      {type === "TRUE_FALSE" && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Jawaban benar</legend>
          <div className="flex gap-4">
            {[
              ["true", "Benar"],
              ["false", "Salah"],
            ].map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="tf"
                  value={value}
                  defaultChecked={defaults?.answerKey?.value !== undefined ? String(defaults.answerKey.value) === value : value === "true"}
                  className="size-4 accent-primary"
                />
                {label}
              </label>
            ))}
          </div>
          <FieldError name="tf" />
        </fieldset>
      )}

      {type === "SHORT_ANSWER" && (
        <FormField name="accepted" label="Jawaban yang diterima" hint="Satu per baris. Tidak membedakan huruf besar/kecil & spasi di tepi.">
          <Textarea id="accepted" name="accepted" defaultValue={defaults?.answerKey?.accepted?.join("\n") ?? ""} rows={3} />
        </FormField>
      )}

      {type === "ESSAY" && <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">Soal esai dinilai manual oleh dosen/admin setelah ujian dikumpulkan.</p>}
    </>
  )
}
