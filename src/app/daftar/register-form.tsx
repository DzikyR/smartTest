"use client"

import { registerAction } from "@/lib/auth/public-actions"
import { ActionForm, FormField } from "@/components/forms/action-form"
import { PasswordInput } from "@/components/auth/password-input"
import { Input } from "@/components/ui/input"

const SUBMIT = "*:h-11 *:w-full *:rounded-xl *:text-base"

export function RegisterForm() {
  return (
    <ActionForm action={registerAction} submitLabel="Buat akun" footerClassName={SUBMIT}>
      <FormField name="name" label="Nama lengkap">
        <Input id="name" name="name" autoComplete="name" maxLength={120} required className="h-11 rounded-xl" />
      </FormField>
      <FormField name="email" label="Email">
        <Input id="email" name="email" type="email" autoComplete="email" maxLength={254} required className="h-11 rounded-xl" />
      </FormField>
      <FormField name="password" label="Password" hint="Minimal 10 karakter, kombinasi huruf dan angka.">
        <PasswordInput id="password" name="password" autoComplete="new-password" required />
      </FormField>
      <FormField name="confirm" label="Ulangi password">
        <PasswordInput id="confirm" name="confirm" autoComplete="new-password" required />
      </FormField>
      {/* Honeypot anti-bot: tidak terlihat & tidak terjangkau keyboard */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
    </ActionForm>
  )
}
