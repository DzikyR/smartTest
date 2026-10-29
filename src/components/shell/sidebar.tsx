"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { FileSpreadsheet, GraduationCap, ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Role } from "@/lib/auth/roles"
import { navFor } from "./nav"

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/dashboard" className={cn("flex items-center gap-2.5", className)}>
      <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/30">
        <GraduationCap className="size-5" aria-hidden />
      </span>
      <span className="text-lg font-bold tracking-tight">
        Smart<span className="text-primary">Test</span>
      </span>
    </Link>
  )
}

export function SidebarNav({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const pathname = usePathname()
  const sections = navFor(role)

  return (
    <nav aria-label="Navigasi utama" className="flex flex-col gap-5">
      {sections.map((section, i) => (
        <div key={section.title ?? i} className="flex flex-col gap-1">
          {section.title && <p className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground/80 uppercase">{section.title}</p>}
          {section.items.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`)
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
      ))}
    </nav>
  )
}

/** Kartu ajakan di bawah sidebar (gaya dashboard e-learning). */
export function SidebarPromo({ role }: { role: Role }) {
  const staff = role !== "PESERTA"
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-[oklch(0.45_0.2_290)] p-4 text-primary-foreground">
      <div className="absolute -top-6 -right-6 size-20 rounded-full bg-white/10" aria-hidden />
      <div className="absolute -right-2 -bottom-8 size-16 rounded-full bg-white/10" aria-hidden />
      {staff ? (
        <>
          <FileSpreadsheet className="mb-2 size-6" aria-hidden />
          <p className="text-sm font-semibold">Impor soal sekaligus</p>
          <p className="mt-1 text-xs text-primary-foreground/80">Unggah dari Word atau Excel memakai templat SmartTest.</p>
          <Link href="/bank-soal/impor" className="mt-3 inline-flex rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-primary hover:bg-white/90">
            Impor sekarang
          </Link>
        </>
      ) : (
        <>
          <ShieldCheck className="mb-2 size-6" aria-hidden />
          <p className="text-sm font-semibold">Siap ujian?</p>
          <p className="mt-1 text-xs text-primary-foreground/80">Pastikan koneksi stabil dan baca tata tertib sebelum mulai.</p>
          <Link href="/ujian" className="mt-3 inline-flex rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-primary hover:bg-white/90">
            Lihat ujian
          </Link>
        </>
      )}
    </div>
  )
}
