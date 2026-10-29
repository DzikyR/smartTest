import type { Metadata } from "next"
import Link from "next/link"
import { CheckCircle2 } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"

export const metadata: Metadata = { title: "Ujian Selesai" }

/** Tujuan "Quit URL" konfigurasi Safe Exam Browser: membuka halaman ini menutup SEB. */
export default function ExamFinishedPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <span className="flex size-16 items-center justify-center rounded-2xl bg-tint-green text-tint-green-fg">
        <CheckCircle2 className="size-8" aria-hidden />
      </span>
      <h1 className="text-xl font-bold">Ujian selesai</h1>
      <p className="text-sm text-muted-foreground">Jawaban Anda sudah tersimpan. Bila memakai Safe Exam Browser, aplikasi akan tertutup otomatis.</p>
      <Link href="/ujian" className={buttonVariants({ variant: "outline", className: "rounded-xl" })}>
        Kembali ke daftar ujian
      </Link>
    </div>
  )
}
