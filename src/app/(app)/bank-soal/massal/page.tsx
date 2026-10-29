import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { db } from "@/lib/db"
import { requireRole } from "@/lib/auth/dal"
import { STAFF } from "@/lib/auth/roles"
import { listManagedSubjects, managedSubjects } from "@/lib/data/access"
import { EmptyState, PageHeader, str } from "@/components/shell/page-parts"
import { buttonVariants } from "@/components/ui/button"
import { BulkEditor } from "./bulk-editor"

export const metadata: Metadata = { title: "Buat Soal Massal" }

export default async function BulkCreatePage({ searchParams }: PageProps<"/bank-soal/massal">) {
  const user = await requireRole(...STAFF)
  const sp = await searchParams
  const subjects = await listManagedSubjects(user)
  if (subjects.length === 0) return <EmptyState title="Belum ada mata uji yang Anda kelola" />
  // Ujian yang soalnya masih bisa diubah (belum ada pengumpulan).
  const exams = await db.exam.findMany({
    where: { subject: managedSubjects(user), attempts: { none: { status: { not: "IN_PROGRESS" } } } },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, subjectId: true },
  })
  const examParam = str(sp.exam)
  const preExam = exams.find((e) => e.id === examParam) ?? null
  const subject = subjects.find((s) => s.id === (preExam?.subjectId ?? str(sp.subject))) ?? subjects[0]

  return (
    <div className="flex flex-col gap-6">
      <Link href={`/bank-soal?subject=${subject.id}`} className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2 w-fit" })}>
        <ArrowLeft aria-hidden /> Bank Soal
      </Link>
      <PageHeader
        title="Buat Soal Massal"
        description="Tulis banyak soal sekaligus — atur jumlah soal per halaman, lalu simpan semuanya dalam satu kali klik. Soal kosong diabaikan."
      />
      <BulkEditor
        subjects={subjects.map((s) => ({ id: s.id, label: `${s.code} · ${s.name}` }))}
        exams={exams}
        initialSubject={subject.id}
        initialExam={preExam?.id ?? null}
      />
    </div>
  )
}
