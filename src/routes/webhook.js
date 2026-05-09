/**
 * Webhook Handler
 * Terima notifikasi dari GoPay/Midtrans saat pembayaran berhasil,
 * lalu forward ke Cloudflare Worker ZaeinStore untuk kirim Drive file.
 */

const router = require('express').Router();
const crypto = require('crypto');
const axios = require('axios');
const store = require('../services/store');

// ─── GoPay/Midtrans Webhook ───────────────────────────────────
router.post('/gopay', async (req, res) => {
  try {
    const payload = req.body;

    console.log('[Webhook] Diterima dari GoPay:', JSON.stringify(payload, null, 2));

    // Verifikasi signature dari Midtrans/GoPay
    // Format: SHA512(order_id + status_code + gross_amount + server_key)
    const serverKey = process.env.GOPAY_SERVER_KEY || '';
    if (serverKey) {
      const signatureInput = `${payload.order_id}${payload.status_code}${payload.gross_amount}${serverKey}`;
      const expectedSig = crypto.createHash('sha512').update(signatureInput).digest('hex');

      if (payload.signature_key && payload.signature_key !== expectedSig) {
        console.warn('[Webhook] Signature tidak valid, ignored');
        return res.status(401).json({ success: false, message: 'Invalid signature' });
      }
    }

    const transactionId = payload.transaction_id;
    const status = payload.transaction_status;
    const orderId = payload.order_id;
    const amount = parseInt(payload.gross_amount || 0);

    // Update status di store
    await store.updateStatus(transactionId, status, {
      settlement_time: payload.settlement_time || new Date().toISOString()
    });

    // Kalau pembayaran berhasil → forward ke ZaeinStore Worker
    if (status === 'settlement' || status === 'capture') {
      await forwardToZaeinStore({
        transaction_id: transactionId,
        order_id: orderId,
        amount,
        status: 'PAID',
        payment_method: 'QRIS_GOPAY',
        paid_at: payload.settlement_time || new Date().toISOString()
      });
    }

    res.status(200).json({ success: true });

  } catch (err) {
    console.error('[Webhook] Error:', err.message);
    // Tetap return 200 supaya GoPay tidak retry terus
    res.status(200).json({ success: true });
  }
});

/**
 * Forward notifikasi ke Cloudflare Worker ZaeinStore
 */
async function forwardToZaeinStore(data) {
  const workerUrl = process.env.ZAEINSTORE_WEBHOOK_URL;
  if (!workerUrl) {
    console.log('[Webhook] ZAEINSTORE_WEBHOOK_URL tidak di-set, skip forward');
    return;
  }

  try {
    const response = await axios.post(workerUrl, data, {
      headers: {
        'Content-Type': 'application/json',
        // Kirim secret biar Worker bisa verifikasi
        'X-Webhook-Secret': process.env.API_SECRET_KEY || ''
      },
      timeout: 15000
    });
    console.log('[Webhook] Forward ke ZaeinStore berhasil:', response.status);
  } catch (err) {
    console.error('[Webhook] Gagal forward ke ZaeinStore:', err.message);
    // Jangan throw, transaksi tetap tercatat di store lokal
  }
}

// ─── Test webhook endpoint (untuk debug) ──────────────────────
router.post('/test', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.API_SECRET_KEY) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  // Simulasi webhook berhasil
  const mockPayload = {
    transaction_id: req.body.transaction_id || 'test-123',
    order_id: req.body.order_id || 'ZP-TEST-001',
    amount: req.body.amount || 50000,
    status: 'PAID',
    payment_method: 'QRIS_GOPAY',
    paid_at: new Date().toISOString()
  };

  await forwardToZaeinStore(mockPayload);

  res.json({ success: true, message: 'Test webhook dikirim', data: mockPayload });
});

module.exports = router;
