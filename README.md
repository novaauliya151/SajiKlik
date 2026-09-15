# SajiKlik

Aplikasi manajemen restoran dengan **React + TypeScript (.tsx), Express + TypeScript (.ts), PostgreSQL, dan Prisma**. Enam role: Pembeli, Kasir, Chef, Finance, Admin, Superadmin.

## Jalankan di Windows / PowerShell

Prasyarat: Node.js 22.12+ (disarankan Node 24 LTS), npm, dan PostgreSQL 17+ yang sudah berjalan. Docker Compose disediakan jika Docker tersedia.

```powershell
cd D:\Laravel\SajiKlik
npm install
if (-not (Test-Path apps/api/.env)) { Copy-Item apps/api/.env.example apps/api/.env }
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Isi `apps/api/.env`:

- `DATABASE_URL`: koneksi database PostgreSQL Anda. Buat database `sajiklik` terlebih dahulu.
- `JWT_SECRET`: tempel hasil generator acak di atas. Nilai contoh sengaja ditolak saat startup.
- `SEED_ADMIN_EMAIL` dan `SEED_ADMIN_PASSWORD`: kredensial awal yang Anda pilih.
- `CLIENT_ORIGIN=http://localhost:5173` untuk development.

Alternatif database melalui Docker:

```powershell
docker compose up -d db
```

Kemudian:

