# 🏥 Apotek POS — Sistem Kasir & Manajemen Farmasi Terpadu

Sistem aplikasi web Point of Sale (POS) dan manajemen apotek modern berbasis **Next.js 16** dan **TypeScript**. Aplikasi ini dirancang untuk operasional apotek nyata dengan dukungan hierarki satuan obat bertingkat (Box, Strip, Biji), sistem FEFO (*First-Expired, First-Out*), manajemen gudang dengan impor Excel dinamis, pelayanan resep, serta sistem autentikasi multi-role (**Admin** dan **Pegawai**).

---

## 🌟 Fitur Utama

### 1. 🔐 Autentikasi & Multi-Role (Admin & Pegawai)
- **Halaman Login Khusus**: Tampilan antarmuka profesional bertema farmasi dengan proteksi rute otomatis (*route guarding*).
- **Pembagian Peran (Role)**:
  - **Admin**: Memiliki hak akses penuh ke seluruh modul sistem, termasuk pengaturan master harga jual/beli, impor katalog obat, dan laporan analitik.
  - **Pegawai**: Memiliki hak akses ke modul operasional harian (Kasir POS, Pelayanan Resep, Katalog Obat, Gudang, Barang Datang, dan Pemantauan Kedaluwarsa). Modul master harga otomatis disembunyikan dan diproteksi.
- **⚡ Akses Cepat (Quick Demo Login)**: Tombol satu-klik untuk langsung masuk sebagai Admin atau Pegawai tanpa mengetik manual.
- **Profil Pengguna & Logout**: Informasi akun aktif, badge role, dan tombol keluar (*logout*) yang terintegrasi di bagian bawah sidebar.

### 2. 🛒 Kasir POS (Point of Sale)
- **Pencarian Cepat**: Filter instan berdasarkan nama obat dan bentuk sediaan (Tablet, Sirup, Salep, Kapsul, Tetes).
- **Pilihan Satuan Bertingkat**: Kasir dapat memilih satuan penjualan langsung pada kartu produk (Box, Strip, atau **Biji**).
- **Format Titik Nominal Otomatis**: Input nominal pembayaran uang diterima dilengkapi pemisah ribuan otomatis secara *real-time* (contoh: mengetik `10000` langsung terformat rapi menjadi `10.000`).
- **Tombol Uang Cepat**: Tombol pecahan *Uang Pas*, *50 Rb*, dan *100 Rb* untuk mempercepat transaksi di kasir.
- **Struk Penjualan**: Pratinjau nota transaksi kasir siap cetak (*receipt preview*).

### 3. 📦 Manajemen Gudang & Impor Excel Dinamis
- **Impor File Excel (`.xlsx`, `.xls`, `.csv`)**: Membaca file data stok fisik gudang dari distributor/supplier.
- **Pilihan Kolom Dinamis (*Column Selector*)**: 
  - Sistem otomatis mendeteksi seluruh header kolom yang ada pada file Excel.
  - Pengguna dapat bebas mencentang atau menghapus centang kolom mana saja yang ingin ditampilkan pada tabel gudang secara *real-time*.
- **Unduh Template Excel**: Menyediakan berkas contoh template siap pakai (`template_data_gudang_apotek.xlsx`).
- **Ekspor Excel Kustom**: Mengunduh tabel gudang sesuai kolom yang sedang aktif dipilih.
- **Pencarian Data Gudang**: Filter data cepat di seluruh kolom aktif (nama obat, nomor batch, nomor rak gudang, atau nama PBF).

### 4. 🚚 Penerimaan Barang Datang & Mutasi Stok
- Pencatatan faktur barang masuk dari PBF distributor lengkap dengan nomor faktur/PO, nomor batch, tanggal kedaluwarsa, dan kuantitas satuan bertingkat.
- Riwayat audit log mutasi stok lengkap (Penerimaan, Penjualan Kasir, Pengeluaran Resep, dan Koreksi Rusak/Pecah).
- Form penyesuaian koreksi stok rusak atau pecah di etalase.

### 5. 💊 Pelayanan Pengeluaran Resep Dokter
- Input nomor resep dokter, nama pasien, dan dokter penulis resep.
- Pengeluaran obat resep racikan atau non-racikan per satuan **Biji** / Botol / Tube.
- Aturan pakai (Signa) yang dapat disesuaikan (contoh: `3x1 Sesudah Makan`).

