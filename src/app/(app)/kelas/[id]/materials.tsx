import Link from "next/link"
import { ArrowDown, ArrowUp, CheckCircle2, Circle, ClipboardList, Download, ExternalLink, FileText, FolderPlus, Link2, Pencil, Plus, StickyNote, Trash2 } from "lucide-react"
import { db } from "@/lib/db"
import { ACTIVE_STUDENT } from "@/lib/classes/access"
import { formatBytes, formatDateTime } from "@/lib/format"
import { hostnameOf, safeHref } from "@/lib/safe-url"
import { cn } from "@/lib/utils"
import { EmptyState } from "@/components/shell/page-parts"
import { ActionButton } from "@/components/forms/action-button"
import { ConfirmAction } from "@/components/forms/confirm-action"
import { FormField } from "@/components/forms/action-form"
import { FormDialog } from "@/components/forms/form-dialog"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { createMaterial, createTopic, deleteMaterial, deleteTopic, moveMaterial, moveTopic, renameTopic, setMaterialPublished, updateMaterial } from "../material-actions"
import { MaterialFields } from "./material-fields"

const materialSelect = {
  id: true,
  title: true,
  content: true,
  type: true,
  url: true,
  fileName: true,
  size: true,
  status: true,
  publishedAt: true,
  createdAt: true,
  topicId: true,
  examId: true,
} as const

type MaterialRow = Awaited<ReturnType<typeof loadMaterials>>["materials"][number]
type Topic = { id: string; name: string }

