// Lab 12 (penerapan ke proyek kelompok): pengujian otomatis sistem reservasi tiket kereta, lewat gateway.
// Jalankan: npm test   (jadwal-service :3000, booking-service :3001, dan gateway :8080 harus hidup)
// Tiap service punya tiga test: satu jalur sukses, satu jalur error, satu efek samping.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function bacaApiKey() {
  if (process.env.API_KEY) return process.env.API_KEY;
  try {
    const m = fs.readFileSync(path.join(__dirname, '..', 'gateway', '.env'), 'utf8').match(/^API_KEY=(.*)$/m);
    if (m) return m[1].trim();
  } catch { /* gateway/.env belum ada */ }
  return 'ganti-dengan-key-rahasia-kelompok';
}

const BASE = process.env.BASE_URL || 'http://localhost:8080';
const json = { 'Content-Type': 'application/json', 'X-API-Key': bacaApiKey() };

// Rate limit gateway 20 request / 10 detik: bila kena 429, tunggu sesuai Retry-After lalu ulangi (maks. 3x)
async function kirim(url, init) {
  for (let i = 0; ; i++) {
    const res = await fetch(url, init);
    if (res.status !== 429 || i >= 3) return res;
    const tunggu = Number(res.headers.get('retry-after')) || 10;
    await new Promise((r) => setTimeout(r, tunggu * 1000 + 100));
  }
}
const get = (p, headers = json) => kirim(BASE + p, { headers });
const post = (p, body, headers = json) =>
  kirim(BASE + p, { method: 'POST', headers, body: JSON.stringify(body) });

// Pilih kursi yang MASIH kosong saat ini, supaya test tetap lulus bila dijalankan berulang
async function kursiKosong(perjalananId, jumlah = 1) {
  const data = await (await get(`/jadwal/${perjalananId}/kursi`)).json();
  const kosong = data.kursi.filter((k) => k.status === 'AVAILABLE').map((k) => k.kode);
  assert.ok(kosong.length >= jumlah, 'kursi kosong tidak cukup; restart service untuk mengembalikan data awal');
  return kosong.slice(0, jumlah);
}
const statusKursi = async (perjalananId, kode) =>
  (await (await get(`/jadwal/${perjalananId}/kursi`)).json()).kursi.find((k) => k.kode === kode).status;
const buatBooking = (perjalananId, kursi, nama = 'Penguji Otomatis') =>
  post('/booking/', { perjalananId, kursi, penumpang: { nama } });

// ====================== jadwal-service ======================

test('[jadwal] sukses: GET /jadwal/ mengembalikan 3 perjalanan dengan bentuk yang benar', async () => {
  const res = await get('/jadwal/');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.jumlah, 3);
  for (const p of body.data) {
    assert.equal(typeof p.id, 'string');
    assert.equal(typeof p.harga, 'number');
    assert.equal(typeof p.kursiTersedia, 'number');
  }
  const kursi = await (await get('/jadwal/KA-001/kursi')).json();
  assert.equal(kursi.kursi.length, 40);
});

test('[jadwal] error: GET /jadwal/KA-999 mengembalikan 404 dan route internal diblokir gateway', async () => {
  const res = await get('/jadwal/KA-999');
  assert.equal(res.status, 404);
  assert.ok((await res.json()).error);
  const internal = await post('/jadwal/internal/lock', { perjalananId: 'KA-001', kursi: ['1A'] });
  assert.equal(internal.status, 404);
});

test('[jadwal] efek samping: kursi yang dibooking berubah AVAILABLE -> LOCKED, kembali AVAILABLE setelah batal', async () => {
  const [kode] = await kursiKosong('KA-001');
  assert.equal(await statusKursi('KA-001', kode), 'AVAILABLE');
  const b = await (await buatBooking('KA-001', [kode])).json();
  assert.equal(await statusKursi('KA-001', kode), 'LOCKED');
  await post(`/booking/${b.id}/batal`, {});
  assert.equal(await statusKursi('KA-001', kode), 'AVAILABLE');
});

// ====================== booking-service ======================

test('[booking] sukses: POST /booking/ membuat booking 201 berstatus MENUNGGU_PEMBAYARAN dengan total benar', async () => {
  const [kode] = await kursiKosong('KA-002');
  const harga = (await (await get('/jadwal/KA-002')).json()).harga;
  const res = await buatBooking('KA-002', [kode]);
  assert.equal(res.status, 201);
  const b = await res.json();
  assert.match(b.id, /^BK-/);
  assert.equal(b.status, 'MENUNGGU_PEMBAYARAN');
  assert.equal(b.total, harga);
  const detail = await get(`/booking/${b.id}`);
  assert.equal(detail.status, 200);
  await post(`/booking/${b.id}/batal`, {});          // bersihkan: lepas kursi
});

test('[booking] error: tanpa API key 401, input salah 400, kursi sudah dikunci 409, booking tak ada 404', async () => {
  const tanpaKey = await kirim(BASE + '/booking/', { headers: { 'Content-Type': 'application/json' } });
  assert.equal(tanpaKey.status, 401);
  assert.equal((await post('/booking/', { perjalananId: 'KA-002', kursi: ['1A'], penumpang: { nama: '' } })).status, 400);
  const [kode] = await kursiKosong('KA-002');
  const pertama = await (await buatBooking('KA-002', [kode])).json();
  assert.equal((await buatBooking('KA-002', [kode])).status, 409);
  assert.equal((await get('/booking/BK-TIDAKADA')).status, 404);
  await post(`/booking/${pertama.id}/batal`, {});
});

test('[booking] efek samping: bayar mengubah status menjadi LUNAS dan kursi menjadi BOOKED', async () => {
  const [kode] = await kursiKosong('KA-003');
  const b = await (await buatBooking('KA-003', [kode])).json();
  const bayar = await post(`/booking/${b.id}/bayar`, {});
  assert.equal(bayar.status, 200);
  assert.equal((await bayar.json()).status, 'LUNAS');
  assert.equal(await statusKursi('KA-003', kode), 'BOOKED');
  const lagi = await post(`/booking/${b.id}/bayar`, {});   // bayar dua kali ditolak
  assert.equal(lagi.status, 409);
});

// ====================== health, metrik, ID permintaan ======================

test('[observability] /health ketiga komponen mengembalikan 200 dan status "ok"', async () => {
  for (const url of [BASE + '/health', BASE + '/jadwal/health', BASE + '/booking/health']) {
    const res = await kirim(url, { headers: json });
    assert.equal(res.status, 200, url);
    assert.equal((await res.json()).status, 'ok', url);
  }
});

test('[observability] respons POST /booking/ memuat header X-Request-Id', async () => {
  const [kode] = await kursiKosong('KA-002');
  const res = await buatBooking('KA-002', [kode]);
  assert.equal(res.status, 201);
  assert.ok(res.headers.get('x-request-id'));
  await post(`/booking/${(await res.json()).id}/batal`, {});
});
