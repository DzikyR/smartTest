import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { findValidResetToken } from "@/lib/auth/account"
import { resetPasswordWithToken } from "@/lib/auth/public-actions"
import { AuthShell } from "@/components/auth/auth-shell"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { buttonVariants } from "@/components/ui/button"
import { ResetForm } from "./reset-form"

export const metadata: Metadata = { title: "Atur Ulang Password", referrer: "no-referrer" }

export default function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  return (
    <AuthShell title="Atur password baru" subtitle="Setelah disimpan, semua sesi lama di perangkat lain otomatis keluar.">
      <Suspense>
        <ResetGate searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  )
}

async function ResetGate({ searchParams }: { searchParams: PageProps<"/reset-password">["searchParams"] }) {
  const raw = (await searchParams).token
  const token = Array.isArray(raw) ? raw[0] : raw
  const row = await findValidResetToken(token)
  if (!row || !token) {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="destructive">
          <AlertDescription>Tautan reset tidak valid, sudah dipakai, atau sudah kedaluwarsa.</AlertDescription>
        </Alert>
        <Link href="/lupa-password" className={buttonVariants({ className: "h-11 rounded-xl" })}>
          Minta tautan baru
        </Link>
      </div>
    )
  }
  return <ResetForm email={row.user.email} action={resetPasswordWithToken.bind(null, token)} />
}
