import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, BookOpen, ClipboardList, FilePen, Layers, Paperclip } from "lucide-react"
import { db } from "@/lib/db"
import { STAFF } from "@/lib/auth/roles"
import { requireFeature } from "@/lib/features/access"
import { managedClasses } from "@/lib/classes/access"
import { POST_KIND_LABEL, POST_KINDS, type PostKindValue } from "@/lib/classes/posts"
import { formatDateTime } from "@/lib/format"
import { EmptyState, PageHeader, StatCard, str } from "@/components/shell/page-parts"
import { NativeSelect } from "@/components/forms/native-select"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { TypeIcon } from "../kelas/[id]/post-icon"

export const metadata: Metadata = { title: "Kelola Materi" }

const LIMIT = 100

/**
 * Kelola Materi: ringkasan Classwork (Materi, Tugas, Tugas Kuis, Pertanyaan) di
 * semua kelas yang dikelola pengajar, plus daftar postingan lintas kelas yang bisa
 * difilter. Pembuatan & pengubahan tetap di tab Materi tiap kelas (satu sumber aksi).
 */
export default async function ManageMaterialsPage({ searchParams }: PageProps<"/kelola-materi">) {
  const user = await requireFeature("kelas.kelola", ...STAFF)
  const sp = await searchParams
  const scope = managedClasses(user)

  const classes = await db.group.findMany({
    where: { AND: [scope, { archivedAt: null }] },
    orderBy: { name: "asc" },
    take: 200,
    select: { id: true, name: true, term: true, subject: { select: { code: true } } },
  })
  const classIds = classes.map((c) => c.id)
  const [rawKelas, rawJenis, rawStatus] = [str(sp.kelas) ?? "", str(sp.jenis) ?? "", str(sp.status) ?? ""]
  const kelas = classIds.includes(rawKelas) ? rawKelas : ""
  const jenis = (POST_KINDS as readonly string[]).includes(rawJenis) ? (rawJenis as PostKindValue) : ""
  const status = rawStatus === "DRAFT" || rawStatus === "PUBLISHED" ? rawStatus : ""

  const [counts, posts] = await Promise.all([
    db.material.groupBy({ by: ["groupId", "kind", "status"], where: { groupId: { in: classIds } }, _count: { _all: true } }),
    db.material.findMany({
      where: { groupId: kelas ? kelas : { in: classIds }, ...(jenis ? { kind: jenis } : {}), ...(status ? { status } : {}) },
      orderBy: { updatedAt: "desc" },
      take: LIMIT,
      select: {
        id: true,
        title: true,
        kind: true,
        status: true,
        updatedAt: true,
        group: { select: { id: true, name: true } },
        topic: { select: { name: true } },
        exam: { select: { dueAt: true } },
        _count: { select: { attachments: true } },
      },
    }),
  ])

  const sum = (f: (c: (typeof counts)[number]) => boolean) => counts.filter(f).reduce((n, c) => n + c._count._all, 0)
  const perClass = (id: string, kind?: PostKindValue) => sum((c) => c.groupId === id && (!kind || c.kind === kind))
  const draftsOf = (id: string) => sum((c) => c.groupId === id && c.status === "DRAFT")
  const filtered = !!(kelas || jenis || status)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Kelola Materi" description="Materi, Tugas, Tugas Kuis, dan Pertanyaan di semua kelas yang Anda kelola. Buat & ubah postingan lewat tab Materi di tiap kelas." />

      {classes.length === 0 ? (
        <EmptyState
          title="Belum ada kelas aktif"
          description="Buat kelas terlebih dahulu, lalu tambahkan materi lewat tombol “Buat” di tab Materi."
          action={
            <Link href="/kelas" className={buttonVariants()}>
              Ke halaman Kelas
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total postingan" value={sum(() => true)} hint={`${classes.length} kelas aktif`} icon={<Layers />} tint="violet" />
            <StatCard label="Materi" value={sum((c) => c.kind === "MATERI")} icon={<BookOpen />} tint="sky" />
            <StatCard label="Tugas, Kuis & Pertanyaan" value={sum((c) => c.kind !== "MATERI")} icon={<ClipboardList />} tint="orange" />
            <StatCard label="Draf" value={sum((c) => c.status === "DRAFT")} hint="Belum terlihat mahasiswa" icon={<FilePen />} tint="rose" />
          </div>

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Per kelas</h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {classes.map((c) => {
                const drafts = draftsOf(c.id)
                return (
                  <Card key={c.id} className="gap-3 px-5 py-4">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{c.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{[c.subject?.code, c.term].filter(Boolean).join(" · ") || "Kelas"}</p>
                    </div>
                    <ul className="grid grid-cols-2 gap-2">
                      {POST_KINDS.map((k) => (
                        <li key={k} className="flex items-center gap-2 text-sm">
                          <TypeIcon kind={k} size="sm" />
                          <span className="min-w-0 flex-1 truncate text-muted-foreground">{POST_KIND_LABEL[k]}</span>
                          <span className="font-semibold tabular-nums">{perClass(c.id, k)}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="flex items-center justify-between gap-2 border-t pt-3">
                      <span className="text-xs text-muted-foreground">{drafts ? `${drafts} draf` : perClass(c.id) ? "Semua terbit" : "Belum ada postingan"}</span>
                      <Link href={`/kelas/${c.id}?tab=materi`} className={buttonVariants({ size: "sm", variant: "outline" })}>
                        Buka Materi <ArrowRight aria-hidden />
                      </Link>
                    </div>
                  </Card>
                )
              })}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <h2 className="text-lg font-semibold">Semua postingan</h2>
              {/* Filter lewat URL (GET) — bekerja tanpa JS */}
              <form className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]" method="get">
                <NativeSelect name="kelas" defaultValue={kelas} aria-label="Filter kelas">
                  <option value="">Semua kelas</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </NativeSelect>
                <NativeSelect name="jenis" defaultValue={jenis} aria-label="Filter jenis">
                  <option value="">Semua jenis</option>
                  {POST_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {POST_KIND_LABEL[k]}
                    </option>
                  ))}
                </NativeSelect>
                <NativeSelect name="status" defaultValue={status} aria-label="Filter status">
                  <option value="">Semua status</option>
                  <option value="PUBLISHED">Terbit</option>
                  <option value="DRAFT">Draf</option>
                </NativeSelect>
                <div className="flex gap-2">
                  <Button type="submit" size="sm" className="h-8">
                    Terapkan
                  </Button>
                  {filtered && (
                    <Link href="/kelola-materi" className={buttonVariants({ size: "sm", variant: "ghost", className: "h-8" })}>
                      Reset
                    </Link>
                  )}
                </div>
              </form>
            </div>

            {posts.length === 0 ? (
              <EmptyState title={filtered ? "Tidak ada postingan yang cocok" : "Belum ada postingan"} description={filtered ? "Ubah atau reset filter." : "Buka salah satu kelas, lalu klik “Buat” di tab Materi."} />
            ) : (
              <Card className="py-0">
                <ul className="divide-y">
                  {posts.map((p) => (
                    <li key={p.id}>
                      <Link href={`/kelas/${p.group.id}/materi/${p.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/40">
                        <TypeIcon kind={p.kind} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate font-medium">{p.title}</span>
                            {p.status === "DRAFT" && <Badge variant="outline">Draf</Badge>}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {[p.group.name, POST_KIND_LABEL[p.kind], p.topic?.name ?? "Tanpa topik", p.exam?.dueAt ? `tenggat ${formatDateTime(p.exam.dueAt)}` : null, `diubah ${formatDateTime(p.updatedAt)}`].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        {p._count.attachments > 0 && (
                          <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground" title="Lampiran">
                            <Paperclip className="size-3.5" aria-hidden /> {p._count.attachments}
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
                {posts.length === LIMIT && <p className="border-t px-5 py-2 text-xs text-muted-foreground">Menampilkan {LIMIT} postingan terbaru. Gunakan filter untuk mempersempit.</p>}
              </Card>
            )}
          </section>
        </>
      )}
    </div>
  )
}
