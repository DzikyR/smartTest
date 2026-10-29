"use client"

import Link from "next/link"
import { useActionState } from "react"
import { AlertCircle, Loader2 } from "lucide-react"
import { loginAction, type LoginState } from "@/lib/auth/actions"
import { PasswordInput } from "@/components/auth/password-input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function LoginForm({ callbackUrl, submitLabel }: { callbackUrl?: string; submitLabel: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {})

  return (
    <form action={action} className="flex flex-col gap-4">
      {callbackUrl && <input type="hidden" name="callbackUrl" value={callbackUrl} />}
      {state.error && (
        <Alert variant="destructive" aria-live="polite">
          <AlertCircle aria-hidden />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="identifier">Email atau NIM / Username</Label>
        <Input id="identifier" name="identifier" defaultValue={state.identifier} autoComplete="username" required className="h-11 rounded-xl" />
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link href="/lupa-password" className="text-xs font-medium text-primary hover:underline">
            Lupa password?
          </Link>
        </div>
        <PasswordInput id="password" name="password" autoComplete="current-password" required />
      </div>
      <Button type="submit" disabled={pending} className="mt-2 h-11 rounded-xl text-base">
        {pending && <Loader2 className="animate-spin" aria-hidden />}
        {submitLabel}
      </Button>
    </form>
  )
}
