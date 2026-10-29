import Image from "next/image"
import Link from "next/link"
import { GraduationCap } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Brand } from "@/lib/site/branding"

/** "SmartTest" → Smart<primary>Test</primary>; nama lain ditampilkan apa adanya. */
export function BrandName({ name }: { name: string }) {
  const m = name.match(/^([A-Z][a-z0-9]+)([A-Z]\w*)$/)
  return m ? (
    <>
      {m[1]}
      <span className="text-primary">{m[2]}</span>
    </>
  ) : (
    <>{name}</>
  )
}

const IMG = "h-9 w-auto max-w-44 object-contain object-left"

/**
 * Logo aplikasi: gambar unggahan Super Admin (terang/gelap ditukar lewat
 * kelas `dark:` agar tidak ada hydration mismatch), atau ikon + nama bawaan.
 * `inverse` untuk latar berwarna primary (memakai logo mode gelap).
 */
export function Logo({ brand, href = "/dashboard", inverse, className }: { brand: Brand; href?: string; inverse?: boolean; className?: string }) {
  const light = inverse ? (brand.logoDark ?? brand.logoLight) : (brand.logoLight ?? brand.logoDark)
  const dark = inverse ? light : (brand.logoDark ?? brand.logoLight)

  if (light && dark) {
    return (
      <Link href={href} className={cn("flex items-center", className)}>
        {light === dark ? (
          <Image src={light} alt={brand.name} width={176} height={36} unoptimized className={IMG} />
        ) : (
          <>
            <Image src={light} alt={brand.name} width={176} height={36} unoptimized className={cn(IMG, "dark:hidden")} />
            <Image src={dark} alt={brand.name} width={176} height={36} unoptimized className={cn(IMG, "hidden dark:block")} />
          </>
        )}
      </Link>
    )
  }

  if (inverse) {
    return (
      <Link href={href} className={cn("flex items-center gap-3", className)}>
        <span className="flex size-11 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
          <GraduationCap className="size-6" aria-hidden />
        </span>
        <span className="text-2xl font-bold tracking-tight">{brand.name}</span>
      </Link>
    )
  }

  return (
    <Link href={href} className={cn("flex items-center gap-2.5", className)}>
      <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/30">
        <GraduationCap className="size-5" aria-hidden />
      </span>
      <span className="text-lg font-bold tracking-tight">
        <BrandName name={brand.name} />
      </span>
    </Link>
  )
}
