import type { Metadata } from "next"
import { Suspense } from "react"
import { CheckCircle2, ClipboardCheck, FileSpreadsheet, GraduationCap, ShieldCheck } from "lucide-react"
import { safeCallbackUrl } from "@/lib/auth/roles"
import { LoginForm } from "./login-form"

export const metadata: Metadata = { title: "Masuk" }

const POINTS = [
  { icon: ClipboardCheck, text: "Kuis, UTS, UAS, dan tes umum dalam satu tempat" },
  { icon: FileSpreadsheet, text: "Impor soal dari Word & Excel, buat puluhan soal sekaligus" },
  { icon: ShieldCheck, text: "Pengamanan ujian: layar penuh, satu perangkat, Safe Exam Browser" },
]

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <div className="grid min-h-svh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-gradient-to-br from-primary via-[oklch(0.48_0.21_285)] to-[oklch(0.4_0.18_295)] p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -top-24 -right-24 size-80 rounded-full bg-white/10" aria-hidden />
        <div className="absolute -bottom-32 -left-16 size-96 rounded-full bg-white/5" aria-hidden />
        <div className="relative flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
            <GraduationCap className="size-6" aria-hidden />
          </span>
          <span className="text-2xl font-bold tracking-tight">SmartTest</span>
        </div>
        <div className="relative max-w-md">
          <h1 className="text-4xl leading-tight font-bold">Ujian online yang rapi, cepat, dan aman.</h1>
          <p className="mt-4 text-primary-foreground/80">Kelola mata uji, bank soal, dan jadwal ujian — peserta mengerjakan dengan tampilan CBT yang nyaman.</p>
          <ul className="mt-8 flex flex-col gap-3">
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 rounded-2xl bg-white/10 p-3 backdrop-blur">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/15">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="text-sm">{text}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative flex items-center gap-2 text-sm text-primary-foreground/70">
          <CheckCircle2 className="size-4" aria-hidden /> Jawaban tersimpan otomatis selama ujian
        </p>
      </section>

      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <GraduationCap className="size-5" aria-hidden />
            </span>
            <span className="text-xl font-bold">
              Smart<span className="text-primary">Test</span>
            </span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight">Selamat datang 👋</h2>
          <p className="mt-1 mb-6 text-sm text-muted-foreground">Masuk untuk mengelola atau mengerjakan ujian.</p>
          <Suspense>
            <LoginWithCallback searchParams={searchParams} />
          </Suspense>
        </div>
      </section>
    </div>
  )
}

async function LoginWithCallback({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const sp = await searchParams
  const raw = Array.isArray(sp.callbackUrl) ? sp.callbackUrl[0] : sp.callbackUrl
  return <LoginForm callbackUrl={safeCallbackUrl(raw, "") || undefined} />
}