/** `studentId` diisi → tampilan mahasiswa (hanya terbit + status selesai miliknya); kosong → pengajar (progres kelas). */
async function loadMaterials(groupId: string, studentId?: string) {
  const [topics, materials] = await Promise.all([
    db.materialTopic.findMany({ where: { groupId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, name: true } }),
    db.material.findMany({
      where: { groupId, ...(studentId ? { status: "PUBLISHED" as const } : {}) },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        ...materialSelect,
        // Tugas tertaut: mahasiswa → status pengumpulannya; pengajar → yang sudah menyerahkan (mahasiswa aktif)
        exam: {
          select: {
            dueAt: true,
            publishedAt: true,
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
  // Tugas yang belum terbit tidak ditampilkan ke mahasiswa walau kartunya terbit
  return { topics, materials: studentId ? materials.filter((m) => !m.exam || m.exam.publishedAt) : materials }
}

/** Status Tugas tertaut untuk mahasiswa (seperti kartu Classroom). */
function taskStatus(m: MaterialRow) {
  const statuses = m.exam?.attempts.map((a) => a.status) ?? []
  if (statuses.includes("GRADED")) return { label: "Dinilai", className: "bg-tint-violet text-tint-violet-fg" }
  if (statuses.includes("SUBMITTED")) return { label: "Diserahkan", className: "bg-tint-green text-tint-green-fg" }
  if (m.exam?.dueAt && m.exam.dueAt < new Date()) return { label: "Lewat tenggat", className: "bg-tint-rose text-tint-rose-fg" }
  return { label: "Ditugaskan", className: "bg-tint-sky text-tint-sky-fg" }
}

/** Kelompokkan per topik: "Tanpa topik" di atas (seperti Classroom), lalu topik sesuai urutan. */
function sections(topics: Topic[], materials: MaterialRow[]) {
  return [{ topic: null as Topic | null, items: materials.filter((m) => !m.topicId) }, ...topics.map((t) => ({ topic: t as Topic | null, items: materials.filter((m) => m.topicId === t.id) }))]
}

const TYPE_ICON = { TEXT: StickyNote, LINK: Link2, FILE: FileText, ASSIGNMENT: ClipboardList } as const
const TYPE_TINT = { TEXT: "bg-tint-violet text-tint-violet-fg", LINK: "bg-tint-sky text-tint-sky-fg", FILE: "bg-tint-orange text-tint-orange-fg", ASSIGNMENT: "bg-tint-green text-tint-green-fg" } as const
type MaterialKind = keyof typeof TYPE_ICON

export function TypeIcon({ type }: { type: MaterialKind }) {
  const Icon = TYPE_ICON[type]
  return (
    <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", TYPE_TINT[type])}>
      <Icon className="size-5" aria-hidden />
    </span>
  )
}

/** Isi materi: teks, tombol buka tautan, atau tombol unduh berkas. */
export function MaterialBody({ m }: { m: { id: string; content: string | null; type: MaterialKind; url: string | null; fileName: string | null; size: number | null } }) {
  const href = m.type === "LINK" ? safeHref(m.url) : undefined
  return (
    <div className="flex flex-col gap-3">
      {m.content && <p className="text-sm whitespace-pre-wrap break-words">{m.content}</p>}
      {href && (
        <a href={href} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "sm", className: "w-fit max-w-full" })}>
          <ExternalLink aria-hidden /> <span className="truncate">Buka {hostnameOf(href)}</span>
        </a>
      )}
      {m.type === "FILE" && m.fileName && (
        <a href={`/materi-berkas/${m.id}`} className={buttonVariants({ variant: "outline", size: "sm", className: "w-fit max-w-full" })}>
          <Download aria-hidden /> <span className="truncate">{m.fileName}</span>
          {m.size ? <span className="text-xs text-muted-foreground">{formatBytes(m.size)}</span> : null}
        </a>
      )}
    </div>
  )
}

export function materialMeta(m: { type: MaterialKind; url: string | null; fileName: string | null; publishedAt: Date | null; createdAt: Date; exam?: { dueAt: Date | null } | null }) {
  const kind = m.type === "LINK" ? hostnameOf(m.url) : m.type === "FILE" ? m.fileName : m.type === "ASSIGNMENT" ? (m.exam?.dueAt ? `Tugas · tenggat ${formatDateTime(m.exam.dueAt)}` : "Tugas · tanpa tenggat") : null
  return [kind, m.publishedAt ? `Diterbitkan ${formatDateTime(m.publishedAt)}` : `Dibuat ${formatDateTime(m.createdAt)}`].filter(Boolean).join(" · ")
}

/** Baris materi (judul → halaman detail). `extra` = info di kanan, mis. progres atau tanda selesai. */
function MaterialLink({ groupId, m, manage, extra }: { groupId: string; m: MaterialRow; manage?: boolean; extra?: React.ReactNode }) {
  // Tugas tertaut membuka halaman Tugas yang sudah ada (pengumpulan/penilaian), bukan detail materi
  const href = m.type === "ASSIGNMENT" && m.examId ? (manage ? `/ujian-kelola/${m.examId}?tab=peserta` : `/ujian/${m.examId}`) : `/kelas/${groupId}/materi/${m.id}`
  return (
    <Link href={href} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg hover:text-primary">
      <TypeIcon type={m.type} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate font-medium">{m.title}</span>
          {m.status === "DRAFT" && <Badge variant="outline">Draf</Badge>}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {materialMeta(m)}
          {m._count.comments ? ` · ${m._count.comments} komentar` : ""}
        </span>
      </span>
      {extra}
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Mahasiswa: hanya materi terbit, topik kosong disembunyikan
// ---------------------------------------------------------------------------

export async function StudentMaterials({ groupId, userId }: { groupId: string; userId: string }) {
  const { topics, materials } = await loadMaterials(groupId, userId)
  if (materials.length === 0) return <EmptyState title="Belum ada materi" description="Materi yang diterbitkan pengajar akan tampil di sini." />
  const readable = materials.filter((m) => m.type !== "ASSIGNMENT")
  const done = readable.filter((m) => m._count.progress > 0).length
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        {done} dari {readable.length} materi selesai dibaca
      </p>
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
                        m.type === "ASSIGNMENT" ? (
                          <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold", taskStatus(m).className)}>{taskStatus(m).label}</span>
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
// Pengajar: semua materi (draf & terbit), kelola topik & urutan
// ---------------------------------------------------------------------------

export async function TeacherMaterials({ groupId }: { groupId: string }) {
  const [{ topics, materials }, students, tasks] = await Promise.all([
    loadMaterials(groupId),
    db.groupMember.count({ where: { groupId, ...ACTIVE_STUDENT } }),
    db.exam.findMany({ where: { workType: "ASSIGNMENT", groups: { some: { groupId } } }, orderBy: { createdAt: "desc" }, select: { id: true, title: true } }),
  ])
  const drafts = materials.filter((m) => m.status === "DRAFT").length
  const groups = sections(topics, materials)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {materials.length} materi{drafts ? ` · ${drafts} draf (belum terlihat mahasiswa)` : ""} · {topics.length} topik
        </p>
        <div className="flex flex-wrap gap-2">
          <FormDialog
            title="Topik baru"
            description="Topik mengelompokkan materi, mis. “Pertemuan 1” atau “Bab 2 — Rekursi”."
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
          <FormDialog
            title="Tambah materi"
            action={createMaterial.bind(null, groupId)}
            submitLabel="Simpan"
            wide
            trigger={
              <Button className="rounded-xl">
                <Plus aria-hidden /> Materi
              </Button>
            }
          >
            <MaterialFields topics={topics} tasks={tasks} />
          </FormDialog>
        </div>
      </div>

      {materials.length === 0 && topics.length === 0 ? (
        <EmptyState title="Belum ada materi" description="Tambahkan teks, tautan, atau berkas. Kelompokkan dengan topik, lalu terbitkan agar terlihat mahasiswa." />
      ) : (
        groups.map((s, gi) =>
          !s.topic && s.items.length === 0 ? null : (
            <section key={s.topic?.id ?? "none"} className="flex flex-col gap-2">
              {s.topic && <TopicHeader groupId={groupId} topic={s.topic} first={gi === 1} last={gi === groups.length - 1} />}
              {s.items.length === 0 ? (
                <p className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">Belum ada materi di topik ini.</p>
              ) : (
                <Card className="py-0">
                  <ul className="divide-y">
                    {s.items.map((m, i) => (
                      <TeacherMaterialRow key={m.id} groupId={groupId} m={m} topics={topics} tasks={tasks} students={students} first={i === 0} last={i === s.items.length - 1} />
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
        description="Materi di dalamnya tidak ikut terhapus — dipindah ke “Tanpa topik”."
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

function TeacherMaterialRow({ groupId, m, topics, tasks, students, first, last }: { groupId: string; m: MaterialRow; topics: Topic[]; tasks: { id: string; title: string }[]; students: number; first: boolean; last: boolean }) {
  const published = m.status === "PUBLISHED"
  const task = m.type === "ASSIGNMENT"
  // Tugas: mahasiswa yang sudah menyerahkan; materi lain: yang menandai selesai dibaca
  const count = task ? new Set(m.exam?.attempts.map((a) => a.userId)).size : m._count.progress
  const pct = students ? Math.round((count / students) * 100) : 0
  return (
    <li className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center">
      <MaterialLink
        groupId={groupId}
        m={m}
        manage
        extra={
          published && (
            <span className="shrink-0 text-right text-xs text-muted-foreground" title={task ? "Mahasiswa aktif yang sudah menyerahkan" : "Mahasiswa aktif yang menandai selesai dibaca"}>
              <span className="block font-semibold text-foreground">{pct}%</span>
              {count}/{students} {task ? "diserahkan" : "selesai"}
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
          title="Ubah materi"
          action={updateMaterial.bind(null, groupId, m.id)}
          wide
          trigger={
            <Button variant="ghost" size="icon-sm" aria-label={`Ubah ${m.title}`} title="Ubah">
              <Pencil />
            </Button>
          }
        >
          <MaterialFields topics={topics} tasks={tasks} defaults={{ title: m.title, content: m.content, type: m.type, url: m.url, topicId: m.topicId, fileName: m.fileName, examId: m.examId }} />
        </FormDialog>
        <ConfirmAction
          action={deleteMaterial.bind(null, groupId, m.id)}
          title={`Hapus “${m.title}”?`}
          description={m.type === "FILE" ? "Materi dan berkasnya dihapus permanen." : "Materi dihapus permanen."}
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
