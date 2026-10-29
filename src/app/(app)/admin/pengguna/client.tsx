"use client"

import { useState, useTransition } from "react"
import { Download, KeyRound, Loader2 } from "lucide-react"
import { toast } from "sonner"
import type { ActionResult } from "@/lib/action-result"
import { ActionForm, FormField } from "@/components/forms/action-form"
import { SecretReveal } from "@/components/forms/secret-reveal"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { NativeSelect } from "@/components/forms/native-select"
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

type AccountsData = { accounts: ImportedAccount[]; errors: string[] }
type AccountsAction = (prev: ActionResult<unknown>, fd: FormData) => Promise<ActionResult<AccountsData>>

/** Daftar akun + password sementara yang baru dibuat (hanya tampil sekali), bisa diunduh sebagai CSV. */
function AccountsResult({ result, roleLabels, again, againLabel }: { result: AccountsData; roleLabels: Record<string, string>; again: () => void; againLabel: string }) {
  const download = () => {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`
    const csv = ["Nama,Email,Username,Role,Password Sementara", ...result.accounts.map((a) => [a.name, a.email, a.username ?? "", roleLabels[a.role] ?? a.role, a.password].map(esc).join(","))].join("\r\n")
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }))
    const link = Object.assign(document.createElement("a"), { href: url, download: "akun-smarttest.csv" })
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p>
        <strong>{result.accounts.length}</strong> akun dibuat. Password sementara <strong>hanya ditampilkan sekarang</strong> — unduh lalu bagikan ke pengguna.
      </p>
      {result.accounts.length > 0 && (
        <div className="max-h-60 overflow-auto rounded-xl border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted text-left">
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
        <Button variant="outline" onClick={again}>
          {againLabel}
        </Button>
      </div>
    </div>
  )
}

/** Unggah Excel pengguna, lalu tampilkan akun & password sementara (unduh sebagai CSV). */
export function ImportUsersForm({ action, roleLabels }: { action: AccountsAction; roleLabels: Record<string, string> }) {
  const [result, setResult] = useState<AccountsData | null>(null)
  if (result) return <AccountsResult result={result} roleLabels={roleLabels} again={() => setResult(null)} againLabel="Impor lagi" />

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

/**
 * Super Admin: buat banyak akun berurutan (awalan + nomor) dengan password acak.
 * Pratinjau username/email diperbarui saat mengetik.
 */
export function GenerateAccountsForm({
  action,
  roleLabels,
  roles,
  groups,
  max,
}: {
  action: AccountsAction
  roleLabels: Record<string, string>
  roles: string[]
  groups: { id: string; name: string }[]
  max: number
}) {
  const [result, setResult] = useState<AccountsData | null>(null)
  const [v, setV] = useState({ count: "30", prefix: "peserta", start: "1", namePrefix: "Peserta", domain: "", role: "PESERTA" })
  if (result) return <AccountsResult result={result} roleLabels={roleLabels} again={() => setResult(null)} againLabel="Buat lagi" />

  const count = Math.min(Math.max(Math.trunc(Number(v.count)) || 0, 0), max)
  const start = Math.max(Math.trunc(Number(v.start)) || 0, 0)
  const digits = Math.max(3, String(start + Math.max(count, 1) - 1).length)
  const sample = (n: number) => `${v.prefix.trim().toLowerCase()}${String(n).padStart(digits, "0")}`
  const set = (key: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((s) => ({ ...s, [key]: e.target.value }))

  return (
    <ActionForm action={action} submitLabel={count ? `Buat ${count} akun` : "Buat akun"} onSuccess={(r) => setResult(r.data ?? null)}>
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField name="count" label="Jumlah akun" hint={`Maks. ${max}`}>
          <Input id="count" name="count" type="number" min={1} max={max} value={v.count} onChange={set("count")} required />
        </FormField>
        <FormField name="prefix" label="Awalan username">
          <Input id="prefix" name="prefix" value={v.prefix} onChange={set("prefix")} maxLength={30} required />
        </FormField>
        <FormField name="start" label="Nomor awal">
          <Input id="start" name="start" type="number" min={0} value={v.start} onChange={set("start")} required />
        </FormField>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField name="namePrefix" label="Awalan nama">
          <Input id="namePrefix" name="namePrefix" value={v.namePrefix} onChange={set("namePrefix")} maxLength={60} required />
        </FormField>
        <FormField name="domain" label="Domain email" hint="Email akun: username@domain.">
          <Input id="domain" name="domain" value={v.domain} onChange={set("domain")} placeholder="peserta.kampus.ac.id" required />
        </FormField>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField name="role" label="Role">
          <NativeSelect id="role" name="role" value={v.role} onChange={set("role")}>
            {roles.map((r) => (
              <option key={r} value={r}>
                {roleLabels[r]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        {groups.length > 0 && v.role === "PESERTA" && (
          <FormField name="groupId" label="Masukkan ke kelompok (opsional)">
            <NativeSelect id="groupId" name="groupId" defaultValue="">
              <option value="">—</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        )}
      </div>
      {count > 0 && v.prefix.trim() && (
        <p className="rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
          Akan dibuat: <span className="font-mono text-foreground">{sample(start)}</span>
          {count > 1 && (
            <>
              {" … "}
              <span className="font-mono text-foreground">{sample(start + count - 1)}</span>
            </>
          )}
          {" · email "}
          <span className="font-mono text-foreground">
            {sample(start)}@{v.domain.trim() || "domain"}
          </span>
          {" · password acak 12 karakter, wajib diganti saat login pertama."}
        </p>
      )}
    </ActionForm>
  )
}
