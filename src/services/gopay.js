/**
 * GoPay Session Service
 * Handles GoPay Merchant login, OTP verification, and token management.
 * 
 * DISCLAIMER: Ini menggunakan internal GoPay Merchant API (sama seperti
 * yang dipakai aplikasi GoPay Merchant). Gunakan hanya dengan akun milikmu sendiri.
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const SESSION_FILE = path.join(__dirname, '../../.gopay_session.json');

// GoPay Merchant API base - ini endpoint yang sama dipakai app GoPay Merchant
const GOPAY_BASE = 'https://api.midtrans.com';
const GOPAY_MERCHANT_BASE = 'https://gopay.co.id/merchant-portal/api/v1';

// Simpan session di memory + file (supaya survive restart)
let sessionCache = null;

function loadSession() {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      const data = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
      // Cek apakah token masih valid (simpan expiry)
      if (data.expires_at && new Date(data.expires_at) > new Date()) {
        sessionCache = data;
        return data;
      }
    }
  } catch (e) {
    console.log('[GoPay] Session file corrupt, akan login ulang');
  }
  return null;
}

function saveSession(session) {
  sessionCache = session;
  try {
    fs.writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2));
  } catch (e) {
    console.error('[GoPay] Gagal simpan session:', e.message);
  }
}

function clearSession() {
  sessionCache = null;
  try {
    if (fs.existsSync(SESSION_FILE)) fs.unlinkSync(SESSION_FILE);
  } catch (e) {}
}

function getSession() {
  if (sessionCache && new Date(sessionCache.expires_at) > new Date()) {
    return sessionCache;
  }
  return loadSession();
}

/**
 * Step 1: Request OTP ke nomor HP GoPay Merchant
 */
async function requestOTP(phone) {
  try {
    // Normalisasi nomor HP
    let normalizedPhone = phone.replace(/\D/g, '');
    if (normalizedPhone.startsWith('0')) {
      normalizedPhone = '62' + normalizedPhone.slice(1);
    }
    if (!normalizedPhone.startsWith('62')) {
      normalizedPhone = '62' + normalizedPhone;
    }

    const response = await axios.post(
      `${GOPAY_MERCHANT_BASE}/auth/otp/request`,
      {
        phone_number: normalizedPhone,
        country_code: '62',
        source: 'MERCHANT_PORTAL'
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'GoPayMerchant/3.0 Android',
          'X-Source': 'merchant-portal'
        },
        timeout: 15000
      }
    );

    if (response.data && response.data.token) {
      return {
        success: true,
        otp_token: response.data.token,
        phone: normalizedPhone,
        message: `OTP terkirim ke ${phone}`
      };
    }

    return { success: false, message: 'Gagal request OTP' };
  } catch (err) {
    console.error('[GoPay] requestOTP error:', err.response?.data || err.message);
    throw new Error(err.response?.data?.message || 'Gagal kirim OTP ke GoPay');
  }
}

/**
 * Step 2: Verifikasi OTP dan dapatkan access token
 */
async function verifyOTP(phone, otp, otpToken) {
  try {
    let normalizedPhone = phone.replace(/\D/g, '');
    if (normalizedPhone.startsWith('0')) normalizedPhone = '62' + normalizedPhone.slice(1);
    if (!normalizedPhone.startsWith('62')) normalizedPhone = '62' + normalizedPhone;

    const response = await axios.post(
      `${GOPAY_MERCHANT_BASE}/auth/otp/verify`,
      {
        phone_number: normalizedPhone,
        otp_code: otp,
        otp_token: otpToken,
        source: 'MERCHANT_PORTAL'
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'GoPayMerchant/3.0 Android',
          'X-Source': 'merchant-portal'
        },
        timeout: 15000
      }
    );

    const data = response.data;

    if (data && data.access_token) {
      // Simpan session dengan expiry 23 jam (GoPay token biasanya 24 jam)
      const expiresAt = new Date(Date.now() + 23 * 60 * 60 * 1000);
      const session = {
        access_token: data.access_token,
        refresh_token: data.refresh_token || null,
        merchant_id: data.merchant_id || data.mid || null,
        phone: normalizedPhone,
        expires_at: expiresAt.toISOString(),
        connected_at: new Date().toISOString()
      };

      saveSession(session);

      return {
        success: true,
        message: 'GoPay Merchant berhasil terhubung!',
        merchant_id: session.merchant_id,
        expires_at: session.expires_at
      };
    }

    return { success: false, message: 'OTP salah atau expired' };
  } catch (err) {
    console.error('[GoPay] verifyOTP error:', err.response?.data || err.message);
    throw new Error(err.response?.data?.message || 'Verifikasi OTP gagal');
  }
}

