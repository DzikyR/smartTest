import { Activity, BookOpenText, ClipboardList, FileClock, LayoutDashboard, Library, MonitorCheck, Palette, School, Tags, ToggleRight, Trophy, UserRound, Users, UsersRound, type LucideIcon } from "lucide-react"
import type { Role } from "@/lib/auth/roles"
import type { FeatureKey } from "@/lib/features/registry"
import { DEFAULT_TEXTS, type TextKey } from "@/content/texts"

/** `feature`: menu disembunyikan bila fitur tersebut dinonaktifkan untuk role pengguna. */
export type NavItem = { href: string; label: string; textKey?: TextKey; icon: LucideIcon; roles: Role[]; feature?: FeatureKey }
export type NavSection = { title?: string; titleKey?: TextKey; items: NavItem[] }
/** Label menu yang dapat diubah Super Admin (fallback = teks bawaan). */
export type NavLabels = Partial<Record<TextKey, string>>

const text = (key: TextKey) => ({ label: DEFAULT_TEXTS[key], textKey: key })

const ALL: Role[] = ["SUPER_ADMIN", "ADMIN", "DOSEN", "PESERTA"]
const STAFF: Role[] = ["SUPER_ADMIN", "ADMIN", "DOSEN"]
const ADMINS: Role[] = ["SUPER_ADMIN", "ADMIN"]

export const NAV: NavSection[] = [
  {
    items: [
      { href: "/dashboard", ...text("nav.dashboard"), icon: LayoutDashboard, roles: ALL },
      { href: "/kelas", ...text("nav.kelas"), icon: School, roles: ALL },
    ],
  },
  {
    title: DEFAULT_TEXTS["nav.section.ujian"],
    titleKey: "nav.section.ujian",
    items: [
      { href: "/ujian", ...text("nav.ujian"), icon: MonitorCheck, roles: ["PESERTA"] },
      { href: "/hasil", ...text("nav.hasil"), icon: Trophy, roles: ["PESERTA"], feature: "hasil.lihat" },
      { href: "/ujian-kelola", ...text("nav.ujian-kelola"), icon: ClipboardList, roles: STAFF },
      { href: "/bank-soal", ...text("nav.bank-soal"), icon: Library, roles: STAFF },
      { href: "/mata-uji", ...text("nav.mata-uji"), icon: BookOpenText, roles: STAFF },
    ],
  },
  {
    title: DEFAULT_TEXTS["nav.section.admin"],
    titleKey: "nav.section.admin",
    items: [
      { href: "/admin/monitoring", label: "Monitoring Ujian", icon: Activity, roles: ADMINS, feature: "admin.monitoring" },
      { href: "/admin/pengguna", ...text("nav.pengguna"), icon: Users, roles: ADMINS },
      { href: "/admin/kelompok", ...text("nav.kelompok"), icon: UsersRound, roles: ADMINS, feature: "admin.kelompok" },
      { href: "/admin/kategori", label: "Kategori Ujian", icon: Tags, roles: ADMINS },
      { href: "/admin/log", label: "Log Aktivitas", icon: FileClock, roles: ["SUPER_ADMIN"] },
      { href: "/admin/fitur", label: "Kontrol Fitur", icon: ToggleRight, roles: ["SUPER_ADMIN"] },
      { href: "/admin/situs", label: "Tampilan Situs", icon: Palette, roles: ["SUPER_ADMIN"] },
    ],
  },
  { title: DEFAULT_TEXTS["nav.section.akun"], titleKey: "nav.section.akun", items: [{ href: "/profil", ...text("nav.profil"), icon: UserRound, roles: ALL }] },
]

export function navFor(role: Role, features: readonly FeatureKey[], labels: NavLabels = {}) {
  const visible = (i: NavItem) => i.roles.includes(role) && (!i.feature || features.includes(i.feature))
  const label = (key: TextKey | undefined, fallback: string | undefined) => (key && labels[key]) || fallback
  return NAV.map((s) => ({ ...s, title: label(s.titleKey, s.title), items: s.items.filter(visible).map((i) => ({ ...i, label: label(i.textKey, i.label)! })) })).filter(
    (s) => s.items.length > 0
  )
}

/** Label breadcrumb/judul untuk segmen URL statis. */
export const SEGMENT_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  ujian: "Ujian Saya",
  hasil: "Hasil Ujian",
  "ujian-kelola": "Kelola Ujian",
  "bank-soal": "Bank Soal",
  "mata-uji": "Mata Uji",
  admin: "Administrasi",
  pengguna: "Pengguna",
  kelompok: "Kelompok Peserta",
  log: "Log Aktivitas",
  monitoring: "Monitoring Ujian",
  kelas: "Kelas",
  kategori: "Kategori Ujian",
  gabung: "Gabung Kelas",
  fitur: "Kontrol Fitur",
  situs: "Tampilan Situs",
  profil: "Profil",
  baru: "Baru",
  massal: "Buat Soal Massal",
  impor: "Impor Soal",
  peserta: "Peserta",
  koreksi: "Koreksi",
}

