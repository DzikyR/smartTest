import type { Metadata } from "next"
import { db } from "@/lib/db"
import { requireRole } from "@/lib/auth/dal"
import { formatDateTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import { EmptyState, PageHeader, Pagination, parsePage, SearchForm, str } from "@/components/shell/page-parts"
import { Card } from "@/components/ui/card"

export const metadata: Metadata = { title: "Log Aktivitas" }

const PAGE_SIZE = 50
const SEVERITY = { INFO: "bg-tint-sky text-tint-sky-fg", WARNING: "bg-tint-orange text-tint-orange-fg", CRITICAL: "bg-tint-rose text-tint-rose-fg" } as const

export default async function AuditLogPage({ searchParams }: PageProps<"/admin/log">) {
  await requireRole("SUPER_ADMIN")
  const sp = await searchParams
  const q = str(sp.q)
  const page = parsePage(sp.page)
  const where = q ? { OR: [{ action: { contains: q, mode: "insensitive" as const } }, { user: { name: { contains: q, mode: "insensitive" as const } } }] } : {}
  const [total, logs] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { user: { select: { name: true, email: true } } } }),
  ])
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Log Aktivitas" description="Login, perubahan akun, dan aktivitas ujian penting (token salah, pelanggaran lingkungan, reset perangkat)." />
      <SearchForm basePath="/admin/log" params={{ q }} placeholder="Cari aksi atau nama pengguna…" />
      {logs.length === 0 ? (
        <EmptyState title="Belum ada log" />
      ) : (
        <Card className="py-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-3xl text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">Waktu</th>
                  <th className="px-3 py-3 font-medium">Aksi</th>
                  <th className="px-3 py-3 font-medium">Pengguna</th>
                  <th className="px-3 py-3 font-medium">IP</th>
                  <th className="px-5 py-3 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {logs.map((l) => (
                  <tr key={l.id} className="align-top">
                    <td className="px-5 py-2.5 text-xs whitespace-nowrap text-muted-foreground">{formatDateTime(l.createdAt)}</td>
                    <td className="px-3 py-2.5">
                      <span className={cn("rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold", SEVERITY[l.severity])}>{l.action}</span>
                    </td>
                    <td className="px-3 py-2.5 text-xs">{l.user ? l.user.name : <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{l.ipAddress ?? "—"}</td>
                    <td className="max-w-xs truncate px-5 py-2.5 font-mono text-[11px] text-muted-foreground" title={l.metadata ? JSON.stringify(l.metadata) : undefined}>
                      {l.entity && `${l.entity} `}
                      {l.metadata ? JSON.stringify(l.metadata) : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <Pagination basePath="/admin/log" params={{ q }} page={page} pageCount={Math.ceil(total / PAGE_SIZE)} total={total} />
    </div>
  )
}
