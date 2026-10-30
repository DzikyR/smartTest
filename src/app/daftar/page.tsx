import type { Metadata } from "next"
import Link from "next/link"
import { getAuthSettings } from "@/lib/site/config"
import { AuthShell } from "@/components/auth/auth-shell"
import { GoogleButton } from "@/components/auth/google-button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { RegisterForm } from "./register-form"

export const metadata: Metadata = { title: "Daftar" }

export default async function RegisterPage() {
  const { registrationOpen, googleLogin } = await getAuthSettings()
  return (
    <AuthShell title="Buat akun" subtitle="Daftar sebagai peserta. Setelah masuk, gabung ke kelas atau ujian memakai kode dari pengajar/panitia.">
      {registrationOpen ? (
        <div className="flex flex-col gap-4">
          <RegisterForm />
          {/* Email Google yang belum terdaftar otomatis dibuatkan akun Peserta */}
          {googleLogin && <GoogleButton label="Daftar dengan Google" />}
        </div>
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
