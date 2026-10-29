"use client"

import { createContext, use, useActionState, useEffect, useRef, startTransition } from "react"
import { AlertCircle, Loader2 } from "lucide-react"
import { toast } from "sonner"
import type { ActionResult } from "@/lib/action-result"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FormAction = (prev: ActionResult<any>, formData: FormData) => Promise<ActionResult<any>>

const FieldErrorsContext = createContext<Record<string, string> | undefined>(undefined)

/**
 * Form generik untuk Server Action. Submit lewat startTransition (bukan prop
 * `action`) agar isian tidak di-reset React saat validasi gagal.
 */
export function ActionForm({
  action,
  children,
  submitLabel = "Simpan",
  onSuccess,
  className,
  footerClassName,
  hideSubmit,
}: {
  action: FormAction
  children: React.ReactNode
  submitLabel?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSuccess?: (result: Extract<ActionResult<any>, { ok: true }>) => void
  className?: string
  footerClassName?: string
  hideSubmit?: boolean
}) {
  const [state, formAction, pending] = useActionState(action, { ok: false, error: "" })
  const handled = useRef(state)

  useEffect(() => {
    if (handled.current === state) return
    handled.current = state
    if (state.ok) {
      if (state.message) toast.success(state.message)
      onSuccess?.(state)
    }
  }, [state, onSuccess])

  return (
    <form
      className={cn("flex flex-col gap-4", className)}
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        const formData = new FormData(e.currentTarget)
        startTransition(() => formAction(formData))
      }}
    >
      {!state.ok && state.error && (
        <Alert variant="destructive" aria-live="polite">
          <AlertCircle aria-hidden />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <FieldErrorsContext value={state.ok ? undefined : state.fieldErrors}>{children}</FieldErrorsContext>
      {!hideSubmit && (
        <div className={cn("flex justify-end gap-2", footerClassName)}>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            {submitLabel}
          </Button>
        </div>
      )}
    </form>
  )
}

/** Pesan error untuk satu field saja (untuk tata letak khusus, mis. daftar checkbox). */
export function FieldError({ name }: { name: string }) {
  const error = use(FieldErrorsContext)?.[name]
  if (!error) return null
  return (
    <p className="text-xs text-destructive" role="alert">
      {error}
    </p>
  )
}

/** Label + kontrol + pesan error (diambil otomatis dari hasil Server Action). */
export function FormField({
  name,
  label,
  hint,
  children,
  className,
}: {
  name: string
  label: string
  hint?: string
  children: React.ReactNode
  className?: string
}) {
  const error = use(FieldErrorsContext)?.[name]
  return (
    <div className={cn("flex flex-col gap-1.5", className)} data-invalid={error ? "" : undefined}>
      <Label htmlFor={name}>{label}</Label>
      <div className="[[data-invalid]_&_input]:border-destructive [[data-invalid]_&_select]:border-destructive [[data-invalid]_&_textarea]:border-destructive">
        {children}
      </div>
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  )
}
