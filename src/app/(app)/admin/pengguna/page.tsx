import type { Metadata } from "next"
import { FileUp, Pencil, Power, UserPlus } from "lucide-react"
import type { Prisma, Role } from "@/generated/prisma/client"
import { db } from "@/lib/db"
import { requireRole } from "@/lib/auth/dal"
import { ADMINS, ROLE_LABEL } from "@/lib/auth/roles"
import { formatDateTime, initials } from "@/lib/format"
import { cn } from "@/lib/utils"
import { EmptyState, PageHeader, Pagination, parsePage, SearchForm, str, UrlTabs } from "@/components/shell/page-parts"
import { ActionButton } from "@/components/forms/action-button"
import { FormDialog } from "@/components/forms/form-dialog"
import { FormField } from "@/components/forms/action-form"
import { NativeSelect } from "@/components/forms/native-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { assignableRoles, createUser, importUsers, resetPassword, setUserActive, updateUser } from "./actions"
import { ImportUsersForm, ResetPasswordButton } from "./client"

export const metadata: Metadata = { title: "Pengguna" }

const PAGE_SIZE = 20
const ROLE_TABS: { key: string; label: string; role?: Role }[] = [
  { key: "semua", label: "Semua" },
  { key: "peserta", label: "Peserta", role: "PESERTA" },
  { key: "dosen", label: "Dosen", role: "DOSEN" },
  { key: "admin", label: "Admin", role: "ADMIN" },
  { key: "super", label: "Super Admin", role: "SUPER_ADMIN" },
]
const ROLE_TINT: Record<Role, string> = {
  SUPER_ADMIN: "bg-tint-rose text-tint-rose-fg",
  ADMIN: "bg-tint-orange text-tint-orange-fg",
  DOSEN: "bg-tint-sky text-tint-sky-fg",
  PESERTA: "bg-tint-violet text-tint-violet-fg",
}

