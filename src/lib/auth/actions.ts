"use server"

import { redirect } from "next/navigation"
import { AuthError, CredentialsSignin } from "next-auth"
import { signIn, signOut } from "@/auth"
import { HOME, safeCallbackUrl } from "@/lib/auth/roles"

export type LoginState = { error?: string; identifier?: string }

const ERROR_MESSAGES: Record<string, string> = {
  account_locked: "Akun dikunci sementara karena terlalu banyak percobaan gagal. Coba lagi dalam 15 menit.",
  rate_limited: "Terlalu banyak percobaan login dari jaringan Anda. Coba lagi nanti.",
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const identifier = String(formData.get("identifier") ?? "")
  const callback = safeCallbackUrl(formData.get("callbackUrl"), HOME)
  try {
    await signIn("credentials", { identifier, password: String(formData.get("password") ?? ""), redirect: false })
  } catch (error) {
    if (error instanceof CredentialsSignin) return { identifier, error: ERROR_MESSAGES[error.code] ?? "Email/NIM atau password salah." }
    if (error instanceof AuthError) return { identifier, error: "Login gagal. Silakan coba lagi." }
    throw error
  }
  redirect(callback)
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" })
}
