import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import { KeyRound, ShieldAlert } from "lucide-react"
import { getCurrentUser } from "@/lib/auth/dal"
import { SESSION_EXPIRED_URL } from "@/lib/auth/roles"
import { PasswordForm } from "@/components/password-form"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export const metadata: Metadata = { title: "Ganti Password" }

export default function ChangePasswordPage() {
  return (
    <main className="flex min-h-svh items-center justify-center px-4 py-12">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <KeyRound className="size-5 text-primary" aria-hidden /> Ganti Password
          </CardTitle>
          <CardDescription>Setelah diganti, Anda keluar dari semua perangkat dan masuk kembali dengan password baru.</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <Section />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  )
}

async function Section() {
  const user = await getCurrentUser()
  if (!user) redirect(SESSION_EXPIRED_URL)
  return (
    <div className="flex flex-col gap-4">
      {user.mustChangePassword && (
        <Alert>
          <ShieldAlert aria-hidden />
          <AlertDescription>Anda masih memakai password sementara. Buat password pribadi sebelum melanjutkan.</AlertDescription>
        </Alert>
      )}
      <PasswordForm />
    </div>
  )
}
