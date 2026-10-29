"use client"

import type { FormAction } from "@/components/forms/action-form"
import { ActionForm, FormField } from "@/components/forms/action-form"
import { PasswordInput } from "@/components/auth/password-input"

export function ResetForm({ email, action }: { email: string; action: FormAction }) {
  return (
    <ActionForm action={action} submitLabel="Simpan password" footerClassName="*:h-11 *:w-full *:rounded-xl *:text-base">
      <p className="text-sm text-muted-foreground">
        Akun: <span className="font-medium text-foreground">{email}</span>
      </p>
      {/* Bantu pengelola password menyimpan untuk akun yang benar */}
      <input type="email" name="username" value={email} autoComplete="username" readOnly hidden />
      <FormField name="password" label="Password baru" hint="Minimal 10 karakter, kombinasi huruf dan angka.">
        <PasswordInput id="password" name="password" autoComplete="new-password" required />
      </FormField>
      <FormField name="confirm" label="Ulangi password baru">
        <PasswordInput id="confirm" name="confirm" autoComplete="new-password" required />
      </FormField>
    </ActionForm>
  )
}
