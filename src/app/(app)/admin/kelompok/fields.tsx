import { FormField } from "@/components/forms/action-form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

export function GroupFields({ defaults }: { defaults?: { name: string; description: string | null } }) {
  return (
    <>
      <FormField name="name" label="Nama kelompok" hint="mis. IF-2A, Gelombang 1, Pelatihan Batch 3">
        <Input id="name" name="name" defaultValue={defaults?.name} maxLength={80} required />
      </FormField>
      <FormField name="description" label="Keterangan (opsional)">
        <Textarea id="description" name="description" defaultValue={defaults?.description ?? ""} rows={2} maxLength={500} />
      </FormField>
    </>
  )
}
