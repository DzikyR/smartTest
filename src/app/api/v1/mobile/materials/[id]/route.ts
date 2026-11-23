import { z } from "zod"
import { db } from "@/lib/db"
import { getMaterialAccess } from "@/lib/classes/materials"
import { attachmentOut } from "@/lib/mobile/lms"
import { authenticate, error, json, ms, readJson } from "@/lib/mobile/http"

const NOT_FOUND = "Postingan tidak ditemukan."

/** Akses sama dengan halaman materi web (getMaterialAccess, anti-IDOR): mahasiswa anggota aktif & postingan terbit. */
async function access(request: Request, id: string) {
  const ctx = await authenticate(request, { roles: ["PESERTA"] })
  if (ctx instanceof Response) return ctx
  const row = await db.material.findUnique({ where: { id }, select: { groupId: true } })
  const found = row ? await getMaterialAccess(ctx.user, row.groupId, id) : null
  if (!found) return error(404, "NOT_FOUND", NOT_FOUND)
  return { ctx, material: found.material }
}

/** GET /api/v1/mobile/materials/[id] — isi postingan, lampiran, dan status "selesai dibaca". */
export async function GET(request: Request, { params }: RouteContext<"/api/v1/mobile/materials/[id]">) {
  const { id } = await params
  const found = await access(request, id)
  if (found instanceof Response) return found
  const { ctx, material: m } = found
  const [done, comments] = await Promise.all([
    db.materialProgress.count({ where: { materialId: id, userId: ctx.user.id } }),
    db.materialComment.count({ where: { materialId: id } }),
  ])
  return json({
    id: m.id,
    classId: m.groupId,
    kind: m.kind,
    title: m.title,
    content: m.content,
    topic: m.topic?.name ?? null,
    publishedAt: ms(m.publishedAt),
    attachments: m.attachments.map(attachmentOut),
    work: m.exam ? { examId: m.exam.id, title: m.exam.title, workType: m.exam.workType, dueAt: ms(m.exam.dueAt), maxPoints: m.exam.maxPoints, startAt: ms(m.exam.startAt), endAt: ms(m.exam.endAt) } : null,
    done: done > 0,
    comments,
  })
}

const doneSchema = z.object({ done: z.boolean() })

/** POST /api/v1/mobile/materials/[id]  { done } — tandai/batalkan "Selesai dibaca" (hanya jenis Materi). */
export async function POST(request: Request, { params }: RouteContext<"/api/v1/mobile/materials/[id]">) {
  const { id } = await params
  const found = await access(request, id)
  if (found instanceof Response) return found
  if (found.material.kind !== "MATERI") return error(404, "NOT_FOUND", NOT_FOUND)
  const body = await readJson(request, doneSchema)
  if (body instanceof Response) return body
  const userId = found.ctx.user.id
  if (body.done) await db.materialProgress.upsert({ where: { materialId_userId: { materialId: id, userId } }, create: { materialId: id, userId }, update: {} })
  else await db.materialProgress.deleteMany({ where: { materialId: id, userId } })
  return json({ done: body.done })
}
