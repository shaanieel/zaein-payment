const router = require('express').Router();
const path = require('path');
const { requireDashboardAuth } = require('../middleware/auth');
const store = require('../services/store');
const gopay = require('../services/gopay');

// Login page (public)
router.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/login.html'));
});

// Dashboard home
router.get('/', requireDashboardAuth, (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/dashboard.html'));
});

// API untuk data dashboard (dipakai oleh JS frontend)
router.get('/api/overview', requireDashboardAuth, async (req, res) => {
  try {
    const [stats, transactions, gopayStatus] = await Promise.all([
      store.getStats(),
      store.getAllTransactions({ limit: 20 }),
      Promise.resolve(gopay.getSessionInfo())
    ]);

    res.json({
      success: true,
      stats,
      recent_transactions: transactions,
      gopay: gopayStatus
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
