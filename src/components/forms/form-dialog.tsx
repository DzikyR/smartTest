"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { ActionForm, type FormAction } from "./action-form"
import { SecretReveal } from "./secret-reveal"

/**
 * Dialog berisi ActionForm. Tertutup otomatis saat sukses, kecuali action
 * mengembalikan `data.password` (password sementara) — ditampilkan sekali dulu.
 * Bila hasilnya membawa `data.href`, pengguna diarahkan ke sana.
 */
export function FormDialog({
  trigger,
  title,
  description,
  action,
  submitLabel,
  children,
  wide,
}: {
  trigger: React.ReactElement
  title: string
  description?: string
  action: FormAction
  submitLabel?: string
  children: React.ReactNode
  wide?: boolean
}) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const [secret, setSecret] = useState<string | null>(null)
  const [formKey, setFormKey] = useState(0)

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
      setSecret(null)
      setFormKey((k) => k + 1) // reset isian & error untuk pembukaan berikutnya
    }
  }

  const onSuccess = (result: { data?: unknown }) => {
    const data = result.data as { password?: string; href?: string } | undefined
    if (data?.password) setSecret(data.password)
    else handleOpenChange(false)
    if (data?.href) router.push(data.href)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent className={wide ? "sm:max-w-2xl" : "sm:max-w-lg"}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {secret ? (
          <SecretReveal secret={secret} onDone={() => handleOpenChange(false)} />
        ) : (
          <div className="max-h-[70svh] overflow-y-auto px-0.5">
            <ActionForm key={formKey} action={action} submitLabel={submitLabel} onSuccess={onSuccess}>
              {children}
            </ActionForm>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
