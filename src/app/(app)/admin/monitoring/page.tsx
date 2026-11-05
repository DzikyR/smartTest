import type { Metadata } from "next"
import Link from "next/link"
import { Activity, Eraser, RotateCcw, TimerOff, Users, WifiOff } from "lucide-react"
import { ADMINS } from "@/lib/auth/roles"
import { requireFeature } from "@/lib/features/access"
import { loadLiveMonitoring } from "@/lib/data/live-monitoring"
import { formatAgo, formatRemaining, isRunningState, LIVE_STATES, type LiveState } from "@/lib/exam/monitoring"
import { formatTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import { EmptyState, PageHeader, SearchForm, StatCard, str, UrlTabs } from "@/components/shell/page-parts"
import { ConfirmAction } from "@/components/forms/confirm-action"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { reopenAttempt, resetAttempt } from "../../ujian-kelola/actions"
import { AutoRefresh } from "./auto-refresh"

export const metadata: Metadata = { title: "Monitoring Ujian" }

const BASE = "/admin/monitoring"
const BADGE: Record<LiveState, string> = {
  online: "bg-tint-green text-tint-green-fg",
  lambat: "bg-tint-orange text-tint-orange-fg",
  putus: "bg-tint-rose text-tint-rose-fg",
  habis: "bg-muted text-muted-foreground",
  selesai: "bg-tint-sky text-tint-sky-fg",
}
const LABEL = Object.fromEntries(LIVE_STATES.map((s) => [s.key, s.label])) as Record<LiveState, string>

type Filters = { q?: string; ujian?: string; status?: string }
const href = (f: Filters) => {
  const sp = new URLSearchParams(Object.entries(f).filter((e): e is [string, string] => !!e[1]))
  return sp.size ? `${BASE}?${sp}` : BASE
}

export default async function MonitoringPage({ searchParams }: PageProps<"/admin/monitoring">) {
  await requireFeature("admin.monitoring", ...ADMINS)
  const sp = await searchParams
  const q = str(sp.q)
  const { rows, summary, truncated, now } = await loadLiveMonitoring()
  const ujian = summary.some((s) => s.exam.id === str(sp.ujian)) ? str(sp.ujian) : undefined
  const status = LIVE_STATES.some((s) => s.key === str(sp.status)) ? (str(sp.status) as LiveState) : undefined

  const needle = q?.toLowerCase()
  const scoped = rows.filter(
    (r) => (!ujian || r.exam.id === ujian) && (!needle || [r.user.name, r.user.username, r.user.email].some((v) => v?.toLowerCase().includes(needle)))
  )
  const visible = status ? scoped.filter((r) => r.state === status) : scoped
  const count = (s: LiveState) => scoped.filter((r) => r.state === s).length
  const runningCount = scoped.filter((r) => isRunningState(r.state)).length

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Monitoring Ujian"
        description="Peserta yang sedang mengerjakan ujian di semua mata uji, ditambah yang selesai ≤ 3 jam terakhir. Status koneksi dibaca dari simpan otomatis lembar ujian (tiap 30 detik)."
        actions={<AutoRefresh updatedAt={now} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Sedang mengerjakan" value={runningCount} hint={ujian ? "pada ujian terpilih" : `${summary.filter((x) => x.running).length} ujian berjalan`} icon={<Users aria-hidden />} tint="violet" />
        <StatCard label="Online" value={count("online")} hint="aktif ≤ 1,5 menit" icon={<Activity aria-hidden />} tint="green" />
        <StatCard label="Tersendat / terputus" value={count("lambat") + count("putus")} hint={`${count("putus")} terputus > 3 menit`} icon={<WifiOff aria-hidden />} tint="rose" />
        <StatCard label="Waktu habis" value={count("habis")} hint="menunggu dikumpulkan otomatis" icon={<TimerOff aria-hidden />} tint="orange" />
      </div>

      {summary.length === 0 ? (
        <EmptyState title="Tidak ada ujian yang sedang dikerjakan" description="Belum ada peserta yang mengerjakan atau selesai dalam 3 jam terakhir. Halaman ini diperbarui otomatis; peserta muncul begitu menekan Mulai." />
      ) : (
        <>
          <Card className="py-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-3xl text-sm">
                <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3 font-medium">Ujian berjalan</th>
                    <th className="px-3 py-3 text-right font-medium">Mengerjakan</th>
                    <th className="px-3 py-3 text-right font-medium">Online</th>
                    <th className="px-3 py-3 text-right font-medium">Tersendat</th>
                    <th className="px-3 py-3 text-right font-medium">Terputus</th>
                    <th className="px-3 py-3 text-right font-medium">Waktu habis</th>
                    <th className="px-3 py-3 text-right font-medium">Ada pelanggaran</th>
                    <th className="px-5 py-3 text-right font-medium">Sudah selesai</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {summary.map((s) => (
                    <tr key={s.exam.id} className={cn(s.exam.id === ujian && "bg-primary/5")}>
                      <td className="px-5 py-2.5">
                        <Link href={href({ q, status, ujian: s.exam.id === ujian ? undefined : s.exam.id })} className="font-medium hover:underline">
                          {s.exam.title}
                        </Link>
                        <span className="block font-mono text-xs text-muted-foreground">{s.exam.subject.code}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{s.running}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{s.online}</td>
                      <td className={cn("px-3 py-2.5 text-right tabular-nums", s.lambat && "font-semibold text-tint-orange-fg")}>{s.lambat}</td>
                      <td className={cn("px-3 py-2.5 text-right tabular-nums", s.putus && "font-semibold text-tint-rose-fg")}>{s.putus}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{s.habis}</td>
                      <td className={cn("px-3 py-2.5 text-right tabular-nums", s.violations && "font-semibold text-tint-rose-fg")}>{s.violations}</td>
                      <td className="px-5 py-2.5 text-right text-muted-foreground tabular-nums">{s.finished}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <UrlTabs
              label="Saring status"
              active={status ?? "semua"}
              tabs={[
                { key: "semua", label: `Semua (${scoped.length})`, href: href({ q, ujian }) },
                ...LIVE_STATES.map((s) => ({ key: s.key, label: `${s.label} (${count(s.key)})`, href: href({ q, ujian, status: s.key }) })),
              ]}
            />
            <SearchForm basePath={BASE} params={{ q }} placeholder="Cari nama, NIM, atau email…" className="lg:w-96">
              {ujian && <input type="hidden" name="ujian" value={ujian} />}
              {status && <input type="hidden" name="status" value={status} />}
            </SearchForm>
          </div>

          {truncated && <p className="text-sm text-tint-orange-fg">Menampilkan 5.000 percobaan pertama. Saring per ujian untuk melihat sisanya.</p>}

          {visible.length === 0 ? (
            <EmptyState title="Tidak ada peserta yang cocok" description="Ubah filter status, ujian, atau kata kunci." />
          ) : (
            <Card className="py-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-5xl text-sm">
                  <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-5 py-3 font-medium">Peserta</th>
                      <th className="px-3 py-3 font-medium">Ujian</th>
                      <th className="px-3 py-3 font-medium">Status</th>
                      <th className="px-3 py-3 font-medium">Aktivitas</th>
                      <th className="px-3 py-3 font-medium">Sisa waktu</th>
                      <th className="px-3 py-3 text-right font-medium">Terjawab</th>
                      <th className="px-3 py-3 text-center font-medium">Pelanggaran</th>
                      <th className="px-3 py-3 text-right font-medium">Nilai</th>
                      <th className="px-5 py-3 text-right font-medium">Aksi pengawas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {visible.map((r) => (
                      <tr key={r.id}>
                        <td className="px-5 py-2.5">
                          <span className="block font-medium">{r.user.name}</span>
                          <span className="block font-mono text-xs text-muted-foreground">{r.user.username ?? r.user.email}</span>
                        </td>
                        <td className="max-w-56 px-3 py-2.5">
                          <span className="block truncate" title={r.exam.title}>
                            {r.exam.title}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {r.exam.subject.code}
                            {r.session && ` · ${r.session}`}
                            {r.attemptNo > 1 && ` · percobaan ke-${r.attemptNo}`}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap", BADGE[r.state])}>
                            {r.state === "selesai" && r.status === "SUBMITTED" ? "Perlu dinilai" : LABEL[r.state]}
                          </span>
                          {r.autoLeave && <span className="mt-1 block text-xs font-medium text-tint-rose-fg">otomatis (pelanggaran)</span>}
                          {r.state === "selesai" && r.isLate && <span className="mt-1 block text-xs font-medium text-tint-rose-fg">terlambat</span>}
                        </td>
                        <td className="px-3 py-2.5 text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                          {r.state === "selesai" ? (
                            <>dikumpulkan {r.submittedAt ? formatTime(r.submittedAt) : "—"}</>
                          ) : (
                            <>
                              <span className="block">sinyal {formatAgo(r.lastSeenAgo)}</span>
                              <span className="block">mulai {formatTime(r.startedAt)}</span>
                            </>
                          )}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">{r.state === "selesai" ? "—" : formatRemaining(r.remaining)}</td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">
                          {r.answered}/{r.exam._count.questions}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {r.leaveCount > 0 ? (
                            <span className="rounded-full bg-tint-rose px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-tint-rose-fg tabular-nums">
                              {r.leaveCount}×{r.exam.maxLeaves ? ` / ${r.exam.maxLeaves}` : ""}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{r.score ?? "—"}</td>
                        <td className="px-5 py-2.5">
                          <div className="flex items-center justify-end gap-1">
                            <ConfirmAction
                              action={reopenAttempt.bind(null, r.id)}
                              title={`Reset lunak ${r.user.name}?`}
                              description={
                                r.state === "selesai"
                                  ? "Ujian yang sudah dikumpulkan dibuka kembali: nilai & hitungan pelanggaran dihapus, peserta melanjutkan soal yang belum dikerjakan dengan jawaban tersimpan dan sisa waktunya."
                                  : "Peserta melanjutkan dengan jawaban tersimpan. Waktu yang hilang sejak simpanan terakhir dikembalikan dan perangkat dilepas (bisa pindah perangkat)."
                              }
                              confirmLabel="Buka kembali"
                              trigger={
                                <Button variant="ghost" size="icon-sm" aria-label={`Reset lunak ${r.user.name}`} title="Reset lunak — lanjutkan">
                                  <RotateCcw />
                                </Button>
                              }
                            />
                            <ConfirmAction
                              action={resetAttempt.bind(null, r.id)}
                              title={`Reset total ${r.user.name}?`}
                              description="Percobaan terakhir beserta jawaban dan nilainya dihapus permanen. Peserta memulai ujian dari awal dengan soal yang diacak ulang dan kesempatannya dikembalikan."
                              confirmLabel="Reset dari awal"
                              destructive
                              trigger={
                                <Button variant="ghost" size="icon-sm" aria-label={`Reset total ${r.user.name}`} title="Reset total — mulai dari awal">
                                  <Eraser className="text-destructive" />
                                </Button>
                              }
                            />
                            {r.state === "selesai" ? (
                              <Link
                                href={`/ujian-kelola/${r.exam.id}/koreksi/${r.id}`}
                                className={buttonVariants({ variant: r.status === "SUBMITTED" ? "default" : "ghost", size: "sm", className: "rounded-lg" })}
                              >
                                {r.status === "SUBMITTED" ? "Nilai" : "Lihat"}
                              </Link>
                            ) : (
                              <Link href={`/ujian-kelola/${r.exam.id}?tab=peserta`} className={buttonVariants({ variant: "ghost", size: "sm", className: "rounded-lg" })} title="Tambah waktu, reset perangkat, akhiri">
                                Lainnya
                              </Link>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
