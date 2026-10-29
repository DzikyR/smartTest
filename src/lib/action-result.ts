import type { z } from "zod"

/** Bentuk hasil standar semua Server Action (aman diserialisasi ke klien). */
export type ActionResult<T = undefined> =
  | { ok: true; message?: string; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

export const initialActionState = { ok: false, error: "" } as ActionResult<never>

export function ok<T>(message?: string, data?: T): ActionResult<T> {
  return { ok: true, message, data }
}

export function fail(error: string, fieldErrors?: Record<string, string>): ActionResult<never> {
  return { ok: false, error, fieldErrors }
}

/** Pesan error Zod per field (pesan pertama tiap field). */
export function zodFieldErrors(error: z.ZodError) {
  const fieldErrors: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.join(".")
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message
  }
  return fieldErrors
}

export function zodFail(error: z.ZodError): ActionResult<never> {
  return fail("Periksa kembali isian yang ditandai.", zodFieldErrors(error))
}

/** Kode error Prisma (P2002 unik, P2003 foreign key, P2025 tidak ditemukan). */
export function prismaCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined
}

/** Ambil semua field FormData sebagai objek (nilai pertama tiap key). */
export function formObject(formData: FormData) {
  const obj: Record<string, FormDataEntryValue> = {}
  for (const [key, value] of formData) if (!(key in obj) && !key.startsWith("$ACTION")) obj[key] = value
  return obj
}
