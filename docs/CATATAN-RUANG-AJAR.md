# Catatan pengerjaan: Ruang Ajar + Posting ke Beberapa Kelas (tahap 1)

Tanggal: 20 November 2026 · Branch: `fitur/ruang-ajar` · Status: **selesai & lulus uji, BELUM dideploy**

## Ringkas
- Dosen bisa membuat **Tugas** dan **Pertanyaan** dari "+ Buat" di kelas mana pun yang ia kelola, **tanpa mata uji**.
  Pekerjaannya disimpan di *ruang ajar* pembuatnya (mata uji bayangan, dibuat otomatis saat pertama dipakai).
- Form "+ Buat" punya pilihan **"Posting juga ke kelas lain"** (keempat jenis postingan). Seperti Google Classroom,
  setiap kelas mendapat **salinan sendiri**: pengumpulan, nilai, dan tenggat terpisah. Lampiran diunggah sekali.
- **Co-teacher hanya melihat & menilai kelas yang ia ampu.** Akses dihitung langsung dari keanggotaan kelas,
  jadi begitu dicabut, aksesnya langsung hilang.
- Modul Ujian, CBT, UTS/UAS, dan Tugas Kuis tidak berubah perilakunya.

## Perubahan database (1 migrasi, hanya menambah kolom)
`20261120090000_personal_space`: `subjects.isPersonalSpace` (bawaan `false`) dan `subjects.ownerId`
(unik, FK ke `users`, `ON DELETE SET NULL`). Tidak ada data lama yang diubah.

## Hak akses (inti)
`src/lib/data/access.ts`
- `managedSubjects(user)` sekarang **hanya mata uji resmi** (`isPersonalSpace = false`), juga untuk Admin.
  Akibatnya ruang ajar otomatis tersembunyi dari menu Mata Uji, dropdown form ujian/kelas, Bank Soal, dan statistik dashboard.
- `managedExams(user)` (baru): ujian di mata uji resmi yang dikelola **atau** ujian ruang ajar yang ditujukan ke kelas
  yang dikelola pengguna (pemilik / co-teacher aktif). `getManagedExam` dan semua filter `exam: { subject: managedSubjects }`
  (penilaian, reset, tambah waktu, koreksi, daftar Kelola Ujian, dashboard) diganti ke sini.
- `ensurePersonalSpace(user)` (baru): ruang ajar `RA-xxxxxxxx` "Ruang ajar — <nama>", satu per pengguna, aman terhadap balapan.

## Alur kelas
- `kelas/material-actions.ts`: `createPost` membuat salinan untuk kelas asal + kelas tujuan yang dicentang
  (disaring ke kelas aktif yang dikelola, maks. 30) dalam **satu transaksi**. Topik di kelas lain dicocokkan menurut nama.
  Tugas Kuis yang sudah tertaut di salah satu tujuan ditolak seluruhnya.
- "Gunakan kembali" Tugas/Pertanyaan: salinan masuk **ruang ajar penyalin**, bukan mata uji kelas sumber (bug lama tertutup).
- Menu "+ Buat" tidak lagi menonaktifkan Tugas/Pertanyaan ("kelas belum punya mata uji / bukan pengampu").

## Tampilan
- Helper `subjectLabel()` (`src/lib/labels.ts`): staf melihat **"Ruang ajar · <kelas>"**, mahasiswa melihat nama ruang ajar;
  kode internal `RA-…` tidak ditampilkan.
- Form Ubah ujian untuk pekerjaan ruang ajar: mata uji, jenis pekerjaan, dan kelas tujuan **dikunci** (server juga mengabaikan
  kiriman ketiganya + "terbuka untuk semua"). Tombol impor/buat massal bank soal disembunyikan untuk ruang ajar.

## Pengujian (di `/opt/smarttest-dev`, DB `smarttest_e2e`)
- E2E: **289 lulus, 0 gagal** (15 tes baru ruang ajar; 1 tes lama disesuaikan: Tugas dari "+ Buat" kini di ruang ajar, bukan IF101).
- Unit: 98 lulus. Typecheck (`tsc --noEmit`) dan `npm run lint` bersih.
- Tes baru mencakup: kelas tanpa mata uji, 3 salinan + 1 berkas, tenggat per kelas, Pertanyaan & Tugas Kuis ke 2 kelas,
  mahasiswa hanya salinan kelasnya, co-teacher Kelas B tidak bisa membuka/menilai/mengekspor Kelas A dan kehilangan akses
  setelah dicabut, Gunakan kembali → ruang ajar penyalin, ruang ajar tersembunyi dari daftar, form Ubah terkunci.
- Belum dijalankan: uji browser (`tests/browser`).

## Belum dikerjakan / keputusan berikutnya
- **Deploy ke produksi** menunggu persetujuan (resep: cek tidak ada ujian berjalan → backup DB → pull → `prisma generate`
  → migrate → build → restart).
- Tahap 2: "Bank soal saya" (bank soal pribadi di ruang ajar) dan "ambil dari Bank soal saya" saat membuat Pertanyaan.
- Fitur terpisah: "Tambah peserta dari kelas lain" / gabung kelas.
- Konsekuensi model salinan: ralat instruksi dilakukan per kelas (sama seperti Classroom).
