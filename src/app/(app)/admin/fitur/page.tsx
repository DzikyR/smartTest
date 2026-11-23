import type { Metadata } from "next"
import { db } from "@/lib/db"
import { requireRole } from "@/lib/auth/dal"
import { getFeatureOverrides } from "@/lib/features/access"
import { getAuthSettings, getTexts, googleConfigured } from "@/lib/site/config"
import { roleLabels } from "@/content/texts"
import { FEATURE_KEYS, FEATURES, featureEligible, TOGGLEABLE_ROLES } from "@/lib/features/registry"
import { PageHeader } from "@/components/shell/page-parts"
import { FeatureMatrix, type FeatureRow } from "./matrix"
import { PublicAccess } from "./public-access"
import { TrustedNetworks } from "./trusted-networks"
import { headers } from "next/headers"
import { clientIp } from "@/lib/rate-limit"
import { getNetworkSettings, IP_LIMITS, isTrustedIp } from "@/lib/network/trusted"

export const metadata: Metadata = { title: "Kontrol Fitur" }

export default async function FeaturesPage() {
  await requireRole("SUPER_ADMIN")
  const [overrides, runningAttempts, t, auth, authRow] = await Promise.all([
    getFeatureOverrides(),
    db.attempt.count({ where: { status: "IN_PROGRESS" } }),
    getTexts(),
    getAuthSettings(),
    db.siteSetting.findUnique({ where: { key: "auth" }, select: { value: true } }),
  ])
  const ip = clientIp(await headers())
  const [network, ipTrusted] = await Promise.all([getNetworkSettings(), isTrustedIp(ip)])
  const limits = Object.values(IP_LIMITS).map((l) => ({ label: l.label, base: l.base, minutes: l.windowMs / 60_000 }))
  const labels = roleLabels(t)
  // Nilai tersimpan (bukan efektif): saklar Google tetap ingat pilihan walau kredensial belum diisi.
  const savedGoogle = (authRow?.value as { googleLogin?: boolean } | null)?.googleLogin ?? true

  const rows: FeatureRow[] = FEATURE_KEYS.map((key) => {
    const f = FEATURES[key]
    const o = overrides[key]
    return {
      key,
      name: f.name,
      description: f.description,
      category: f.category,
      critical: "critical" in f && f.critical,
      customized: !!o,
      global: o?.enabled ?? true,
      roles: TOGGLEABLE_ROLES.map((role) => ({ role, label: labels[role], eligible: featureEligible(key, role), enabled: o?.roles[role] ?? true })),
    }
  })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Kontrol Fitur"
        description="Aktifkan atau nonaktifkan fitur per role. Perubahan berlaku seketika pada permintaan berikutnya: menu & tombol disembunyikan, halaman dan aksinya ditolak. Super Admin selalu memiliki akses penuh."
      />
      <PublicAccess settings={{ registrationOpen: auth.registrationOpen, googleLogin: savedGoogle }} googleConfigured={googleConfigured()} />
      <TrustedNetworks networks={network.networks} multiplier={network.multiplier} currentIp={ip} currentTrusted={ipTrusted} limits={limits} />
      <FeatureMatrix rows={rows} runningAttempts={runningAttempts} />
    </div>
  )
}
