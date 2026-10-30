import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Ban, Check, ClipboardList, Hourglass, Plus, RotateCcw, School, UserMinus, X } from "lucide-react"
import { db } from "@/lib/db"
import { requireRole, type CurrentUser } from "@/lib/auth/dal"
import { appOrigin } from "@/lib/auth/account"
import { listManagedSubjects } from "@/lib/data/access"
import { participantExams } from "@/lib/data/participant"
import { ACTIVE_STUDENT, getManagedClass, getMembership } from "@/lib/classes/access"
import { EXAM_STATUS, examStatus } from "@/lib/exam/status"
import { examLabel, WORK_TYPE_LABEL } from "@/lib/labels"
import { formatDateTime, initials, toDateTimeInput } from "@/lib/format"
import { cn } from "@/lib/utils"
import { EmptyState, str, UrlTabs } from "@/components/shell/page-parts"
import { ParticipantExamCard } from "@/components/exam/participant-exam-card"
import { ActionButton } from "@/components/forms/action-button"
import { ActionForm, FormField } from "@/components/forms/action-form"
import { ConfirmAction } from "@/components/forms/confirm-action"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  approveMember,
  rejectMember,
  removeMember,
  restoreMember,
  rotateClassCode,
  setClassArchived,
  setClassCodeEnabled,
  setClassCodeLimits,
  updateClass,
} from "../actions"
import { ClassFields } from "../fields"
import { CodeDisplay } from "./code-card"

export const metadata: Metadata = { title: "Kelas" }

type ClassHead = { name: string; term: string | null; description: string | null; archivedAt: Date | null; owner: { name: string } | null; subject: { code: string; name: string } | null }

export default async function ClassPage({ params, searchParams }: PageProps<"/kelas/[id]">) {
  const user = await requireRole()
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const tab = str(sp.tab)

  if (user.role !== "PESERTA") {
    const cls = await getManagedClass(user, id)
    if (!cls) notFound()
    return <TeacherView user={user} cls={cls} tab={tab === "anggota" || tab === "pengaturan" ? tab : "tugas"} />
  }

  // Peserta: hanya anggota (bukan yang dikeluarkan). Bukan anggota → 404, bukan 403 (tidak membocorkan kelas ada).
  const m = await getMembership(user, id)
  if (!m || m.role !== "STUDENT" || m.status === "REMOVED") notFound()
  if (m.status === "PENDING") {
    return (
      <div className="flex flex-col gap-6">
        <BackLink />
        <Header cls={m.group} />
        <EmptyState title="Menunggu persetujuan pengajar" description="Permintaan bergabung Anda sudah terkirim. Isi kelas tampil setelah pengajar menyetujui." />
      </div>
    )
  }
  return <StudentView user={user} groupId={id} cls={m.group} tab={tab === "anggota" ? "anggota" : "tugas"} />
}

function BackLink() {
  return (
    <Link href="/kelas" className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2 w-fit" })}>
      <ArrowLeft aria-hidden /> Kelas
    </Link>
  )
}

function Header({ cls, children }: { cls: ClassHead; children?: React.ReactNode }) {
  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-primary-deep p-6 text-primary-foreground">
      <div className="absolute -top-16 -right-10 size-56 rounded-full bg-white/10" aria-hidden />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm text-primary-foreground/80">
            <School className="size-4" aria-hidden /> {[cls.subject ? `${cls.subject.code} · ${cls.subject.name}` : null, cls.term].filter(Boolean).join(" · ") || "Kelas"}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{cls.name}</h1>
          {cls.owner && <p className="mt-1 text-sm text-primary-foreground/85">Pengampu: {cls.owner.name}</p>}
          {cls.description && <p className="mt-2 max-w-2xl text-sm text-primary-foreground/85">{cls.description}</p>}
          {cls.archivedAt && <Badge className="mt-2 bg-white/20 text-primary-foreground">Diarsipkan {formatDateTime(cls.archivedAt)}</Badge>}
        </div>
        {children}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Mahasiswa / peserta
// ---------------------------------------------------------------------------

async function StudentView({ user, groupId, cls, tab }: { user: CurrentUser; groupId: string; cls: ClassHead; tab: "tugas" | "anggota" }) {
  const base = `/kelas/${groupId}`
  return (
    <div className="flex flex-col gap-6">
      <BackLink />
      <Header cls={cls} />
      <UrlTabs
        label="Bagian kelas"
        active={tab}
        tabs={[
          { key: "tugas", label: "Ujian & Tugas", href: base },
          { key: "anggota", label: "Anggota", href: `${base}?tab=anggota` },
        ]}
      />
      {tab === "tugas" ? <StudentWork user={user} groupId={groupId} /> : <MemberDirectory groupId={groupId} />}
    </div>
  )
}

async function StudentWork({ user, groupId }: { user: CurrentUser; groupId: string }) {
  const exams = await participantExams(user, { groupId })
  if (exams.length === 0) return <EmptyState title="Belum ada ujian atau tugas" description="Ujian yang ditujukan pengajar untuk kelas ini akan tampil di sini." />
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {exams.map((e) => (
        <ParticipantExamCard key={e.id} exam={e} />
      ))}
    </div>
  )
}

