import { db } from "@/lib/db"
import { navFor } from "@/components/shell/nav"
import { enabledFeatures } from "@/lib/features/access"
import { getTexts } from "@/lib/site/config"
import { authenticate, json } from "@/lib/mobile/http"

/** Menu web yang sudah tersedia di aplikasi (urutan & label tetap mengikuti web). */
const MOBILE_ROUTES = new Set(["/dashboard", "/kelas", "/ujian", "/hasil", "/profil"])

/**
 * GET /api/v1/mobile/me — profil, kelas, dan menu navigasi. Menu dihitung dengan navFor()
 * yang sama dengan sidebar web: label dari Tampilan Situs, item disembunyikan bila fiturnya
 * dinonaktifkan di Kontrol Fitur.
 */
export async function GET(request: Request) {
  const ctx = await authenticate(request, { allowPasswordChange: true })
  if (ctx instanceof Response) return ctx
  const { user } = ctx
  const [classes, features, texts] = await Promise.all([
    db.groupMember.findMany({
      where: { userId: user.id, status: { in: ["ACTIVE", "PENDING"] }, group: { archivedAt: null } },
      orderBy: { joinedAt: "desc" },
      select: { role: true, status: true, group: { select: { id: true, name: true, term: true, owner: { select: { name: true } }, subject: { select: { code: true, name: true } } } } },
    }),
    enabledFeatures(user.role),
    getTexts(),
  ])
  const nav = navFor(user.role, features, texts)
    .map((s) => ({ title: s.title ?? null, items: s.items.filter((i) => MOBILE_ROUTES.has(i.href)).map((i) => ({ href: i.href, label: i.label })) }))
    .filter((s) => s.items.length > 0)
  return json({
    user: { id: user.id, name: user.name, email: user.email, username: user.username, role: user.role, mustChangePassword: user.mustChangePassword },
    classes: classes.map((m) => ({ id: m.group.id, name: m.group.name, term: m.group.term, owner: m.group.owner?.name ?? null, subject: m.group.subject, role: m.role, status: m.status })),
    nav,
    features,
  })
}