export default async function UsersPage({ searchParams }: PageProps<"/admin/pengguna">) {
  const actor = await requireRole(...ADMINS)
  const sp = await searchParams
  const tab = ROLE_TABS.find((t) => t.key === str(sp.role)) ?? ROLE_TABS[0]
  const q = str(sp.q)
  const page = parsePage(sp.page)
  const allowed = await assignableRoles(actor)

  const where: Prisma.UserWhereInput = {
    ...(tab.role ? { role: tab.role } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { username: { contains: q, mode: "insensitive" } }] } : {}),
  }
  const [total, users, groups, counts] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      orderBy: [{ role: "asc" }, { name: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: { id: true, name: true, email: true, username: true, role: true, isActive: true, lastLoginAt: true, memberships: { select: { group: { select: { name: true } } } } },
    }),
    db.group.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.user.groupBy({ by: ["role"], _count: true }),
  ])
  const countOf = (role?: Role) => (role ? (counts.find((c) => c.role === role)?._count ?? 0) : counts.reduce((s, c) => s + c._count, 0))
  const params = { role: tab.key, q }

  const userFields = (defaults?: { name: string; email: string; username: string | null; role: Role }) => (
    <>
      <FormField name="name" label="Nama lengkap">
        <Input id="name" name="name" defaultValue={defaults?.name} maxLength={120} required />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField name="email" label="Email">
          <Input id="email" name="email" type="email" defaultValue={defaults?.email} required />
        </FormField>
        <FormField name="username" label="Username / NIM (opsional)" hint="Dapat dipakai untuk login.">
          <Input id="username" name="username" defaultValue={defaults?.username ?? ""} maxLength={50} />
        </FormField>
      </div>
      <FormField name="role" label="Role">
        <NativeSelect id="role" name="role" defaultValue={defaults?.role ?? "PESERTA"}>
          {allowed.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      {!defaults && groups.length > 0 && (
        <FormField name="groupId" label="Kelompok (khusus peserta, opsional)">
          <NativeSelect id="groupId" name="groupId" defaultValue="">
            <option value="">—</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      )}
    </>
  )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Pengguna"
        description="Akun Super Admin, Admin, Dosen, dan Peserta. Akun baru mendapat password sementara yang wajib diganti saat login pertama."
        actions={
          <>
            <Dialog>
              <DialogTrigger
                render={
                  <Button variant="outline" className="rounded-xl">
                    <FileUp aria-hidden /> Impor Excel
                  </Button>
                }
              />
              <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                  <DialogTitle>Impor Pengguna dari Excel</DialogTitle>
                </DialogHeader>
                <ImportUsersForm action={importUsers} />
              </DialogContent>
            </Dialog>
            <FormDialog
              title="Tambah Pengguna"
              action={createUser}
              trigger={
                <Button className="rounded-xl">
                  <UserPlus aria-hidden /> Tambah pengguna
                </Button>
              }
            >
              {userFields()}
            </FormDialog>
          </>
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <UrlTabs
          label="Filter role"
          active={tab.key}
          tabs={ROLE_TABS.map((t) => ({ key: t.key, href: `/admin/pengguna?role=${t.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`, label: `${t.label} (${countOf(t.role)})` }))}
        />
        <SearchForm basePath="/admin/pengguna" params={params} placeholder="Cari nama, email, NIM…" className="lg:w-96">
          <input type="hidden" name="role" value={tab.key} />
        </SearchForm>
      </div>

      {users.length === 0 ? (
        <EmptyState title="Tidak ada pengguna" />
      ) : (
        <Card className="py-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-3xl text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">Pengguna</th>
                  <th className="px-3 py-3 font-medium">Username/NIM</th>
                  <th className="px-3 py-3 font-medium">Role</th>
                  <th className="px-3 py-3 font-medium">Kelompok</th>
                  <th className="px-3 py-3 font-medium">Login terakhir</th>
                  <th className="px-5 py-3 text-right font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {users.map((u) => {
                  const manageable = allowed.includes(u.role)
                  return (
                    <tr key={u.id} className={cn(!u.isActive && "opacity-55")}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold", ROLE_TINT[u.role])}>{initials(u.name)}</span>
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{u.name}</span>
                            <span className="block truncate text-xs text-muted-foreground">{u.email}</span>
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 font-mono text-xs">{u.username ?? "—"}</td>
                      <td className="px-3 py-3">
                        <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", ROLE_TINT[u.role])}>{ROLE_LABEL[u.role]}</span>
                        {!u.isActive && (
                          <Badge variant="outline" className="ml-1">
                            Nonaktif
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">{u.memberships.map((m) => m.group.name).join(", ") || "—"}</td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Belum pernah"}</td>
                      <td className="px-5 py-3">
                        {manageable && (
                          <div className="flex justify-end gap-1">
                            <FormDialog
                              title="Ubah Pengguna"
                              action={updateUser.bind(null, u.id)}
                              trigger={
                                <Button variant="ghost" size="icon-sm" aria-label={`Ubah ${u.name}`} title="Ubah">
                                  <Pencil />
                                </Button>
                              }
                            >
                              {userFields(u)}
                            </FormDialog>
                            <ResetPasswordButton name={u.name} action={resetPassword.bind(null, u.id)} />
                            {u.id !== actor.id && (
                              <ActionButton
                                action={setUserActive.bind(null, u.id, !u.isActive)}
                                variant="ghost"
                                size="icon-sm"
                                aria-label={u.isActive ? `Nonaktifkan ${u.name}` : `Aktifkan ${u.name}`}
                                title={u.isActive ? "Nonaktifkan" : "Aktifkan"}
                              >
                                <Power className={u.isActive ? "text-destructive" : "text-emerald-600"} />
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
        </Card>
      )}
      <Pagination basePath="/admin/pengguna" params={params} page={page} pageCount={Math.ceil(total / PAGE_SIZE)} total={total} />
    </div>
  )
}
