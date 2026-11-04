/**
 * Reset lunak percobaan — fungsi murni (tanpa database) agar mudah diuji.
 */

/**
 * Waktu mulai baru untuk percobaan yang dibuka kembali pengawas. Waktu yang
 * terpakai sampai simpanan otomatis terakhir dipertahankan; jeda sesudahnya
 * (koneksi putus, laptop mati) tidak dihitung, sehingga peserta mendapat
 * kembali sisa waktunya.
 */
export function reopenedStartedAt(
  attempt: { startedAt: Date; lastSavedAt: Date | null; extraMinutes: number },
  exam: { durationMinutes: number },
  now = new Date()
) {
  const allowed = (exam.durationMinutes + attempt.extraMinutes) * 60_000
  const used = attempt.lastSavedAt ? attempt.lastSavedAt.getTime() - attempt.startedAt.getTime() : 0
  return new Date(now.getTime() - Math.min(Math.max(used, 0), allowed))
}
