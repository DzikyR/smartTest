import type { Metadata } from "next"
import Link from "next/link"
import { getAuthSettings } from "@/lib/site/config"
import { AuthShell } from "@/components/auth/auth-shell"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { RegisterForm } from "./register-form"

export const metadata: Metadata = { title: "Daftar" }

export default async function RegisterPage() {
  const { registrationOpen } = await getAuthSettings()
  return (
    <AuthShell title="Buat akun" subtitle="Daftar sebagai peserta. Setelah masuk, gabung ke kelas atau ujian memakai kode dari pengajar/panitia.">
      {registrationOpen ? (
        <RegisterForm />
      ) : (
        <Alert>
          <AlertDescription>Pendaftaran akun baru sedang ditutup. Hubungi admin untuk dibuatkan akun.</AlertDescription>
        </Alert>
      )}
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Sudah punya akun?{" "}
        <Link href="/login" className="font-semibold text-primary hover:underline">
          Masuk
        </Link>
      </p>
    </AuthShell>
  )
}
