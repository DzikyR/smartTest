import type { Metadata } from "next"
import { db } from "@/lib/db"
import { requireRole } from "@/lib/auth/dal"
import { getBranding, getTheme } from "@/lib/site/config"
import { BRAND_ASSETS, BRAND_KINDS } from "@/lib/site/branding"
import { TEXT_KEYS, TEXTS } from "@/content/texts"
import { formatDateTime } from "@/lib/format"
import { PageHeader, str, UrlTabs } from "@/components/shell/page-parts"
import { ActionButton } from "@/components/forms/action-button"
import { ActionForm, FieldError } from "@/components/forms/action-form"
import { ConfirmAction } from "@/components/forms/confirm-action"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { deleteBrandAsset, resetTheme, uploadBrandAsset } from "./actions"
import { ThemeEditor } from "./theme-editor"
import { TextsEditor } from "./texts-editor"

export const metadata: Metadata = { title: "Tampilan Situs" }

const TABS = [
  { key: "tema", label: "Tema Warna" },
  { key: "branding", label: "Logo & Favicon" },
  { key: "teks", label: "Teks" },
] as const

export default async function SiteAppearancePage({ searchParams }: PageProps<"/admin/situs">) {
  await requireRole("SUPER_ADMIN")
  const active = str((await searchParams).tab)
  const tab = TABS.find((t) => t.key === active)?.key ?? "tema"

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tampilan Situs"
        description="Ubah warna, logo, dan teks situs. Perubahan langsung berlaku untuk semua pengguna; nilai bawaan selalu dapat dikembalikan."
      />
      <UrlTabs tabs={TABS.map((t) => ({ ...t, href: t.key === "tema" ? "/admin/situs" : `/admin/situs?tab=${t.key}` }))} active={tab} label="Bagian tampilan situs" />
      {tab === "tema" && <ThemeTab />}
      {tab === "branding" && <BrandingTab />}
      {tab === "teks" && <TextsTab />}
    </div>
  )
}

async function ThemeTab() {
  const theme = await getTheme()
  const customized = Object.keys(theme.light).length + Object.keys(theme.dark).length > 0
  return (
    <>
      <ThemeEditor key={JSON.stringify(theme)} initial={theme} />
      {customized && (
        <div className="flex justify-end">
          <ConfirmAction
            action={resetTheme}
            title="Kembalikan warna bawaan?"
            description="Semua warna ubahan (mode terang & gelap) dihapus dan situs kembali ke palet bawaan."
            confirmLabel="Ya, kembalikan"
            destructive
            trigger={<Button variant="outline">Kembalikan semua warna bawaan</Button>}
          />
        </div>
      )}
    </>
  )
}

async function BrandingTab() {
  const [branding, assets] = await Promise.all([getBranding(), db.brandAsset.findMany({ select: { kind: true, mimeType: true, updatedAt: true } })])
  const urls = { LOGO_LIGHT: branding.logoLight, LOGO_DARK: branding.logoDark, FAVICON: branding.favicon }
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {BRAND_KINDS.map((kind) => {
        const spec = BRAND_ASSETS[kind]
        const asset = assets.find((a) => a.kind === kind)
        const url = urls[kind]
        return (
          <Card key={kind}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {spec.label}
                {asset ? <Badge variant="outline">Diubah</Badge> : <Badge variant="secondary">Bawaan</Badge>}
              </CardTitle>
              <CardDescription>{spec.hint}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className={kind === "LOGO_DARK" ? "rounded-xl bg-[#16141f] p-4" : "rounded-xl bg-muted p-4"}>
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- pratinjau aset unggahan apa adanya
                  <img src={url} alt={spec.label} className={kind === "FAVICON" ? "size-10" : "h-10 w-auto max-w-full object-contain"} />
                ) : (
                  <p className={kind === "LOGO_DARK" ? "text-sm text-white/60" : "text-sm text-muted-foreground"}>Memakai {kind === "FAVICON" ? "ikon bawaan browser" : "logo bawaan (ikon + nama aplikasi)"}</p>
                )}
              </div>
              {asset && (
                <p className="text-xs text-muted-foreground">
                  {asset.mimeType.replace("image/", "").toUpperCase()} · diperbarui {formatDateTime(asset.updatedAt)}
                </p>
              )}
              <ActionForm action={uploadBrandAsset.bind(null, kind)} submitLabel={asset ? "Ganti" : "Unggah"}>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`file-${kind}`}>Berkas</Label>
                  <Input id={`file-${kind}`} name="file" type="file" accept={spec.types.join(",")} required />
                  <FieldError name="file" />
                </div>
              </ActionForm>
              {asset && (
                <ActionButton action={deleteBrandAsset.bind(null, kind)} variant="ghost" size="sm" className="w-fit">
                  Hapus & pakai bawaan
                </ActionButton>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

async function TextsTab() {
  const rows = await db.contentText.findMany({ select: { key: true, value: true, updatedAt: true } })
  const overrides = new Map(rows.map((r) => [r.key, r.value]))
  const items = TEXT_KEYS.map((key) => {
    const def: { group: string; label: string; default: string; max?: number; multiline?: boolean; vars?: readonly string[] } = TEXTS[key]
    return { key, group: def.group, label: def.label, defaultValue: def.default, value: overrides.get(key) ?? def.default, max: def.max ?? 200, multiline: !!def.multiline, vars: [...(def.vars ?? [])] }
  })
  const version = rows.map((r) => r.updatedAt.getTime()).join(",")
  return <TextsEditor key={version} items={items} />
}
