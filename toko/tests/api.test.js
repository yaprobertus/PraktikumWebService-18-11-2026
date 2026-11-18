// Lab 12: pengujian otomatis (black-box) terhadap gateway toko.
// Jalankan: npm test   (product-service :3000, order-service :3001, dan gateway :8080 harus hidup)
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// API key untuk /order-service (tantangan lab 08): dari env API_KEY, jika tidak ada dibaca dari gateway/.env
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
const get = (p) => kirim(BASE + p, { headers: json });
const post = (p, body, extra = {}) =>
  kirim(BASE + p, { method: 'POST', headers: { ...json, ...extra }, body: JSON.stringify(body) });

let createdOrder;

test('GET /products mengembalikan daftar produk yang bentuknya benar', async () => {
  const res = await get('/product-service/products');
  assert.equal(res.status, 200);
  const list = await res.json();
  assert.ok(Array.isArray(list) && list.length > 0);
  for (const p of list) {
    assert.equal(typeof p.id, 'number');
    assert.equal(typeof p.name, 'string');
    assert.equal(typeof p.price, 'number');
    assert.equal(typeof p.stock, 'number');
  }
});

test('GET /products/:id mengembalikan satu produk', async () => {
  const res = await get('/product-service/products/1');
  assert.equal(res.status, 200);
  assert.equal((await res.json()).id, 1);
});

test('GET /products/:id untuk id tak dikenal mengembalikan 404', async () => {
  const res = await get('/product-service/products/9999');
  assert.equal(res.status, 404);
  assert.ok((await res.json()).error);
});

test('POST /orders berhasil (201) dan mengurangi stok produk', async () => {
  const before = await (await get('/product-service/products/2')).json();
  const res = await post('/order-service/orders', { productId: 2, qty: 1 });
  assert.equal(res.status, 201);
  createdOrder = await res.json();
  assert.equal(createdOrder.productId, 2);
  assert.equal(createdOrder.qty, 1);
  assert.equal(createdOrder.total, before.price);
  const after = await (await get('/product-service/products/2')).json();
  assert.equal(after.stock, before.stock - 1);
});

test('POST /orders dengan qty melebihi stok mengembalikan 409', async () => {
  const res = await post('/order-service/orders', { productId: 2, qty: 100000 });
  assert.equal(res.status, 409);
});

test('POST /orders dengan input tidak valid mengembalikan 400', async () => {
  assert.equal((await post('/order-service/orders', { productId: 2, qty: 0 })).status, 400);
  assert.equal((await post('/order-service/orders', { productId: 2, qty: 'abc' })).status, 400);
});

test('POST /orders untuk produk tak dikenal mengembalikan 404', async () => {
  const res = await post('/order-service/orders', { productId: 9999, qty: 1 });
  assert.equal(res.status, 404);
});

test('GET /orders memuat pesanan yang baru dibuat', async () => {
  const list = await (await get('/order-service/orders')).json();
  assert.ok(list.some(o => o.id === createdOrder.id));
});

// ---------- Langkah 07: test tambahan ----------

test('GET /product-service/health mengembalikan 200 dan status "ok"', async () => {
  const res = await get('/product-service/health');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'ok');
});

test('respons POST /order-service/orders memuat header X-Request-Id', async () => {
  const res = await post('/order-service/orders', { productId: 2, qty: 1 });
  assert.equal(res.status, 201);
  const id = res.headers.get('x-request-id');
  assert.ok(id && id.length > 0, 'header X-Request-Id harus ada dan tidak kosong');
});

// Bonus: ID yang dikirim klien dipakai ulang (bukan dibuat baru) sehingga bisa dilacak dari sisi klien
test('X-Request-Id dari klien dikembalikan apa adanya', async () => {
  const res = await get('/product-service/products/1');
  const id = res.headers.get('x-request-id');
  assert.ok(id);
  const res2 = await kirim(BASE + '/product-service/products/1', { headers: { ...json, 'X-Request-Id': 'uji-lab12-abc' } });
  assert.equal(res2.headers.get('x-request-id'), 'uji-lab12-abc');
});
