import { Pause, Pencil, Play, Plus, RotateCcw, UserMinus } from "lucide-react"
import { db } from "@/lib/db"
import { appOrigin } from "@/lib/auth/account"
import { sessionWindow } from "@/lib/sessions/access"
import { formatDateTime, toDateTimeInput } from "@/lib/format"
import { cn } from "@/lib/utils"
import { EmptyState } from "@/components/shell/page-parts"
import { ActionButton } from "@/components/forms/action-button"
import { FormField } from "@/components/forms/action-form"
import { Checkbox } from "@/components/forms/checkbox"
import { ConfirmAction } from "@/components/forms/confirm-action"
import { FormDialog } from "@/components/forms/form-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { CodeDisplay } from "@/app/(app)/kelas/[id]/code-card"
import { qrDataUrl } from "@/lib/classes/qr"
import { createSession, removeSessionParticipant, restoreSessionParticipant, rotateSessionCode, setSessionActive, setSessionCodeEnabled, updateSession } from "../session-actions"

type SessionDefaults = { name: string; opensAt: Date | null; closesAt: Date | null; capacity: number | null; requireStudentId: boolean }

const WINDOW = {
  stopped: { label: "Dihentikan", className: "bg-tint-orange text-tint-orange-fg" },
  upcoming: { label: "Menunggu dibuka", className: "bg-tint-sky text-tint-sky-fg" },
  open: { label: "Dibuka", className: "bg-tint-green text-tint-green-fg" },
  closed: { label: "Batas masuk lewat", className: "bg-muted text-muted-foreground" },
} as const

function SessionFields({ defaults }: { defaults?: SessionDefaults }) {
  return (
    <>
      <FormField name="name" label="Nama sesi" hint="mis. “Gelombang 1 — Pagi”.">
        <Input id="name" name="name" defaultValue={defaults?.name} maxLength={80} required />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField name="opensAt" label="Mulai boleh mengerjakan (WIB)" hint="Kosong = ikut jadwal ujian.">
          <Input id="opensAt" name="opensAt" type="datetime-local" defaultValue={toDateTimeInput(defaults?.opensAt)} />
        </FormField>
        <FormField name="closesAt" label="Batas masuk (WIB)" hint="Setelah ini tidak bisa MULAI; yang sudah mulai tetap lanjut.">
          <Input id="closesAt" name="closesAt" type="datetime-local" defaultValue={toDateTimeInput(defaults?.closesAt)} />
        </FormField>
      </div>
      <FormField name="capacity" label="Kuota peserta (opsional)" hint="Kosong = tanpa batas.">
        <Input id="capacity" name="capacity" type="number" min={1} defaultValue={defaults?.capacity ?? ""} />
      </FormField>
      <Checkbox name="requireStudentId" label="Wajib NIM / nomor peserta" hint="Peserta tanpa NIM diminta melengkapinya saat memasukkan kode." defaultChecked={defaults?.requireStudentId} />
    </>
  )
}

