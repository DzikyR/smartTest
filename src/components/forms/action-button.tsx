"use client"

import { useTransition } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import type { ActionResult } from "@/lib/action-result"
import { Button } from "@/components/ui/button"

/** Tombol satu klik untuk aksi ringan yang mudah dibatalkan (mis. terbitkan/draf). */
export function ActionButton({
  action,
  children,
  ...props
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  action: () => Promise<ActionResult<any>>
  children: React.ReactNode
} & Omit<React.ComponentProps<typeof Button>, "onClick" | "action">) {
  const [pending, startTransition] = useTransition()
  return (
    <Button
      {...props}
      disabled={pending || props.disabled}
      onClick={() =>
        startTransition(async () => {
          const result = await action()
          if (result.ok) {
            if (result.message) toast.success(result.message)
          } else toast.error(result.error)
        })
      }
    >
      {pending && <Loader2 className="animate-spin" aria-hidden />}
      {children}
    </Button>
  )
}
