/**
 * QRIS Routes
 * POST /api/qris/generate  - Generate QRIS baru
 * POST /api/qris/status    - Cek status transaksi
 */

const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const { requireApiKey } = require('../middleware/auth');
const { generateLimiter, apiLimiter } = require('../middleware/ratelimit');
const gopay = require('../services/gopay');
const store = require('../services/store');

// ─── Generate QRIS ────────────────────────────────────────────
router.post('/generate', requireApiKey, generateLimiter, async (req, res) => {
  try {
    const { amount, buyer_email, product_id, metadata } = req.body;

    if (!amount || isNaN(amount) || amount < 100) {
      return res.status(400).json({ success: false, message: 'Amount tidak valid (min Rp 100)' });
    }

    // Generate order ID unik
    const orderId = `ZP-${Date.now()}-${uuidv4().slice(0, 6).toUpperCase()}`;

    // Request QRIS ke GoPay
    const result = await gopay.generateQRIS(parseInt(amount), orderId);

    // Simpan ke store
    await store.saveTransaction({
      ...result,
      buyer_email,
      product_id,
      metadata: metadata || {}
    });

    res.json({
      success: true,
      message: 'QRIS berhasil dibuat',
      data: {
        transaction_id: result.transaction_id,
        order_id: result.order_id,
        amount: result.amount,
        status: result.status,
        qr_url: result.qr_url,
        qr_string: result.qr_string,
        transaction_time: result.transaction_time,
        expiry_time: result.expiry_time
      }
    });

  } catch (err) {
    console.error('[QRIS] generate error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Cek Status Transaksi ─────────────────────────────────────
router.post('/status', requireApiKey, apiLimiter, async (req, res) => {
  try {
    const { transaction_id } = req.body;

    if (!transaction_id) {
      return res.status(400).json({ success: false, message: 'transaction_id wajib diisi' });
    }

    // Cek ke GoPay langsung untuk status real-time
    const result = await gopay.checkStatus(transaction_id);

    // Update store kalau sudah settlement
    if (result.status === 'settlement' || result.status === 'PAID') {
      await store.updateStatus(transaction_id, result.status, {
        settlement_time: result.settlement_time
      });
    }

    res.json({
      success: true,
      message: result.status === 'settlement' ? 'Pembayaran berhasil' : 'Menunggu pembayaran',
      data: result
    });

  } catch (err) {
    console.error('[QRIS] status error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Polling endpoint (untuk frontend countdown timer) ────────
router.get('/poll/:transactionId', requireApiKey, async (req, res) => {
  try {
    const { transactionId } = req.params;
    const result = await gopay.checkStatus(transactionId);

    const paid = result.status === 'settlement' || result.status === 'PAID';
    const expired = result.status === 'expire' || result.status === 'cancel';

    if (paid) {
      await store.updateStatus(transactionId, result.status);
    }

    res.json({
      success: true,
      paid,
      expired,
      status: result.status,
      transaction_id: transactionId
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
