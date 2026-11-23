import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { db } from "@/lib/db"
import { requireFeature } from "@/lib/features/access"
import { STAFF } from "@/lib/auth/roles"
import { listManagedSubjects, managedSubjects, MY_BANK } from "@/lib/data/access"
import { PageHeader, str } from "@/components/shell/page-parts"
import { buttonVariants } from "@/components/ui/button"
import { BulkEditor } from "./bulk-editor"

export const metadata: Metadata = { title: "Buat Soal Massal" }

export default async function BulkCreatePage({ searchParams }: PageProps<"/bank-soal/massal">) {
  const user = await requireFeature("bank-soal.massal", ...STAFF)
  const sp = await searchParams
  // "Bank soal saya" selalu tersedia (juga untuk dosen tanpa mata uji); ujian tujuan hanya dari mata uji resmi.
  const subjects = [...(await listManagedSubjects(user)), { id: MY_BANK, code: "★", name: "Bank soal saya (pribadi)" }]
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
