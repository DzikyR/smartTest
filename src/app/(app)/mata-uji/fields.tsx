import { FormField } from "@/components/forms/action-form"
import { NativeSelect } from "@/components/forms/native-select"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

export function SubjectFields({
  lecturers,
  showLecturers = true,
  defaults,
}: {
  lecturers: { id: string; name: string; username: string | null }[]
  /** Hanya admin yang menunjuk pengelola; pengajar otomatis menjadi pengelola mata uji buatannya. */
  showLecturers?: boolean
  defaults?: { code: string; name: string; type: string; description: string | null; lecturerIds: string[] }
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
        <FormField name="code" label="Kode" hint="mis. IF201 atau UMUM-TPA">
          <Input id="code" name="code" defaultValue={defaults?.code} maxLength={30} required className="uppercase" />
        </FormField>
        <FormField name="name" label="Nama mata uji">
          <Input id="name" name="name" defaultValue={defaults?.name} maxLength={150} required />
        </FormField>
      </div>
      <FormField name="type" label="Jenis" hint="Umum: untuk tes di luar mata kuliah, mis. tes masuk, TOEFL, psikotes, pelatihan.">
        <NativeSelect id="type" name="type" defaultValue={defaults?.type ?? "MATA_KULIAH"}>
          <option value="MATA_KULIAH">Mata Kuliah</option>
          <option value="UMUM">Umum</option>
        </NativeSelect>
      </FormField>
      <FormField name="description" label="Deskripsi (opsional)">
        <Textarea id="description" name="description" defaultValue={defaults?.description ?? ""} rows={2} maxLength={2000} />
      </FormField>
      {showLecturers && <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Dosen pengelola</legend>
        <p className="-mt-1 text-xs text-muted-foreground">Dosen terpilih dapat mengelola bank soal & ujian mata uji ini.</p>
        {lecturers.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada akun dosen.</p>
        ) : (
          <div className="grid max-h-48 gap-1 overflow-y-auto rounded-xl border p-2 sm:grid-cols-2">
            {lecturers.map((l) => (
              <label key={l.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted">
                <input type="checkbox" name="lecturerId" value={l.id} defaultChecked={defaults?.lecturerIds.includes(l.id)} className="size-4 accent-primary" />
                <span className="truncate">{l.name}</span>
              </label>
            ))}
          </div>
        )}
      </fieldset>}
    </>
  )
}
