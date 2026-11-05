# Rencana: SmartTest Sanggup 1.000 Peserta Serentak

Dicatat: 5 November 2026. Status: tahap 1–2 selesai; tahap 3–5 menunggu upgrade perangkat server.

## Kondisi saat ini

| Aspek | Kondisi |
|---|---|
| Host Proxmox | RAM total **4 GB** (spesifikasi rendah) |
| Container 100 (server web) | 2 vCPU, 2 GB RAM, swap 2 GB (sudah terpakai ±430 MB saat sepi) |
| Dipakai bersama | LocalPanel, MariaDB, PostgreSQL, penjadwalan, sertifdigital, smarttest |
| Aplikasi | 1 proses Next.js (±300 MB) di port 3002, lewat Cloudflare Tunnel |
| PostgreSQL | Pengaturan bawaan (`shared_buffers` 128 MB, `max_connections` 100) |
| Pengalaman nyata | Terbanyak 33 peserta per ujian (50 peserta terdaftar) |

**Kesimpulan:** dengan perangkat ini, 1.000 peserta *dalam satu waktu* kemungkinan besar
belum sanggup. Belum pernah diuji beban; angka pastinya perlu dibuktikan (tahap 5).

### Titik rawan (lonjakan, bukan beban rata-rata)

1. **Login massal**: pemeriksaan password sengaja berat (±70 ms CPU per login).
2. **Ruang tunggu sesi**: memuat ulang halaman berkala selama menunggu.
3. **Mulai serentak**: ratusan lembar ujian disusun bersamaan.
4. **Simpan berkala serempak**: semua yang mulai bersamaan menyimpan bersamaan.
5. **Akhir waktu**: pengumpulan dan penilaian otomatis di menit yang sama.

Beban rata-rata 1.000 peserta: ±50 permintaan/detik (±300–400 query/detik).

## Tahap

### ✅ Tahap 1: Monitoring Ujian (selesai, commit `b06d860`)

Menu **Administrasi → Monitoring Ujian** (`/admin/monitoring`) untuk Super Admin & Admin:
status koneksi (online/tersendat/terputus/waktu habis/selesai), sisa waktu, terjawab,
pelanggaran, nilai, aksi reset lunak/total. Diatur lewat **Kontrol Fitur**
(`admin.monitoring`). Status dibaca dari simpan otomatis, jadi tidak menambah beban peserta.

### ✅ Tahap 2: Optimasi ringan (selesai, commit `2ff2d46`)

- Cache soal per ujian di memori (`src/lib/exam/question-cache.ts`): mulai serentak = 1 query per ujian.
- Autosave 6 → 4 query.
- Simpan berkala diacak 25–35 detik; ruang tunggu diacak 15–25 detik dan 0–3 detik saat waktu mulai.
- Uji: e2e 221/221 lolos, skenario monitoring 15/15 lolos.

### ⏳ Tahap 3: Upgrade perangkat (tugas fisik, menunggu)

Urutan dampak terbesar:

1. **Tambah RAM host** (mis. menjadi 16 GB), lalu naikkan container 100 ke **4 vCPU / 6–8 GB RAM**
   (Proxmox → 100 → *Resources*).
2. Bila memungkinkan, CPU dengan lebih banyak inti dan penyimpanan SSD.
3. Pastikan BIOS **Restore on AC Power Loss = Power On** dan container **Start at boot = Yes**.

### ⏳ Tahap 4: Penyesuaian perangkat lunak (setelah tahap 3)

1. **PostgreSQL**: `shared_buffers` ±25% RAM, `effective_cache_size` ±50–75% RAM,
   pool koneksi aplikasi ±20, index untuk percobaan yang sedang berjalan.
2. **Jalankan 2 proses Next.js** di belakang nginx (memakai semua inti CPU).
   Catatan: cache soal & rate limit saat ini di memori per proses; dengan 2 proses
   tetap aman (cache punya TTL 30 detik), rate limit menjadi per proses.
3. Ruang tunggu: ganti muat ulang halaman penuh dengan cek status ringan.
4. Pengumpulan akhir: coba ulang otomatis dengan jeda bila gagal.

### ⏳ Tahap 5: Uji beban (membuktikan angka)

- Alat: **k6**, skenario mengikuti alur nyata: login → ruang tunggu → mulai → menjawab
  (autosave) → kumpulkan.
- Lokasi: **salinan aplikasi terpisah** dengan database salinan (bukan situs/data asli).
  Uji lokal tidak perlu DNS; uji lewat Cloudflare perlu subdomain uji.
- Naik bertahap: **100 → 200 → 300** (perangkat sekarang), **500 → 1.000** (setelah upgrade).
- Jadwalkan **di luar jam ujian**: CPU penuh selama uji, situs lain ikut lambat.
- Kriteria lolos: 95% autosave < 1 detik, error < 1%, tidak ada jawaban hilang, CPU < 80%.

## Sambil menunggu upgrade (bisa diterapkan sekarang)

1. **Bagi ujian besar menjadi gelombang** lewat fitur Sesi Ujian
   (mis. 4 gelombang × 250 peserta, jeda 15–30 menit).
2. **Buka login 15–30 menit sebelum ujian** (sesi login berlaku 8 jam) agar tidak
   bertumpuk dengan waktu mulai.
3. **Hindari kegiatan berat saat ujian**: build/deploy, backup, impor data besar.
4. **Pantau lewat Monitoring Ujian**; bila banyak yang *Tersendat/Terputus*, kurangi
   ukuran gelombang berikutnya.
5. Opsional: uji beban kecil (100–300) di luar jam ujian untuk mengetahui batas nyata
   perangkat sekarang, lalu tentukan ukuran gelombang dari angka itu.
