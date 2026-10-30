/**
 * Parser daftar NIM yang ditempel pengajar (murni — bisa diuji unit).
 * Satu baris per mahasiswa: "NIM", "NIM, Nama", "NIM;Nama", atau "NIM<TAB>Nama"
 * (salinan 1–2 kolom dari Excel). Baris judul/kosong dilewati.
 */
export const MAX_ROSTER = 2000
const NIM = /^[A-Za-z0-9._-]{3,50}$/

export type RosterEntry = { studentId: string; name: string | null }

export function parseRoster(text: string): { entries: RosterEntry[]; invalid: string[] } {
  const seen = new Map<string, RosterEntry>()
  const invalid: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const [first, ...rest] = line.split(/\t|;|,/)
    const id = first.trim()
    if (/^(nim|no\.?|nomor|username)\b/i.test(id)) continue // baris judul
    if (!NIM.test(id)) {
      invalid.push(line.slice(0, 60))
      continue
    }
    const name = rest.join(" ").trim().slice(0, 120) || null
    seen.set(id.toLowerCase(), { studentId: id.toLowerCase(), name })
  }
  return { entries: [...seen.values()], invalid }
}
