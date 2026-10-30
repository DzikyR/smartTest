"use server"

import { refresh } from "next/cache"
import { z } from "zod"
import { db } from "@/lib/db"
import { audit } from "@/lib/audit"
import { requireRole, type CurrentUser } from "@/lib/auth/dal"
import { STAFF } from "@/lib/auth/roles"
import { getManagedExam } from "@/lib/data/access"
import { isFeatureEnabled } from "@/lib/features/access"
import { FEATURE_DISABLED } from "@/lib/features/registry"
import { createSessionCode } from "@/lib/classes/codes"
import { checkbox, optionalLocalDateTime } from "@/lib/validation"
import { fail, formObject, ok, zodFail, type ActionResult } from "@/lib/action-result"

const NOT_FOUND = "Sesi tidak ditemukan atau di luar kewenangan Anda."

async function requireOrganizer() {
  const user = await requireRole(...STAFF)
  return (await isFeatureEnabled("sesi.kelola", user.role)) ? user : null
}

/** Sesi milik ujian yang dikelola actor (anti-IDOR: id sesi dari klien selalu dicocokkan ke ujian yang dikelola). */
async function managedSession(user: CurrentUser | null, sessionId: string) {
  if (!user) return null
  const session = await db.examSession.findUnique({ where: { id: sessionId }, select: { id: true, examId: true, name: true } })
  return session && (await getManagedExam(user, session.examId)) ? session : null
}

const sessionSchema = z
  .object({
    name: z.string().trim().min(2, "Minimal 2 karakter").max(80, "Maksimal 80 karakter"),
    opensAt: optionalLocalDateTime,
    closesAt: optionalLocalDateTime,
    capacity: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? Number(v) : null))
      .pipe(z.number().int("Bilangan bulat").min(1, "Minimal 1").max(100_000).nullable()),
    requireStudentId: checkbox,
  })
  .superRefine((v, ctx) => {
    if (v.opensAt && v.closesAt && v.closesAt <= v.opensAt) ctx.addIssue({ code: "custom", path: ["closesAt"], message: "Batas masuk harus setelah waktu buka" })
  })

export async function createSession(examId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireOrganizer()
  if (!user) return fail(FEATURE_DISABLED)
  const exam = await getManagedExam(user, examId)
  if (!exam) return fail("Ujian tidak ditemukan atau di luar kewenangan Anda.")
  if (exam.workType === "ASSIGNMENT") return fail("Sesi publik hanya untuk ujian (bukan Tugas).")
  const parsed = sessionSchema.safeParse(formObject(formData))
  if (!parsed.success) return zodFail(parsed.error)
  const session = await db.$transaction(async (tx) => {
    const s = await tx.examSession.create({ data: { ...parsed.data, examId, createdById: user.id }, select: { id: true } })
    await createSessionCode(tx, s.id, user.id)
    return s
  })
  await audit("SESSION_CREATED", { userId: user.id, entity: "ExamSession", entityId: session.id, metadata: { examId } })
  refresh()
  return ok(`Sesi "${parsed.data.name}" dibuat. Bagikan kodenya ke peserta.`)
}

export async function updateSession(sessionId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireOrganizer()
  const session = await managedSession(user, sessionId)
  if (!user || !session) return fail(NOT_FOUND)
  const parsed = sessionSchema.safeParse(formObject(formData))
  if (!parsed.success) return zodFail(parsed.error)
  await db.examSession.update({ where: { id: sessionId }, data: parsed.data })
  await audit("SESSION_UPDATED", { userId: user.id, entity: "ExamSession", entityId: sessionId })
  refresh()
  return ok("Sesi disimpan.")
}

/** Hentikan/lanjutkan sesi: dihentikan = tidak ada yang bisa bergabung atau MULAI (yang sedang mengerjakan tetap lanjut). */
export async function setSessionActive(sessionId: string, active: boolean): Promise<ActionResult> {
  const user = await requireOrganizer()
  if (!user || !(await managedSession(user, sessionId))) return fail(NOT_FOUND)
  await db.examSession.update({ where: { id: sessionId }, data: { isActive: active } })
  await audit(active ? "SESSION_RESUMED" : "SESSION_STOPPED", { userId: user.id, entity: "ExamSession", entityId: sessionId, severity: active ? "INFO" : "WARNING" })
  refresh()
  return ok(active ? "Sesi dibuka kembali." : "Sesi dihentikan — tidak ada peserta baru yang bisa bergabung atau mulai.")
}

/** Ganti kode (bocor): kode lama langsung mati; peserta yang sudah terdaftar tidak terpengaruh. */
export async function rotateSessionCode(sessionId: string): Promise<ActionResult> {
  const user = await requireOrganizer()
  if (!user || !(await managedSession(user, sessionId))) return fail(NOT_FOUND)
  const code = await db.$transaction(async (tx) => {
    await tx.accessCode.updateMany({ where: { sessionId, status: { not: "REVOKED" } }, data: { status: "REVOKED", revokedAt: new Date() } })
    return createSessionCode(tx, sessionId, user.id)
  })
  await audit("SESSION_CODE_ROTATED", { userId: user.id, entity: "ExamSession", entityId: sessionId, severity: "WARNING" })
  refresh()
  return ok(`Kode baru: ${code.code}. Kode lama sudah tidak berlaku.`)
}

export async function setSessionCodeEnabled(sessionId: string, enabled: boolean): Promise<ActionResult> {
  const user = await requireOrganizer()
  if (!user || !(await managedSession(user, sessionId))) return fail(NOT_FOUND)
  const r = await db.accessCode.updateMany({ where: { sessionId, status: enabled ? "DISABLED" : "ACTIVE" }, data: { status: enabled ? "ACTIVE" : "DISABLED" } })
  if (r.count === 0) return fail("Kode tidak ditemukan — buat kode baru.")
  await audit(enabled ? "SESSION_CODE_ENABLED" : "SESSION_CODE_DISABLED", { userId: user.id, entity: "ExamSession", entityId: sessionId })
  refresh()
  return ok(enabled ? "Kode diaktifkan." : "Kode dinonaktifkan.")
}

/** Keluarkan peserta dari sesi (salah masuk): tidak lagi melihat ujian & tidak bisa bergabung lagi lewat kode. */
export async function removeSessionParticipant(sessionId: string, userId: string): Promise<ActionResult> {
  const user = await requireOrganizer()
  if (!user || !(await managedSession(user, sessionId))) return fail(NOT_FOUND)
  const r = await db.sessionParticipant.updateMany({ where: { sessionId, userId, status: "ACTIVE" }, data: { status: "REMOVED", removedAt: new Date() } })
  if (r.count === 0) return fail("Peserta tidak ditemukan.")
  await audit("SESSION_PARTICIPANT_REMOVED", { userId: user.id, entity: "ExamSession", entityId: sessionId, severity: "WARNING", metadata: { participant: userId } })
  refresh()
  return ok("Peserta dikeluarkan dari sesi.")
}

export async function restoreSessionParticipant(sessionId: string, userId: string): Promise<ActionResult> {
  const user = await requireOrganizer()
  if (!user || !(await managedSession(user, sessionId))) return fail(NOT_FOUND)
  const r = await db.sessionParticipant.updateMany({ where: { sessionId, userId, status: "REMOVED" }, data: { status: "ACTIVE", removedAt: null } })
  if (r.count === 0) return fail("Peserta tidak ditemukan.")
  await audit("SESSION_PARTICIPANT_RESTORED", { userId: user.id, entity: "ExamSession", entityId: sessionId, metadata: { participant: userId } })
  refresh()
  return ok("Peserta dipulihkan.")
}
