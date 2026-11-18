# PANDUAN LAB 12: Automated Testing & Monitoring API

Lanjutan dari Lab 09 sampai Lab 11 (folder `toko`). Semua kode Langkah 01 sampai 08 sudah terpasang. Panduan ini berisi cara menjalankan tiap langkah dan daftar screenshot untuk laporan.

## A. Isi yang ditambahkan

| Berkas | Langkah | Fungsi |
|---|---|---|
| `package.json` (`"test": "node --test tests/api.test.js"`) | 01 | Menjalankan test dengan test runner bawaan Node.js |
| `tests/api.test.js` | 02, 07 | 11 test: 8 dari soal, 2 tambahan Langkah 07 (health, X-Request-Id), 1 bonus (ID dari klien dikembalikan) |
| `product-service/observability.js`, `order-service/observability.js` | 04 | `/health`, `/metrics`, log JSON per permintaan |
| `gateway/gateway.js` (middleware ID + log JSON) | 05 | Membuat `X-Request-Id`, meneruskan ke service, mencatat log gateway |
| `order-service/order-service.js` (header `X-Request-Id: req.id`) | 05 | Meneruskan ID ke product-service |
| `monitor.js` | 06 | Skrip monitor UP/DOWN, ALERT, RECOVERED |
| `lacak-order.js` | 05 | Pembantu: kirim satu order dan tampilkan `X-Request-Id` (alternatif Postman) |
| `../.github/workflows/ci.yml` | 08 | Workflow GitHub Actions (job `toko` dan `proyek-kelompok`) |
| `../proyek-kelompok/...` | Tugas | `/health`, `/metrics`, log berID, `tests/api.test.js` (8 test), `monitor.js` |

Penyesuaian terhadap kondisi project Anda (bukan kesalahan soal):

- Gateway memakai API key untuk `/order-service`, jadi test mengirim header `X-API-Key`. Nilainya dibaca dari env `API_KEY`, bila kosong dari `gateway/.env`. Di CI nilainya diisi di `ci.yml` (`ci-test-key`).
- Gateway memakai rate limit 20 request per 10 detik. Satu kali `npm test` memakai 15 request. Bila test dijalankan ulang cepat, test menunggu otomatis (mengikuti `Retry-After`) lalu lanjut, sehingga tidak gagal karena 429.
- `/health` product-service, order-service, dan gateway sudah ada dari lab sebelumnya. Pada kedua service, rute lama diganti oleh `observability.js` (jawaban sekarang juga memuat `uptimeSec`). Rute `/health` gateway tetap di atas rate limit.
- Repository berisi `toko/` dan `proyek-kelompok/` di akar, sehingga `ci.yml` memakai `working-directory` per job. Workflow harus berada di `.github/workflows/ci.yml` pada akar repository (folder yang berisi `toko/` dan `proyek-kelompok/`).
- Data in-memory: tiap `npm test` mengurangi stok produk 2 sebanyak 2 (stok awal 25). Bila test mulai gagal karena stok habis, restart product-service dan order-service.

## B. Persiapan

1. `node -v` harus 18 atau lebih baru.
2. Di folder `toko`: `npm run install:all` (sekali saja).
3. Buka **tiga terminal terpisah** (bukan `start:all`, karena Langkah 06 mematikan product-service sendirian):

| Terminal | Perintah | Port |
|---|---|---|
| T1 | `cd toko/product-service` lalu `node product-service.js` | 3000 |
| T2 | `cd toko/order-service` lalu `node order-service.js` | 3001 |
| T3 | `cd toko/gateway` lalu `node gateway.js` | 8080 |
| T4 | `cd toko` (untuk `npm test`, `node monitor.js`, dan lainnya) | |

Peringatan RabbitMQ di T2 ("RabbitMQ belum tersedia", "event TIDAK terkirim") normal karena RabbitMQ tidak diperlukan di lab ini.

## C. Langkah dan screenshot

### Langkah 01 dan 02: test otomatis
Di T4: `npm test`. Semua test harus lulus. Jalankan sekali lagi, hasilnya tetap lulus (perbandingan relatif).

