import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Pencil, Trash2, UserMinus, UserPlus } from "lucide-react"
import { db } from "@/lib/db"
import { requireRole } from "@/lib/auth/dal"
import { ADMINS } from "@/lib/auth/roles"
import { initials } from "@/lib/format"
import { EmptyState, PageHeader } from "@/components/shell/page-parts"
import { ActionButton } from "@/components/forms/action-button"
import { ConfirmAction } from "@/components/forms/confirm-action"
import { FormDialog } from "@/components/forms/form-dialog"
import { FormField } from "@/components/forms/action-form"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { addMembers, deleteGroup, removeMember, updateGroup } from "../actions"
import { GroupFields } from "../fields"

export const metadata: Metadata = { title: "Kelompok" }

export default async function GroupDetailPage({ params }: PageProps<"/admin/kelompok/[id]">) {
  await requireRole(...ADMINS)
  const { id } = await params
  const group = await db.group.findUnique({
    where: { id },
    include: {
      members: { orderBy: { user: { name: "asc" } }, select: { user: { select: { id: true, name: true, email: true, username: true, isActive: true } } } },
      exams: { select: { exam: { select: { id: true, title: true } } } },
    },
  })
  if (!group) notFound()

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/kelompok" className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2 w-fit" })}>
        <ArrowLeft aria-hidden /> Kelompok Peserta
      </Link>
      <PageHeader
        title={group.name}
        description={`${group.members.length} peserta${group.description ? ` · ${group.description}` : ""}`}
        actions={
          <>
            <FormDialog
              title="Tambah Peserta"
              description="Tulis email atau username/NIM peserta, satu per baris (bisa ditempel dari Excel)."
              action={addMembers.bind(null, group.id)}
              submitLabel="Tambahkan"
              trigger={
                <Button className="rounded-xl">
                  <UserPlus aria-hidden /> Tambah peserta
                </Button>
              }
            >
              <FormField name="identifiers" label="Email / username peserta">
                <Textarea id="identifiers" name="identifiers" rows={8} className="font-mono text-xs" placeholder={"2401001\n2401002\nbudi@kampus.ac.id"} />
              </FormField>
            </FormDialog>
            <FormDialog
              title="Ubah Kelompok"
              action={updateGroup.bind(null, group.id)}
              trigger={
                <Button variant="outline" className="rounded-xl">
                  <Pencil aria-hidden /> Ubah
                </Button>
              }
            >
              <GroupFields defaults={group} />
            </FormDialog>
            <ConfirmAction
              action={deleteGroup.bind(null, group.id)}
              title={`Hapus kelompok ${group.name}?`}
              description="Akun peserta tetap ada; hanya pengelompokannya yang dihapus. Ujian yang ditujukan ke kelompok ini tidak lagi terlihat oleh anggotanya."
              confirmLabel="Hapus"
              destructive
              trigger={
                <Button variant="outline" size="icon" className="rounded-xl" aria-label="Hapus kelompok">
                  <Trash2 className="text-destructive" />
                </Button>
              }
            />
          </>
        }
      />
      {group.exams.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Mengikuti ujian:{" "}
          {group.exams.map((e, i) => (
            <span key={e.exam.id}>
              {i > 0 && ", "}
              <Link href={`/ujian-kelola/${e.exam.id}`} className="text-primary hover:underline">
                {e.exam.title}
              </Link>
            </span>
          ))}
        </p>
      )}
      {group.members.length === 0 ? (
        <EmptyState title="Belum ada peserta" description="Tambahkan peserta dengan menempel daftar email atau NIM." />
      ) : (
        <Card className="py-0">
          <ul className="divide-y">
            {group.members.map(({ user: u }, i) => (
              <li key={u.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <span className="w-6 text-right text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                <span className="flex size-9 items-center justify-center rounded-full bg-tint-violet text-xs font-semibold text-tint-violet-fg">{initials(u.name)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{u.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {u.username && <span className="font-mono">{u.username} · </span>}
                    {u.email}
                    {!u.isActive && " · nonaktif"}
                  </span>
                </span>
                <ActionButton action={removeMember.bind(null, group.id, u.id)} variant="ghost" size="icon-sm" aria-label={`Keluarkan ${u.name}`} title="Keluarkan">
                  <UserMinus className="text-destructive" />
                </ActionButton>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
