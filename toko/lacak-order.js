// Bantu Langkah 05 Lab 12: kirim SATU order lewat gateway dan tampilkan nilai header X-Request-Id
// pada respons, lalu cari nilai itu di log gateway, order-service, dan product-service.
// Jalankan: node lacak-order.js        (alternatif dari Postman)
// Env opsional: BASE_URL, API_KEY (jika kosong dibaca dari gateway/.env)
const fs = require('fs');
const path = require('path');

function bacaApiKey() {
  if (process.env.API_KEY) return process.env.API_KEY;
  try {
    const m = fs.readFileSync(path.join(__dirname, 'gateway', '.env'), 'utf8').match(/^API_KEY=(.*)$/m);
    if (m) return m[1].trim();
  } catch { /* gateway/.env belum ada */ }
  return 'ganti-dengan-key-rahasia-kelompok';
}

const BASE = process.env.BASE_URL || 'http://localhost:8080';
(async () => {
  const res = await fetch(`${BASE}/order-service/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': bacaApiKey() },
    body: JSON.stringify({ productId: 2, qty: 1 }),
  });
  const body = await res.json();
  console.log('POST /order-service/orders ->', res.status);
  console.log('X-Request-Id :', res.headers.get('x-request-id'));
  console.log('body         :', JSON.stringify(body));
  console.log('\nCari nilai X-Request-Id di atas pada log gateway, order-service, dan product-service.');
})().catch((e) => { console.error('Gagal menghubungi gateway:', e.cause?.code || e.message); process.exit(1); });
