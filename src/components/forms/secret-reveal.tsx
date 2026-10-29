"use client"

import { useState } from "react"
import { Check, Copy, KeyRound } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

/** Tampilkan password sementara satu kali, dengan tombol salin. */
export function SecretReveal({ secret, onDone }: { secret: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false)

  return (
    <div className="flex flex-col gap-4">
      <Alert>
        <KeyRound aria-hidden />
        <AlertDescription>
          Berikan password sementara ini kepada pengguna. Password <strong>tidak akan ditampilkan lagi</strong>.
        </AlertDescription>
      </Alert>
      <div className="flex items-center gap-2 rounded-lg border bg-muted/50 p-3">
        <code className="flex-1 font-mono text-base tracking-wider select-all">{secret}</code>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={async () => {
            await navigator.clipboard.writeText(secret)
            setCopied(true)
          }}
        >
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? "Tersalin" : "Salin"}
        </Button>
      </div>
      <div className="flex justify-end">
        <Button type="button" onClick={onDone}>
          Selesai
        </Button>
      </div>
    </div>
  )
}
