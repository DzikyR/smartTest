import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { db } from "@/lib/db"
import { ACTIVE_STUDENT, targetableClasses } from "@/lib/classes/access"
import { requireRole } from "@/lib/auth/dal"
import { STAFF } from "@/lib/auth/roles"
import { getManagedExam, listManagedSubjects } from "@/lib/data/access"
import { PageHeader } from "@/components/shell/page-parts"
import { buttonVariants } from "@/components/ui/button"
import { updateExam } from "../../actions"
import { ExamForm } from "../../exam-form"

export const metadata: Metadata = { title: "Ubah Ujian" }

export default async function EditExamPage({ params }: PageProps<"/ujian-kelola/[id]/ubah">) {
  const user = await requireRole(...STAFF)
  const { id } = await params
  const exam = await getManagedExam(user, id)
  if (!exam) notFound()
  const [subjects, groups] = await Promise.all([
    listManagedSubjects(user),
    db.group.findMany({
      // Kelas yang boleh dituju (aktif) + kelas yang sudah dipilih untuk ujian ini.
      where: { OR: [{ AND: [{ archivedAt: null }, targetableClasses(user)] }, { exams: { some: { examId: id } } }] },
      orderBy: { name: "asc" },
      select: { id: true, name: true, _count: { select: { members: { where: ACTIVE_STUDENT } } } },
    }),
  ])

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <Link href={`/ujian-kelola/${exam.id}`} className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2 w-fit" })}>
        <ArrowLeft aria-hidden /> {exam.title}
      </Link>
      <PageHeader title="Ubah Ujian" description="Perubahan durasi berlaku untuk peserta yang belum selesai; tambahan waktu per peserta diatur di tab Peserta." />
      <ExamForm
        action={updateExam.bind(null, exam.id)}
        submitLabel="Simpan perubahan"
        subjects={subjects.map((s) => ({ id: s.id, label: `${s.code} · ${s.name}` }))}
        groups={groups.map((g) => ({ id: g.id, name: g.name, members: g._count.members }))}
        defaults={{ ...exam, groupIds: exam.groups.map((g) => g.group.id) }}
      />
    </div>
  )
}