- **S1**: `npm test` lulus semua (daftar test dengan tanda centang, ringkasan `pass 11`, `fail 0`).
- **S2**: `npm test` kedua (bukti tetap lulus bila diulang).

### Langkah 03: biarkan test menangkap regresi
1. Di `product-service/product-service.js`, cari baris `if (p.stock < qty) return res.status(409)...` dan ubah `409` menjadi `400`. Simpan.
2. **S3**: potongan kode yang sudah diubah (baris `status(400)`).
3. T1: Ctrl+C lalu `node product-service.js`. T4: `npm test`.
4. **S4**: test `qty melebihi stok mengembalikan 409` gagal dengan `expected: 409` dan `actual: 400`.
5. Kembalikan menjadi `409`, restart T1, `npm test`.
6. **S5**: semua test lulus kembali.

### Langkah 04: health, metrik, log terstruktur
1. Restart T1 dan T2 (kode sudah terpasang). Buka di browser: `http://localhost:3000/health`, `http://localhost:3001/health`, `http://localhost:3000/metrics`, `http://localhost:3001/metrics`.
2. **S6**: `/health` product-service dan order-service (boleh dua tab).
3. **S7**: `/metrics` order-service (atau kedua service), setelah menjalankan `npm test` sekali supaya angka `requests` bukan nol.
4. Jalankan `npm test`, lihat T1, T2, T3: baris JSON muncul tiap permintaan.
5. **S8**: terminal T1 atau T2 yang menampilkan log JSON (`time`, `service`, `id`, `method`, `path`, `status`, `ms`).

### Langkah 05: lacak satu permintaan lintas service
1. Postman: `POST http://localhost:8080/order-service/orders`, header `Content-Type: application/json` dan `X-API-Key` (nilai `API_KEY` di `gateway/.env`), body `{"productId":2,"qty":1}`. Atau tanpa Postman: `node lacak-order.js`.
2. **S9**: respons berstatus 201 dengan header `X-Request-Id` (Postman: tab **Headers** pada respons; skrip: baris `X-Request-Id`).
3. Salin nilai itu dan cari di T3 (gateway), T2 (order-service), dan T1 (product-service). Susun tiga terminal berdampingan.
4. **S10**: satu screenshot yang memperlihatkan baris dengan `id` yang sama di log gateway, order-service, dan product-service (beri tanda/sorot pada id).

### Langkah 06: monitor
1. T4: `node monitor.js` (biarkan berjalan). Ingin lebih cepat: `INTERVAL_MS=2000` (PowerShell: `$env:INTERVAL_MS=2000; node monitor.js`).
2. T1: Ctrl+C untuk mematikan product-service. Tunggu `ALERT: product-service DOWN`.
3. Di terminal lain: `node uji-kegagalan.js` beberapa kali (hasil `503`).
4. T1: `node product-service.js`. Tunggu `RECOVERED: product-service`.
5. Buka `http://localhost:3001/metrics`: `errors5xx` lebih dari 0.
6. **S11**: terminal monitor yang menampilkan `ALERT: product-service DOWN` dan `RECOVERED: product-service` (usahakan dalam satu gambar).
7. **S12**: output `node uji-kegagalan.js` saat product-service mati (`POST ... -> 503`).
8. **S13**: `/metrics` order-service dengan `errors5xx` lebih dari 0.

### Langkah 07: test sendiri
Dua test sudah ditambahkan di `tests/api.test.js`: `GET /product-service/health` (200 dan `status === 'ok'`) dan header `X-Request-Id` pada respons `POST /order-service/orders`. Keduanya sudah tampil pada S1 (`pass 11`). Pastikan `npm test` lulus sebelum lanjut.

### Langkah 08: GitHub Actions
Folder akar repository = folder yang berisi `toko/` dan `proyek-kelompok/`.

1. Buat repository kosong di GitHub. Ganti `USERNAME/REPO` pada baris pertama `README.md` dengan milik Anda.
2. Di akar repository:
   ```bash
   git init
   git add .
   git status            # pastikan TIDAK ada node_modules dan .env, dan package-lock.json ikut
   git commit -m "Lab 12: test otomatis, observability, monitor, CI"
   git branch -M main
   git remote add origin https://github.com/USERNAME/REPO.git
   git push -u origin main
   ```