/**
 * Generate QRIS Dinamis menggunakan GoPay Merchant API
 */
async function generateQRIS(amount, orderId) {
  const session = getSession();
  if (!session) throw new Error('GoPay belum terhubung. Silakan login terlebih dahulu.');

  try {
    // GoPay generate QRIS lewat Midtrans API menggunakan merchant credentials
    const response = await axios.post(
      `${GOPAY_BASE}/v2/charge`,
      {
        payment_type: 'gopay',
        transaction_details: {
          order_id: orderId,
          gross_amount: amount
        },
        gopay: {
          enable_callback: true,
          callback_url: process.env.ZAEINSTORE_WEBHOOK_URL || '',
          // QRIS mode untuk generate QR code
          payment_option_type: 'QRIS'
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'GoPayMerchant/3.0'
        },
        timeout: 20000
      }
    );

    const data = response.data;

    // Ambil QR URL dari response actions
    let qrUrl = null;
    let qrString = null;

    if (data.actions) {
      const generateAction = data.actions.find(a => a.name === 'generate-qr-code');
      if (generateAction) qrUrl = generateAction.url;
      const qrAction = data.actions.find(a => a.name === 'qr-code');
      if (qrAction) qrString = qrAction.url;
    }

    return {
      success: true,
      transaction_id: data.transaction_id,
      order_id: orderId,
      amount: amount,
      status: data.transaction_status || 'pending',
      qr_url: qrUrl || data.qr_code_url,
      qr_string: qrString || data.qr_code,
      transaction_time: data.transaction_time,
      expiry_time: data.expiry_time
    };

  } catch (err) {
    console.error('[GoPay] generateQRIS error:', err.response?.data || err.message);
    
    // Jika 401, session expired
    if (err.response?.status === 401) {
      clearSession();
      throw new Error('Session GoPay expired. Silakan login ulang.');
    }

    throw new Error(err.response?.data?.status_message || 'Gagal generate QRIS');
  }
}

/**
 * Cek status transaksi via GoPay/Midtrans
 */
async function checkStatus(transactionId) {
  const session = getSession();
  if (!session) throw new Error('GoPay belum terhubung.');

  try {
    const response = await axios.get(
      `${GOPAY_BASE}/v2/${transactionId}/status`,
      {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    const data = response.data;
    return {
      success: true,
      transaction_id: data.transaction_id,
      order_id: data.order_id,
      status: data.transaction_status,
      amount: parseInt(data.gross_amount),
      payment_type: data.payment_type,
      transaction_time: data.transaction_time,
      settlement_time: data.settlement_time || null
    };

  } catch (err) {
    console.error('[GoPay] checkStatus error:', err.response?.data || err.message);
    throw new Error(err.response?.data?.status_message || 'Gagal cek status transaksi');
  }
}

/**
 * Info session aktif
 */
function getSessionInfo() {
  const session = getSession();
  if (!session) return { connected: false };
  return {
    connected: true,
    phone: session.phone ? '0' + session.phone.slice(2) : '-',
    merchant_id: session.merchant_id,
    expires_at: session.expires_at,
    connected_at: session.connected_at
  };
}

module.exports = {
  requestOTP,
  verifyOTP,
  generateQRIS,
  checkStatus,
  getSession,
  getSessionInfo,
  clearSession
};
