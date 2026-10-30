import { FormField } from "@/components/forms/action-form"
import { Checkbox } from "@/components/forms/checkbox"
import { NativeSelect } from "@/components/forms/native-select"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

export type ClassDefaults = {
  name: string
  term: string | null
  description: string | null
  subjectId: string | null
  joinPolicy: "AUTO" | "APPROVAL"
  requireStudentId: boolean
  joinLocked: boolean
}

/** Isian kelas (buat & ubah). `withLock` menampilkan saklar kunci kelas (hanya saat mengubah). */
export function ClassFields({ subjects, defaults, withLock }: { subjects: { id: string; label: string }[]; defaults?: ClassDefaults; withLock?: boolean }) {
  return (
    <>
      <FormField name="name" label="Nama kelas" hint="Unik, mis. “Algoritma — IF-1A 2026 Ganjil”.">
        <Input id="name" name="name" defaultValue={defaults?.name} maxLength={80} required />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField name="subjectId" label="Mata uji (bank soal)">
          <NativeSelect id="subjectId" name="subjectId" defaultValue={defaults?.subjectId ?? ""}>
            <option value="">—</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField name="term" label="Semester (opsional)">
          <Input id="term" name="term" defaultValue={defaults?.term ?? ""} maxLength={40} placeholder="2026/2027 Ganjil" />
        </FormField>
      </div>
      <FormField name="description" label="Deskripsi (opsional)">
        <Textarea id="description" name="description" defaultValue={defaults?.description ?? ""} maxLength={500} rows={2} />
      </FormField>
      <FormField name="joinPolicy" label="Cara bergabung">
        <NativeSelect id="joinPolicy" name="joinPolicy" defaultValue={defaults?.joinPolicy ?? "AUTO"}>
          <option value="AUTO">Langsung masuk setelah memasukkan kode</option>
          <option value="APPROVAL">Perlu persetujuan pengajar</option>
        </NativeSelect>
      </FormField>
      <Checkbox name="requireStudentId" label="Wajib NIM" hint="Mahasiswa tanpa NIM diminta melengkapinya sebelum bergabung." defaultChecked={defaults?.requireStudentId ?? true} />
      {withLock && <Checkbox name="joinLocked" label="Kunci kelas" hint="Tolak semua anggota baru (kode tetap tersimpan)." defaultChecked={defaults?.joinLocked} />}
    </>
  )
}
