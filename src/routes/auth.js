const router = require('express').Router();
const { createSession, destroySession } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/ratelimit');

const DASHBOARD_USER = process.env.DASHBOARD_USERNAME || 'admin';
const DASHBOARD_PASS = process.env.DASHBOARD_PASSWORD || 'admin123';

// POST /api/auth/login
router.post('/login', loginLimiter, (req, res) => {
  const { username, password } = req.body;

  if (username === DASHBOARD_USER && password === DASHBOARD_PASS) {
    const token = createSession(username);
    res.setHeader('Set-Cookie', `zp_session=${token}; HttpOnly; Path=/; Max-Age=86400; SameSite=Strict`);
    res.json({ success: true, message: 'Login berhasil' });
  } else {
    res.status(401).json({ success: false, message: 'Username atau password salah' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  const token = req.headers.cookie
    ?.split(';')
    .find(c => c.trim().startsWith('zp_session='))
    ?.split('=')[1];

  if (token) destroySession(token);

  res.setHeader('Set-Cookie', 'zp_session=; HttpOnly; Path=/; Max-Age=0');
  res.json({ success: true });
});

module.exports = router;
