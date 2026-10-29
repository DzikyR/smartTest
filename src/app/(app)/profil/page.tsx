import type { Metadata } from "next"
import { requireRole } from "@/lib/auth/dal"
import { getTexts } from "@/lib/site/config"
import { roleLabels } from "@/content/texts"
import { PageHeader } from "@/components/shell/page-parts"
import { PasswordForm } from "@/components/password-form"
import { initials } from "@/lib/format"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata: Metadata = { title: "Profil" }

export default async function ProfilePage() {
  const [user, texts] = await Promise.all([requireRole(), getTexts()])
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Profil & Password" />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-4 text-center">
            <span className="flex size-20 items-center justify-center rounded-full bg-tint-violet text-2xl font-bold text-tint-violet-fg">{initials(user.name)}</span>
            <div>
              <p className="text-lg font-semibold">{user.name}</p>
              <p className="text-sm text-muted-foreground">{user.email}</p>
              {user.username && <p className="font-mono text-sm text-muted-foreground">{user.username}</p>}
            </div>
            <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">{roleLabels(texts)[user.role]}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Ganti password</CardTitle>
          </CardHeader>
          <CardContent>
            <PasswordForm />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
