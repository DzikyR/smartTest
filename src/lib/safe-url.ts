/**
 * Pertahanan berlapis untuk tautan dari data pengguna: URL sudah divalidasi
 * http(s) saat disimpan, tetapi dicek ulang saat dirender agar data yang
 * masuk lewat jalur lain (impor, SQL manual) tidak bisa menjadi `javascript:`.
 */
export function safeHref(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value)
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined
  } catch {
    return undefined
  }
}

export function hostnameOf(value: string | null | undefined) {
  const href = safeHref(value)
  return href ? new URL(href).hostname : null
}
