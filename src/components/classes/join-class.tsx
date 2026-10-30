"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { AlertCircle, Loader2, Plus } from "lucide-react"
import { toast } from "sonner"
import { completeStudentId, joinClassAction } from "@/app/(app)/kelas/actions"
import { normalizeCode, sanitizeCodeInput } from "@/lib/classes/code-format"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/**
 * Form gabung kelas: satu kotak kode (huruf besar otomatis, tempel dengan/tanpa "-").
 * Bila kelas mewajibkan NIM dan profil belum lengkap, form berganti ke langkah 2
 * (isi NIM), lalu bergabung otomatis dengan kode yang sama.
 */
export function JoinClassForm({ initialCode = "", onDone }: { initialCode?: string; onDone?: () => void }) {
  const router = useRouter()
  const [code, setCode] = useState(sanitizeCodeInput(initialCode))
  const [nim, setNim] = useState("")
  const [step, setStep] = useState<"code" | "profile">("code")
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const join = () =>
    start(async () => {
      setError(null)
      const r = await joinClassAction(code)
      if (r.ok) {
        toast.success(
          r.kind === "session"
            ? r.already
              ? `Anda sudah terdaftar di ${r.name}.`
              : `Terdaftar di ${r.name}. Tunggu di ruang tunggu sampai ujian dibuka.`
            : r.already
              ? `Anda sudah tergabung di ${r.name}.`
              : r.status === "PENDING"
                ? `Permintaan bergabung ke ${r.name} terkirim — menunggu persetujuan pengajar.`
                : `Bergabung dengan ${r.name}.`
        )
        onDone?.()
        router.push(r.href)
      } else if (r.error === "PROFILE_INCOMPLETE") {
        setStep("profile")
      } else setError(r.message)
    })

  const saveNim = () =>
    start(async () => {
      setError(null)
      const r = await completeStudentId(nim)
      if (!r.ok) return setError(r.fieldErrors?.studentId ? `${r.fieldErrors.studentId}. ${r.error}` : r.error)
      setStep("code")
      join() // lanjut bergabung dengan kode yang sama
    })

  const valid = !!normalizeCode(code)

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (step === "profile") saveNim()
        else if (valid) join()
      }}
    >
      {error && (
        <Alert variant="destructive" aria-live="polite">
          <AlertCircle aria-hidden />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {step === "code" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="class-code">Kode kelas atau ujian</Label>
          <Input
            id="class-code"
            value={code}
            onChange={(e) => setCode(sanitizeCodeInput(e.target.value))}
            placeholder="K7M-QX2P"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            autoFocus
            className="h-14 rounded-xl text-center font-mono text-2xl tracking-[0.3em] uppercase"
          />
          <p className="text-xs text-muted-foreground">6–8 karakter dari pengajar/panitia. Tidak memakai huruf O, I, L atau angka 0, 1.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="student-id">NIM</Label>
          <Input id="student-id" value={nim} onChange={(e) => setNim(e.target.value)} placeholder="mis. 2401001" autoFocus autoComplete="off" className="h-11 rounded-xl font-mono" />
          <p className="text-xs text-muted-foreground">Kelas/ujian ini mewajibkan NIM atau nomor peserta agar nilai dapat dicocokkan. Tidak bisa diubah sendiri setelah disimpan.</p>
        </div>
      )}
      <div className="flex justify-end gap-2">
        {step === "profile" && (
          <Button type="button" variant="outline" onClick={() => setStep("code")} disabled={pending}>
            Kembali
          </Button>
        )}
        <Button type="submit" disabled={pending || (step === "code" ? !valid : nim.trim().length < 3)}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {step === "code" ? "Gabung" : "Simpan NIM & gabung"}
        </Button>
      </div>
    </form>
  )
}

/** Tombol "+ Gabung kelas" yang membuka dialog form gabung. */
export function JoinClassDialog({ className, label = "Gabung kelas" }: { className?: string; label?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button className={className}>
            <Plus aria-hidden /> {label}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Gabung ke kelas atau ujian</DialogTitle>
          <DialogDescription>Masukkan kode dari pengajar (kelas) atau panitia (ujian umum).</DialogDescription>
        </DialogHeader>
        <JoinClassForm onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}
