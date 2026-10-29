# SmartTest

Platform **ujian online berbasis komputer (CBT)** untuk kuis, UTS, UAS, try out, dan tes umum — dengan bank soal, impor soal dari **Microsoft Word & Excel**, pembuatan soal massal, dan pengamanan ujian berlapis.

## Fitur

**Peran**
| Role | Kewenangan |
|---|---|
| Super Admin | Seluruh sistem, termasuk mengelola akun Admin & melihat log aktivitas |
| Admin | Pengguna (dosen & peserta), mata uji, kelompok peserta, semua ujian |
| Dosen | Bank soal & ujian pada mata uji yang ia kelola, koreksi esai, pengawasan |
| Peserta | Mengerjakan ujian yang ditujukan untuknya, melihat hasil |

**Mata uji** — *Mata Kuliah* atau *Umum* (tes masuk, TOEFL, psikotes, pelatihan), masing-masing dengan dosen pengelola.

**Bank soal** — pilihan ganda (2–6 pilihan), benar/salah, isian singkat, esai; topik & tingkat kesulitan.
- **Buat soal massal**: tulis puluhan soal sekaligus, tampil **N soal per halaman** (1/5/10/20), draf tersimpan di perangkat, soal belum lengkap ditandai.
- **Impor** dari **Excel (.xlsx)**, **Word (.docx)**, atau tempel teks — dengan **pratinjau** sebelum disimpan dan templat yang bisa diunduh.

**Ujian**
- Admin/dosen mengatur **durasi pengerjaan**, jadwal buka/tutup, jumlah kesempatan, nilai lulus, token, acak soal/pilihan, dan **jumlah soal per halaman** di lembar peserta.
- Peserta: semua peserta aktif atau kelompok tertentu.
- Isi soal dari bank (pilih manual atau **acak N soal** per topik/jenis/kesulitan), buat massal, atau impor.
- Lembar ujian CBT: panel nomor soal (terjawab/ragu-ragu/kosong), ragu-ragu, ukuran huruf, timer, **simpan otomatis** (server + perangkat), kumpul otomatis saat waktu habis.
- Pengawasan langsung: status tiap peserta, **tambah waktu per peserta**, reset perangkat, akhiri paksa, hentikan/buka sesi.
- Koreksi otomatis PG/BS/isian, koreksi manual esai, umpan balik; statistik, sebaran nilai, analisis butir soal, **ekspor Excel**.
- **Tata tertib** otomatis (mengikuti pengaturan) + aturan tambahan, terlihat oleh pengelola & peserta (juga selama ujian).

**Pengamanan**
- *Tingkat 1* (bawaan kuis/latihan): wajib layar penuh, blokir salin/tempel/klik kanan, kunci satu perangkat, batas pelanggaran keluar halaman → kumpul otomatis, batas jaringan IP/CIDR.
- *Tingkat 2* (bawaan UTS/UAS): wajib **Safe Exam Browser**, diverifikasi dengan hash Config Key (`X-SafeExamBrowser-ConfigKeyHash` / JavaScript API SEB).
- Login dengan email atau NIM/username, kunci akun setelah 5× gagal, rate limit, password sementara wajib diganti, sesi dicabut saat password diganti, CSP & header keamanan, log aktivitas.

## Teknologi
Next.js 16 (App Router, Server Actions, Cache Components) · React 19 · Prisma 7 + PostgreSQL · NextAuth v5 · Tailwind CSS 4 · ExcelJS · Mammoth · docx

## Menjalankan

```bash
npm install                 # juga menjalankan prisma generate
cp .env.example .env        # isi DATABASE_URL & AUTH_SECRET
npx prisma migrate deploy   # buat tabel
npm run db:seed             # data contoh + akun demo (password dicetak & disimpan ke .akun-demo.txt)
npm run dev                 # http://localhost:3000
```

Produksi: `npm run build && npm start` di belakang reverse proxy HTTPS (atur `AUTH_URL` dan `TRUSTED_PROXY_COUNT`).

## Format impor soal

**Excel** — satu baris satu soal, kolom: `Jenis | Pertanyaan | A | B | C | D | E | F | Kunci | Poin | Topik | Kesulitan`
- Jenis: `PG`, `BS`, `Isian`, `Esai` · Kunci PG = huruf (`B`), BS = `Benar`/`Salah`, Isian = `jawaban1 | jawaban2`, Esai dikosongkan.

**Word / teks** — soal bernomor (nomor diketik manual), tanda `*` pada jawaban benar atau baris `Kunci:`:
```
1. Ibukota Indonesia adalah ...
A. Bandung
*B. Jakarta
Poin: 2
Kesulitan: Mudah

2. Jelaskan konsep rekursi!
Poin: 10
```
Templat Excel & Word tersedia di menu **Bank Soal → Impor**.

## Safe Exam Browser (UTS/UAS)
1. Buat berkas `.seb` di *SEB Config Tool*: Start URL `<AUTH_URL>/login`, izinkan domain SmartTest di URL Filter, aktifkan *Send Config Key*, Quit URL `<AUTH_URL>/ujian/selesai`.
2. Salin **Config Key** ke `SEB_CONFIG_KEYS` (atau per ujian di pengaturan ujian).
3. Opsional: unggah berkas `.seb` dan isi `SEB_CONFIG_URL`.

SEB tersedia untuk Windows, macOS, dan iOS/iPadOS (tidak untuk Android).

## Pengujian

| Perintah | Isi |
|---|---|
| `npm run test:unit` | Parser impor (teks/Word), validasi baris Excel, pengacakan, IP/SEB, tata tertib |
| `npx tsx --conditions=react-server tests/office.test.mts` | Templat Excel/Word dibuat lalu dibaca kembali; berkas rusak ditolak |
| `node tests/e2e.test.cjs` | Alur lengkap lewat HTTP: RBAC, buat ujian, soal massal, impor Excel, token, kunci perangkat, tambah waktu, koreksi, ekspor, impor pengguna |
| `node tests/browser/ui.test.cjs` | Uji di Microsoft Edge + tangkapan layar (`tests/shots/`); sekali: `cd tests/browser && npm install` |

Uji HTTP/browser membutuhkan server berjalan: `npm run build && npm start -- -p 3123`, database berisi data seed. Data uji dibuat dan dihapus sendiri.
