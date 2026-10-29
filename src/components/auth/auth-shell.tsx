import { CheckCircle2, ClipboardCheck, FileSpreadsheet, ShieldCheck } from "lucide-react"
import { getBrand, getTexts } from "@/lib/site/config"
import { Logo } from "@/components/shell/logo"

const POINTS = [
  { icon: ClipboardCheck, key: "login.point1" },
  { icon: FileSpreadsheet, key: "login.point2" },
  { icon: ShieldCheck, key: "login.point3" },
] as const

/** Kerangka halaman masuk/daftar/lupa password: panel brand di kiri, form di kanan. */
export async function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  const [t, brand] = await Promise.all([getTexts(), getBrand()])
  return (
    <div className="grid min-h-svh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-gradient-to-br from-primary via-primary-mid to-primary-deep p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -top-24 -right-24 size-80 rounded-full bg-white/10" aria-hidden />
        <div className="absolute -bottom-32 -left-16 size-96 rounded-full bg-white/5" aria-hidden />
        <Logo brand={brand} href="/login" inverse className="relative w-fit" />
        <div className="relative max-w-md">
          <h1 className="text-4xl leading-tight font-bold">{t["login.hero.title"]}</h1>
          <p className="mt-4 text-primary-foreground/80">{t["login.hero.subtitle"]}</p>
          <ul className="mt-8 flex flex-col gap-3">
            {POINTS.map(({ icon: Icon, key }) => (
              <li key={key} className="flex items-center gap-3 rounded-2xl bg-white/10 p-3 backdrop-blur">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/15">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="text-sm">{t[key]}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative flex items-center gap-2 text-sm text-primary-foreground/70">
          <CheckCircle2 className="size-4" aria-hidden /> {t["login.footnote"]}
        </p>
      </section>

      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <Logo brand={brand} href="/login" className="mb-8 w-fit lg:hidden" />
          <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </section>
    </div>
  )
}
