import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { db } from "@/lib/db"
import { requireFeature } from "@/lib/features/access"
import { STAFF } from "@/lib/auth/roles"
import { listManagedSubjects, managedSubjects, MY_BANK } from "@/lib/data/access"
import { PageHeader, str } from "@/components/shell/page-parts"
import { buttonVariants } from "@/components/ui/button"
import { ImportWizard } from "./import-wizard"

export const metadata: Metadata = { title: "Impor Soal" }

export default async function ImportPage({ searchParams }: PageProps<"/bank-soal/impor">) {
  const user = await requireFeature("bank-soal.impor", ...STAFF)
  const sp = await searchParams
  // "Bank soal saya" selalu tersedia (juga untuk dosen tanpa mata uji); ujian tujuan hanya dari mata uji resmi.
  const subjects = [...(await listManagedSubjects(user)), { id: MY_BANK, code: "★", name: "Bank soal saya (pribadi)" }]
  const subject = subjects.find((s) => s.id === str(sp.subject)) ?? subjects[0]
  const exams = await db.exam.findMany({
    where: { subject: managedSubjects(user), attempts: { none: { status: { not: "IN_PROGRESS" } } } },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, subjectId: true },
  })

  return (
    <div className="flex flex-col gap-6">
      <Link href={`/bank-soal?subject=${subject.id}`} className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2 w-fit" })}>
        <ArrowLeft aria-hidden /> Bank Soal
      </Link>
      <PageHeader title="Impor Soal" description="Unggah soal dari Microsoft Excel atau Word, atau tempel teks. Periksa pratinjau sebelum disimpan." />
      <ImportWizard subjects={subjects.map((s) => ({ id: s.id, label: `${s.code} · ${s.name}` }))} exams={exams} initialSubject={subject.id} />
    </div>
  )
}
