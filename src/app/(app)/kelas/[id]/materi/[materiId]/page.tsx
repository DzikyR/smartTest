import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ArrowLeft, CheckCircle2, Circle, MessageSquare, Trash2 } from "lucide-react"
import { db } from "@/lib/db"
import { requireRole } from "@/lib/auth/dal"
import { ACTIVE_STUDENT } from "@/lib/classes/access"
import { getMaterialAccess } from "@/lib/classes/materials"
import { formatDateTime, initials } from "@/lib/format"
import { ActionButton } from "@/components/forms/action-button"
import { ConfirmAction } from "@/components/forms/confirm-action"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { addMaterialComment, deleteMaterialComment, setMaterialDone } from "../../../material-actions"
import { MaterialBody, materialMeta, TypeIcon } from "../../materials"
import { CommentForm } from "./comment-form"

export const metadata: Metadata = { title: "Materi" }

export default async function MaterialPage({ params }: PageProps<"/kelas/[id]/materi/[materiId]">) {
  const user = await requireRole()
  const { id, materiId } = await params
  // Pengelola kelas → semua materi; mahasiswa anggota aktif → hanya yang terbit. Selain itu 404.
  const access = await getMaterialAccess(user, id, materiId)
  if (!access) notFound()
  const { material: m, manage } = access
  // Materi jenis Tugas hanyalah penaut: pengumpulan & penilaian ada di halaman Tugas
  if (m.type === "ASSIGNMENT" && m.examId) redirect(manage ? `/ujian-kelola/${m.examId}?tab=peserta` : `/ujian/${m.examId}`)

  const [comments, done] = await Promise.all([
    db.materialComment.findMany({ where: { materialId: m.id }, orderBy: { createdAt: "asc" }, select: { id: true, body: true, createdAt: true, author: { select: { id: true, name: true, role: true } } } }),
    manage ? null : db.materialProgress.findUnique({ where: { materialId_userId: { materialId: m.id, userId: user.id } }, select: { completedAt: true } }),
  ])

  return (
    <div className="flex flex-col gap-6">
      <Link href={`/kelas/${id}?tab=materi`} className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2 w-fit" })}>
        <ArrowLeft aria-hidden /> Materi kelas
      </Link>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <TypeIcon type={m.type} />
            <div className="min-w-0 flex-1">
              <CardTitle className="flex flex-wrap items-center gap-2 text-xl">
                {m.title}
                {m.status === "DRAFT" && <Badge variant="outline">Draf</Badge>}
              </CardTitle>
              <CardDescription>{[m.topic?.name, materialMeta(m)].filter(Boolean).join(" · ")}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <MaterialBody m={m} />
          {!manage && (
            <div className="flex flex-wrap items-center gap-3 border-t pt-4">
              {done ? (
                <>
                  <span className="flex items-center gap-1.5 text-sm font-medium text-tint-green-fg">
                    <CheckCircle2 className="size-4" aria-hidden /> Selesai dibaca {formatDateTime(done.completedAt)}
                  </span>
                  <ActionButton action={setMaterialDone.bind(null, id, m.id, false)} variant="ghost" size="sm">
                    Batalkan
                  </ActionButton>
                </>
              ) : (
                <ActionButton action={setMaterialDone.bind(null, id, m.id, true)}>
                  <CheckCircle2 aria-hidden /> Tandai selesai dibaca
                </ActionButton>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {manage && <ProgressCard groupId={id} materialId={m.id} />}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="size-4" aria-hidden /> Diskusi ({comments.length})
          </CardTitle>
          <CardDescription>Terlihat oleh pengajar dan semua anggota kelas.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {comments.length > 0 && (
            <ul className="flex flex-col divide-y">
              {comments.map((c) => (
                <li key={c.id} className="flex gap-3 py-3 first:pt-0">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-tint-violet text-xs font-semibold text-tint-violet-fg">{initials(c.author.name)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 text-sm">
                      <span className="font-medium">{c.author.name}</span>
                      {c.author.role !== "PESERTA" && <Badge variant="secondary">Pengajar</Badge>}
                      <span className="text-xs text-muted-foreground">{formatDateTime(c.createdAt)}</span>
                    </p>
                    <p className="mt-1 text-sm whitespace-pre-wrap break-words">{c.body}</p>
                  </div>
                  {(manage || c.author.id === user.id) && (
                    <ConfirmAction
                      action={deleteMaterialComment.bind(null, id, m.id, c.id)}
                      title="Hapus komentar?"
                      description={c.author.id === user.id ? "Komentar Anda dihapus permanen." : `Komentar ${c.author.name} dihapus permanen.`}
                      confirmLabel="Hapus"
                      destructive
                      trigger={
                        <Button variant="ghost" size="icon-sm" aria-label="Hapus komentar" title="Hapus">
                          <Trash2 className="text-destructive" />
                        </Button>
                      }
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
          <CommentForm action={addMaterialComment.bind(null, id, m.id)} />
        </CardContent>
      </Card>
    </div>
  )
}

/** Pengajar: berapa mahasiswa aktif yang sudah menandai selesai dibaca. */
async function ProgressCard({ groupId, materialId }: { groupId: string; materialId: string }) {
  const students = await db.groupMember.findMany({
    where: { groupId, ...ACTIVE_STUDENT },
    orderBy: { user: { name: "asc" } },
    select: { user: { select: { id: true, name: true, username: true, materialDone: { where: { materialId }, select: { completedAt: true } } } } },
  })
  const doneCount = students.filter((s) => s.user.materialDone.length > 0).length
  const pct = students.length ? Math.round((doneCount / students.length) * 100) : 0
  return (
    <Card>
      <CardHeader>
        <CardTitle>Progres mahasiswa</CardTitle>
        <CardDescription>
          {doneCount} dari {students.length} mahasiswa aktif sudah menandai selesai dibaca ({pct}%).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Persentase selesai dibaca">
          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
        {students.length > 0 && (
          <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {students.map(({ user: s }) => {
              const at = s.materialDone[0]?.completedAt
              return (
                <li key={s.id} className="flex min-w-0 items-center gap-2 text-sm">
                  {at ? <CheckCircle2 className="size-4 shrink-0 text-tint-green-fg" aria-label="Selesai" /> : <Circle className="size-4 shrink-0 text-muted-foreground" aria-label="Belum" />}
                  <span className="min-w-0 flex-1 truncate">
                    {s.name}
                    {s.username && <span className="text-xs text-muted-foreground"> · {s.username}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{at ? formatDateTime(at) : "belum"}</span>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
