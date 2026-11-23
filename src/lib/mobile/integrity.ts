import "server-only"
import type { Platform } from "./http"

/**
 * Verifikasi integritas aplikasi — pengganti hash Config Key Safe Exam Browser untuk
 * ujian tingkat 2 (UTS/UAS) di aplikasi mobile. Tanpa ini, siapa pun yang memegang
 * access token dapat "mengerjakan" ujian lewat skrip dan melewati pengamanan aplikasi.
 *
 *  - Android: Play Integrity API (token dari aplikasi → decodeIntegrityToken di server;
 *    wajib appIntegrity = PLAY_RECOGNIZED, deviceIntegrity ⊇ MEETS_DEVICE_INTEGRITY,
 *    requestHash = nonce percobaan).
 *  - iOS: App Attest (DeviceCheck) — assertion ditandatangani kunci attested perangkat.
 *
 * BELUM DIIMPLEMENTASIKAN (butuh akun Google Cloud/Play Console & Apple Developer milik
 * kampus). Sampai diisi, fungsi ini selalu menolak → ujian tingkat 2 tidak dapat dimulai
 * dari aplikasi (aman secara bawaan). Ujian tingkat 1 tidak memerlukan verifikasi ini.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- parameter dipakai saat verifikasi diimplementasikan
export async function verifyAppIntegrity(_input: { platform: Platform | null; token: string | undefined; nonce: string }): Promise<{ ok: true } | { ok: false; reason: "NOT_CONFIGURED" | "MISSING" | "FAILED" }> {
  return { ok: false, reason: "NOT_CONFIGURED" }
}
