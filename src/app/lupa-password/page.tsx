import type { Metadata } from "next"
import Link from "next/link"
import { RESET_TOKEN_TTL_MINUTES } from "@/lib/auth/account"
import { AuthShell } from "@/components/auth/auth-shell"
import { ForgotForm } from "./forgot-form"

export const metadata: Metadata = { title: "Lupa Password" }

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Lupa password" subtitle={`Masukkan email akun Anda. Kami kirimkan tautan untuk mengatur password baru (berlaku ${RESET_TOKEN_TTL_MINUTES} menit).`}>
      <ForgotForm />
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Ingat password?{" "}
        <Link href="/login" className="font-semibold text-primary hover:underline">
          Masuk
        </Link>
      </p>
    </AuthShell>
  )
}
