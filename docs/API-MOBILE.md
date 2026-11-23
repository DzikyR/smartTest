# API Aplikasi Mobile SmartTest — `/api/v1/mobile`

Dicatat: 23 November 2026 · Branch: `fitur/api-mobile` · Tahap 1: **mahasiswa (PESERTA)** — ujian CBT + LMS baca.

API ini memakai **mesin ujian yang sama** dengan web (`src/lib/exam/*`, `src/lib/exam/start.ts`):
jadwal, sesi, token, kesempatan, tata letak acak, batas waktu, tambah waktu pengawas,
koreksi otomatis, kunci perangkat, batas jaringan, audit log. Yang berbeda hanya transportasi.

## Konvensi

| Hal | Aturan |
|---|---|
| Autentikasi | `Authorization: Bearer <accessToken>` (15 menit). Tanpa cookie → tidak rawan CSRF. |
| Header wajib | `X-Device-Id` (acak 16–128 karakter `[A-Za-z0-9_-]`, dibuat sekali per instalasi, simpan di secure storage — **rahasia**), `X-Platform` (`android`/`ios`), `X-App-Version` (`1.4.2`) |
| Body | `Content-Type: application/json`, maks. 256 KB |
| Waktu | epoch milidetik (angka). `null` = tanpa batas. |
| Error | `{ "error": "KODE_STABIL", "message": "Teks untuk pengguna", ...tambahan }` — percabangan di aplikasi memakai `error`, bukan `message` |
| Cache | default `no-store`; dashboard/postingan/paket/berkas ber-`ETag` → kirim `If-None-Match`, `304` = pakai cache lokal |
| Kompresi | gzip/brotli oleh Cloudflare/nginx (Dio/dart:io mendukung gzip otomatis) |

Kode error umum: `UNAUTHENTICATED` (401 → refresh lalu ulangi sekali), `PASSWORD_CHANGE_REQUIRED` (403),
`FORBIDDEN` (403), `VALIDATION` (400, `fields`), `RATE_LIMITED` (429, header `Retry-After`),
`UPGRADE_REQUIRED` (426, `minVersion`, `storeUrl`), `MAINTENANCE` (503).

## Endpoint

### Sistem
| Method & path | Keterangan |
|---|---|
| `GET /config` | Publik. `{ minVersion, latestVersion, storeUrl:{android,ios}, maintenance, message, now }`. Panggil saat aplikasi dibuka; `now` = jam server. |

### Akun
| Method & path | Body → Respons |
|---|---|
| `POST /auth/login` | `{ identifier, password }` → `{ user:{id,name,email,username,role,mustChangePassword}, accessToken, refreshToken, expiresIn }`. Error: `INVALID_CREDENTIALS` 401, `ACCOUNT_LOCKED` 423, `RATE_LIMITED` 429, `DEVICE_REQUIRED` 400. Aturan sama dengan web (kunci 5× gagal, rate limit per IP). |
| `POST /auth/refresh` | `{ refreshToken }` → `{ accessToken, refreshToken, expiresIn }`. **Simpan refresh token baru** (rotasi). `SESSION_INVALID` 401 → ke layar login. Tanpa gerbang versi. |
| `POST /auth/logout` | `{ refreshToken }` → `{ ok:true }`; notifikasi perangkat dilepas. |
| `POST /auth/password` | `{ currentPassword, newPassword }` → token baru. Satu-satunya endpoint yang boleh saat `mustChangePassword`. Semua sesi lain (web & mobile) dicabut. |
| `GET /me` | Profil + kelas (`role`, `status` ACTIVE/PENDING). |

Refresh token berlaku 30 hari (bergeser). Token lama yang dipakai ulang → seluruh sesi perangkat
dicabut, **kecuali** dalam 60 detik dan penggantinya belum pernah dipakai (respons refresh hilang
di jaringan putus-nyambung). Aplikasi wajib memakai satu refresh pada satu waktu (`QueuedInterceptor`).

