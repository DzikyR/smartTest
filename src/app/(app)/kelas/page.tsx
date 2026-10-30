import type { Metadata } from "next"
import Link from "next/link"
import { Archive, ChevronRight, Hourglass, Plus, School } from "lucide-react"
import { db } from "@/lib/db"
import { requireRole, type CurrentUser } from "@/lib/auth/dal"
import { listManagedSubjects } from "@/lib/data/access"
import { enabledFeatures } from "@/lib/features/access"
import { ACTIVE_STUDENT, managedClasses } from "@/lib/classes/access"
import { formatCode } from "@/lib/classes/code-format"
import { cn } from "@/lib/utils"
import { EmptyState, PageHeader, str, TintIcon, UrlTabs } from "@/components/shell/page-parts"
import { JoinClassDialog } from "@/components/classes/join-class"
import { FormDialog } from "@/components/forms/form-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { createClass } from "./actions"
import { ClassFields } from "./fields"

export const metadata: Metadata = { title: "Kelas" }

const TINTS = ["violet", "sky", "green", "orange", "rose"] as const

export default async function ClassesPage({ searchParams }: PageProps<"/kelas">) {
  const user = await requireRole()
  const features = await enabledFeatures(user.role)
  return user.role === "PESERTA" ? <StudentClasses user={user} canJoin={features.includes("kelas.gabung")} /> : <TeacherClasses user={user} canManage={features.includes("kelas.kelola")} archived={str((await searchParams).arsip) === "1"} />
}

async function StudentClasses({ user, canJoin }: { user: CurrentUser; canJoin: boolean }) {
  const memberships = await db.groupMember.findMany({
    where: { userId: user.id, role: "STUDENT", status: { in: ["ACTIVE", "PENDING"] }, group: { archivedAt: null } },
    orderBy: { joinedAt: "desc" },
    select: { status: true, group: { select: { id: true, name: true, term: true, owner: { select: { name: true } }, subject: { select: { code: true, name: true } }, _count: { select: { members: { where: ACTIVE_STUDENT } } } } } },
  })
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Kelas Saya" description="Kelas perkuliahan yang Anda ikuti. Masuk ke kelas baru memakai kode dari pengajar." actions={canJoin && <JoinClassDialog className="rounded-xl" />} />
      {memberships.length === 0 ? (
        <EmptyState title="Belum mengikuti kelas" description="Minta kode kelas ke pengajar, lalu tekan “Gabung kelas”." action={canJoin && <JoinClassDialog />} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {memberships.map(({ status, group: g }, i) => (
            <Link key={g.id} href={`/kelas/${g.id}`} className="group flex items-center gap-4 rounded-2xl bg-card p-5 ring-1 ring-border/60 transition hover:ring-primary/40">
              <TintIcon tint={TINTS[i % TINTS.length]}>
                <School />
              </TintIcon>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{g.name}</p>
                <p className="truncate text-sm text-muted-foreground">{[g.subject ? g.subject.code : null, g.owner?.name, g.term].filter(Boolean).join(" · ") || `${g._count.members} anggota`}</p>
                {status === "PENDING" && (
                  <Badge variant="outline" className="mt-1.5">
                    <Hourglass aria-hidden /> Menunggu persetujuan
                  </Badge>
                )}
              </div>
              <ChevronRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5" aria-hidden />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

async function TeacherClasses({ user, canManage, archived }: { user: CurrentUser; canManage: boolean; archived: boolean }) {
  const [classes, subjects] = await Promise.all([
    db.group.findMany({
      where: { AND: [managedClasses(user), { archivedAt: archived ? { not: null } : null }] },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        term: true,
        ownerId: true,
        joinLocked: true,
        subject: { select: { code: true } },
        owner: { select: { name: true } },
        codes: { where: { status: "ACTIVE" }, select: { code: true }, take: 1 },
        _count: { select: { members: { where: ACTIVE_STUDENT }, exams: true } },
        members: { where: { status: "PENDING" }, select: { userId: true } },
      },
    }),
    listManagedSubjects(user),
  ])
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Kelas"
        description="Buat kelas, bagikan kodenya ke mahasiswa, lalu tujukan ujian/tugas ke kelas tersebut."
        actions={
          canManage && (
            <FormDialog
              title="Kelas Baru"
              description="Kode kelas dibuat otomatis setelah disimpan."
              action={createClass}
              trigger={
                <Button className="rounded-xl">
                  <Plus aria-hidden /> Buat kelas
                </Button>
              }
            >
              <ClassFields subjects={subjects.map((s) => ({ id: s.id, label: `${s.code} · ${s.name}` }))} />
            </FormDialog>
          )
        }
      />
      <UrlTabs
        label="Status kelas"
        active={archived ? "arsip" : "aktif"}
        tabs={[
          { key: "aktif", label: "Aktif", href: "/kelas" },
          { key: "arsip", label: "Diarsipkan", href: "/kelas?arsip=1" },
        ]}
      />
      {classes.length === 0 ? (
        <EmptyState title={archived ? "Tidak ada kelas diarsipkan" : "Belum ada kelas"} description={archived ? undefined : "Buat kelas pertama Anda, lalu bagikan kode kelas ke mahasiswa."} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {classes.map((g, i) => (
            <Link key={g.id} href={`/kelas/${g.id}`} className="group flex flex-col gap-3 rounded-2xl bg-card p-5 ring-1 ring-border/60 transition hover:ring-primary/40">
              <div className="flex items-center gap-4">
                <TintIcon tint={TINTS[i % TINTS.length]}>{archived ? <Archive /> : <School />}</TintIcon>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{g.name}</p>
                  <p className="truncate text-sm text-muted-foreground">{[g.subject?.code, g.term, g.ownerId ? (g.ownerId === user.id ? null : g.owner?.name) : "Kelompok administratif"].filter(Boolean).join(" · ") || "—"}</p>
                </div>
                <ChevronRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5" aria-hidden />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>
                  {g._count.members} mahasiswa · {g._count.exams} ujian
                </span>
                {g.members.length > 0 && <Badge>{g.members.length} menunggu</Badge>}
                {g.joinLocked && <Badge variant="outline">Dikunci</Badge>}
                {g.codes[0] && <span className={cn("ml-auto font-mono font-semibold text-primary")}>{formatCode(g.codes[0].code)}</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
