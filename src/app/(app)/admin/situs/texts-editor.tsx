"use client"

import { useMemo, useState, useTransition } from "react"
import { Loader2, RotateCcw, Search } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { saveTexts } from "./actions"

export type TextItem = { key: string; group: string; label: string; defaultValue: string; value: string; max: number; multiline: boolean; vars: string[] }

export function TextsEditor({ items }: { items: TextItem[] }) {
  const initial = useMemo(() => Object.fromEntries(items.map((i) => [i.key, i.value])), [items])
  const [values, setValues] = useState<Record<string, string>>(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [query, setQuery] = useState("")
  const [pending, startTransition] = useTransition()

  const dirty = items.some((i) => values[i.key] !== initial[i.key])
  const q = query.trim().toLowerCase()
  const visible = items.filter((i) => !q || [i.label, i.key, values[i.key], i.defaultValue].some((s) => s.toLowerCase().includes(q)))
  const groups = [...new Set(visible.map((i) => i.group))]

  const save = () =>
    startTransition(async () => {
      const r = await saveTexts(values)
      if (r.ok) {
        setErrors({})
        toast.success(r.message)
      } else {
        setErrors(r.fieldErrors ?? {})
        toast.error(r.error)
      }
    })

  return (
    <div className="flex flex-col gap-4">
      <div className="relative max-w-md">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari teks, label, atau key…" className="pl-9" aria-label="Cari teks" />
      </div>

      {groups.length === 0 && <p className="text-sm text-muted-foreground">Tidak ada teks yang cocok.</p>}

      {groups.map((group) => (
        <Card key={group}>
          <CardHeader>
            <CardTitle>{group}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {visible
              .filter((i) => i.group === group)
              .map((item) => {
                const value = values[item.key]
                const changed = value.trim() !== item.defaultValue
                const error = errors[item.key]
                const Field = item.multiline ? Textarea : Input
                return (
                  <div key={item.key} className="flex flex-col gap-1.5" data-invalid={error ? "" : undefined}>
                    <div className="flex flex-wrap items-center gap-2">
                      <label htmlFor={item.key} className="text-sm font-medium">
                        {item.label}
                      </label>
                      {changed && <Badge variant="outline">Diubah</Badge>}
                      <span className="ml-auto font-mono text-[11px] text-muted-foreground/80">{item.key}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <Field
                        id={item.key}
                        value={value}
                        rows={item.multiline ? 2 : undefined}
                        onChange={(e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => setValues((v) => ({ ...v, [item.key]: e.target.value }))}
                        className={cn(error && "border-destructive")}
                        aria-invalid={!!error}
                      />
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className={cn("mt-1 shrink-0", !changed && "invisible")}
                        title="Kembalikan teks bawaan"
                        aria-label={`Kembalikan ${item.label} ke teks bawaan`}
                        onClick={() => setValues((v) => ({ ...v, [item.key]: item.defaultValue }))}
                      >
                        <RotateCcw aria-hidden />
                      </Button>
                    </div>
                    <div className="flex gap-3 text-xs">
                      {error ? (
                        <p className="text-destructive" role="alert">
                          {error}
                        </p>
                      ) : (
                        <p className="text-muted-foreground">
                          {changed ? `Bawaan: ${item.defaultValue}` : "Memakai teks bawaan."}
                          {item.vars.length > 0 && ` Placeholder: ${item.vars.map((v) => `{${v}}`).join(", ")}.`}
                        </p>
                      )}
                      <span className={cn("ml-auto shrink-0 tabular-nums", value.length > item.max ? "text-destructive" : "text-muted-foreground")}>
                        {value.length}/{item.max}
                      </span>
                    </div>
                  </div>
                )
              })}
          </CardContent>
        </Card>
      ))}

      <div className="sticky bottom-4 z-10 flex items-center justify-end gap-3 rounded-2xl bg-card/95 p-3 shadow-lg ring-1 ring-border/60 backdrop-blur">
        <p className="mr-auto text-sm text-muted-foreground">{dirty ? "Ada perubahan yang belum disimpan." : "Kosongkan kolom untuk kembali ke teks bawaan."}</p>
        {dirty && (
          <Button variant="outline" onClick={() => setValues(initial)} disabled={pending}>
            Batalkan
          </Button>
        )}
        <Button onClick={save} disabled={!dirty || pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          Simpan teks
        </Button>
      </div>
    </div>
  )
}