### 6. ⏰ Pemantauan Kedaluwarsa & Algoritma FEFO
- **Pengurangan Stok FEFO (*First-Expired, First-Out*)**: Saat transaksi kasir terjadi, sistem otomatis memotong stok dari nomor batch yang paling mendekati tanggal kedaluwarsa terlebih dahulu.
- **Klasifikasi Status EXP**:
  - 🔴 **Kedaluwarsa**: Masa berlaku telah lewat.
  - 🟠 **Kritis**: Sisa masa berlaku $\le$ 30 hari.
  - 🟡 **Peringatan**: Sisa masa berlaku 31–90 hari.
  - 🟢 **Aman**: Sisa masa berlaku $>$ 90 hari.

---

## 🔑 Kredensial Akun Bawaan

Aplikasi telah dilengkapi dengan akun bawaan yang siap digunakan:

| Role | Username | Password | Deskripsi Akses |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin` | `admin123` | Akses penuh ke seluruh fitur dan pengaturan harga master. |
| **Pegawai** | `pegawai` | `pegawai123` | Akses modul operasional (Kasir, Resep, Gudang, Katalog, Kedaluwarsa). |

---

## 🛠️ Teknologi & Dependensi

- **Frontend Framework**: [Next.js 16 (Turbopack, App Router)](https://nextjs.org/)
- **UI Library**: [React 19](https://react.dev/)
- **Bahasa**: [TypeScript 5](https://www.typescriptlang.org/)
- **Parser Spreadsheet**: [SheetJS (xlsx)](https://docs.sheetjs.com/)
- **Penyimpanan**: Supabase (cloud) adalah sumber kebenaran bila terkonfigurasi. Browser `localStorage` berfungsi sebagai cache dan antrean tulis (outbox) yang dikirim ulang bila gagal. Inisialisasi awal otomatis (*auto-seeding*) dan migrasi skema otomatis.

---

## 🚀 Panduan Menjalankan Project

### 1. Prasyarat
Pastikan komputer Anda telah terinstal [Node.js](https://nodejs.org/) (versi 18 atau lebih baru).

### 2. Instalasi Dependensi
Jalankan perintah berikut di folder proyek:

```bash
npm install
```

### 3. Menjalankan Server Pengembangan
Jalankan dev server dengan perintah:

```bash
npm run dev
```

Buka browser Anda dan akses:
- **Local URL**: [http://localhost:3000](http://localhost:3000)
- **Halaman Login**: [http://localhost:3000/login](http://localhost:3000/login)

---

## 📁 Struktur Direktori

```text
Apotek/
├── src/
│   ├── app/                        # Next.js App Router Pages
│   │   ├── expiry/                 # Halaman Monitoring Kedaluwarsa
│   │   ├── gudang/                 # Halaman Manajemen Gudang & Impor Excel Kolom Dinamis
│   │   ├── inventory/              # Halaman Katalog Obat
│   │   ├── login/                  # Halaman Login Multi-Role (Admin & Pegawai)
│   │   ├── pos/                    # Halaman Kasir Penjualan POS
│   │   ├── prescription/           # Halaman Pelayanan Resep Dokter
│   │   ├── pricing/                # Halaman Pengaturan Harga & Master Impor (Khusus Admin)
│   │   ├── warehouse/              # Halaman Penerimaan Barang Datang & Mutasi
│   │   ├── globals.css             # Desain token, styling komponen & tema farmasi
│   │   ├── layout.tsx              # Root layout server component
│   │   └── page.tsx                # Dashboard analitik utama
│   ├── components/
│   │   └── layout/
│   │       ├── AppInitializer.tsx  # Inisialisasi awal database lokal browser
│   │       ├── AppLayout.tsx       # Wrapper proteksi login & sidebar kondisional
│   │       └── Sidebar.tsx         # Menu navigasi sidebar responsif berbasis role
│   ├── context/
│   │   └── AuthContext.tsx         # State management autentikasi, user session & role guard
│   ├── database/
│   │   ├── db.ts                   # CRUD localStorage & migrasi data otomatis
│   │   ├── schema.ts               # TypeScript interfaces, enum UserRole, Batch, Mutasi
│   │   └── seed.ts                 # Data sampel awal obat, batch, dan transaksi
│   ├── features/
│   │   └── inventory/utils/
│   │       └── conversion.ts       # Kalkulasi konversi satuan bertingkat (Box/Strip/Biji)
│   └── lib/
│       ├── formatters.ts           # Format mata uang Rupiah, tanggal, pemisah titik nominal
│       ├── outbox.ts               # Antrean tulis cloud yang belum terkirim
│       ├── print-escpos.ts         # Utilitas cetak struk thermal
│       └── supabase.ts             # Klien Supabase & operasi cloud
├── package.json
└── README.md
```

---

## 📄 Lisensi
Proyek ini dikembangkan untuk kebutuhan operasional apotek terpadu (*Private / Proprietary*).
