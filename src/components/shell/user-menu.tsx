"use client"

import { useTransition } from "react"
import Link from "next/link"
import { ChevronDown, KeyRound, LogOut } from "lucide-react"
import { logoutAction } from "@/lib/auth/actions"
import { ROLE_LABEL, type Role } from "@/lib/auth/roles"
import { initials } from "@/lib/format"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function UserMenu({ name, email, role }: { name: string; email: string; role: Role }) {
  const [pending, startTransition] = useTransition()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" className="h-11 gap-2.5 rounded-xl px-2" aria-label="Menu akun" />}>
        <span className="flex size-9 items-center justify-center rounded-full bg-tint-violet text-sm font-semibold text-tint-violet-fg" aria-hidden>
          {initials(name)}
        </span>
        <span className="hidden text-left sm:block">
          <span className="block max-w-40 truncate text-sm leading-tight font-semibold">{name}</span>
          <span className="block text-xs leading-tight font-normal text-muted-foreground">{ROLE_LABEL[role]}</span>
        </span>
        <ChevronDown className="hidden size-4 text-muted-foreground sm:block" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="truncate font-medium text-foreground">{name}</span>
            <span className="truncate text-xs font-normal">{email}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/profil" />}>
          <KeyRound aria-hidden /> Profil & password
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" disabled={pending} onClick={() => startTransition(() => logoutAction())}>
          <LogOut aria-hidden /> Keluar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