/** Daftar anggota untuk mahasiswa: nama saja (NIM & email hanya untuk pengajar). */
async function MemberDirectory({ groupId }: { groupId: string }) {
  const [group, students] = await Promise.all([
    db.group.findUnique({ where: { id: groupId }, select: { owner: { select: { name: true } }, members: { where: { role: "TEACHER", status: "ACTIVE" }, select: { user: { select: { name: true } } } } } }),
    db.groupMember.findMany({ where: { groupId, ...ACTIVE_STUDENT }, orderBy: { user: { name: "asc" } }, select: { user: { select: { id: true, name: true } } } }),
  ])
  const teachers = [group?.owner?.name, ...(group?.members.map((m) => m.user.name) ?? [])].filter((n): n is string => !!n)
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
      <Card>
        <CardHeader>
          <CardTitle>Pengajar</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {teachers.length ? teachers.map((name) => <Person key={name} name={name} />) : <p className="text-sm text-muted-foreground">—</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Teman sekelas ({students.length})</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {students.map(({ user }) => (
            <Person key={user.id} name={user.name} />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function Person({ name, detail }: { name: string; detail?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-tint-violet text-xs font-semibold text-tint-violet-fg">{initials(name)}</span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{name}</span>
        {detail && <span className="block truncate text-xs text-muted-foreground">{detail}</span>}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pengajar
// ---------------------------------------------------------------------------

type ManagedClass = NonNullable<Awaited<ReturnType<typeof getManagedClass>>>

async function TeacherView({ user, cls, tab }: { user: CurrentUser; cls: ManagedClass; tab: "tugas" | "anggota" | "pengaturan" }) {
  const base = `/kelas/${cls.id}`
  const pending = await db.groupMember.count({ where: { groupId: cls.id, status: "PENDING" } })
  return (
    <div className="flex flex-col gap-6">
      <BackLink />
      <Header cls={cls}>
        <Link href={`/ujian-kelola/baru?kelas=${cls.id}${cls.subjectId ? `&subject=${cls.subjectId}` : ""}`} className={buttonVariants({ className: "rounded-xl bg-white text-primary hover:bg-white/90" })}>
          <Plus aria-hidden /> Buat ujian untuk kelas ini
        </Link>
      </Header>
      <UrlTabs
        label="Bagian kelas"
        active={tab}
        tabs={[
          { key: "tugas", label: "Ujian & Tugas", href: base },
          { key: "anggota", label: pending ? `Anggota · ${pending} menunggu` : "Anggota", href: `${base}?tab=anggota` },
          { key: "pengaturan", label: "Kode & Pengaturan", href: `${base}?tab=pengaturan` },
        ]}
      />
      {tab === "tugas" && <TeacherWork groupId={cls.id} />}
      {tab === "anggota" && <TeacherMembers groupId={cls.id} />}
      {tab === "pengaturan" && <TeacherSettings user={user} cls={cls} />}
    </div>
  )
}

async function TeacherWork({ groupId }: { groupId: string }) {
  const exams = await db.exam.findMany({
    where: { groups: { some: { groupId } } },
    orderBy: [{ startAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
    select: { id: true, title: true, kind: true, workType: true, dueAt: true, category: { select: { name: true } }, publishedAt: true, sessionActive: true, startAt: true, endAt: true, _count: { select: { questions: true, attempts: true } } },
  })
  if (exams.length === 0) return <EmptyState title="Belum ada ujian untuk kelas ini" description="Buat ujian lalu pilih kelas ini di bagian “Peserta”." />
  return (
    <Card className="py-0">
      <ul className="divide-y">
        {exams.map((e) => {
          const st = EXAM_STATUS[examStatus(e)]
          return (
            <li key={e.id}>
              <Link href={`/ujian-kelola/${e.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-muted/40">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-tint-violet text-tint-violet-fg">
                  <ClipboardList className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{e.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {examLabel(e)} · {WORK_TYPE_LABEL[e.workType]} · {e._count.questions} soal{e.dueAt ? ` · tenggat ${formatDateTime(e.dueAt)}` : ""} · {e._count.attempts} percobaan{e.startAt ? ` · ${formatDateTime(e.startAt)}` : ""}
                  </span>
                </span>
                <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", st.className)}>{st.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

async function TeacherMembers({ groupId }: { groupId: string }) {
  const members = await db.groupMember.findMany({
    where: { groupId, role: "STUDENT" },
    orderBy: [{ user: { name: "asc" } }],
    select: { status: true, joinedAt: true, joinedVia: true, removedAt: true, blockRejoin: true, user: { select: { id: true, name: true, email: true, username: true } } },
  })
  const by = (s: string) => members.filter((m) => m.status === s)
  const [pending, active, removed] = [by("PENDING"), by("ACTIVE"), by("REMOVED")]

  return (
    <div className="flex flex-col gap-4">
      {pending.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Hourglass className="size-4" aria-hidden /> Menunggu persetujuan ({pending.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y">
            {pending.map(({ user, joinedAt }) => (
              <div key={user.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <Person name={user.name} detail={`${user.username ?? "tanpa NIM"} · ${user.email} · ${formatDateTime(joinedAt)}`} />
                <div className="ml-auto flex shrink-0 gap-1">
                  <ActionButton action={approveMember.bind(null, groupId, user.id)} size="sm">
                    <Check aria-hidden /> Setujui
                  </ActionButton>
                  <ActionButton action={rejectMember.bind(null, groupId, user.id)} size="sm" variant="outline">
                    <X aria-hidden /> Tolak
                  </ActionButton>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="py-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-2xl text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Mahasiswa ({active.length})</th>
                <th className="px-3 py-3 font-medium">NIM</th>
                <th className="px-3 py-3 font-medium">Bergabung</th>
                <th className="px-5 py-3 text-right font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {active.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-6 text-center text-muted-foreground">
                    Belum ada mahasiswa. Bagikan kode kelas di tab “Kode & Pengaturan”.
                  </td>
                </tr>
              )}
              {active.map(({ user, joinedAt, joinedVia }) => (
                <tr key={user.id}>
                  <td className="px-5 py-2.5">
                    <Person name={user.name} detail={user.email} />
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs">{user.username ?? "—"}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {formatDateTime(joinedAt)}
                    {joinedVia ? " · via kode" : ""}
                  </td>
                  <td className="px-5 py-2.5">
                    <div className="flex justify-end gap-1">
                      <ConfirmAction
                        action={removeMember.bind(null, groupId, user.id, false)}
                        title={`Keluarkan ${user.name}?`}
                        description="Ia tidak lagi melihat ujian kelas ini. Riwayat nilainya tetap tersimpan, dan ia bisa bergabung lagi dengan kode."
                        confirmLabel="Keluarkan"
                        destructive
                        trigger={
                          <Button variant="ghost" size="icon-sm" title="Keluarkan" aria-label={`Keluarkan ${user.name}`}>
                            <UserMinus />
                          </Button>
                        }
                      />
                      <ConfirmAction
                        action={removeMember.bind(null, groupId, user.id, true)}
                        title={`Keluarkan & blokir ${user.name}?`}
                        description="Seperti “Keluarkan”, ditambah: ia tidak bisa bergabung lagi memakai kode apa pun sampai Anda memulihkannya."
                        confirmLabel="Keluarkan & blokir"
                        destructive
                        trigger={
                          <Button variant="ghost" size="icon-sm" title="Keluarkan & blokir" aria-label={`Keluarkan dan blokir ${user.name}`}>
                            <Ban className="text-destructive" />
                          </Button>
                        }
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {removed.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Dikeluarkan ({removed.length})</CardTitle>
            <CardDescription>Riwayat nilai tetap tersimpan. Pulihkan bila salah mengeluarkan.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col divide-y">
            {removed.map(({ user, removedAt, blockRejoin }) => (
              <div key={user.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <Person name={user.name} detail={`${user.username ?? user.email}${removedAt ? ` · ${formatDateTime(removedAt)}` : ""}`} />
                {blockRejoin && <Badge variant="destructive">Diblokir</Badge>}
                <ActionButton action={restoreMember.bind(null, groupId, user.id)} size="sm" variant="outline" className="ml-auto">
                  <RotateCcw aria-hidden /> Pulihkan
                </ActionButton>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

async function TeacherSettings({ user, cls }: { user: CurrentUser; cls: ManagedClass }) {
  const subjects = await listManagedSubjects(user)
  const code = cls.codes[0] ?? null
  const joinUrl = code ? `${appOrigin()}/gabung?kode=${code.code}` : ""
  const expired = !!code?.expiresAt && code.expiresAt <= new Date()

  return (
    <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Kode kelas
            {code &&
              (code.status === "DISABLED" ? (
                <Badge variant="outline">Dinonaktifkan</Badge>
              ) : expired ? (
                <Badge variant="destructive">Kedaluwarsa</Badge>
              ) : cls.joinLocked || cls.archivedAt ? (
                <Badge variant="outline">Kelas dikunci</Badge>
              ) : (
                <Badge>Aktif</Badge>
              ))}
          </CardTitle>
          <CardDescription>Mahasiswa memasukkan kode ini di menu Kelas → Gabung kelas.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {code ? (
            <>
              <CodeDisplay code={code.code} joinUrl={joinUrl} className={cls.name} />
              <p className="text-xs text-muted-foreground">
                Dipakai {code.usesCount}
                {code.maxUses ? ` dari ${code.maxUses}` : ""} kali · {code.expiresAt ? `berlaku s.d. ${formatDateTime(code.expiresAt)}` : "tanpa batas waktu"}
              </p>
              <div className="flex flex-wrap gap-2">
                <ConfirmAction
                  action={rotateClassCode.bind(null, cls.id)}
                  title="Ganti kode kelas?"
                  description="Kode lama langsung tidak berlaku (gunakan bila kode bocor). Mahasiswa yang sudah bergabung tidak terpengaruh."
                  confirmLabel="Ganti kode"
                  trigger={<Button variant="outline">Ganti kode</Button>}
                />
                <ActionButton action={setClassCodeEnabled.bind(null, cls.id, code.status === "DISABLED")} variant="outline">
                  {code.status === "DISABLED" ? "Aktifkan kode" : "Nonaktifkan kode"}
                </ActionButton>
              </div>
              <ActionForm action={setClassCodeLimits.bind(null, cls.id)} submitLabel="Simpan batas" className="rounded-xl border p-4">
                <p className="text-sm font-medium">Batas kode (opsional)</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField name="expiresAt" label="Berlaku sampai" hint="Kosong = tanpa batas waktu (WIB).">
                    <Input id="expiresAt" name="expiresAt" type="datetime-local" defaultValue={toDateTimeInput(code.expiresAt)} />
                  </FormField>
                  <FormField name="maxUses" label="Maks. pemakaian" hint="Kosong = tanpa batas.">
                    <Input id="maxUses" name="maxUses" type="number" min={1} defaultValue={code.maxUses ?? ""} />
                  </FormField>
                </div>
              </ActionForm>
            </>
          ) : (
            <ActionButton action={rotateClassCode.bind(null, cls.id)}>Buat kode kelas</ActionButton>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Pengaturan kelas</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={updateClass.bind(null, cls.id)}>
              <ClassFields
                withLock
                subjects={subjects.map((s) => ({ id: s.id, label: `${s.code} · ${s.name}` }))}
                defaults={{ name: cls.name, term: cls.term, description: cls.description, subjectId: cls.subjectId, joinPolicy: cls.joinPolicy, requireStudentId: cls.requireStudentId, joinLocked: cls.joinLocked }}
              />
            </ActionForm>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">{cls.archivedAt ? "Kelas diarsipkan" : "Arsipkan kelas"}</p>
              <p className="text-xs text-muted-foreground">{cls.archivedAt ? "Aktifkan kembali agar kode menerima anggota." : "Akhir semester: kelas disembunyikan, kode berhenti, nilai tetap tersimpan."}</p>
            </div>
            <ConfirmAction
              action={setClassArchived.bind(null, cls.id, !cls.archivedAt)}
              title={cls.archivedAt ? "Aktifkan kembali kelas?" : "Arsipkan kelas?"}
              description={cls.archivedAt ? "Kelas tampil lagi di daftar dan kode bisa dipakai." : "Kelas pindah ke tab Diarsipkan. Mahasiswa tidak bisa bergabung lagi; riwayat nilai tetap ada."}
              confirmLabel={cls.archivedAt ? "Aktifkan" : "Arsipkan"}
              trigger={<Button variant="outline">{cls.archivedAt ? "Aktifkan" : "Arsipkan"}</Button>}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
