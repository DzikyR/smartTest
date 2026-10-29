"use client"

import { useOptimistic, useState, useTransition } from "react"
import { RotateCcw, ShieldAlert } from "lucide-react"
import { toast } from "sonner"
import type { Role } from "@/lib/auth/roles"
import type { ActionResult } from "@/lib/action-result"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { resetFeature, setFeatureGlobal, setFeatureRole } from "./actions"

export type FeatureRow = {
  key: string
  name: string
  description: string
  category: string
  critical: boolean
  customized: boolean
  global: boolean
  roles: { role: Role; label: string; eligible: boolean; enabled: boolean }[]
}

type Change = { key: string; role?: Role; enabled: boolean } | { key: string; reset: true }

function applyChange(rows: FeatureRow[], c: Change): FeatureRow[] {
  return rows.map((row) => {
    if (row.key !== c.key) return row
    if ("reset" in c) return { ...row, customized: false, global: true, roles: row.roles.map((r) => ({ ...r, enabled: true })) }
    if (c.role) return { ...row, customized: true, roles: row.roles.map((r) => (r.role === c.role ? { ...r, enabled: c.enabled } : r)) }
    return { ...row, customized: true, global: c.enabled }
  })
}

/** Matriks saklar fitur × role, dengan pembaruan optimistis & konfirmasi untuk fitur kritis. */
export function FeatureMatrix({ rows, runningAttempts }: { rows: FeatureRow[]; runningAttempts: number }) {
  const [optimistic, setOptimistic] = useOptimistic(rows, applyChange)
  const [, startTransition] = useTransition()
  const [confirm, setConfirm] = useState<{ title: string; run: () => void } | null>(null)

  const run = (change: Change, action: () => Promise<ActionResult>) =>
    startTransition(async () => {
      setOptimistic(change)
      const result = await action()
      if (!result.ok) toast.error(result.error)
      else if (result.message) toast.success(result.message)
    })

  /** Mematikan fitur kritis butuh konfirmasi; menyalakan tidak. */
  const toggle = (row: FeatureRow, enabled: boolean, role?: Role) => {
    const exec = () => run({ key: row.key, role, enabled }, () => (role ? setFeatureRole(row.key, role, enabled) : setFeatureGlobal(row.key, enabled)))
    if (row.critical && !enabled) setConfirm({ title: role ? `${row.name} — ${row.roles.find((r) => r.role === role)?.label}` : row.name, run: exec })
    else exec()
  }

  const categories = [...new Set(optimistic.map((r) => r.category))]
  const roleColumns = optimistic[0]?.roles ?? []

  return (
    <>
      {categories.map((category) => (
        <Card key={category} className="py-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-2xl text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-semibold text-foreground">{category}</th>
                  <th className="w-24 px-3 py-3 text-center font-medium">Semua role</th>
                  {roleColumns.map((r) => (
                    <th key={r.role} className="w-24 px-3 py-3 text-center font-medium">
                      {r.label}
                    </th>
                  ))}
                  <th className="w-12 px-3 py-3">
                    <span className="sr-only">Reset</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {optimistic
                  .filter((row) => row.category === category)
                  .map((row) => (
                    <tr key={row.key} className="align-middle">
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap items-center gap-2 font-medium">
                          {row.name}
                          {row.critical && (
                            <Badge variant="destructive">
                              <ShieldAlert aria-hidden /> Kritis
                            </Badge>
                          )}
                          {row.customized && <Badge variant="outline">Diubah</Badge>}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">{row.description}</p>
                        <p className="mt-0.5 font-mono text-[11px] text-muted-foreground/80">{row.key}</p>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <Switch checked={row.global} onCheckedChange={(v) => toggle(row, v)} aria-label={`${row.name}: semua role`} />
                      </td>
                      {row.roles.map((r) => (
                        <td key={r.role} className="px-3 py-3 text-center">
                          {r.eligible ? (
                            <span className={cn("inline-flex", !row.global && "opacity-40")} title={row.global ? undefined : "Nonaktif secara global"}>
                              <Switch checked={r.enabled} disabled={!row.global} onCheckedChange={(v) => toggle(row, v, r.role)} aria-label={`${row.name}: ${r.label}`} />
                            </span>
                          ) : (
                            <span className="text-muted-foreground" title="Role ini tidak memiliki akses ke fitur ini">
                              —
                            </span>
                          )}
                        </td>
                      ))}
                      <td className="px-3 py-3 text-center">
                        {row.customized && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Kembalikan ke bawaan"
                            aria-label={`Kembalikan ${row.name} ke bawaan`}
                            onClick={() => run({ key: row.key, reset: true }, () => resetFeature(row.key))}
                          >
                            <RotateCcw aria-hidden />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}

      <Dialog open={!!confirm} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nonaktifkan {confirm?.title}?</DialogTitle>
            <DialogDescription>
              Ini fitur kritis — role terkait langsung kehilangan akses sampai fitur diaktifkan kembali.
              {runningAttempts > 0 && ` ${runningAttempts} percobaan yang sedang berjalan tetap dapat dilanjutkan dan dikumpulkan.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                confirm?.run()
                setConfirm(null)
              }}
            >
              Ya, nonaktifkan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
