import { db } from "@/lib/db"
import { authenticate, json } from "@/lib/mobile/http"

/** GET /api/v1/mobile/me — profil & kelas (untuk menu aplikasi). */
export async function GET(request: Request) {
  const ctx = await authenticate(request, { allowPasswordChange: true })
  if (ctx instanceof Response) return ctx
  const { user } = ctx
  const classes = await db.groupMember.findMany({
    where: { userId: user.id, status: { in: ["ACTIVE", "PENDING"] }, group: { archivedAt: null } },
    orderBy: { joinedAt: "desc" },
    select: { role: true, status: true, group: { select: { id: true, name: true, term: true, owner: { select: { name: true } }, subject: { select: { code: true, name: true } } } } },
  })
  return json({
    user: { id: user.id, name: user.name, email: user.email, username: user.username, role: user.role, mustChangePassword: user.mustChangePassword },
    classes: classes.map((m) => ({ id: m.group.id, name: m.group.name, term: m.group.term, owner: m.group.owner?.name ?? null, subject: m.group.subject, role: m.role, status: m.status })),
  })
}
