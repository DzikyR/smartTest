"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import type { ActionResult } from "@/lib/action-result"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { SecretReveal } from "./secret-reveal"

/**
 * Tombol aksi dengan dialog konfirmasi. `action` adalah Server Action yang
 * argumennya sudah di-bind di server (mis. deleteX.bind(null, id)).
 * Bila hasilnya membawa `data.href`, pengguna diarahkan ke sana.
 */
export function ConfirmAction({
  action,
  trigger,
  title,
  description,
  confirmLabel = "Ya, lanjutkan",
  destructive,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  action: () => Promise<ActionResult<any>>
  trigger: React.ReactElement
  title: string
  description: React.ReactNode
  confirmLabel?: string
  destructive?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [secret, setSecret] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const close = (next: boolean) => {
    setOpen(next)
    if (!next) setSecret(null)
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {!secret && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {secret ? (
          <SecretReveal secret={secret} onDone={() => close(false)} />
        ) : (
          <DialogFooter>
            <Button variant="outline" onClick={() => close(false)} disabled={pending}>
              Batal
            </Button>
            <Button
              variant={destructive ? "destructive" : "default"}
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await action()
                  if (!result.ok) {
                    toast.error(result.error)
                    return
                  }
                  if (result.message) toast.success(result.message)
                  const data = result.data as { password?: string; href?: string } | undefined
                  if (data?.password) setSecret(data.password)
                  else close(false)
                  if (data?.href) router.push(data.href)
                })
              }
            >
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              {confirmLabel}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