/** Tab "Sesi Publik": jalur umum/event — kode instan + ruang tunggu, tanpa kelas. */
export async function SessionsTab({ examId, canManage }: { examId: string; canManage: boolean }) {
  const sessions = await db.examSession.findMany({
    where: { examId },
    orderBy: { createdAt: "asc" },
    include: {
      codes: { where: { status: { not: "REVOKED" } }, orderBy: { createdAt: "desc" }, take: 1 },
      participants: {
        orderBy: { joinedAt: "asc" },
        select: { status: true, joinedAt: true, user: { select: { id: true, name: true, username: true, email: true, attempts: { where: { examId }, select: { status: true }, orderBy: { attemptNo: "desc" }, take: 1 } } } },
      },
    },
  })
  const origin = appOrigin()
  const joinUrl = (code: string) => `${origin}/gabung?kode=${code}`
  const qrs = new Map(await Promise.all(sessions.flatMap((s) => (s.codes[0] ? [Promise.all([s.id, qrDataUrl(joinUrl(s.codes[0].code))] as const)] : []))))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Untuk tes umum/event: peserta memasukkan kode sesi lalu menunggu di ruang tunggu, tanpa perlu masuk kelas. Satu ujian bisa punya beberapa sesi (gelombang).
        </p>
        {canManage && (
          <FormDialog
            title="Sesi Baru"
            description="Kode sesi 6 karakter dibuat otomatis."
            action={createSession.bind(null, examId)}
            trigger={
              <Button className="rounded-xl">
                <Plus aria-hidden /> Buat sesi
              </Button>
            }
          >
            <SessionFields />
          </FormDialog>
        )}
      </div>

      {sessions.length === 0 && <EmptyState title="Belum ada sesi publik" description="Buat sesi bila ujian ini juga dibuka untuk peserta umum lewat kode akses." />}

      {sessions.map((s) => {
        const code = s.codes[0] ?? null
        const w = WINDOW[sessionWindow(s)]
        const active = s.participants.filter((p) => p.status === "ACTIVE")
        return (
          <Card key={s.id}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {s.name}
                <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", w.className)}>{w.label}</span>
                {s.requireStudentId && <Badge variant="outline">Wajib NIM</Badge>}
              </CardTitle>
              <CardDescription>
                {s.opensAt ? `Mulai ${formatDateTime(s.opensAt)}` : "Mulai mengikuti jadwal ujian"} · {s.closesAt ? `batas masuk ${formatDateTime(s.closesAt)}` : "tanpa batas masuk"} · {active.length}
                {s.capacity ? ` / ${s.capacity}` : ""} peserta
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {code ? (
                <div className="flex flex-col gap-3">
                  <CodeDisplay code={code.code} joinUrl={joinUrl(code.code)} className={s.name} qr={qrs.get(s.id)!} />
                  {code.status === "DISABLED" && <Badge variant="outline">Kode dinonaktifkan</Badge>}
                </div>
              ) : (
                canManage && <ActionButton action={rotateSessionCode.bind(null, s.id)}>Buat kode sesi</ActionButton>
              )}
              {canManage && (
                <div className="flex flex-wrap gap-2">
                  <FormDialog
                    title={`Ubah ${s.name}`}
                    action={updateSession.bind(null, s.id)}
                    trigger={
                      <Button variant="outline" size="sm">
                        <Pencil aria-hidden /> Ubah
                      </Button>
                    }
                  >
                    <SessionFields defaults={s} />
                  </FormDialog>
                  <ActionButton action={setSessionActive.bind(null, s.id, !s.isActive)} variant="outline" size="sm">
                    {s.isActive ? <Pause aria-hidden /> : <Play aria-hidden />} {s.isActive ? "Hentikan sesi" : "Lanjutkan sesi"}
                  </ActionButton>
                  {code && (
                    <>
                      <ConfirmAction
                        action={rotateSessionCode.bind(null, s.id)}
                        title="Ganti kode sesi?"
                        description="Kode lama langsung tidak berlaku (gunakan bila kode bocor). Peserta yang sudah terdaftar tidak terpengaruh."
                        confirmLabel="Ganti kode"
                        trigger={
                          <Button variant="outline" size="sm">
                            <RotateCcw aria-hidden /> Ganti kode
                          </Button>
                        }
                      />
                      <ActionButton action={setSessionCodeEnabled.bind(null, s.id, code.status === "DISABLED")} variant="outline" size="sm">
                        {code.status === "DISABLED" ? "Aktifkan kode" : "Nonaktifkan kode"}
                      </ActionButton>
                    </>
                  )}
                </div>
              )}

              {s.participants.length > 0 && (
                <div className="overflow-x-auto rounded-xl border">
                  <table className="w-full min-w-xl text-sm">
                    <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2 font-medium">Peserta</th>
                        <th className="px-3 py-2 font-medium">NIM / No.</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                        <th className="px-4 py-2 text-right font-medium">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {s.participants.map(({ user, status, joinedAt }) => {
                        const attempt = user.attempts[0]
                        return (
                          <tr key={user.id} className={cn(status === "REMOVED" && "opacity-55")}>
                            <td className="px-4 py-2">
                              <span className="block font-medium">{user.name}</span>
                              <span className="block text-xs text-muted-foreground">
                                {user.email} · masuk {formatDateTime(joinedAt)}
                              </span>
                            </td>
                            <td className="px-3 py-2 font-mono text-xs">{user.username ?? "—"}</td>
                            <td className="px-3 py-2 text-xs">
                              {status === "REMOVED" ? "Dikeluarkan" : !attempt ? "Di ruang tunggu" : attempt.status === "IN_PROGRESS" ? "Mengerjakan" : "Selesai"}
                            </td>
                            <td className="px-4 py-2">
                              {canManage && (
                                <div className="flex justify-end">
                                  {status === "ACTIVE" ? (
                                    <ConfirmAction
                                      action={removeSessionParticipant.bind(null, s.id, user.id)}
                                      title={`Keluarkan ${user.name}?`}
                                      description="Ia tidak lagi melihat ujian ini dan tidak bisa bergabung lagi lewat kode sampai dipulihkan."
                                      confirmLabel="Keluarkan"
                                      destructive
                                      trigger={
                                        <Button variant="ghost" size="icon-sm" title="Keluarkan" aria-label={`Keluarkan ${user.name}`}>
                                          <UserMinus />
                                        </Button>
                                      }
                                    />
                                  ) : (
                                    <ActionButton action={restoreSessionParticipant.bind(null, s.id, user.id)} variant="ghost" size="sm">
                                      Pulihkan
                                    </ActionButton>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
