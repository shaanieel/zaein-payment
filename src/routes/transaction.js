const router = require('express').Router();
const { requireApiKey } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/ratelimit');
const store = require('../services/store');

// GET /api/trx/list
router.get('/list', requireApiKey, apiLimiter, async (req, res) => {
  try {
    const { limit = 50, status } = req.query;
    const transactions = await store.getAllTransactions({ limit: parseInt(limit), status });
    res.json({ success: true, count: transactions.length, data: transactions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/trx/stats
router.get('/stats', requireApiKey, apiLimiter, async (req, res) => {
  try {
    const stats = await store.getStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/trx/:id
router.get('/:id', requireApiKey, apiLimiter, async (req, res) => {
  try {
    const trx = await store.getTransaction(req.params.id);
    if (!trx) return res.status(404).json({ success: false, message: 'Transaksi tidak ditemukan' });
    res.json({ success: true, data: trx });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
