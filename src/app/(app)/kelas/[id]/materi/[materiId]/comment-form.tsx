"use client"

import { useState } from "react"
import { ActionForm, FormField, type FormAction } from "@/components/forms/action-form"
import { Textarea } from "@/components/ui/textarea"

/** Form komentar yang kosong kembali setelah terkirim (ActionForm sendiri mempertahankan isian). */
export function CommentForm({ action }: { action: FormAction }) {
  const [key, setKey] = useState(0)
  return (
    <ActionForm key={key} action={action} submitLabel="Kirim" onSuccess={() => setKey((k) => k + 1)}>
      <FormField name="body" label="Tulis komentar">
        <Textarea id="body" name="body" rows={3} maxLength={2000} placeholder="Tanyakan atau diskusikan materi ini…" required />
      </FormField>
    </ActionForm>
  )
}
