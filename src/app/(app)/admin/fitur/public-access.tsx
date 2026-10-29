"use client"

import { useOptimistic, useTransition } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { setAuthSetting } from "./actions"

type Settings = { registrationOpen: boolean; googleLogin: boolean }

/** Saklar akses publik (tamu belum login): pendaftaran mandiri & masuk dengan Google. */
export function PublicAccess({ settings, googleConfigured }: { settings: Settings; googleConfigured: boolean }) {
  const [state, setState] = useOptimistic(settings, (s, change: Partial<Settings>) => ({ ...s, ...change }))
  const [, startTransition] = useTransition()

  const toggle = (key: keyof Settings, enabled: boolean) =>
    startTransition(async () => {
      setState({ [key]: enabled })
      const r = await setAuthSetting(key, enabled)
      if (r.ok) toast.success(r.message)
      else toast.error(r.error)
    })

  const rows: { key: keyof Settings; title: string; hint: string; disabled?: boolean }[] = [
    { key: "registrationOpen", title: "Pendaftaran mandiri", hint: "Tamu dapat membuat akun peserta sendiri di halaman Daftar (juga lewat Google untuk email yang belum terdaftar)." },
    {
      key: "googleLogin",
      title: "Masuk dengan Google",
      hint: googleConfigured ? "Tombol “Masuk dengan Google” di halaman masuk." : "Belum dikonfigurasi — isi AUTH_GOOGLE_ID & AUTH_GOOGLE_SECRET di .env server.",
      disabled: !googleConfigured,
    },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Akses publik</CardTitle>
        <CardDescription>Berlaku untuk pengunjung yang belum masuk. Akun yang sudah ada tidak terpengaruh.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col divide-y">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
            <div>
              <p className="text-sm font-medium">{row.title}</p>
              <p className="text-xs text-muted-foreground">{row.hint}</p>
            </div>
            <Switch checked={state[row.key] && !row.disabled} disabled={row.disabled} onCheckedChange={(v) => toggle(row.key, v)} aria-label={row.title} />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
