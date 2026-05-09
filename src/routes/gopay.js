/**
 * GoPay Connect Routes
 * POST /api/gopay/request-otp  - Minta OTP ke nomor GoPay Merchant
 * POST /api/gopay/verify-otp   - Verifikasi OTP, simpan session
 * GET  /api/gopay/status       - Cek status koneksi
 * POST /api/gopay/disconnect   - Hapus session
 */

const router = require('express').Router();
const { requireDashboardAuth } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/ratelimit');
const gopay = require('../services/gopay');

// Simpan OTP token sementara (in-memory, cukup)
const otpStore = new Map();

// ─── Request OTP ─────────────────────────────────────────────
router.post('/request-otp', requireDashboardAuth, loginLimiter, async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: 'Nomor HP wajib diisi' });

    const result = await gopay.requestOTP(phone);

    if (result.success) {
      // Simpan OTP token sementara (expire 5 menit)
      otpStore.set(result.phone, { otp_token: result.otp_token, phone: result.phone });
      setTimeout(() => otpStore.delete(result.phone), 5 * 60 * 1000);

      res.json({ success: true, message: result.message, phone: result.phone });
    } else {
      res.status(400).json({ success: false, message: result.message });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Verify OTP ───────────────────────────────────────────────
router.post('/verify-otp', requireDashboardAuth, loginLimiter, async (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) {
      return res.status(400).json({ success: false, message: 'Nomor HP dan OTP wajib diisi' });
    }

    // Cari OTP token yang tersimpan
    let normalizedPhone = phone.replace(/\D/g, '');
    if (normalizedPhone.startsWith('0')) normalizedPhone = '62' + normalizedPhone.slice(1);
    if (!normalizedPhone.startsWith('62')) normalizedPhone = '62' + normalizedPhone;

    const otpData = otpStore.get(normalizedPhone);
    if (!otpData) {
      return res.status(400).json({
        success: false,
        message: 'OTP token tidak ditemukan atau expired. Request OTP ulang.'
      });
    }

    const result = await gopay.verifyOTP(phone, otp, otpData.otp_token);

    if (result.success) {
      otpStore.delete(normalizedPhone);
      res.json({ success: true, message: result.message, expires_at: result.expires_at });
    } else {
      res.status(400).json({ success: false, message: result.message });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Status Koneksi ───────────────────────────────────────────
router.get('/status', requireDashboardAuth, (req, res) => {
  const info = gopay.getSessionInfo();
  res.json({ success: true, data: info });
});

// ─── Disconnect ───────────────────────────────────────────────
router.post('/disconnect', requireDashboardAuth, (req, res) => {
  gopay.clearSession();
  res.json({ success: true, message: 'GoPay berhasil di-disconnect' });
});

module.exports = router;
