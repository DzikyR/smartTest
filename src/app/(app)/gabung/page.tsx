import type { Metadata } from "next"
import Link from "next/link"
import { requireRole } from "@/lib/auth/dal"
import { isFeatureEnabled } from "@/lib/features/access"
import { FEATURE_DISABLED } from "@/lib/features/registry"
import { str } from "@/components/shell/page-parts"
import { JoinClassForm } from "@/components/classes/join-class"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata: Metadata = { title: "Gabung Kelas" }

/** Tautan undangan /gabung?kode=XXXX (dibagikan pengajar). Belum login → Proxy mengarahkan ke login lalu kembali ke sini. */
export default async function JoinPage({ searchParams }: PageProps<"/gabung">) {
  const user = await requireRole()
  const code = str((await searchParams).kode) ?? ""
  const canJoin = user.role === "PESERTA" && (await isFeatureEnabled("kelas.gabung", user.role))

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 py-6">
      <Card>
        <CardHeader>
          <CardTitle>Gabung ke kelas</CardTitle>
          <CardDescription>Periksa kodenya, lalu tekan Gabung.</CardDescription>
        </CardHeader>
        <CardContent>
          {canJoin ? (
            <JoinClassForm initialCode={code} />
          ) : (
            <div className="flex flex-col gap-4">
              <Alert>
                <AlertDescription>{user.role === "PESERTA" ? FEATURE_DISABLED : "Kode kelas untuk peserta. Sebagai pengajar, kelola kelas dari menu Kelas."}</AlertDescription>
              </Alert>
              <Link href="/kelas" className={buttonVariants({ variant: "outline" })}>
                Ke halaman Kelas
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
