import { Suspense } from "react"
import { getCurrentUser, requireRole } from "@/lib/auth/dal"
import { Skeleton } from "@/components/ui/skeleton"
import { MobileNav } from "./mobile-nav"
import { Logo, SidebarNav, SidebarPromo } from "./sidebar"
import { HeaderDate } from "./header-date"
import { UserMenu } from "./user-menu"

/**
 * Kerangka aplikasi: sidebar putih di kiri, kanvas lavender di kanan.
 * Bagian yang membaca sesi di-stream di balik <Suspense> (Partial Prerendering).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh">
      <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col gap-6 overflow-y-auto border-r border-sidebar-border bg-sidebar px-4 py-6 lg:flex">
        <Logo className="px-2" />
        <Suspense fallback={<NavSkeleton />}>
          <SidebarForUser />
        </Suspense>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border/60 bg-background/85 px-4 backdrop-blur sm:px-6">
          <Suspense fallback={<Skeleton className="size-9 lg:hidden" />}>
            <MobileNavForUser />
          </Suspense>
          <Logo className="lg:hidden" />
          <HeaderDate className="hidden lg:block" />
          <div className="ml-auto">
            <Suspense fallback={<Skeleton className="h-10 w-40 rounded-xl" />}>
              <HeaderUser />
            </Suspense>
          </div>
        </header>
        <main className="flex min-w-0 flex-1 flex-col gap-6 p-4 sm:p-6 lg:p-8">
          <Suspense fallback={<PageSkeleton />}>
            <Gate>{children}</Gate>
          </Suspense>
        </main>
      </div>
    </div>
  )
}

async function SidebarForUser() {
  const user = await getCurrentUser()
  if (!user || user.mustChangePassword) return null
  return (
    <div className="flex flex-1 flex-col justify-between gap-6">
      <SidebarNav role={user.role} />
      <SidebarPromo role={user.role} />
    </div>
  )
}

async function MobileNavForUser() {
  const user = await getCurrentUser()
  return user && !user.mustChangePassword ? <MobileNav role={user.role} /> : null
}

async function HeaderUser() {
  const user = await getCurrentUser()
  if (!user) return null
  return <UserMenu name={user.name} email={user.email} role={user.role} />
}

/** Otorisasi server-side: konten hanya untuk pengguna login (role per halaman dicek di halaman). */
async function Gate({ children }: { children: React.ReactNode }) {
  await requireRole()
  return children
}

function NavSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-10 rounded-xl" />
      ))}
    </div>
  )
}

function PageSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-56" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-2xl" />
    </div>
  )
}
