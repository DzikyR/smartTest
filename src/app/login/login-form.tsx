"use client"

import { useActionState, useState } from "react"
import { AlertCircle, Eye, EyeOff, Loader2 } from "lucide-react"
import { loginAction, type LoginState } from "@/lib/auth/actions"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function LoginForm({ callbackUrl }: { callbackUrl?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {})
  const [show, setShow] = useState(false)

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
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Input id="password" name="password" type={show ? "text" : "password"} autoComplete="current-password" required className="h-11 rounded-xl pr-10" />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:text-foreground"
            aria-label={show ? "Sembunyikan password" : "Tampilkan password"}
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>
      <Button type="submit" disabled={pending} className="mt-2 h-11 rounded-xl text-base">
        {pending && <Loader2 className="animate-spin" aria-hidden />}
        Masuk
      </Button>
    </form>
  )
}
