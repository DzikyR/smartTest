"use client"

import { useState } from "react"
import { FormField } from "@/components/forms/action-form"
import { Checkbox } from "@/components/forms/checkbox"
import { NativeSelect } from "@/components/forms/native-select"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { SUBMISSION_ACCEPT, SUBMISSION_FORMATS_LABEL, SUBMISSION_LIMITS } from "@/lib/submissions/files"

export type MaterialDefaults = { title: string; content: string | null; type: "TEXT" | "LINK" | "FILE" | "ASSIGNMENT"; url: string | null; topicId: string | null; fileName: string | null; examId: string | null }

const TYPES = [
  { value: "TEXT", label: "Teks" },
  { value: "LINK", label: "Tautan" },
  { value: "FILE", label: "Berkas" },
  { value: "ASSIGNMENT", label: "Tugas (pengumpulan & nilai)" },
] as const

/** Isian materi (buat & ubah). Kolom tautan/berkas tampil sesuai jenis yang dipilih. */
export function MaterialFields({ topics, tasks, defaults, defaultTopicId }: { topics: { id: string; name: string }[]; tasks: { id: string; title: string }[]; defaults?: MaterialDefaults; defaultTopicId?: string }) {
  const [type, setType] = useState<MaterialDefaults["type"]>(defaults?.type ?? "TEXT")
  return (
    <>
      <FormField name="title" label="Judul" hint={type === "ASSIGNMENT" ? "Kosongkan untuk memakai judul Tugas." : undefined}>
        <Input id="title" name="title" defaultValue={defaults?.title} maxLength={150} required={type !== "ASSIGNMENT"} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField name="type" label="Jenis">
          <NativeSelect id="type" name="type" value={type} onChange={(e) => setType(e.target.value as MaterialDefaults["type"])}>
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField name="topicId" label="Topik">
          <NativeSelect id="topicId" name="topicId" defaultValue={defaults ? (defaults.topicId ?? "") : (defaultTopicId ?? "")}>
            <option value="">Tanpa topik</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </div>
      {type === "ASSIGNMENT" && (
        <FormField name="examId" label="Tugas" hint={tasks.length ? "Pengumpulan, penilaian, dan tenggat mengikuti Tugas ini." : "Belum ada Tugas untuk kelas ini. Buat lewat “Buat ujian untuk kelas ini”, jenis pekerjaan Tugas."}>
          <NativeSelect id="examId" name="examId" defaultValue={defaults?.examId ?? ""}>
            <option value="">— pilih Tugas —</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      )}
      {type === "LINK" && (
        <FormField name="url" label="Tautan" hint="Mis. video YouTube, folder Google Drive, atau artikel.">
          <Input id="url" name="url" type="url" inputMode="url" placeholder="https://" defaultValue={defaults?.url ?? ""} maxLength={2000} />
        </FormField>
      )}
      {type === "FILE" && (
        <FormField
          name="file"
          label="Berkas"
          hint={`${defaults?.fileName ? `Saat ini: ${defaults.fileName}. Kosongkan bila tidak diganti. ` : ""}${SUBMISSION_FORMATS_LABEL} · maks. ${SUBMISSION_LIMITS.maxBytes / 1024 / 1024} MB`}
        >
          <Input id="file" name="file" type="file" accept={SUBMISSION_ACCEPT} />
        </FormField>
      )}
      <FormField name="content" label={type === "TEXT" ? "Isi materi" : type === "ASSIGNMENT" ? "Catatan di materi (opsional)" : "Deskripsi (opsional)"}>
        <Textarea id="content" name="content" rows={type === "TEXT" ? 8 : 3} defaultValue={defaults?.content ?? ""} maxLength={10_000} />
      </FormField>
      {!defaults && <Checkbox name="publish" label="Terbitkan sekarang" hint="Tidak dicentang = disimpan sebagai draf (hanya terlihat pengajar)." />}
    </>
  )
}
