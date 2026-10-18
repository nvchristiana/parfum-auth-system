# Parfum Promo Expense - Authentication & Authorization System

REST API sederhana (Node.js + Express) dengan antarmuka web untuk mengelola pengeluaran promo parfum.
Dibuat untuk tugas ALP Keamanan Siber (Universitas Ciputra) dan menerapkan:

1. **Access Token** - JWT (username/password) dan Google Login (OAuth 2.0)
2. **RBAC** - Role-Based Access Control (3 peran)
3. **ABAC** - Attribute-Based Access Control (atribut region)
4. **Gabungan RBAC + ABAC** - pada endpoint approve up-budget

## Teknologi

- Node.js, Express
- jsonwebtoken (JWT)
- google-auth-library (verifikasi Google ID Token)
- dotenv

## Instalasi

1. Clone repository dan masuk ke foldernya:
   ```
   git clone <URL-REPOSITORY>
   cd parfum-auth-system
   ```
2. Install dependency:
   ```
   npm install
   ```
3. Salin `.env.example` menjadi `.env`, lalu isi nilainya:
   ```
   JWT_SECRET=isi_dengan_string_acak_yang_panjang
   GOOGLE_CLIENT_ID=isi_dengan_client_id_google_milikmu
   ```
   Cara mendapatkan `GOOGLE_CLIENT_ID`: Google Cloud Console > Google Auth Platform > Clients > Create OAuth client ID
   (Web application) dengan **Authorized JavaScript origins** `http://localhost:3001`. Tambahkan email penguji
   ke daftar **Test users** pada menu Audience.
4. Jalankan server:
   ```
   node server.js
   ```
5. Buka `http://localhost:3001` di browser.

## Akun Uji

Semua akun memakai password `password123`.

| Username | Role | Region |
|---|---|---|
| `staff_jatim` | Branch_Staff | Jatim |
| `staff_jateng` | Branch_Staff | Jateng |
| `spv_jatim` | SPV_Area | Jatim |
| `spv_kalimantan` | SPV_Area | Kalimantan |
| `auditor_ho` | HO_Auditor | HO |

Pengguna yang login via Google otomatis mendapat role `Branch_Staff` dengan region `Jatim` (hak akses minimum).

## Daftar Endpoint

| Method | Endpoint | Auth | Keterangan |
|---|---|---|---|
| POST | `/api/auth/login` | - | Login username/password, mengembalikan JWT (berlaku 2 jam) |
| POST | `/api/auth/google` | - | Kirim Google ID Token, diverifikasi ke Google, mengembalikan JWT |
| GET | `/api/config` | - | Mengembalikan Google Client ID untuk tombol login |
| GET | `/api/promos` | JWT | Lihat promo; HO_Auditor melihat semua, role lain hanya region sendiri |
| POST | `/api/promos` | JWT | Buat promo; hanya Branch_Staff dan hanya untuk region sendiri |
| PATCH | `/api/promos/:id/approve-up-budget` | JWT | Approve promo over-budget; SPV_Area dan region harus sama |

Format header: `Authorization: Bearer <accessToken>`

## Access Policy (Ringkas)

| Endpoint / Aksi | Role (RBAC) | Kondisi Atribut (ABAC) |
|---|---|---|
| GET `/api/promos` | Semua role terautentikasi | Branch_Staff dan SPV_Area: `promo.region == user.region`. HO_Auditor: semua region |
| POST `/api/promos` | Branch_Staff | `body.region == user.region` |
| PATCH `/api/promos/:id/approve-up-budget` | SPV_Area | `promo.region == user.region` dan `promo.isOverBudget == true` |

## Kode Status

- `200` / `201` - berhasil
- `401` - token tidak ada, tidak valid, atau kedaluwarsa; atau login gagal
- `403` - ditolak karena role (RBAC) atau atribut (ABAC)
- `404` - data tidak ditemukan

## Catatan

Data disimpan di memori (array) sehingga kembali ke kondisi awal setiap server di-restart. File `.env` tidak
di-commit ke repository.