3. Buka tab **Actions**. Run harus hijau (dua job: `toko` dan `proyek-kelompok`).
4. **S14**: tab Actions, run hijau pada branch `main`, dan **S15**: halaman run dengan kedua job hijau.
5. Buka job `toko`, langkah **Show service logs**. **S16**: log JSON kedua service (memuat `id`). Peringatan RabbitMQ di log CI itu normal.
6. Bukti run merah:
   ```bash
   git checkout -b uji-gagal
   # ubah 409 menjadi 400 di toko/product-service/product-service.js (seperti Langkah 03)
   git commit -am "uji gagal: ubah 409 menjadi 400"
   git push -u origin uji-gagal
   ```
   Tunggu run pada branch `uji-gagal` berstatus merah.
7. **S17**: run merah pada branch `uji-gagal` (daftar Actions). **S18**: job `toko`, langkah **Run tests** yang gagal beserta test yang gagal (`expected: 409`, `actual: 400`).
8. Kembali ke main: `git checkout main` (branch `uji-gagal` tidak perlu digabung; kode 409 di `main` tetap utuh).
9. **S19**: halaman utama repository (atau `README.md`) dengan badge CI berstatus `passing`.
10. **S20**: daftar berkas repository di GitHub yang menunjukkan tidak ada `node_modules` dan `.env`.

## D. Penerapan ke proyek kelompok

Dari folder `proyek-kelompok` (jalankan `npm run start:all`, atau tiga terminal seperti README proyek):

1. `npm test`: 8 test (tiap service: satu jalur sukses, satu jalur error, satu efek samping; ditambah `/health` dan `X-Request-Id`). **S21**: `npm test` lulus.
2. `/health`: `http://localhost:3000/health` (jadwal-service) dan `http://localhost:3001/health` (booking-service). **S22**: kedua jawaban.
3. `node monitor.js` (TARGETS: gateway, jadwal-service, booking-service), matikan salah satu service sebentar sampai `ALERT` lalu nyalakan kembali sampai `RECOVERED`. **S23**: output monitor.
4. CI: job `proyek-kelompok` pada run yang sama dengan S15 (sudah terlihat di S15).

## E. Daftar yang dikumpulkan

1. Tautan repository.
2. Screenshot `npm test` lulus: S1 (S2).
3. Screenshot test gagal dan hasil setelah diperbaiki: S3, S4, S5.
4. Potongan log kedua service dengan `id` sama: S9, S10 (S8 pendukung).
5. Screenshot monitor ALERT dan RECOVERED: S11 (S12, S13 pendukung).
6. Tautan halaman Actions run hijau pada `main` (S14, S15, S16), screenshot run merah pada `uji-gagal` (S17, S18), dan README dengan badge CI (S19).
7. Penerapan proyek kelompok: S21, S22, S23.
8. Refleksi 4 sampai 5 kalimat (`docs/refleksi-lab12.md`), dikumpulkan sebelum lab 13.

## F. Kesalahan umum

| Gejala | Penyebab dan perbaikan |
|---|---|
| `fetch failed` / `ECONNREFUSED` | Salah satu service atau gateway belum menyala. Nyalakan semuanya dulu. |
| Test 401 | Header `X-API-Key` tidak cocok dengan `gateway/.env`. Pastikan `gateway/.env` ada, atau isi env `API_KEY`. |
| Test 429 | Rate limit gateway. Test menunggu otomatis; bila tetap gagal, tunggu 10 detik. |
| Test 409 atau stok gagal setelah banyak percobaan | Data di memori habis. Restart product-service dan order-service. |
| `id` di log order-service dan product-service berbeda | Header ID belum diteruskan di `order-service.js`, atau middleware ID gateway ada setelah proxy. |
| Workflow tidak muncul | Nama berkas harus `.github/workflows/ci.yml` di akar repository, dan sudah di-push. |
| `npm ci` gagal | `package-lock.json` tiap service belum ter-commit. |
| Lulus di laptop, merah di CI (`Cannot find module './observability'`) | Berkas belum ter-commit atau beda huruf besar/kecil nama berkas (Linux membedakan). |

## G. Refleksi

Lihat `docs/refleksi-lab12.md`.
