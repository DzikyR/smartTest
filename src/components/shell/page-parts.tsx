import Link from "next/link"
import { ChevronLeft, ChevronRight, Inbox, Search } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed bg-card/60 px-4 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-tint-violet text-tint-violet-fg">
        <Inbox className="size-6" aria-hidden />
      </span>
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

type Params = Record<string, string | undefined>

function hrefWith(basePath: string, params: Params, patch: Params) {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries({ ...params, ...patch })) if (v) sp.set(k, v)
  const qs = sp.toString()
  return qs ? `${basePath}?${qs}` : basePath
}

/** Paginasi berbasis URL (?page=) — bekerja tanpa JS & bisa di-bookmark. */
export function Pagination({
  basePath,
  params,
  page,
  pageCount,
  total,
}: {
  basePath: string
  params: Params
  page: number
  pageCount: number
  total: number
}) {
  if (pageCount <= 1) return <p className="text-xs text-muted-foreground">{total} data</p>
  const prev = page > 1 ? hrefWith(basePath, params, { page: String(page - 1) }) : null
  const next = page < pageCount ? hrefWith(basePath, params, { page: String(page + 1) }) : null

  return (
    <nav className="flex items-center justify-between gap-2" aria-label="Paginasi">
      <p className="text-xs text-muted-foreground">
        Halaman {page} dari {pageCount} · {total} data
      </p>
      <div className="flex gap-1">
        <PageLink href={prev} label="Sebelumnya">
          <ChevronLeft aria-hidden />
        </PageLink>
        <PageLink href={next} label="Berikutnya">
          <ChevronRight aria-hidden />
        </PageLink>
      </div>
    </nav>
  )
}

function PageLink({ href, label, children }: { href: string | null; label: string; children: React.ReactNode }) {
  if (!href)
    return (
      <Button variant="outline" size="icon-sm" disabled aria-label={label}>
        {children}
      </Button>
    )
  return (
    <Link href={href} className={buttonVariants({ variant: "outline", size: "icon-sm" })} aria-label={label}>
      {children}
    </Link>
  )
}

/** Form pencarian GET; filter lain dipertahankan lewat hidden input. */
export function SearchForm({
  basePath,
  params,
  placeholder = "Cari…",
  children,
  className,
}: {
  basePath: string
  params: Params
  placeholder?: string
  children?: React.ReactNode
  className?: string
}) {
  return (
    <form action={basePath} className={cn("flex flex-col gap-2 sm:flex-row", className)} role="search">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input name="q" defaultValue={params.q} placeholder={placeholder} className="pl-8" aria-label="Kata kunci" />
      </div>
      {children}
      <Button type="submit" variant="secondary">
        Terapkan
      </Button>
    </form>
  )
}

export function parsePage(value: string | string[] | undefined) {
  const n = Number(Array.isArray(value) ? value[0] : value)
  return Number.isInteger(n) && n > 0 ? n : 1
}

export function str(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() || undefined
}

const TINTS = {
  violet: "bg-tint-violet text-tint-violet-fg",
  orange: "bg-tint-orange text-tint-orange-fg",
  green: "bg-tint-green text-tint-green-fg",
  sky: "bg-tint-sky text-tint-sky-fg",
  rose: "bg-tint-rose text-tint-rose-fg",
} as const
export type Tint = keyof typeof TINTS

/** Ikon bulat berwarna pastel. */
export function TintIcon({ tint, children, className }: { tint: Tint; children: React.ReactNode; className?: string }) {
  return <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl [&_svg]:size-5", TINTS[tint], className)}>{children}</span>
}

/** Kartu statistik ringkas (gaya dashboard e-learning). */
export function StatCard({ label, value, hint, icon, tint }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon: React.ReactNode; tint: Tint }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-card p-5 shadow-[0_1px_2px_rgb(30_20_80/0.04),0_8px_24px_-12px_rgb(30_20_80/0.08)] ring-1 ring-border/60">
      <TintIcon tint={tint}>{icon}</TintIcon>
      <div className="min-w-0">
        <p className="truncate text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl leading-tight font-bold tabular-nums">{value}</p>
        {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  )
}

/** Tab berbasis URL (bekerja tanpa JS). */
export function UrlTabs({ tabs, active, label }: { tabs: { href: string; label: React.ReactNode; key: string }[]; active: string; label: string }) {
  return (
    <nav className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-xl bg-card p-1 ring-1 ring-border/60" aria-label={label}>
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === active ? "page" : undefined}
          className={cn(
            "rounded-lg px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
            t.key === active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  )
}
