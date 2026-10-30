import type { Metadata } from "next"
import { Pencil, Plus, Power } from "lucide-react"
import type { ExamKind } from "@/generated/prisma/enums"
import { db } from "@/lib/db"
import { requireRole } from "@/lib/auth/dal"
import { ADMINS } from "@/lib/auth/roles"
import { EXAM_KIND_LABEL, isHighStakes } from "@/lib/labels"
import { cn } from "@/lib/utils"
import { EmptyState, PageHeader } from "@/components/shell/page-parts"
import { ActionButton } from "@/components/forms/action-button"
import { FormField } from "@/components/forms/action-form"
import { FormDialog } from "@/components/forms/form-dialog"
import { NativeSelect } from "@/components/forms/native-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { createCategory, setCategoryActive, updateCategory } from "./actions"

export const metadata: Metadata = { title: "Kategori Ujian" }

function CategoryFields({ defaults }: { defaults?: { name: string; kind: ExamKind; sortOrder: number } }) {
  return (
    <>
      <FormField name="name" label="Nama kategori" hint="Tampil di kartu ujian peserta, mis. “Kuis”, “UTS”, “Psikotes”.">
        <Input id="name" name="name" defaultValue={defaults?.name} maxLength={40} required />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField name="kind" label="Perilaku dasar" hint="UTS/UAS = pengamanan Safe Exam Browser aktif secara bawaan.">
          <NativeSelect id="kind" name="kind" defaultValue={defaults?.kind ?? "KUIS"}>
            {(Object.keys(EXAM_KIND_LABEL) as ExamKind[]).map((k) => (
              <option key={k} value={k}>
                {EXAM_KIND_LABEL[k]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField name="sortOrder" label="Urutan" hint="Kecil = di atas.">
          <Input id="sortOrder" name="sortOrder" type="number" min={0} max={999} defaultValue={defaults?.sortOrder ?? 100} />
        </FormField>
      </div>
    </>
  )
}

export default async function CategoriesPage() {
  await requireRole(...ADMINS)
  const categories = await db.examCategory.findMany({ orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { name: "asc" }], include: { _count: { select: { exams: true } } } })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Kategori Ujian"
        description="Topik/kategori yang dipilih pengajar saat membuat ujian atau tugas. Perilaku dasar menentukan pengamanan bawaan."
        actions={
          <FormDialog
            title="Kategori Baru"
            action={createCategory}
            trigger={
              <Button className="rounded-xl">
                <Plus aria-hidden /> Kategori baru
              </Button>
            }
          >
            <CategoryFields />
          </FormDialog>
        }
      />
      {categories.length === 0 ? (
        <EmptyState title="Belum ada kategori" />
      ) : (
        <Card className="py-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-xl text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">Kategori</th>
                  <th className="px-3 py-3 font-medium">Perilaku dasar</th>
                  <th className="px-3 py-3 font-medium">Dipakai</th>
                  <th className="px-5 py-3 text-right font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {categories.map((c) => (
                  <tr key={c.id} className={cn(!c.isActive && "opacity-55")}>
                    <td className="px-5 py-3 font-medium">
                      {c.name}
                      {!c.isActive && (
                        <Badge variant="outline" className="ml-2">
                          Nonaktif
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {EXAM_KIND_LABEL[c.kind]}
                      {isHighStakes(c.kind) && " · Safe Exam Browser"}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{c._count.exams} ujian</td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1">
                        <FormDialog
                          title={`Ubah ${c.name}`}
                          description="Ujian yang sudah ada tetap memakai perilaku saat disimpan."
                          action={updateCategory.bind(null, c.id)}
                          trigger={
                            <Button variant="ghost" size="icon-sm" aria-label={`Ubah ${c.name}`} title="Ubah">
                              <Pencil />
                            </Button>
                          }
                        >
                          <CategoryFields defaults={c} />
                        </FormDialog>
                        <ActionButton
                          action={setCategoryActive.bind(null, c.id, !c.isActive)}
                          variant="ghost"
                          size="icon-sm"
                          aria-label={c.isActive ? `Nonaktifkan ${c.name}` : `Aktifkan ${c.name}`}
                          title={c.isActive ? "Nonaktifkan" : "Aktifkan"}
                        >
                          <Power className={c.isActive ? "text-destructive" : "text-emerald-600"} />
                        </ActionButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
