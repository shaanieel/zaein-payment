const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 menit
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Terlalu banyak request. Coba lagi dalam 1 menit.' }
});

const generateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { success: false, message: 'Limit generate QRIS tercapai. Tunggu 1 menit.' }
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 5,
  message: { success: false, message: 'Terlalu banyak percobaan login.' }
});

module.exports = { apiLimiter, generateLimiter, loginLimiter };
