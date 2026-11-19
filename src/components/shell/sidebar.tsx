"use client"

import { Fragment } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { FileSpreadsheet, ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Role } from "@/lib/auth/roles"
import type { FeatureKey } from "@/lib/features/registry"
import { navFor, type NavLabels } from "./nav"

export type SidebarClass = { id: string; name: string }

export function SidebarNav({ role, features, labels, classes = [], onNavigate }: { role: Role; features: FeatureKey[]; labels: NavLabels; classes?: SidebarClass[]; onNavigate?: () => void }) {
  const pathname = usePathname()
  const sections = navFor(role, features, labels)
  const inClass = (id: string) => pathname === `/kelas/${id}` || pathname.startsWith(`/kelas/${id}/`)
  const classActive = classes.some((c) => inClass(c.id))

  return (
    <nav aria-label="Navigasi utama" className="flex flex-col gap-5">
      {sections.map((section, i) => (
        <Fragment key={section.title ?? i}>
        <div className="flex flex-col gap-1">
          {section.title && <p className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground/80 uppercase">{section.title}</p>}
          {section.items.map(({ href, label, icon: Icon }) => {
            // Saat berada di kelas yang tercantum di "Kelas Saya", sorotan pindah ke nama kelasnya
            const active = pathname === href || (pathname.startsWith(`${href}/`) && !(href === "/kelas" && classActive))
            return (
              <Link
                key={href}
                href={href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <Icon className="size-[18px] shrink-0" aria-hidden />
                {label}
              </Link>
            )
          })}
        </div>
        {i === 0 && classes.length > 0 && <ClassList classes={classes} isActive={inClass} onNavigate={onNavigate} />}
        </Fragment>
      ))}
    </nav>
  )
}

/** Daftar kelas yang diajar (pintasan langsung ke halaman kelas). */
function ClassList({ classes, isActive, onNavigate }: { classes: SidebarClass[]; isActive: (id: string) => boolean; onNavigate?: () => void }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground/80 uppercase">Kelas Saya</p>
      {classes.map((c) => {
        const active = isActive(c.id)
        return (
          <Link
            key={c.id}
            href={`/kelas/${c.id}`}
            onClick={onNavigate}
            title={c.name}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
              active ? "bg-primary text-primary-foreground shadow-md shadow-primary/25" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}
          >
            <span className={cn("flex size-[18px] shrink-0 items-center justify-center rounded-md text-[10px] font-bold", active ? "bg-white/20" : "bg-tint-violet text-tint-violet-fg")} aria-hidden>
              {c.name.trim().charAt(0).toUpperCase()}
            </span>
            <span className="truncate">{c.name}</span>
          </Link>
        )
      })}
      <Link href="/kelas" onClick={onNavigate} className="px-3 py-1 text-xs text-muted-foreground hover:text-primary">
        Semua kelas →
      </Link>
    </div>
  )
}

/** Kartu ajakan di bawah sidebar (gaya dashboard e-learning). */
export function SidebarPromo({ role, features, copy }: { role: Role; features: FeatureKey[]; copy: { title: string; text: string; cta: string } }) {
  const staff = role !== "PESERTA"
  if (staff && !features.includes("bank-soal.impor")) return null
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-primary-deep p-4 text-primary-foreground">
      <div className="absolute -top-6 -right-6 size-20 rounded-full bg-white/10" aria-hidden />
      <div className="absolute -right-2 -bottom-8 size-16 rounded-full bg-white/10" aria-hidden />
      {staff ? (
        <>
          <FileSpreadsheet className="mb-2 size-6" aria-hidden />
          <p className="text-sm font-semibold">{copy.title}</p>
          <p className="mt-1 text-xs text-primary-foreground/80">{copy.text}</p>
          <Link href="/bank-soal/impor" className="mt-3 inline-flex rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-primary hover:bg-white/90">
            {copy.cta}
          </Link>
        </>
      ) : (
        <>
          <ShieldCheck className="mb-2 size-6" aria-hidden />
          <p className="text-sm font-semibold">{copy.title}</p>
          <p className="mt-1 text-xs text-primary-foreground/80">{copy.text}</p>
          <Link href="/ujian" className="mt-3 inline-flex rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-primary hover:bg-white/90">
            {copy.cta}
          </Link>
        </>
      )}
    </div>
  )
}
