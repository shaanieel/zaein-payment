# Integrasi ZaeinPayment ke ZaeinStore Worker

## Overview
Setelah deploy ZaeinPayment, ganti panggilan VMP di `worker-payment.js` dengan endpoint baru ini.

## 1. Environment Variables di Cloudflare Worker

Tambahkan di Cloudflare Dashboard → Workers → Settings → Variables:
```
ZAEIN_PAYMENT_URL = https://your-railway-url.railway.app
ZAEIN_PAYMENT_KEY = nilai_API_SECRET_KEY_kamu
```

## 2. Generate QRIS (ganti bagian create payment VMP)

```javascript
// Di worker-payment.js ZaeinStore

async function createPayment(amount, buyerEmail, productId, env) {
  const res = await fetch(`${env.ZAEIN_PAYMENT_URL}/api/qris/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': env.ZAEIN_PAYMENT_KEY
    },
    body: JSON.stringify({
      amount,
      buyer_email: buyerEmail,
      product_id: productId
    })
  });

  const data = await res.json();
  if (!data.success) throw new Error(data.message);

  return {
    transaction_id: data.data.transaction_id,
    order_id: data.data.order_id,
    qr_url: data.data.qr_url,
    qr_string: data.data.qr_string,
    expiry_time: data.data.expiry_time
  };
}
```

## 3. Terima Callback dari ZaeinPayment

ZaeinPayment akan POST ke `ZAEINSTORE_WEBHOOK_URL` yang kamu set di .env.
Tambahkan endpoint ini di worker-payment.js:

```javascript
// Handler untuk callback dari ZaeinPayment
if (pathname === '/gopay-callback' && request.method === 'POST') {
  const webhookSecret = env.ZAEIN_PAYMENT_KEY;
  const incomingSecret = request.headers.get('X-Webhook-Secret');

  // Verifikasi secret
  if (incomingSecret !== webhookSecret) {
    return new Response('Unauthorized', { status: 401 });
  }

  const payload = await request.json();

  if (payload.status === 'PAID') {
    const transactionId = payload.transaction_id;
    const orderId = payload.order_id;

    // Cari order di Supabase dan proses delivery
    // ... (sama seperti flow VMP kamu sebelumnya)
    await ctx.waitUntil(processDelivery(orderId, env));
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
```

## 4. Polling Status (opsional, untuk frontend)

```javascript
// Dari frontend ZaeinStore, polling setiap 3 detik
async function pollPaymentStatus(transactionId) {
  const res = await fetch(
    `${PAYMENT_SERVER}/api/qris/poll/${transactionId}`,
    { headers: { 'X-Api-Key': API_KEY } }
  );
  const data = await res.json();

  if (data.paid) {
    // Tampilkan sukses ke user
    showSuccessMessage();
  } else if (data.expired) {
    // QR expired, minta generate ulang
    showExpiredMessage();
  }
}

// Polling loop
const interval = setInterval(async () => {
  await pollPaymentStatus(currentTransactionId);
}, 3000);
```

## 5. Deploy ke Railway

1. Push repo ke GitHub
2. Buat project baru di Railway → Deploy from GitHub
3. Tambahkan semua environment variables dari `.env.example`
4. Railway auto-detect Node.js, langsung jalan

URL Railway format: `https://zaein-payment-production.up.railway.app`
