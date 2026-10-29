"use client"

import { changePassword } from "@/lib/auth/password-actions"
import { ActionForm, FormField } from "@/components/forms/action-form"
import { Input } from "@/components/ui/input"

export function PasswordForm() {
  return (
    <ActionForm action={changePassword} submitLabel="Simpan password baru">
      <FormField name="current" label="Password saat ini">
        <Input id="current" name="current" type="password" autoComplete="current-password" required />
      </FormField>
      <FormField name="next" label="Password baru" hint="Minimal 10 karakter, kombinasi huruf dan angka.">
        <Input id="next" name="next" type="password" autoComplete="new-password" required />
      </FormField>
      <FormField name="confirm" label="Ulangi password baru">
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </FormField>
    </ActionForm>
  )
}
