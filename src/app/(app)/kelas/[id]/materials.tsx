import Link from "next/link"
import { ArrowDown, ArrowUp, CheckCircle2, Circle, Download, ExternalLink, FolderPlus, Paperclip, Pencil, Trash2 } from "lucide-react"
import { db } from "@/lib/db"
import type { CurrentUser } from "@/lib/auth/dal"
import { managedSubjects } from "@/lib/data/access"
import { ACTIVE_STUDENT, managedClasses } from "@/lib/classes/access"
import { attachmentSelect } from "@/lib/classes/materials"
import { POST_KIND_LABEL, type PostKindValue } from "@/lib/classes/posts"
import { formatBytes, formatDateTime, toDateTimeInput } from "@/lib/format"
import { hostnameOf, safeHref } from "@/lib/safe-url"
import { cn } from "@/lib/utils"
import { EmptyState } from "@/components/shell/page-parts"
import { ActionButton } from "@/components/forms/action-button"
import { ConfirmAction } from "@/components/forms/confirm-action"
import { FormField } from "@/components/forms/action-form"
import { FormDialog } from "@/components/forms/form-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { createTopic, deleteMaterial, deleteTopic, moveMaterial, moveTopic, renameTopic, setMaterialPublished, updatePost } from "../material-actions"
import { PostFields } from "./material-fields"
import { PostCreateMenu, type ReuseSource } from "./post-create-menu"
import { ATTACHMENT_ICON, TypeIcon } from "./post-icon"

export { TypeIcon }

type Topic = { id: string; name: string }
type MaterialRow = Awaited<ReturnType<typeof loadMaterials>>["materials"][number]

/** `studentId` diisi → tampilan mahasiswa (hanya terbit + status miliknya); kosong → pengajar (progres kelas). */
async function loadMaterials(groupId: string, studentId?: string) {
  const [topics, materials] = await Promise.all([
    db.materialTopic.findMany({ where: { groupId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, name: true } }),
    db.material.findMany({
      where: { groupId, ...(studentId ? { status: "PUBLISHED" as const } : {}) },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        title: true,
        content: true,
        kind: true,
        status: true,
        publishedAt: true,
        createdAt: true,
        topicId: true,
        examId: true,
        attachments: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: attachmentSelect },
        // Pekerjaan tertaut: mahasiswa → status pengumpulannya; pengajar → yang sudah menyerahkan (mahasiswa aktif)
        exam: {
          select: {
            title: true,
            workType: true,
            dueAt: true,
            maxPoints: true,
            publishedAt: true,
            questions: { take: 1, orderBy: { order: "asc" }, select: { points: true } },
            attempts: {
              where: studentId ? { userId: studentId } : { status: { not: "IN_PROGRESS" }, user: { memberships: { some: { groupId, ...ACTIVE_STUDENT } } } },
              select: { userId: true, status: true },
            },
          },
        },
        _count: {
          select: {
            comments: true,
            // mahasiswa: miliknya sendiri; pengajar: hanya mahasiswa yang masih aktif di kelas
            progress: { where: studentId ? { userId: studentId } : { user: { memberships: { some: { groupId, ...ACTIVE_STUDENT } } } } },
          },
        },
      },
    }),
  ])
  // Pekerjaan yang belum terbit tidak ditampilkan ke mahasiswa walau kartunya terbit
  return { topics, materials: studentId ? materials.filter((m) => !m.exam || m.exam.publishedAt) : materials }
}

/** Status pekerjaan tertaut untuk mahasiswa (seperti kartu Classroom). */
function workStatus(m: { exam: { dueAt: Date | null; attempts: { status: string }[] } | null }) {
  const statuses = m.exam?.attempts.map((a) => a.status) ?? []
  if (statuses.includes("GRADED")) return { label: "Dinilai", className: "bg-tint-violet text-tint-violet-fg" }
  if (statuses.includes("SUBMITTED")) return { label: "Diserahkan", className: "bg-tint-green text-tint-green-fg" }
  if (statuses.includes("IN_PROGRESS")) return { label: "Dikerjakan", className: "bg-tint-sky text-tint-sky-fg" }
  if (m.exam?.dueAt && m.exam.dueAt < new Date()) return { label: "Lewat tenggat", className: "bg-tint-rose text-tint-rose-fg" }
  return { label: "Ditugaskan", className: "bg-tint-sky text-tint-sky-fg" }
}

