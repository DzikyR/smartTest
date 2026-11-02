import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { db } from "@/lib/db"
import { ACTIVE_STUDENT, targetableClasses } from "@/lib/classes/access"
import { requireRole } from "@/lib/auth/dal"
import { STAFF } from "@/lib/auth/roles"
import { listManagedSubjects } from "@/lib/data/access"
import { EmptyState, PageHeader, str } from "@/components/shell/page-parts"
import { buttonVariants } from "@/components/ui/button"
import { createExam } from "../actions"
import { ExamForm } from "../exam-form"

export const metadata: Metadata = { title: "Buat Ujian" }

export default async function NewExamPage({ searchParams }: PageProps<"/ujian-kelola/baru">) {
  const user = await requireRole(...STAFF)
  const sp = await searchParams
  const [subjects, groups, categories] = await Promise.all([
    listManagedSubjects(user),
    db.group.findMany({ where: { AND: [{ archivedAt: null }, targetableClasses(user)] }, orderBy: { name: "asc" }, select: { id: true, name: true, _count: { select: { members: { where: ACTIVE_STUDENT } } } } }),
    db.examCategory.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, kind: true } }),
  ])
  if (subjects.length === 0) return <EmptyState title="Belum ada mata uji yang Anda kelola" description="Ujian dibuat di dalam mata uji. Buat mata uji terlebih dahulu." action={<Link href="/mata-uji" className={buttonVariants({ className: "rounded-xl" })}>Buat mata uji</Link>} />
  const pre = subjects.find((s) => s.id === str(sp.subject))

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <Link href="/ujian-kelola" className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2 w-fit" })}>
        <ArrowLeft aria-hidden /> Kelola Ujian
      </Link>
      <PageHeader title="Buat Ujian" description="Setelah disimpan (sebagai draf), Anda akan diarahkan untuk mengisi soal." />
      <ExamForm
        action={createExam}
        submitLabel="Simpan & isi soal"
        subjects={(pre ? [pre, ...subjects.filter((s) => s !== pre)] : subjects).map((s) => ({ id: s.id, label: `${s.code} · ${s.name}` }))}
        groups={groups.map((g) => ({ id: g.id, name: g.name, members: g._count.members }))}
        preselectGroupId={str(sp.kelas)}
        categories={categories}
      />
    </div>
  )
}
