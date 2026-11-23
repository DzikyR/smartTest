"use client"

import { useRef, useState } from "react"
import { Network } from "lucide-react"
import { ActionForm, FormField } from "@/components/forms/action-form"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { saveTrustedNetworks } from "./actions"

export type IpLimitRow = { label: string; base: number; minutes: number }

const per = (minutes: number) => (minutes >= 60 ? `${minutes / 60} jam` : `${minutes} menit`)

/**
 * Jaringan kampus tepercaya: satu kampus/lab di balik NAT terlihat sebagai SATU IP publik,
 * sehingga ratusan peserta ujian bisa tertahan batas per IP. IP di daftar ini memakai batas × pengali.
 */
export function TrustedNetworks({
  networks,
  multiplier,
  currentIp,
  currentTrusted,
  limits,
}: {
  networks: string[]
  multiplier: number
  currentIp: string
  currentTrusted: boolean
  limits: IpLimitRow[]
}) {
  const listRef = useRef<HTMLTextAreaElement>(null)
  const [factor, setFactor] = useState(multiplier)
  const valid = Number.isInteger(factor) && factor >= 2 && factor <= 100

  const addMine = () => {
    const el = listRef.current
    if (!el || el.value.split(/[\s,;]+/).includes(currentIp)) return
    el.value = `${el.value.trimEnd()}${el.value.trim() ? "\n" : ""}${currentIp}`
    el.focus()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Network className="size-4" aria-hidden />
          Jaringan kampus tepercaya
        </CardTitle>
        <CardDescription>
          Satu kampus atau lab biasanya keluar ke internet lewat satu IP publik (NAT), sehingga ratusan peserta ujian terhitung sebagai satu IP. Untuk IP di daftar ini,
          batas per IP dikalikan. Batas per akun (kunci akun setelah 5× salah password, gabung kelas 10×/menit per akun) tetap berlaku.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/40 px-3 py-2 text-sm">
          <span className="text-muted-foreground">IP Anda saat ini:</span>
          <code className="font-mono">{currentIp}</code>
          {currentTrusted ? <Badge>Tepercaya</Badge> : <Badge variant="outline">Belum tepercaya</Badge>}
          {!currentTrusted && currentIp !== "unknown" && (
            <Button type="button" size="sm" variant="outline" className="ml-auto" onClick={addMine}>
              Tambahkan IP saya
            </Button>
          )}
        </div>

        <ActionForm action={saveTrustedNetworks} submitLabel="Simpan jaringan">
          <FormField
            name="networks"
            label="IP / CIDR publik kampus"
            hint="Satu per baris. Contoh: 114.141.59.182 atau 114.141.59.0/24 (IPv6: 2001:db8:10::/48). Teks setelah # diabaikan. Tanyakan IP publik kampus ke bagian TIK."
          >
            <Textarea
              ref={listRef}
              id="networks"
              name="networks"
              rows={5}
              defaultValue={networks.join("\n")}
              placeholder={"114.141.59.182   # gedung A\n114.141.60.0/24  # lab komputer"}
              className="font-mono text-sm"
            />
          </FormField>
          <FormField name="multiplier" label="Pengali batas per IP" hint="2–100. Bawaan 20: cukup untuk ±500 peserta dari satu IP.">
            <Input
              id="multiplier"
              name="multiplier"
              type="number"
              inputMode="numeric"
              min={2}
              max={100}
              step={1}
              defaultValue={multiplier}
              onChange={(e) => setFactor(Number(e.target.value))}
              className="w-32"
            />
          </FormField>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Batas per IP</th>
                  <th className="px-3 py-2 font-medium">IP biasa</th>
                  <th className="px-3 py-2 font-medium">Jaringan tepercaya</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {limits.map((l) => (
                  <tr key={l.label}>
                    <td className="px-3 py-2">{l.label}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {l.base} / {per(l.minutes)}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{valid ? `${l.base * factor} / ${per(l.minutes)}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Login dan gabung kelas hanya menghitung percobaan yang gagal: peserta yang berhasil masuk atau bergabung tidak menghabiskan jatah. IPv6 dihitung per blok /64.
          </p>
        </ActionForm>
      </CardContent>
    </Card>
  )
}
