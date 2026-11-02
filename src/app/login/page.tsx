import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { CheckCircle2 } from "lucide-react"
import { safeCallbackUrl } from "@/lib/auth/roles"
import { getAuthSettings, getTexts } from "@/lib/site/config"
import { AuthShell } from "@/components/auth/auth-shell"
import { GoogleButton } from "@/components/auth/google-button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { LoginForm } from "./login-form"

export const metadata: Metadata = { title: "Masuk" }

/** Pesan dari redirect (?reset=1, ?error=google_…). */
const NOTICES: Record<string, { ok?: boolean; text: string }> = {
  reset: { ok: true, text: "Password berhasil diatur ulang. Silakan masuk dengan password baru." },
  expired: { text: "Sesi Anda telah berakhir. Silakan masuk kembali." },
  google_disabled: { text: "Masuk dengan Google sedang dinonaktifkan." },
  google_unverified: { text: "Email akun Google Anda belum terverifikasi." },
  google_inactive: { text: "Akun Anda dinonaktifkan. Hubungi admin." },
  google_closed: { text: "Pendaftaran akun baru sedang ditutup. Hubungi admin untuk dibuatkan akun." },
  google_conflict: { text: "Email ini sudah tertaut dengan akun Google lain." },
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const [t, settings] = await Promise.all([getTexts(), getAuthSettings()])
  return (
    <AuthShell title={t["login.title"]} subtitle={t["login.subtitle"]}>
      <Suspense>
        <LoginWithCallback searchParams={searchParams} submitLabel={t["login.cta"]} google={settings.googleLogin} />
      </Suspense>
      {settings.registrationOpen && (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Belum punya akun?{" "}
          <Link href="/daftar" className="font-semibold text-primary hover:underline">
            Daftar
          </Link>
        </p>
      )}
    </AuthShell>
  )
}

async function LoginWithCallback({ searchParams, submitLabel, google }: { searchParams: PageProps<"/login">["searchParams"]; submitLabel: string; google: boolean }) {
  const sp = await searchParams
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  const callbackUrl = safeCallbackUrl(first(sp.callbackUrl), "") || undefined
  const error = first(sp.error)
  const notice = first(sp.reset) ? NOTICES.reset : first(sp.expired) ? NOTICES.expired : error ? (NOTICES[error] ?? (error.startsWith("google") || error === "AccessDenied" ? { text: "Masuk dengan Google gagal. Coba lagi." } : null)) : null

  return (
    <div className="flex flex-col gap-4">
      {notice && (
        <Alert variant={notice.ok ? "default" : "destructive"} aria-live="polite">
          {notice.ok && <CheckCircle2 aria-hidden />}
          <AlertDescription>{notice.text}</AlertDescription>
        </Alert>
      )}
      <LoginForm callbackUrl={callbackUrl} submitLabel={submitLabel} />
      {google && <GoogleButton label="Masuk dengan Google" callbackUrl={callbackUrl} />}
    </div>
  )
}
