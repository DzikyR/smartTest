import { BookOpenText, ClipboardList, FileClock, LayoutDashboard, Library, MonitorCheck, Trophy, UserRound, Users, UsersRound, type LucideIcon } from "lucide-react"
import type { Role } from "@/lib/auth/roles"

export type NavItem = { href: string; label: string; icon: LucideIcon; roles: Role[] }
export type NavSection = { title?: string; items: NavItem[] }

const ALL: Role[] = ["SUPER_ADMIN", "ADMIN", "DOSEN", "PESERTA"]
const STAFF: Role[] = ["SUPER_ADMIN", "ADMIN", "DOSEN"]
const ADMINS: Role[] = ["SUPER_ADMIN", "ADMIN"]

export const NAV: NavSection[] = [
  { items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ALL }] },
  {
    title: "Ujian",
    items: [
      { href: "/ujian", label: "Ujian Saya", icon: MonitorCheck, roles: ["PESERTA"] },
      { href: "/hasil", label: "Hasil Ujian", icon: Trophy, roles: ["PESERTA"] },
      { href: "/ujian-kelola", label: "Kelola Ujian", icon: ClipboardList, roles: STAFF },
      { href: "/bank-soal", label: "Bank Soal", icon: Library, roles: STAFF },
      { href: "/mata-uji", label: "Mata Uji", icon: BookOpenText, roles: STAFF },
    ],
  },
  {
    title: "Administrasi",
    items: [
      { href: "/admin/pengguna", label: "Pengguna", icon: Users, roles: ADMINS },
      { href: "/admin/kelompok", label: "Kelompok Peserta", icon: UsersRound, roles: ADMINS },
      { href: "/admin/log", label: "Log Aktivitas", icon: FileClock, roles: ["SUPER_ADMIN"] },
    ],
  },
  { title: "Akun", items: [{ href: "/profil", label: "Profil & Password", icon: UserRound, roles: ALL }] },
]

export function navFor(role: Role) {
  return NAV.map((s) => ({ ...s, items: s.items.filter((i) => i.roles.includes(role)) })).filter((s) => s.items.length > 0)
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
  profil: "Profil",
  baru: "Baru",
  massal: "Buat Soal Massal",
  impor: "Impor Soal",
  peserta: "Peserta",
  koreksi: "Koreksi",
}

