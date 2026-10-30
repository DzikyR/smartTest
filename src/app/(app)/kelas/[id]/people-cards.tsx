import { UserMinus, UserPlus } from "lucide-react"
import { db } from "@/lib/db"
import { isAdmin, type CurrentUser } from "@/lib/auth/dal"
import { MAX_ROSTER } from "@/lib/classes/roster"
import { ActionForm, FormField } from "@/components/forms/action-form"
import { ConfirmAction } from "@/components/forms/confirm-action"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { addCoTeacher, removeCoTeacher, saveRoster } from "../actions"

/** Kartu co-teacher & daftar NIM di tab "Kode & Pengaturan". */
export async function ClassPeopleCards({ user, cls }: { user: CurrentUser; cls: { id: string; ownerId: string | null; owner: { name: string } | null; rosterOnly: boolean } }) {
  const canManageTeachers = cls.ownerId === user.id || isAdmin(user)
  const [teachers, roster, students] = await Promise.all([
    db.groupMember.findMany({ where: { groupId: cls.id, role: "TEACHER", status: "ACTIVE" }, orderBy: { joinedAt: "asc" }, select: { user: { select: { id: true, name: true, email: true } } } }),
    db.classRoster.findMany({ where: { groupId: cls.id }, orderBy: { studentId: "asc" }, select: { studentId: true, name: true } }),
    db.groupMember.findMany({ where: { groupId: cls.id, role: "STUDENT", status: "ACTIVE" }, select: { user: { select: { username: true, name: true } } } }),
  ])
  const joined = new Set(students.map((s) => s.user.username?.toLowerCase()).filter(Boolean))
  const listed = new Set(roster.map((r) => r.studentId))
  const notJoined = roster.filter((r) => !joined.has(r.studentId))
  // Tanpa daftar NIM, belum ada yang "di luar daftar".
  const outside = roster.length === 0 ? [] : students.filter((s) => !s.user.username || !listed.has(s.user.username.toLowerCase()))

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1.1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Pengajar kelas</CardTitle>
          <CardDescription>Co-teacher dapat mengelola anggota, kode, dan pengaturan kelas. Hanya pemilik/Admin yang dapat menambah atau mencabut.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ul className="flex flex-col divide-y rounded-xl border text-sm">
            <li className="flex items-center gap-2 px-3 py-2">
              <span className="font-medium">{cls.owner?.name ?? "Admin (kelompok administratif)"}</span>
              <Badge variant="secondary">Pemilik</Badge>
            </li>
            {teachers.map(({ user: t }) => (
              <li key={t.id} className="flex items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{t.name}</span> <span className="text-xs text-muted-foreground">{t.email}</span>
                </span>
                {canManageTeachers && (
                  <ConfirmAction
                    action={removeCoTeacher.bind(null, cls.id, t.id)}
                    title={`Cabut ${t.name} dari kelas?`}
                    description="Ia tidak lagi dapat membuka atau mengelola kelas ini."
                    confirmLabel="Cabut"
                    destructive
                    trigger={
                      <Button variant="ghost" size="icon-sm" aria-label={`Cabut ${t.name}`} title="Cabut">
                        <UserMinus />
                      </Button>
                    }
                  />
                )}
              </li>
            ))}
          </ul>
          {canManageTeachers && (
            <ActionForm action={addCoTeacher.bind(null, cls.id)} submitLabel="Tambah pengajar">
              <FormField name="identifier" label="Email atau username pengajar">
                <Input id="identifier" name="identifier" placeholder="dosen@kampus.ac.id" autoComplete="off" />
              </FormField>
            </ActionForm>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Daftar NIM
            {roster.length > 0 && <Badge variant="outline">{roster.length} NIM</Badge>}
            {cls.rosterOnly && <Badge>Hanya NIM terdaftar</Badge>}
          </CardTitle>
          <CardDescription>Tempel dari Excel/SIAKAD: satu baris per mahasiswa, “NIM” atau “NIM, Nama”. Dipakai untuk mencocokkan siapa yang sudah/belum bergabung.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {roster.length > 0 && (
            <div className="grid gap-2 text-xs sm:grid-cols-3">
              <p className="rounded-lg bg-tint-green p-2 text-tint-green-fg">
                <strong className="block text-lg">{roster.length - notJoined.length}</strong> sudah bergabung
              </p>
              <p className="rounded-lg bg-tint-orange p-2 text-tint-orange-fg">
                <strong className="block text-lg">{notJoined.length}</strong> belum bergabung
              </p>
              <p className="rounded-lg bg-tint-rose p-2 text-tint-rose-fg">
                <strong className="block text-lg">{outside.length}</strong> anggota di luar daftar
              </p>
            </div>
          )}
          {notJoined.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Belum bergabung: {notJoined.slice(0, 15).map((r) => (r.name ? `${r.studentId} (${r.name})` : r.studentId)).join(", ")}
              {notJoined.length > 15 && `, +${notJoined.length - 15} lagi`}
            </p>
          )}
          {outside.length > 0 && (
            <p className="text-xs text-tint-rose-fg">
              Di luar daftar: {outside.slice(0, 15).map((s) => `${s.user.name}${s.user.username ? ` (${s.user.username})` : ""}`).join(", ")}
            </p>
          )}
          <ActionForm action={saveRoster.bind(null, cls.id)} submitLabel="Simpan daftar">
            <FormField name="roster" label={`NIM (maks. ${MAX_ROSTER})`} hint="Kosongkan lalu simpan untuk menghapus daftar.">
              <Textarea id="roster" name="roster" rows={6} defaultValue={roster.map((r) => (r.name ? `${r.studentId}, ${r.name}` : r.studentId)).join("\n")} className="font-mono text-xs" />
            </FormField>
            <label className="flex items-start gap-2.5 text-sm">
              <input type="checkbox" name="rosterOnly" defaultChecked={cls.rosterOnly} className="mt-0.5 size-4 accent-primary" />
              <span>
                <UserPlus className="mr-1 inline size-4" aria-hidden />
                Hanya NIM terdaftar yang boleh bergabung
                <span className="block text-xs text-muted-foreground">Mencegah salah kamar atau kode yang tersebar. Anggota yang sudah ada tidak terpengaruh.</span>
              </span>
            </label>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  )
}
