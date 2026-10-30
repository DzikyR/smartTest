import type { Metadata } from "next"
import Link from "next/link"
import { ChevronRight, Plus, UsersRound } from "lucide-react"
import { db } from "@/lib/db"
import { ACTIVE_STUDENT } from "@/lib/classes/access"
import { requireFeature } from "@/lib/features/access"
import { ADMINS } from "@/lib/auth/roles"
import { EmptyState, PageHeader, TintIcon } from "@/components/shell/page-parts"
import { FormDialog } from "@/components/forms/form-dialog"
import { Button } from "@/components/ui/button"
import { createGroup } from "./actions"
import { GroupFields } from "./fields"

export const metadata: Metadata = { title: "Kelompok Peserta" }

export default async function GroupsPage() {
  await requireFeature("admin.kelompok", ...ADMINS)
  const groups = await db.group.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { members: { where: ACTIVE_STUDENT }, exams: true } } } })
  const tints = ["violet", "sky", "green", "orange", "rose"] as const

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Kelompok Peserta"
        description="Kelompokkan peserta (kelas, gelombang, angkatan) untuk menentukan siapa yang dapat mengikuti ujian."
        actions={
          <FormDialog
            title="Kelompok Baru"
            action={createGroup}
            trigger={
              <Button className="rounded-xl">
                <Plus aria-hidden /> Kelompok baru
              </Button>
            }
          >
            <GroupFields />
          </FormDialog>
        }
      />
      {groups.length === 0 ? (
        <EmptyState title="Belum ada kelompok" description="Buat kelompok, lalu tambahkan peserta. Ujian dapat ditujukan ke satu atau beberapa kelompok." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {groups.map((g, i) => (
            <Link key={g.id} href={`/admin/kelompok/${g.id}`} className="group flex items-center gap-4 rounded-2xl bg-card p-5 ring-1 ring-border/60 transition hover:ring-primary/40">
              <TintIcon tint={tints[i % tints.length]}>
                <UsersRound />
              </TintIcon>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{g.name}</p>
                <p className="text-sm text-muted-foreground">
                  {g._count.members} peserta · {g._count.exams} ujian
                </p>
              </div>
              <ChevronRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5" aria-hidden />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
