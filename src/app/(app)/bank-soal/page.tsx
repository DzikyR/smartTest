import type { Metadata } from "next"
import Link from "next/link"
import { Check, FileUp, Layers, Pencil, Plus } from "lucide-react"
import type { Prisma, QuestionType } from "@/generated/prisma/client"
import { db } from "@/lib/db"
import { requireRole } from "@/lib/auth/dal"
import { enabledFeatures } from "@/lib/features/access"
import { STAFF } from "@/lib/auth/roles"
import { listManagedSubjects } from "@/lib/data/access"
import { DIFFICULTY_LABEL, QUESTION_TYPE_LABEL, QUESTION_TYPE_SHORT, SUBJECT_TYPE_LABEL } from "@/lib/labels"
import { QUESTION_TYPES } from "@/lib/exam/question-input"
import { cn } from "@/lib/utils"
import { EmptyState, PageHeader, Pagination, parsePage, SearchForm, str } from "@/components/shell/page-parts"
import { FormDialog } from "@/components/forms/form-dialog"
import { NativeSelect } from "@/components/forms/native-select"
import { QuestionFields } from "@/components/question/question-fields"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { createQuestion, updateQuestion } from "./actions"
import { BulkDeleteButton, SelectAll } from "./bulk-delete"

export const metadata: Metadata = { title: "Bank Soal" }

const PAGE_SIZE = 20
type Option = { id: string; text: string }
type AnswerKey = { optionId?: string; value?: boolean; accepted?: string[] } | null
const TYPE_TINT: Record<QuestionType, string> = {
  MULTIPLE_CHOICE: "bg-tint-violet text-tint-violet-fg",
  TRUE_FALSE: "bg-tint-sky text-tint-sky-fg",
  SHORT_ANSWER: "bg-tint-green text-tint-green-fg",
  ESSAY: "bg-tint-orange text-tint-orange-fg",
}