### Ujian (CBT)
| Method & path | Keterangan |
|---|---|
| `GET /exams` | Daftar ujian/pekerjaan: `state` (`running`/`available`/`upcoming`/`done`/`missed`), `mobile` (`ok`/`not_allowed`/`integrity_required`/`web_only`). |
| `GET /exams/{id}` | Detail + `rules` (tata tertib), `needsToken`, `running` (id percobaan berjalan), `attempts`, `package:{version,size}`. |
| `GET /exams/{id}/package` | **Paket soal terenkripsi** (`application/octet-stream`, `ETag` = versi). Boleh diunduh sebelum ujian dibuka. |
| `POST /exams/{id}/start` | `{ token?, integrityToken? }` → keadaan lembar ujian (di bawah). Mulai baru atau lanjutkan. |
| `PUT /attempts/{id}/answers` | Simpan otomatis **delta** (di bawah). |
| `POST /attempts/{id}/submit` | `{ answers (SEMUA), flagged, leaveCount? }` → `{ status, score, late, message, duplicate }`. |

**Respons start** (juga untuk melanjutkan setelah aplikasi ditutup):
```json
{ "resumed": false, "attemptId": "cm…", "status": "IN_PROGRESS", "startedAt": 1764000000000,
  "deadline": 1764001800000, "now": 1764000000150,
  "layout": { "questions": ["q3","q1","q2"], "options": { "q1": ["b","a","c"] } },
  "answers": {}, "flagged": [], "seq": 0, "leaveCount": 0, "maxLeaves": 3, "questionsPerPage": 1,
  "package": { "version": "9f2c…", "key": "base64-32-byte" } }
```
Kode error start: `TOKEN` 400 (`fields.token`), `OTHER_DEVICE` 423, `UPCOMING`/`SESSION_UPCOMING` 425,
`CLOSED`, `STOPPED`, `SESSION_*`, `MAX_ATTEMPTS`, `NO_QUESTIONS`, `FEATURE` (403), `MOBILE_NOT_ALLOWED` 403,
`INTEGRITY_REQUIRED` 403, `NETWORK` 403 (di luar jaringan yang diizinkan), `WEB_ONLY` 400 (Tugas unggah berkas).

**Paket soal**: `[12 byte IV][ciphertext AES-256-GCM][16 byte tag]`, plaintext = gzip(JSON)
`{ v, examId, questions:[{ id, type, prompt, options:[{id,text}]|null, points }] }` — tanpa kunci jawaban.
Kunci (`package.key`) hanya diberikan saat start. Versi di start ≠ versi paket lokal → unduh ulang.
Urutan tampil = `layout` dari server (jangan mengacak sendiri). Jawaban PG = id pilihan (`"a"`–`"f"`),
B/S = `"true"`/`"false"`, isian/esai = teks (maks. 5.000 karakter).

**Simpan delta** — `PUT /attempts/{id}/answers`:
```json
{ "seq": 4, "answers": { "q1": "b" }, "cleared": ["q2"], "flagged": ["q3"], "leaveCount": 1 }
→ 200 { "seq": 4, "deadline": 1764001800000, "now": 1764000900000, "savedAt": 1764000900000, "duplicate": false }
```
- `seq` naik 1 setiap simpan baru. Mengulang seq yang sama (respons hilang) → `200 duplicate:true`, tidak menimpa.
  Seq lebih kecil → `409 STALE_SEQ` (`seq` server) — abaikan.
- Kirim semua jawaban yang berubah sejak simpan terakhir yang **berhasil** (bukan hanya sejak permintaan terakhir).
- `deadline` selalu dari server (tambah waktu pengawas langsung terbaca). Timer aplikasi: `deadline − (now + jam monotonic sejak respons)`.
- Error: `TIME_UP` 409 → langsung kumpulkan; `ATTEMPT_CLOSED` 409 (`result:{status,score,reason}`) — dikumpulkan
  pengawas/otomatis (`LEAVE_LIMIT`, `PROCTOR`, `TIMEOUT`); `OTHER_DEVICE` 423; `NETWORK` 403.
- Tanpa gerbang versi: aplikasi lama tetap bisa menyelesaikan ujian yang sedang berjalan.

**Interval simpan**: setiap **60 detik** (+ jitter awal acak 0–60 dtk), segera setelah sinyal kembali, saat aplikasi
ke latar belakang, dan setiap **15 detik pada 5 menit terakhir**. Monitoring Ujian menganggap peserta "Tersendat"
bila tidak ada simpan 90 detik (`src/lib/exam/monitoring.ts`), jadi jangan lebih jarang dari 60 detik.

