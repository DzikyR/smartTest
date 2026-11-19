import Link from "next/link"
import { Download, FileSpreadsheet } from "lucide-react"
import { loadGradebook } from "@/lib/classes/gradebook"
import { CELL_LABEL, type GradeCell } from "@/lib/classes/gradebook-math"
import { formatDateTime } from "@/lib/format"
import { WORK_TYPE_LABEL } from "@/lib/labels"
import { cn } from "@/lib/utils"
import { EmptyState } from "@/components/shell/page-parts"
import { buttonVariants } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

function Cell({ c }: { c: GradeCell }) {
  if (c.state === "graded")
    return (
      <span className="font-semibold tabular-nums" title={c.submittedAt ? `Dikumpulkan ${formatDateTime(c.submittedAt)}${c.isLate ? " (terlambat)" : ""}` : undefined}>
        {c.score}
        {c.isLate && <span className="ml-1 text-[10px] font-medium text-tint-rose-fg">terlambat</span>}
      </span>
    )
  if (c.state === "pending") return <span className="rounded-full bg-tint-orange px-2 py-0.5 text-xs font-medium text-tint-orange-fg">{CELL_LABEL.pending}</span>
  if (c.state === "missing")
    return (
      <span className="font-semibold text-tint-rose-fg tabular-nums" title={CELL_LABEL.missing}>
        0
      </span>
    )
  return <span className="text-muted-foreground">—</span>
}

/** Tab "Penilaian & Rekap" (pengajar): matriks nilai mahasiswa × Tugas/ujian kelas, ekspor Excel. */
export async function TeacherGradebook({ groupId, canExport }: { groupId: string; canExport: boolean }) {
  const { works, rows } = await loadGradebook(groupId)
  if (works.length === 0) return <EmptyState title="Belum ada nilai" description="Rekap muncul setelah ada Tugas atau ujian terbit yang ditujukan ke kelas ini." />
  const pending = rows.reduce((n, r) => n + r.cells.filter((c) => c.state === "pending").length, 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {rows.length} mahasiswa · {works.length} pekerjaan{pending ? ` · ${pending} perlu dinilai` : ""} · nilai skala 0–100
        </p>
        {canExport && (
          <a href={`/kelas/${groupId}/ekspor`} className={buttonVariants({ className: "rounded-xl" })}>
            <FileSpreadsheet aria-hidden /> Ekspor Excel (rekap)
          </a>
        )}
      </div>
      <Card className="py-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="sticky left-0 min-w-48 bg-card px-4 py-3 font-medium">Mahasiswa</th>
                {works.map((w) => (
                  <th key={w.id} className="min-w-32 px-3 py-3 align-top font-medium">
                    <Link href={`/ujian-kelola/${w.id}?tab=peserta`} className="line-clamp-2 text-foreground hover:text-primary hover:underline">
                      {w.title}
                    </Link>
                    <span className="mt-0.5 flex items-center gap-1">
                      {w.workType === "ASSIGNMENT" ? WORK_TYPE_LABEL.ASSIGNMENT : w.label}
                      {canExport && (
                        <a href={`/kelas/${groupId}/ekspor/${w.id}`} className="rounded p-0.5 hover:bg-muted hover:text-primary" title={`Ekspor Excel: ${w.title}`} aria-label={`Ekspor Excel ${w.title}`}>
                          <Download className="size-3.5" />
                        </a>
                      )}
                    </span>
                    {w.dueAt && <span className="block font-normal">tenggat {formatDateTime(w.dueAt)}</span>}
                  </th>
                ))}
                <th className="min-w-28 bg-tint-violet/40 px-3 py-3 align-top font-semibold text-foreground">Rata-Rata Tugas</th>
                <th className="min-w-28 px-3 py-3 align-top font-medium">Rata-rata semua</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={works.length + 3} className="px-4 py-6 text-center text-muted-foreground">
                    Belum ada mahasiswa aktif.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.user.id}>
                  <td className="sticky left-0 bg-card px-4 py-2.5">
                    <span className="block truncate font-medium">{r.user.name}</span>
                    <span className="block truncate font-mono text-xs text-muted-foreground">{r.user.username ?? r.user.email}</span>
                  </td>
                  {r.cells.map((c, i) => (
                    <td key={works[i].id} className="px-3 py-2.5">
                      <Cell c={c} />
                    </td>
                  ))}
                  <td className={cn("bg-tint-violet/20 px-3 py-2.5 font-semibold tabular-nums", r.avgAssignment === null && "text-muted-foreground")}>{r.avgAssignment ?? "—"}</td>
                  <td className="px-3 py-2.5 tabular-nums">{r.avgAll ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="text-xs text-muted-foreground">
        Tidak mengumpulkan setelah tenggat (atau tutup, bila tanpa tenggat) dihitung 0. “Perlu dinilai” belum masuk rata-rata. Rata-Rata Tugas hanya dari pekerjaan jenis Tugas. Klik judul untuk menilai.
      </p>
    </div>
  )
}
