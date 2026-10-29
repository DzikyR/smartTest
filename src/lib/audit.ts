import "server-only"
import { headers } from "next/headers"
import { db } from "@/lib/db"
import type { LogSeverity, Prisma } from "@/generated/prisma/client"
import { clientIp } from "@/lib/rate-limit"

/** Catat aktivitas penting admin ke audit_logs (dipanggil dari Server Action). */
export async function audit(
  action: string,
  opts: {
    userId?: string | null
    entity?: string
    entityId?: string
    severity?: LogSeverity
    metadata?: Prisma.InputJsonValue
  } = {}
) {
  const h = await headers()
  await db.auditLog.create({
    data: {
      action,
      severity: opts.severity ?? "INFO",
      userId: opts.userId ?? null,
      entity: opts.entity,
      entityId: opts.entityId,
      metadata: opts.metadata,
      ipAddress: clientIp(h),
      userAgent: h.get("user-agent")?.slice(0, 255) ?? null,
    },
  })
}