export default async function QuestionBankPage({ searchParams }: PageProps<"/bank-soal">) {
  const user = await requireRole(...STAFF)
  const features = await enabledFeatures(user.role)
  const sp = await searchParams
  const subjects = await listManagedSubjects(user)
  const subject = subjects.find((s) => s.id === str(sp.subject)) ?? subjects[0]

  if (!subject) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Bank Soal" />
        <EmptyState title="Belum ada mata uji" description="Bank soal dikelola per mata uji. Buat mata uji terlebih dahulu." action={<Link href="/mata-uji" className={buttonVariants({ className: "rounded-xl" })}>Buat mata uji</Link>} />
      </div>
    )
  }

  const q = str(sp.q)
  const topic = str(sp.topic)
  const type = QUESTION_TYPES.find((t) => t === str(sp.type))
  const difficulty = [1, 2, 3].find((d) => String(d) === str(sp.difficulty))
  const page = parsePage(sp.page)
  const where: Prisma.QuestionWhereInput = {
    subjectId: subject.id,
    ...(topic ? { topic } : {}),
    ...(type ? { type } : {}),
    ...(difficulty ? { difficulty } : {}),
    ...(q ? { prompt: { contains: q, mode: "insensitive" } } : {}),
  }

  const [topics, byType, total, items] = await Promise.all([
    db.question.groupBy({ by: ["topic"], where: { subjectId: subject.id, topic: { not: null } }, _count: true, orderBy: { topic: "asc" } }),
    db.question.groupBy({ by: ["type"], where: { subjectId: subject.id }, _count: true }),
    db.question.count({ where }),
    db.question.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { createdBy: { select: { name: true } } },
    }),
  ])
  const params = { subject: subject.id, q, topic, type, difficulty: difficulty ? String(difficulty) : undefined }
  const bankTotal = byType.reduce((s, t) => s + t._count, 0)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Bank Soal"
        description="Kumpulan soal per mata uji — dipakai ulang untuk kuis, UTS, UAS, dan tes umum. Soal disalin saat dimasukkan ke ujian."
        actions={
          <>
            {features.includes("bank-soal.impor") && (
              <Link href={`/bank-soal/impor?subject=${subject.id}`} className={buttonVariants({ variant: "outline", className: "rounded-xl" })}>
                <FileUp aria-hidden /> Impor Word/Excel
              </Link>
            )}
            {features.includes("bank-soal.massal") && (
              <Link href={`/bank-soal/massal?subject=${subject.id}`} className={buttonVariants({ variant: "outline", className: "rounded-xl" })}>
                <Layers aria-hidden /> Buat massal
              </Link>
            )}
            <FormDialog
              title="Tambah Soal"
              description={`${subject.code} · ${subject.name}`}
              action={createQuestion.bind(null, subject.id)}
              wide
              trigger={
                <Button className="rounded-xl">
                  <Plus aria-hidden /> Tambah soal
                </Button>
              }
            >
              <QuestionFields bank />
            </FormDialog>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <form action="/bank-soal" className="flex flex-col gap-1.5">
          <label htmlFor="subject" className="text-xs font-medium text-muted-foreground">
            Mata uji
          </label>
          <div className="flex gap-2">
            <NativeSelect id="subject" name="subject" defaultValue={subject.id} className="h-10 rounded-xl bg-card sm:min-w-80">
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} · {s.name} ({SUBJECT_TYPE_LABEL[s.type]})
                </option>
              ))}
            </NativeSelect>
            <Button type="submit" variant="secondary" className="h-10 rounded-xl">
              Buka
            </Button>
          </div>
        </form>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-card px-3 py-1.5 text-sm font-semibold ring-1 ring-border/60">{bankTotal} soal</span>
          {byType.map((t) => (
            <span key={t.type} className={cn("rounded-full px-3 py-1.5 text-xs font-semibold", TYPE_TINT[t.type])}>
              {QUESTION_TYPE_SHORT[t.type]} {t._count}
            </span>
          ))}
        </div>
      </div>

      <SearchForm basePath="/bank-soal" params={params} placeholder="Cari teks soal…">
        <input type="hidden" name="subject" value={subject.id} />
        <NativeSelect name="type" defaultValue={type ?? ""} aria-label="Jenis soal" className="sm:w-40">
          <option value="">Semua jenis</option>
          {QUESTION_TYPES.map((t) => (
            <option key={t} value={t}>
              {QUESTION_TYPE_LABEL[t]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect name="topic" defaultValue={topic ?? ""} aria-label="Topik" className="sm:w-44">
          <option value="">Semua topik</option>
          {topics.map((t) => (
            <option key={t.topic} value={t.topic!}>
              {t.topic} ({t._count})
            </option>
          ))}
        </NativeSelect>
        <NativeSelect name="difficulty" defaultValue={difficulty ? String(difficulty) : ""} aria-label="Kesulitan" className="sm:w-36">
          <option value="">Semua tingkat</option>
          {[1, 2, 3].map((d) => (
            <option key={d} value={d}>
              {DIFFICULTY_LABEL[d]}
            </option>
          ))}
        </NativeSelect>
      </SearchForm>

      {items.length === 0 ? (
        <EmptyState
          title={bankTotal === 0 ? "Bank soal masih kosong" : "Tidak ada soal yang cocok"}
          description="Tambah satu per satu, buat banyak soal sekaligus, atau impor dari Word/Excel memakai templat SmartTest."
          action={
            features.includes("bank-soal.impor") && (
              <Link href={`/bank-soal/impor?subject=${subject.id}`} className={buttonVariants({ size: "sm" })}>
                <FileUp aria-hidden /> Impor soal
              </Link>
            )
          }
        />
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <SelectAll formId="bank-items" />
            <BulkDeleteButton formId="bank-items" />
          </div>
          <form id="bank-items" className="flex flex-col gap-3">
            {items.map((item, i) => {
              const options = (item.options as Option[] | null) ?? []
              const key = item.answerKey as AnswerKey
              const no = (page - 1) * PAGE_SIZE + i + 1
              return (
                <article key={item.id} className="flex gap-3 rounded-2xl bg-card p-4 ring-1 ring-border/60">
                  <input type="checkbox" name="ids" value={item.id} className="mt-1 size-4 shrink-0 accent-primary" aria-label={`Pilih soal ${no}`} />
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className={cn("rounded-full px-2.5 py-0.5 font-semibold", TYPE_TINT[item.type])}>{QUESTION_TYPE_LABEL[item.type]}</span>
                      <span className="text-muted-foreground">
                        {item.points} poin · {DIFFICULTY_LABEL[item.difficulty]}
                      </span>
                      {item.topic && <Badge variant="outline">{item.topic}</Badge>}
                      <span className="ml-auto text-muted-foreground">#{no}</span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{item.prompt}</p>
                    {item.type === "MULTIPLE_CHOICE" && (
                      <ul className="grid gap-1 text-sm sm:grid-cols-2">
                        {options.map((o, j) => (
                          <li key={o.id} className={cn("flex gap-2 rounded-lg px-2 py-1", o.id === key?.optionId ? "bg-tint-green font-medium text-tint-green-fg" : "bg-muted/60")}>
                            <span className="font-semibold">{String.fromCharCode(65 + j)}.</span>
                            <span className="min-w-0 flex-1">{o.text}</span>
                            {o.id === key?.optionId && <Check className="size-4 shrink-0" aria-label="Jawaban benar" />}
                          </li>
                        ))}
                      </ul>
                    )}
                    {item.type === "TRUE_FALSE" && <p className="text-sm text-tint-green-fg">Kunci: {key?.value ? "Benar" : "Salah"}</p>}
                    {item.type === "SHORT_ANSWER" && <p className="text-sm text-tint-green-fg">Diterima: {key?.accepted?.join(" / ")}</p>}
                    {item.createdBy && <p className="text-xs text-muted-foreground">Dibuat oleh {item.createdBy.name}</p>}
                  </div>
                  <FormDialog
                    title={`Ubah Soal #${no}`}
                    action={updateQuestion.bind(null, item.id)}
                    wide
                    trigger={
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Ubah soal ${no}`} title="Ubah">
                        <Pencil />
                      </Button>
                    }
                  >
                    <QuestionFields defaults={{ ...item, options, answerKey: key }} bank />
                  </FormDialog>
                </article>
              )
            })}
          </form>
        </>
      )}
      <Pagination basePath="/bank-soal" params={params} page={page} pageCount={Math.ceil(total / PAGE_SIZE)} total={total} />
    </div>
  )
}