/** Kelompokkan per topik: "Tanpa topik" di atas (seperti Classroom), lalu topik sesuai urutan. */
function sections(topics: Topic[], materials: MaterialRow[]) {
  return [{ topic: null as Topic | null, items: materials.filter((m) => !m.topicId) }, ...topics.map((t) => ({ topic: t as Topic | null, items: materials.filter((m) => m.topicId === t.id) }))]
}

type Attachment = { id: string; type: "FILE" | "LINK" | "YOUTUBE"; name: string; url: string | null; size: number | null }

/** Isi postingan: deskripsi + semua lampiran (berkas diunduh lewat rute berizin, tautan dibuka di tab baru). */
export function MaterialBody({ m }: { m: { content: string | null; attachments: Attachment[] } }) {
  return (
    <div className="flex flex-col gap-3">
      {m.content && <p className="text-sm whitespace-pre-wrap break-words">{m.content}</p>}
      {m.attachments.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {m.attachments.map((a) => {
            const href = a.type === "FILE" ? `/materi-berkas/${a.id}` : safeHref(a.url)
            if (!href) return null
            const Icon = ATTACHMENT_ICON[a.type]
            const external = a.type !== "FILE"
            return (
              <li key={a.id}>
                <a
                  href={href}
                  {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  className="flex min-w-0 items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-muted/40"
                >
                  <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", a.type === "YOUTUBE" ? "bg-tint-rose text-tint-rose-fg" : a.type === "LINK" ? "bg-tint-sky text-tint-sky-fg" : "bg-tint-orange text-tint-orange-fg")}>
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{a.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{external ? hostnameOf(a.url) : formatBytes(a.size)}</span>
                  </span>
                  {external ? <ExternalLink className="size-4 shrink-0 text-muted-foreground" aria-hidden /> : <Download className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
                </a>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export function materialMeta(m: { kind: PostKindValue; publishedAt: Date | null; createdAt: Date; exam?: { dueAt: Date | null } | null }) {
  const work = m.kind !== "MATERI" ? `${POST_KIND_LABEL[m.kind]}${m.exam?.dueAt ? ` · tenggat ${formatDateTime(m.exam.dueAt)}` : m.kind === "TUGAS_KUIS" ? "" : " · tanpa tenggat"}` : null
  return [work, m.publishedAt ? `Diterbitkan ${formatDateTime(m.publishedAt)}` : `Dibuat ${formatDateTime(m.createdAt)}`].filter(Boolean).join(" · ")
}

/** Baris postingan (judul → halaman detail). `extra` = info di kanan, mis. progres atau status. */
function MaterialLink({ groupId, m, extra }: { groupId: string; m: MaterialRow; extra?: React.ReactNode }) {
  return (
    <Link href={`/kelas/${groupId}/materi/${m.id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg hover:text-primary">
      <TypeIcon kind={m.kind} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate font-medium">{m.title}</span>
          {m.status === "DRAFT" && <Badge variant="outline">Draf</Badge>}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {materialMeta(m)}
          {m.attachments.length ? (
            <>
              {" · "}
              <Paperclip className="inline size-3 align-[-1px]" aria-label="lampiran" /> {m.attachments.length}
            </>
          ) : null}
          {m._count.comments ? ` · ${m._count.comments} komentar` : ""}
        </span>
      </span>
      {extra}
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Mahasiswa: hanya postingan terbit, topik kosong disembunyikan
// ---------------------------------------------------------------------------

export async function StudentMaterials({ groupId, userId }: { groupId: string; userId: string }) {
  const { topics, materials } = await loadMaterials(groupId, userId)
  if (materials.length === 0) return <EmptyState title="Belum ada materi atau tugas" description="Postingan yang diterbitkan pengajar akan tampil di sini." />
  const readable = materials.filter((m) => m.kind === "MATERI")
  const done = readable.filter((m) => m._count.progress > 0).length
  return (
    <div className="flex flex-col gap-6">
      {readable.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {done} dari {readable.length} materi selesai dibaca
        </p>
      )}
      {sections(topics, materials)
        .filter((s) => s.items.length > 0)
        .map((s) => (
          <section key={s.topic?.id ?? "none"} className="flex flex-col gap-2">
            {s.topic && <h2 className="border-b pb-2 text-lg font-semibold text-primary">{s.topic.name}</h2>}
            <Card className="py-0">
              <ul className="divide-y">
                {s.items.map((m) => (
                  <li key={m.id} className="flex px-5 py-3">
                    <MaterialLink
                      groupId={groupId}
                      m={m}
                      extra={
                        m.kind !== "MATERI" ? (
                          <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold", workStatus(m).className)}>{workStatus(m).label}</span>
                        ) : m._count.progress > 0 ? (
                          <CheckCircle2 className="size-5 shrink-0 text-tint-green-fg" aria-label="Selesai dibaca" />
                        ) : (
                          <Circle className="size-5 shrink-0 text-muted-foreground/50" aria-label="Belum dibaca" />
                        )
                      }
                    />
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pengajar: semua postingan (draf & terbit), "+ Buat", topik & urutan
// ---------------------------------------------------------------------------

export async function TeacherMaterials({ user, groupId }: { user: CurrentUser; groupId: string }) {
  const [{ topics, materials }, students, quizzes, sourceClasses, otherClasses, myBank] = await Promise.all([
    loadMaterials(groupId),
    db.groupMember.count({ where: { groupId, ...ACTIVE_STUDENT } }),
    // Tugas Kuis yang bisa ditautkan: ujian CBT berjenis kuis yang dikelola & belum tertaut di kelas ini
    db.exam.findMany({
      where: { workType: "QUIZ", subject: managedSubjects(user), materials: { none: { groupId } } },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, title: true, publishedAt: true, _count: { select: { questions: true } } },
    }),
    // Sumber "Gunakan kembali": kelas lain yang dikelola (termasuk arsip semester lalu)
    db.group.findMany({
      where: { AND: [managedClasses(user), { id: { not: groupId } }, { materials: { some: {} } }] },
      orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { name: "asc" }],
      take: 100,
      select: {
        id: true,
        name: true,
        term: true,
        archivedAt: true,
        materials: { orderBy: { createdAt: "desc" }, take: 200, select: { id: true, title: true, kind: true, topic: { select: { name: true } }, _count: { select: { attachments: true } } } },
      },
    }),
    // Tujuan tambahan "+ Buat" (posting ke beberapa kelas): kelas aktif lain yang dikelola
    db.group.findMany({
      where: { AND: [managedClasses(user), { id: { not: groupId } }, { archivedAt: null }] },
      orderBy: { name: "asc" },
      take: 100,
      select: { id: true, name: true, term: true },
    }),
    // "Ambil dari Bank soal saya" untuk Pertanyaan: hanya ruang ajar MILIK pengguna
    db.question.findMany({
      where: { subject: { isPersonalSpace: true, ownerId: user.id } },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: { id: true, type: true, prompt: true, points: true, topic: true },
    }),
  ])
  const drafts = materials.filter((m) => m.status === "DRAFT").length
  const groups = sections(topics, materials)
  const sources: ReuseSource[] = sourceClasses.map((c) => ({
    id: c.id,
    name: c.name,
    term: c.term,
    archived: !!c.archivedAt,
    posts: c.materials.map((p) => ({ id: p.id, title: p.title, kind: p.kind, topic: p.topic?.name ?? null, attachments: p._count.attachments })),
  }))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {materials.length} postingan{drafts ? ` · ${drafts} draf (belum terlihat mahasiswa)` : ""} · {topics.length} topik
        </p>
        <div className="flex flex-wrap gap-2">
          <FormDialog
            title="Topik baru"
            description="Topik mengelompokkan postingan, mis. “Pertemuan 1” atau “Bab 2 — Rekursi”."
            action={createTopic.bind(null, groupId)}
            submitLabel="Buat topik"
            trigger={
              <Button variant="outline" className="rounded-xl">
                <FolderPlus aria-hidden /> Topik
              </Button>
            }
          >
            <TopicField />
          </FormDialog>
          <PostCreateMenu
            groupId={groupId}
            topics={topics}
            quizzes={quizzes.map((q) => ({ id: q.id, title: q.title, published: !!q.publishedAt, questions: q._count.questions }))}
            sources={sources}
            otherClasses={otherClasses}
            bank={myBank.map((q) => ({ ...q, prompt: q.prompt.slice(0, 300) }))}
          />
        </div>
      </div>

      {materials.length === 0 && topics.length === 0 ? (
        <EmptyState title="Belum ada postingan" description="Klik “Buat” untuk menambahkan Tugas, Tugas Kuis, Pertanyaan, atau Materi. Kelompokkan dengan topik, lalu terbitkan agar terlihat mahasiswa." />
      ) : (
        groups.map((s, gi) =>
          !s.topic && s.items.length === 0 ? null : (
            <section key={s.topic?.id ?? "none"} className="flex flex-col gap-2">
              {s.topic && <TopicHeader groupId={groupId} topic={s.topic} first={gi === 1} last={gi === groups.length - 1} />}
              {s.items.length === 0 ? (
                <p className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">Belum ada postingan di topik ini.</p>
              ) : (
                <Card className="py-0">
                  <ul className="divide-y">
                    {s.items.map((m, i) => (
                      <TeacherMaterialRow key={m.id} groupId={groupId} m={m} topics={topics} students={students} first={i === 0} last={i === s.items.length - 1} />
                    ))}
                  </ul>
                </Card>
              )}
            </section>
          )
        )
      )}
    </div>
  )
}

function TopicField({ name }: { name?: string }) {
  return (
    <FormField name="name" label="Nama topik">
      <Input id="name" name="name" defaultValue={name} maxLength={80} required />
    </FormField>
  )
}

function TopicHeader({ groupId, topic, first, last }: { groupId: string; topic: Topic; first: boolean; last: boolean }) {
  return (
    <div className="flex items-center gap-2 border-b pb-2">
      <h2 className="min-w-0 flex-1 truncate text-lg font-semibold text-primary">{topic.name}</h2>
      <ActionButton action={moveTopic.bind(null, groupId, topic.id, "up")} variant="ghost" size="icon-sm" disabled={first} aria-label={`Naikkan topik ${topic.name}`} title="Naikkan">
        <ArrowUp />
      </ActionButton>
      <ActionButton action={moveTopic.bind(null, groupId, topic.id, "down")} variant="ghost" size="icon-sm" disabled={last} aria-label={`Turunkan topik ${topic.name}`} title="Turunkan">
        <ArrowDown />
      </ActionButton>
      <FormDialog
        title="Ganti nama topik"
        action={renameTopic.bind(null, groupId, topic.id)}
        trigger={
          <Button variant="ghost" size="icon-sm" aria-label={`Ganti nama topik ${topic.name}`} title="Ganti nama">
            <Pencil />
          </Button>
        }
      >
        <TopicField name={topic.name} />
      </FormDialog>
      <ConfirmAction
        action={deleteTopic.bind(null, groupId, topic.id)}
        title={`Hapus topik “${topic.name}”?`}
        description="Postingan di dalamnya tidak ikut terhapus — dipindah ke “Tanpa topik”."
        confirmLabel="Hapus topik"
        destructive
        trigger={
          <Button variant="ghost" size="icon-sm" aria-label={`Hapus topik ${topic.name}`} title="Hapus topik">
            <Trash2 className="text-destructive" />
          </Button>
        }
      />
    </div>
  )
}

const DELETE_NOTE: Record<PostKindValue, string> = {
  MATERI: "Materi dan lampirannya dihapus permanen. Berkas yang juga dipakai kelas lain tetap tersimpan.",
  TUGAS: "Bila belum ada yang mengumpulkan, Tugasnya ikut terhapus. Bila sudah, Tugas & nilainya tetap ada di tab Ujian & Tugas.",
  PERTANYAAN: "Bila belum ada yang menjawab, Pertanyaannya ikut terhapus. Bila sudah, jawaban & nilainya tetap ada di tab Ujian & Tugas.",
  TUGAS_KUIS: "Hanya postingan yang dihapus. Ujian CBT-nya tetap ada dan tetap ditujukan ke kelas ini (atur di modul Ujian).",
}

function TeacherMaterialRow({ groupId, m, topics, students, first, last }: { groupId: string; m: MaterialRow; topics: Topic[]; students: number; first: boolean; last: boolean }) {
  const published = m.status === "PUBLISHED"
  const work = m.kind !== "MATERI"
  // Pekerjaan: mahasiswa yang sudah menyerahkan; materi: yang menandai selesai dibaca
  const count = work ? new Set(m.exam?.attempts.map((a) => a.userId)).size : m._count.progress
  const pct = students ? Math.round((count / students) * 100) : 0
  const label = POST_KIND_LABEL[m.kind]
  return (
    <li className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center">
      <MaterialLink
        groupId={groupId}
        m={m}
        extra={
          published && (
            <span className="shrink-0 text-right text-xs text-muted-foreground" title={work ? "Mahasiswa aktif yang sudah menyerahkan" : "Mahasiswa aktif yang menandai selesai dibaca"}>
              <span className="block font-semibold text-foreground">{pct}%</span>
              {count}/{students} {work ? "diserahkan" : "selesai"}
            </span>
          )
        }
      />
      <div className="flex shrink-0 items-center gap-1 self-end sm:self-center">
        <ActionButton action={setMaterialPublished.bind(null, groupId, m.id, !published)} variant={published ? "outline" : "default"} size="sm">
          {published ? "Jadikan draf" : "Terbitkan"}
        </ActionButton>
        <ActionButton action={moveMaterial.bind(null, groupId, m.id, "up")} variant="ghost" size="icon-sm" disabled={first} aria-label={`Naikkan ${m.title}`} title="Naikkan">
          <ArrowUp />
        </ActionButton>
        <ActionButton action={moveMaterial.bind(null, groupId, m.id, "down")} variant="ghost" size="icon-sm" disabled={last} aria-label={`Turunkan ${m.title}`} title="Turunkan">
          <ArrowDown />
        </ActionButton>
        <FormDialog
          title={`Ubah ${label}`}
          action={updatePost.bind(null, groupId, m.id)}
          wide
          trigger={
            <Button variant="ghost" size="icon-sm" aria-label={`Ubah ${m.title}`} title="Ubah">
              <Pencil />
            </Button>
          }
        >
          <PostFields
            kind={m.kind}
            topics={topics}
            defaults={{
              title: m.title,
              content: m.content,
              topicId: m.topicId,
              dueAt: toDateTimeInput(m.exam?.dueAt),
              maxPoints: m.exam?.maxPoints ?? (m.kind === "PERTANYAAN" ? (m.exam?.questions[0]?.points ?? null) : null),
              attachments: m.attachments,
              examTitle: m.exam?.title,
              questionLocked: m.kind === "PERTANYAAN" && (m.exam?.attempts.length ?? 0) > 0,
            }}
          />
        </FormDialog>
        <ConfirmAction
          action={deleteMaterial.bind(null, groupId, m.id)}
          title={`Hapus “${m.title}”?`}
          description={DELETE_NOTE[m.kind]}
          confirmLabel="Hapus"
          destructive
          trigger={
            <Button variant="ghost" size="icon-sm" aria-label={`Hapus ${m.title}`} title="Hapus">
              <Trash2 className="text-destructive" />
            </Button>
          }
        />
      </div>
    </li>
  )
}
