"use client"

import { useState } from "react"
import { MailCheck } from "lucide-react"
import { requestPasswordReset } from "@/lib/auth/public-actions"
import { ActionForm, FormField } from "@/components/forms/action-form"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function ForgotForm() {
  const [sent, setSent] = useState<string | null>(null)

  if (sent) {
    return (
      <div className="flex flex-col gap-4">
        <Alert aria-live="polite">
          <MailCheck aria-hidden />
          <AlertDescription>{sent}</AlertDescription>
        </Alert>
        <Button variant="outline" className="h-11 rounded-xl" onClick={() => setSent(null)}>
          Kirim ulang / gunakan email lain
        </Button>
      </div>
    )
  }

  return (
    <ActionForm action={requestPasswordReset} submitLabel="Kirim tautan reset" footerClassName="*:h-11 *:w-full *:rounded-xl *:text-base" onSuccess={(r) => setSent(r.message ?? "")}>
      <FormField name="email" label="Email">
        <Input id="email" name="email" type="email" autoComplete="email" required className="h-11 rounded-xl" />
      </FormField>
    </ActionForm>
  )
}
