import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { CheckCircle2 } from "lucide-react"
import { safeCallbackUrl } from "@/lib/auth/roles"
import { googleSignIn } from "@/lib/auth/public-actions"
import { getAuthSettings, getTexts } from "@/lib/site/config"
import { AuthShell } from "@/components/auth/auth-shell"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { LoginForm } from "./login-form"

export const metadata: Metadata = { title: "Masuk" }

/** Pesan dari redirect (?reset=1, ?error=google_…). */
const NOTICES: Record<string, { ok?: boolean; text: string }> = {
  reset: { ok: true, text: "Password berhasil diatur ulang. Silakan masuk dengan password baru." },
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
  const notice = first(sp.reset) ? NOTICES.reset : error ? (NOTICES[error] ?? (error.startsWith("google") || error === "AccessDenied" ? { text: "Masuk dengan Google gagal. Coba lagi." } : null)) : null

  return (
    <div className="flex flex-col gap-4">
      {notice && (
        <Alert variant={notice.ok ? "default" : "destructive"} aria-live="polite">
          {notice.ok && <CheckCircle2 aria-hidden />}
          <AlertDescription>{notice.text}</AlertDescription>
        </Alert>
      )}
      <LoginForm callbackUrl={callbackUrl} submitLabel={submitLabel} />
      {google && (
        <>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> atau <span className="h-px flex-1 bg-border" />
          </div>
          <form action={googleSignIn}>
            {callbackUrl && <input type="hidden" name="callbackUrl" value={callbackUrl} />}
            <Button type="submit" variant="outline" className="h-11 w-full rounded-xl text-base">
              <GoogleIcon /> Masuk dengan Google
            </Button>
          </form>
        </>
      )}
    </div>
  )
}

/** Logo "G" Google (sesuai panduan tombol Sign in with Google). */
function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z" />
      <path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z" />
    </svg>
  )
}