**Aturan waktu habis (sama dengan web)**: lewat batas waktu + 2 menit toleransi, jawaban kiriman diabaikan; yang
dinilai adalah jawaban yang sudah tersimpan. Karena itu jawaban harus tersinkron sesering di atas.

**Kumpul** idempotent: dikirim ulang setelah berhasil → `200 duplicate:true` dengan hasil yang sama.

### LMS (baca)
| Method & path | Keterangan |
|---|---|
| `GET /dashboard` | `{ classes, exams (aktif), posts (20 terbaru) }`, ber-ETag, jam server di header `X-Server-Time`. |
| `GET /classes/{id}/posts` | `{ topics, posts:[{ id, kind, title, content, topicId, attachments, work, comments, done }] }`, ber-ETag. |
| `GET /materials/{id}` | Detail postingan + lampiran + `done`. |
| `POST /materials/{id}` | `{ done: true|false }` — tandai selesai dibaca (jenis Materi). |
| `GET /files/{attachmentId}` | Unduh berkas lampiran (Bearer). `Cache-Control: private, max-age=604800`, `ETag` = sha256 → simpan di cache aplikasi. |

Lampiran `type`: `FILE` (`url` = `/api/v1/mobile/files/{id}`), `LINK`, `YOUTUBE` (`url` = tautan asli).

### Notifikasi
| Method & path | Keterangan |
|---|---|
| `POST /devices` | `{ fcmToken }` → `{ enabled, topics }`. Server mendaftarkan token ke topik kelas (`<prefix>_class_<groupId>`). Panggil saat aplikasi dibuka, `onTokenRefresh`, dan setelah bergabung ke kelas. |

Notifikasi dikirim otomatis saat pengajar **pertama kali menerbitkan** postingan (Materi, Tugas, Tugas Kuis,
Pertanyaan) — satu permintaan FCM per kelas. Data: `{ type: "MATERI"|"TUGAS"|"TUGAS_KUIS"|"PERTANYAAN", groupId, materialId, examId? }`.
Aktif bila `FCM_CREDENTIALS` diisi; tanpa itu API tetap berjalan.

## Pengamanan

- **Ujian tingkat 1**: kunci perangkat memakai hash `X-Device-Id` (pengawas tetap bisa reset dari web), batas jaringan
  IP/CIDR sama dengan web, batas pelanggaran (`leaveCount` dari aplikasi, hanya boleh naik).
- **Ujian tingkat 2 (SEB / UTS-UAS)**: di aplikasi wajib lolos verifikasi integritas (Play Integrity / App Attest) dan
  selalu dikunci ke perangkat. **Verifikasinya belum diimplementasikan** (`src/lib/mobile/integrity.ts`) → saat ini selalu
  `INTEGRITY_REQUIRED`: UTS/UAS tetap hanya lewat Safe Exam Browser.
- **Pengaturan per ujian**: "Larang dikerjakan dari aplikasi mobile" di form ujian (`Exam.allowMobileApp`).
- Paket soal terenkripsi; kuncinya baru diberikan saat Mulai. Catatan: peserta gelombang awal yang sudah memegang kunci
  secara teknis bisa membagikannya ke gelombang berikutnya — sama dengan risiko berbagi soal di web.
- Access token tidak disimpan server; logout mencabut refresh token, access token yang tersisa habis ≤ 15 menit.
  Ganti password / akun dinonaktifkan berlaku seketika (user dibaca ulang dari database setiap permintaan).

## Belum dikerjakan (tahap berikutnya)

- Verifikasi integritas aplikasi (Play Integrity & App Attest) untuk ujian tingkat 2.
- Login dengan Google (verifikasi ID token di server).
- Tugas unggah berkas/teks dari aplikasi, komentar materi, gabung kelas (sudah ada `POST /api/v1/join` berbasis cookie).
- Endpoint untuk pengajar (posting, koreksi).
- Monitoring: tampilkan asal klien (`Attempt.client`) di layar Monitoring Ujian.
- Rate limit & cache soal masih di memori per proses (lihat RENCANA-1000-PESERTA tahap 4).