```powershell
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Buka **http://localhost:5173**. API berada di **http://localhost:4000/api**. Gunakan hostname `localhost` secara konsisten karena origin dan cookie diperiksa.

Login dengan akun seed. Password wajib diganti saat login pertama. Seed aman diulang: akun yang sudah ada tidak ditimpa atau direset. Akun staf dibuat melalui **Superadmin → Kelola pengguna**. Password sementara hanya ditampilkan saat pembuatan/reset; salin dan sampaikan secara privat.

## Fitur yang sudah diimplementasikan

- **Pembeli:** beranda responsif, kategori dan pencarian, keranjang dengan catatan item, guest checkout, registrasi/login member, profil, riwayat, poin loyalty, tracking privat setiap 5 detik.
- **Kasir:** daftar pesanan, input transaksi manual, konfirmasi pembayaran, serah-terima pesanan, detail dan cetak struk via browser.
- **Chef:** satu halaman antrian terlama dahulu; Mulai Masak → Selesai Memasak. API dapur tidak mengirim harga, total, atau detail pembayaran.
- **Finance:** laporan kas per bulan, grafik harian, pemasukan/pengeluaran manual, gaji per karyawan/periode, konfirmasi gaji, slip cetak, ekspor Excel/PDF.
- **Admin:** ringkasan operasional, aktivitas tim, CRUD menu dan kategori, pengarsipan menu, pengelolaan pesanan, pembatalan pesanan belum dibayar, akun kasir/chef/finance, laporan keuangan read-only.
- **Superadmin:** akses admin, keuangan, pengelolaan seluruh role, reset password/nonaktif akun, audit aktivitas, warna, logo/favicon/icon, identitas toko, rekening, dan gambar QRIS.
- Sidebar tetap pada desktop dan navigasi hamburger pada mobile. Semua komponen React memakai `.tsx`; tidak ada `.jsx`.

## Keputusan bisnis dan batasan

1. **Pembayaran manual.** QRIS dan transfer tidak terhubung payment gateway. Kasir memverifikasi pembayaran yang benar-benar diterima. Tampilan QRIS/rekening berasal dari pengaturan toko.
2. **Pesanan:** Diterima → Diproses → Siap → Selesai. Kasir hanya menyerahkan pesanan siap yang sudah lunas. Pembatalan mengembalikan stok dalam satu transaksi dan hanya untuk pesanan belum dibayar. Refund pembayaran belum diimplementasikan.
3. **Poin:** 1 poin per Rp10.000, dibulatkan ke bawah, diberikan sekali ketika pesanan member selesai. Penukaran poin dan promo diskon belum tersedia.
4. **Keuangan:** laporan arus kas, bukan pembukuan akuntansi penuh. Pendapatan pesanan diakui saat pembayaran dikonfirmasi; pengeluaran gaji saat gaji ditandai dibayar. Batas laporan bulanan memakai UTC. Pajak dan biaya layanan belum ditambahkan.
5. **Menu seed:** data contoh dengan ilustrasi CSS lokal. Upload foto makanan asli melalui Kelola Menu. Tidak bergantung pada layanan gambar eksternal.
6. **Meja:** nomor meja dicatat pada pesanan; belum ada denah/reservasi meja. Mode pemesanan: makan di tempat atau bawa pulang, belum termasuk kurir/delivery.
7. **Realtime:** Socket.IO mengirim notifikasi perubahan ke staf; polling 10 detik sebagai cadangan. Tracking pembeli polling 5 detik dengan token privat atau kepemilikan akun.
8. **Superadmin:** akun superadmin tidak dapat dinonaktifkan/diturunkan melalui panel agar akses pengelola tidak hilang. Profil sendiri diperbarui melalui endpoint profil/password.
9. **Opsional belum diaktifkan:** Google login, dark mode, PWA/offline, payment gateway, cloud storage, email reset password. Icon dapat diunggah tetapi tidak berarti aplikasi sudah mendukung offline.

## Struktur

```text
apps/
  api/
    prisma/schema.prisma        Model database
    prisma/migrations/          Migrasi SQL awal
    prisma/seed.ts              Superadmin + menu contoh
    src/auth.ts                 JWT, refresh session, RBAC
    src/domain.ts               Validasi & aturan status pesanan
    src/routes/                 Auth, pesanan, manajemen, keuangan
    src/app.ts                  Express, upload, error handling
    src/server.ts               HTTP + Socket.IO
    test/                      Unit dan integrasi PostgreSQL
  web/
    src/components/UI.tsx       Komponen bersama
    src/pages/*.tsx             Halaman berbasis fitur
    src/lib.ts                  Axios, Zustand, sesi, keranjang
    src/main.tsx                Routing dan layout
    src/styles.css              Tailwind + styling responsif
```

## Pengujian dan build

```powershell
npm test
npm run build
npm audit
```

`npm test` menjalankan unit test dan melewati tes integrasi jika `TEST_DATABASE_URL` tidak diberikan. Untuk integrasi, gunakan database terpisah yang namanya memuat `sajiklik_test`:

```powershell
$env:DATABASE_URL='postgresql://USER:PASSWORD@localhost:5432/sajiklik_test?schema=public'
npm run db:migrate
$env:TEST_DATABASE_URL=$env:DATABASE_URL
npm test
Remove-Item Env:TEST_DATABASE_URL
Remove-Item Env:DATABASE_URL
```

Tes membuat fixture unik dan membersihkan datanya sendiri. Jangan arahkan database tes ke data operasional. Tercakup: eskalasi role, rotasi refresh token, akses privat pesanan, harga server, rollback stok, pesanan bersamaan, siklus dapur, pembayaran berulang, loyalty sekali, ekspor, gaji, dan pencabutan sesi setelah reset password.

## Build produksi lokal

```powershell
npm run build
```

Set `NODE_ENV=production`, `CLIENT_ORIGIN` ke origin aplikasi yang sebenarnya, dan jalankan `npm start -w @sajiklik/api`. Express menyajikan hasil build React. Produksi membutuhkan HTTPS untuk refresh cookie `Secure`. Jalankan API di balik reverse proxy pada mesin yang sama; server bind ke `127.0.0.1`. Konfigurasi trusted proxy harus disesuaikan secara eksplisit sebelum mengandalkan rate limit per pengguna di belakang proxy.

Upload tersimpan di `apps/api/uploads`; sertakan folder ini dan database dalam backup. Ukuran maksimal 3 MB, format PNG/JPEG/WebP diperiksa lewat signature file. Access token berumur 15 menit disimpan di memori browser; refresh cookie HttpOnly berumur 7 hari dan dirotasi. Reset password/perubahan role menonaktifkan token lama. Semua nominal Rupiah berupa integer.

## Dokumentasi teknis rujukan

- [Vite — Getting Started](https://vite.dev/guide/)
- [Prisma 6 — Schema Reference](https://docs.prisma.io/docs/orm/v6/reference/prisma-schema-reference)

Prisma dipatok ke 6.19 agar schema dan migrasi konsisten. Override `deepmerge-ts`, `effect`, dan `uuid` memperbaiki advisori pada paket turunan; build, migrasi, dan ekspor diuji dengan override tersebut.
