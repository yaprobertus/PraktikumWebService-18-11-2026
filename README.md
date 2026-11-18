![CI](https://github.com/yaprobertus/PraktikumWebService-18-11-2026/actions/workflows/ci.yml/badge.svg)

# Praktikum Web Service, Lab 09 sampai Lab 12

Repository ini berisi sistem **Toko** yang dipecah menjadi microservices, dokumentasi API otomatis (OpenAPI/Swagger) pada Lab 11, serta pengujian otomatis, health check, metrik, log berID, monitor, dan CI GitHub Actions pada Lab 12.

## Deskripsi singkat sistem

Toko sederhana (produk dan pesanan) dipecah menjadi dua service dengan data masing-masing, dihubungkan lewat HTTP, dan dipasang di balik satu API gateway:

- **product-service** (port 3000): pemilik data produk dan stok. Endpoint: `GET /products`, `GET /products/:id`, `POST /products/:id/reserve`.
- **order-service** (port 3001): pemilik data pesanan. Endpoint: `POST /orders` (memanggil product-service untuk mengurangi stok) dan `GET /orders`. Sejak Lab 10 juga menerbitkan event `order.created` ke RabbitMQ (opsional; jika RabbitMQ tidak jalan, hanya muncul peringatan di log).
- **gateway** (port 8080): satu-satunya alamat untuk klien. Rate limit 20 request per 10 detik, API key (`X-API-Key`) untuk `/order-service`, routing `/product-service/*` dan `/order-service/*`.
- **notification-service** (Lab 10): consumer RabbitMQ, tidak diperlukan untuk Lab 11.

Lab 11 menambahkan dokumentasi code-first: tiap service menyajikan `/openapi.json` dan `/docs` sendiri, dan gateway menggabungkannya menjadi satu halaman.

## Cara menjalankan

Butuh Node.js 18 atau lebih baru (`node -v`). Jalankan dari folder `toko`:

```bash
npm run install:all          # sekali saja
```

Lalu buka tiga terminal, dengan urutan ini:

| Urutan | Terminal | Perintah | Port |
|---|---|---|---|
| 1 | T1 | `cd product-service && node product-service.js` | 3000 |
| 2 | T2 | `cd order-service && node order-service.js` | 3001 |
| 3 | T3 | `cd gateway && node gateway.js` | 8080 |

Cara singkat: `npm run start:all` menjalankan ketiganya sekaligus (Ctrl+C mematikan semuanya). `gateway/.env` dibuat otomatis dari `gateway/.env.example` bila belum ada. Jangan jalankan monolit bersamaan dengan product-service (port 3000 sama).

## Alamat dokumentasi

| Alamat | Isi |
|---|---|
| http://localhost:8080/docs | **Dokumentasi gabungan** (Swagger UI) untuk product-service dan order-service lewat gateway |
| http://localhost:8080/openapi.json | Spesifikasi OpenAPI gabungan (dibuat saat diminta) |
| http://localhost:3000/docs dan /openapi.json | Dokumentasi product-service sendiri |
| http://localhost:3001/docs dan /openapi.json | Dokumentasi order-service sendiri |

Salinan spesifikasi gabungan disimpan di `toko/openapi.json` (hasil `GET :8080/openapi.json`). Untuk mencoba `POST /order-service/orders` dari Swagger UI, klik **Authorize** lalu isi API key yang sama dengan `API_KEY` di `toko/gateway/.env`.

## Variabel environment

| Variabel | Dipakai oleh | Default | Keterangan |
|---|---|---|---|
| `PORT` | semua service | 3000 / 3001 / 8080 | Port masing-masing service |
| `PRODUCT_SERVICE_URL` | gateway, order-service | `http://localhost:3000` | Alamat product-service |
| `ORDER_SERVICE_URL` | gateway | `http://localhost:3001` | Alamat order-service |
| `API_KEY` | gateway | (tanpa default, isi di `gateway/.env`) | API key untuk route `/order-service`; jangan di-commit |
| `PRODUCT_DOC_URL` | gateway | `http://localhost:3000/openapi.json` | Sumber spesifikasi product-service untuk `/docs` gabungan |
| `ORDER_DOC_URL` | gateway | `http://localhost:3001/openapi.json` | Sumber spesifikasi order-service untuk `/docs` gabungan |
| `AMQP_URL` | order-service, notification-service | `amqp://localhost` | Alamat RabbitMQ (Lab 10), jangan menyimpan kredensial di repository |

## Lab 12: pengujian otomatis dan monitoring

Dari folder `toko` (tiga service harus hidup lebih dulu, `npm run start:all`):

```bash
npm test                  # 11 test otomatis lewat gateway (node --test, tanpa paket tambahan)
node monitor.js           # pantau /health gateway, product-service, order-service tiap 5 detik (ALERT / RECOVERED)
node lacak-order.js       # kirim satu order, tampilkan X-Request-Id untuk dicari di log tiga service
```

- Tiap service punya `/health` dan `/metrics` serta menulis satu baris log JSON per permintaan (`observability.js`). Gateway membuat `X-Request-Id`, order-service meneruskannya ke product-service, sehingga satu transaksi terlacak lintas tiga service.
- `proyek-kelompok/` punya `npm test` dan `monitor.js` sendiri (jadwal-service, booking-service, gateway).
- `.github/workflows/ci.yml` menjalankan semua service dan test pada setiap push (dua job: `toko` dan `proyek-kelompok`).
- Langkah, bukti, dan daftar screenshot: `toko/PANDUAN-LAB12.md`. Refleksi: `toko/docs/refleksi-lab12.md`.

Tanpa nilai `API_KEY` di environment, test dan skrip membaca key dari `toko/gateway/.env`. Di CI, `API_KEY` diisi pada `ci.yml`.

## Isi repository

- `toko/` : monolit, product-service, order-service, gateway, notification-service, Postman, diagram, panduan Lab 09 sampai 12 (`toko/PANDUAN-LAB12.md`), `toko/tests/`, `toko/monitor.js`, serta `toko/openapi.json`.
- `.github/workflows/ci.yml` : workflow CI Lab 12.
- `proyek-kelompok/` : sistem reservasi tiket kereta dari Lab 08 (Lab 12: `/health`, `/metrics`, log berID, `tests/`, `monitor.js`). Dokumentasi OpenAPI endpoint-nya ada di `proyek-kelompok/docs/openapi-jadwal-service.yaml` dan `proyek-kelompok/docs/openapi-booking-service.yaml` (bahan dokumen desain UAS).

Catatan: `node_modules` dan `.env` tidak ikut di-commit (sudah diabaikan oleh `.gitignore`).
