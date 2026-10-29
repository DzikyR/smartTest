"use client"

import { useState, useTransition } from "react"
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react"
import { toast } from "sonner"
import { contrastWarnings, DEFAULT_COLORS, THEME_TOKENS, themeVars, type SiteTheme, type ThemeMode, type ThemeToken } from "@/lib/site/theme"
import { cn } from "@/lib/utils"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { saveTheme } from "./actions"

const MODES: { key: ThemeMode; label: string }[] = [
  { key: "light", label: "Mode terang" },
  { key: "dark", label: "Mode gelap" },
]

/**
 * Palet dasar pratinjau per mode. Pratinjau tidak boleh mewarisi mode halaman
 * admin, jadi semua variabel yang dipakai di pratinjau ditetapkan di sini.
 */
const PREVIEW_BASE: Record<ThemeMode, Record<string, string>> = {
  light: { "--card": "#ffffff", "--muted-foreground": "#77758c", "--border": "#e7e6f1", "--primary-foreground": "#ffffff", "--secondary-foreground": DEFAULT_COLORS.light.softForeground, "--accent-foreground": DEFAULT_COLORS.light.softForeground },
  dark: { "--card": "#201e2e", "--muted-foreground": "#aaa8bd", "--border": "#2f2d40", "--primary-foreground": "#15131f", "--secondary-foreground": DEFAULT_COLORS.dark.softForeground, "--accent-foreground": DEFAULT_COLORS.dark.softForeground },
}

function previewStyle(mode: ThemeMode, theme: SiteTheme) {
  const d = DEFAULT_COLORS[mode]
  return {
    ...PREVIEW_BASE[mode],
    "--primary": d.primary,
    "--secondary": d.secondary,
    "--accent": d.accent,
    "--background": d.background,
    "--foreground": d.foreground,
    ...themeVars(mode, theme[mode]),
    "--primary-mid": "color-mix(in oklch, var(--primary), black 7%)",
    "--primary-deep": "color-mix(in oklch, var(--primary), black 20%)",
  } as React.CSSProperties
}

export function ThemeEditor({ initial }: { initial: SiteTheme }) {
  const [theme, setTheme] = useState<SiteTheme>(initial)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()
  const dirty = JSON.stringify(theme) !== JSON.stringify(initial)

  const setColor = (mode: ThemeMode, token: ThemeToken, value: string | undefined) =>
    setTheme((t) => {
      const colors = { ...t[mode] }
      if (value) colors[token] = value.toLowerCase()
      else delete colors[token]
      return { ...t, [mode]: colors }
    })

  const save = () =>
    startTransition(async () => {
      const r = await saveTheme(theme)
      if (r.ok) toast.success(r.message)
      else toast.error(r.error)
    })

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 xl:grid-cols-2">
        {MODES.map(({ key: mode, label }) => {
          const warnings = contrastWarnings(mode, theme[mode])
          return (
            <Card key={mode}>
              <CardHeader>
                <CardTitle>{label}</CardTitle>
                <CardDescription>Warna teks di atas setiap warna dipilih otomatis agar tetap terbaca.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  {THEME_TOKENS.map((token) => {
                    const id = `${mode}-${token.key}`
                    const value = theme[mode][token.key]
                    const shown = value ?? DEFAULT_COLORS[mode][token.key]
                    return (
                      <div key={token.key} className="flex flex-col gap-1.5">
                        <label htmlFor={id} className="text-sm font-medium">
                          {token.label}
                          {!value && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(bawaan)</span>}
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={shown}
                            onChange={(e) => setColor(mode, token.key, e.target.value)}
                            aria-label={`Pilih warna ${token.label} ${label}`}
                            className="size-9 shrink-0 cursor-pointer rounded-lg border bg-transparent p-0.5"
                          />
                          <Input
                            id={id}
                            value={drafts[id] ?? shown}
                            spellCheck={false}
                            maxLength={7}
                            className="font-mono uppercase"
                            onChange={(e) => {
                              const v = e.target.value.trim()
                              setDrafts((d) => ({ ...d, [id]: v }))
                              if (/^#[0-9a-f]{6}$/i.test(v)) setColor(mode, token.key, v)
                            }}
                            onBlur={() =>
                              setDrafts((d) => {
                                const next = { ...d }
                                delete next[id]
                                return next
                              })
                            }
                          />
                          {value && (
                            <Button variant="ghost" size="icon-sm" title="Kembalikan bawaan" aria-label={`Kembalikan ${token.label} bawaan`} onClick={() => setColor(mode, token.key, undefined)}>
                              <RotateCcw aria-hidden />
                            </Button>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{token.hint}</p>
                      </div>
                    )
                  })}
                </div>

                {warnings.length > 0 && (
                  <Alert>
                    <AlertTriangle aria-hidden />
                    <AlertDescription>
                      Kontras rendah (di bawah 4.5:1): {warnings.map((w) => `${w.label} ${w.ratio}:1`).join(", ")}. Teks mungkin sulit dibaca — pilih warna yang lebih terang atau lebih gelap.
                    </AlertDescription>
                  </Alert>
                )}

                <ThemePreview mode={mode} theme={theme} />
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="sticky bottom-4 z-10 flex items-center justify-end gap-3 rounded-2xl bg-card/95 p-3 shadow-lg ring-1 ring-border/60 backdrop-blur">
        <p className="mr-auto text-sm text-muted-foreground">{dirty ? "Ada perubahan yang belum disimpan." : "Pratinjau sesuai warna yang sedang aktif."}</p>
        {dirty && (
          <Button variant="outline" onClick={() => setTheme(initial)} disabled={pending}>
            Batalkan
          </Button>
        )}
        <Button onClick={save} disabled={!dirty || pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          Simpan tema
        </Button>
      </div>
    </div>
  )
}

/** Miniatur aplikasi — hanya kelas warna token, tanpa varian dark: (agar tidak terpengaruh mode admin). */
function ThemePreview({ mode, theme }: { mode: ThemeMode; theme: SiteTheme }) {
  return (
    <div style={previewStyle(mode, theme)} className="overflow-hidden rounded-2xl border border-border bg-background text-foreground" aria-label="Pratinjau tema">
      <div className="flex">
        <div className="hidden w-36 shrink-0 flex-col gap-1 border-r border-border bg-card p-3 sm:flex">
          <span className="rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground">Dashboard</span>
          <span className="rounded-lg bg-accent px-2.5 py-1.5 text-xs font-medium text-accent-foreground">Bank Soal</span>
          <span className="px-2.5 py-1.5 text-xs text-muted-foreground">Kelola Ujian</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3 p-3">
          <div className={cn("rounded-xl bg-gradient-to-br from-primary via-primary-mid to-primary-deep p-3 text-primary-foreground")}>
            <p className="text-[11px] opacity-80">Selamat datang kembali</p>
            <p className="text-sm font-bold">Halo, Rina!</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-xs font-semibold">Kartu konten</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Teks sekunder dan <span className="font-medium text-primary">tautan</span>.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground">Simpan</span>
              <span className="rounded-md bg-secondary px-2.5 py-1 text-[11px] font-medium text-secondary-foreground">Sekunder</span>
              <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] text-accent-foreground">Badge</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
