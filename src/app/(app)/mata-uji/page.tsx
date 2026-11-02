import type { Metadata } from "next"
import Link from "next/link"
import { BookOpenText, Globe2, Library, Pencil, Plus, Power, Trash2 } from "lucide-react"
import { db } from "@/lib/db"
import { isAdmin, requireRole } from "@/lib/auth/dal"
import { STAFF } from "@/lib/auth/roles"
import { managedSubjects } from "@/lib/data/access"
import { SUBJECT_TYPE_LABEL } from "@/lib/labels"
import { cn } from "@/lib/utils"
import { EmptyState, PageHeader, TintIcon } from "@/components/shell/page-parts"
import { ActionButton } from "@/components/forms/action-button"
import { ConfirmAction } from "@/components/forms/confirm-action"
import { FormDialog } from "@/components/forms/form-dialog"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { createSubject, deleteSubject, setSubjectActive, updateSubject } from "./actions"
import { SubjectFields } from "./fields"

export const metadata: Metadata = { title: "Mata Uji" }

export default async function SubjectsPage() {
  const user = await requireRole(...STAFF)
  const admin = isAdmin(user)
  const [subjects, lecturers] = await Promise.all([
    db.subject.findMany({
      where: managedSubjects(user),
      orderBy: [{ type: "asc" }, { code: "asc" }],
      include: {
        lecturers: { select: { user: { select: { id: true, name: true } } } },
        _count: { select: { questions: true, exams: true } },
      },
    }),
    admin ? db.user.findMany({ where: { role: "DOSEN", isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, username: true } }) : [],
  ])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Mata Uji"
        description={admin ? "Mata kuliah atau tes umum beserta dosen pengelolanya." : "Mata uji yang Anda kelola. Buat mata uji untuk mulai menyusun bank soal dan ujian."}
        actions={
          <FormDialog
            title="Tambah Mata Uji"
            action={createSubject}
            wide
            trigger={
              <Button className="rounded-xl">
                <Plus aria-hidden /> Tambah mata uji
              </Button>
            }
          >
            <SubjectFields lecturers={lecturers} showLecturers={admin} />
          </FormDialog>
        }
      />

      {subjects.length === 0 ? (
        <EmptyState title="Belum ada mata uji" description={admin ? "Tambahkan mata kuliah atau tes umum, lalu tetapkan dosen pengelolanya." : "Tambahkan mata uji pertama Anda, lalu susun bank soal dan ujiannya."} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {subjects.map((s) => (
            <article key={s.id} className={cn("flex flex-col gap-4 rounded-2xl bg-card p-5 ring-1 ring-border/60", !s.isActive && "opacity-60")}>
              <div className="flex items-start gap-3">
                <TintIcon tint={s.type === "UMUM" ? "orange" : "violet"}>{s.type === "UMUM" ? <Globe2 /> : <BookOpenText />}</TintIcon>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs text-muted-foreground">{s.code}</p>
                  <h2 className="leading-snug font-semibold">{s.name}</h2>
                </div>
                <Badge variant={s.type === "UMUM" ? "outline" : "secondary"}>{SUBJECT_TYPE_LABEL[s.type]}</Badge>
              </div>
              {s.description && <p className="line-clamp-2 text-sm text-muted-foreground">{s.description}</p>}
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded-xl bg-muted p-2">
                  <p className="text-lg font-bold tabular-nums">{s._count.questions}</p>
                  <p className="text-xs text-muted-foreground">soal di bank</p>
                </div>
                <div className="rounded-xl bg-muted p-2">
                  <p className="text-lg font-bold tabular-nums">{s._count.exams}</p>
                  <p className="text-xs text-muted-foreground">ujian</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Pengelola: {s.lecturers.length ? s.lecturers.map((l) => l.user.name).join(", ") : <em>belum ada dosen</em>}
              </p>
              <div className="mt-auto flex flex-wrap items-center gap-2">
                <Link href={`/bank-soal?subject=${s.id}`} className={buttonVariants({ variant: "secondary", size: "sm", className: "rounded-lg" })}>
                  <Library aria-hidden /> Bank soal
                </Link>
                <FormDialog
                      title="Ubah Mata Uji"
                      action={updateSubject.bind(null, s.id)}
                      wide
                      trigger={
                        <Button variant="ghost" size="icon-sm" aria-label={`Ubah ${s.name}`} title="Ubah">
                          <Pencil />
                        </Button>
                      }
                    >
                      <SubjectFields lecturers={lecturers} showLecturers={admin} defaults={{ ...s, lecturerIds: s.lecturers.map((l) => l.user.id) }} />
                    </FormDialog>
                    <ActionButton action={setSubjectActive.bind(null, s.id, !s.isActive)} variant="ghost" size="icon-sm" aria-label={s.isActive ? "Nonaktifkan" : "Aktifkan"} title={s.isActive ? "Nonaktifkan" : "Aktifkan"}>
                      <Power className={s.isActive ? "" : "text-emerald-600"} />
                    </ActionButton>
                    <ConfirmAction
                      action={deleteSubject.bind(null, s.id)}
                      title={`Hapus ${s.name}?`}
                      description={`Bank soal (${s._count.questions} soal) ikut terhapus. Mata uji yang sudah memiliki ujian tidak dapat dihapus.`}
                      confirmLabel="Hapus"
                      destructive
                      trigger={
                        <Button variant="ghost" size="icon-sm" aria-label={`Hapus ${s.name}`} title="Hapus">
                          <Trash2 className="text-destructive" />
                        </Button>
                      }
                    />
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
