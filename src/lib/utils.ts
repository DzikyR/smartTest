import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// Warna kustom tema (pastel) agar tailwind-merge mengenalinya sebagai warna.
const TINTS = ["tint-violet", "tint-violet-fg", "tint-orange", "tint-orange-fg", "tint-green", "tint-green-fg", "tint-sky", "tint-sky-fg", "tint-rose", "tint-rose-fg"]
const twMerge = extendTailwindMerge({
  extend: { theme: { color: TINTS } },
})

/** Gabung kelas; kelas yang bentrok (mis. bg-primary vs bg-white) diselesaikan: yang terakhir menang. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
