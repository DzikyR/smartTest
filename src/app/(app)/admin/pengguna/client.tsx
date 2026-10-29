"use client"

import { useState, useTransition } from "react"
import { Download, KeyRound, Loader2 } from "lucide-react"
import { toast } from "sonner"
import type { ActionResult } from "@/lib/action-result"
import { ActionForm, FormField } from "@/components/forms/action-form"
import { SecretReveal } from "@/components/forms/secret-reveal"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import type { ImportedAccount } from "./actions"

/** Reset password lalu tampilkan password sementara satu kali. */
export function ResetPasswordButton({ name, action }: { name: string; action: () => Promise<ActionResult<{ password: string }>> }) {
  const [secret, setSecret] = useState<string | null>(null)
  const [pending, start] = useTransition()
  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        title="Reset password"
        aria-label={`Reset password ${name}`}
        disabled={pending}
        onClick={() => {
          if (!confirm(`Reset password ${name}? Password lama langsung tidak berlaku.`)) return
          start(async () => {
            const r = await action()
            if (r.ok && r.data?.password) setSecret(r.data.password)
            else if (!r.ok) toast.error(r.error)
          })
        }}
      >
        {pending ? <Loader2 className="animate-spin" /> : <KeyRound />}
      </Button>
      <Dialog open={!!secret} onOpenChange={(o) => !o && setSecret(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Password sementara {name}</DialogTitle>
          </DialogHeader>
          {secret && <SecretReveal secret={secret} onDone={() => setSecret(null)} />}
        </DialogContent>
      </Dialog>
    </>
  )
}

type ImportResult = ActionResult<{ accounts: ImportedAccount[]; errors: string[] }>

/** Unggah Excel pengguna, lalu tampilkan akun & password sementara (unduh sebagai CSV). */
export function ImportUsersForm({ action }: { action: (prev: ActionResult<unknown>, fd: FormData) => Promise<ImportResult> }) {
  const [result, setResult] = useState<{ accounts: ImportedAccount[]; errors: string[] } | null>(null)

  const download = () => {
    if (!result) return
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`
    const csv = ["Nama,Email,Username,Role,Password Sementara", ...result.accounts.map((a) => [a.name, a.email, a.username ?? "", a.role, a.password].map(esc).join(","))].join("\r\n")
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }))
    const link = Object.assign(document.createElement("a"), { href: url, download: "akun-smarttest.csv" })
    link.click()
    URL.revokeObjectURL(url)
  }

  if (result) {
    return (
      <div className="flex flex-col gap-3 text-sm">
        <p>
          <strong>{result.accounts.length}</strong> akun dibuat. Password sementara <strong>hanya ditampilkan sekarang</strong> — unduh lalu bagikan ke pengguna.
        </p>
        {result.accounts.length > 0 && (
          <div className="max-h-60 overflow-auto rounded-xl border">
            <table className="w-full text-xs">
              <thead className="bg-muted text-left">
                <tr>
                  <th className="p-2">Nama</th>
                  <th className="p-2">Login</th>
                  <th className="p-2">Password</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {result.accounts.map((a) => (
                  <tr key={a.email}>
                    <td className="p-2">{a.name}</td>
                    <td className="p-2 font-mono">{a.username ?? a.email}</td>
                    <td className="p-2 font-mono">{a.password}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {result.errors.length > 0 && (
          <ul className="max-h-32 list-disc overflow-auto rounded-xl bg-destructive/5 p-3 pl-6 text-xs text-destructive">
            {result.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          {result.accounts.length > 0 && (
            <Button onClick={download}>
              <Download aria-hidden /> Unduh CSV akun
            </Button>
          )}
          <Button variant="outline" onClick={() => setResult(null)}>
            Impor lagi
          </Button>
        </div>
      </div>
    )
  }

  return (
    <ActionForm action={action} submitLabel="Impor" onSuccess={(r) => setResult(r.data ?? null)}>
      <p className="text-sm text-muted-foreground">
        Kolom baris pertama: <strong>Nama</strong>, <strong>Email</strong>, Username/NIM, Role (Peserta/Dosen), Kelompok. Maks. 1000 baris.{" "}
        <a href="/admin/pengguna/templat" className="font-medium text-primary hover:underline">
          Unduh templat
        </a>
      </p>
      <FormField name="file" label="Berkas Excel (.xlsx)">
        <Input id="file" name="file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required />
      </FormField>
    </ActionForm>
  )
}
