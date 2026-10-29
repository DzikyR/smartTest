"use client"

import { useState } from "react"
import { Menu } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import type { Role } from "@/lib/auth/roles"
import type { FeatureKey } from "@/lib/features/registry"
import { BrandName } from "./logo"
import type { NavLabels } from "./nav"
import { SidebarNav } from "./sidebar"

export function MobileNav({ role, features, labels, appName }: { role: Role; features: FeatureKey[]; labels: NavLabels; appName: string }) {
  const [open, setOpen] = useState(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="ghost" size="icon" className="lg:hidden" aria-label="Buka menu" />}>
        <Menu />
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-4">
        <SheetHeader className="p-0 pb-2">
          <SheetTitle>
            <BrandName name={appName} />
          </SheetTitle>
        </SheetHeader>
        <SidebarNav role={role} features={features} labels={labels} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  )
}
