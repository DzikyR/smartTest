import { cn } from "@/lib/utils"

/**
 * Diagram batang satu seri (HTML murni, tanpa pustaka): satu warna (--chart-1),
 * ujung atas membulat 4px, celah 2px antar-batang, grid samar, tooltip saat
 * hover/fokus, dan tabel data untuk pembaca layar.
 */
export function BarChart({
  title,
  data,
  valueLabel,
  format = (v) => String(v),
  max,
  height = 180,
  className,
}: {
  title: string
  data: { label: string; value: number; hint?: string }[]
  valueLabel: string
  format?: (v: number) => string
  /** Skala atas sumbu (mis. 100 untuk nilai); bawaan = nilai terbesar */
  max?: number
  height?: number
  className?: string
}) {
  const top = Math.max(max ?? 0, ...data.map((d) => d.value), 1)
  const ticks = [top, top / 2, 0]

  return (
    <figure className={cn("flex flex-col gap-2", className)}>
      <figcaption className="sr-only">{title}</figcaption>
      <div className="flex gap-2">
        {/* Sumbu nilai */}
        <div className="flex flex-col justify-between pb-6 text-right text-[11px] text-muted-foreground tabular-nums" style={{ height: height + 24 }} aria-hidden>
          {ticks.map((t) => (
            <span key={t} className="-translate-y-1/2 leading-none">
              {format(Math.round(t * 10) / 10)}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          {/* Garis grid samar */}
          <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col justify-between" style={{ height }} aria-hidden>
            {ticks.map((t) => (
              <span key={t} className={cn("border-t", t === 0 ? "border-border" : "border-dashed border-border/60")} />
            ))}
          </div>
          <div className="relative flex items-end gap-[2px]" style={{ height }} aria-hidden>
            {data.map((d) => (
              <div key={d.label} className="group relative flex h-full min-w-0 flex-1 items-end justify-center">
                <div
                  className="w-full max-w-12 rounded-t-[4px] bg-chart-1 transition-opacity group-hover:opacity-80"
                  style={{ height: `${(d.value / top) * 100}%`, minHeight: d.value > 0 ? 2 : 0 }}
                />
                <div className="pointer-events-none absolute bottom-full z-10 mb-1 hidden rounded-lg bg-foreground px-2.5 py-1.5 text-xs whitespace-nowrap text-background shadow-lg group-hover:block">
                  <span className="font-semibold">{d.label}</span>
                  <br />
                  {valueLabel}: {format(d.value)}
                  {d.hint && (
                    <>
                      <br />
                      {d.hint}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex gap-[2px] text-center text-[11px] text-muted-foreground" aria-hidden>
            {data.map((d) => (
              <span key={d.label} className="min-w-0 flex-1 truncate" title={d.label}>
                {d.label}
              </span>
            ))}
          </div>
        </div>
      </div>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">Lihat tabel data</summary>
        <table className="mt-2 w-full max-w-sm text-left">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr>
              <th className="py-1 font-medium">Kategori</th>
              <th className="py-1 text-right font-medium">{valueLabel}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.label} className="border-t">
                <td className="py-1">{d.label}</td>
                <td className="py-1 text-right tabular-nums">{format(d.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}
