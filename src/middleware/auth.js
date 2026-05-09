/**
 * Auth Middleware
 * Verifikasi API key untuk semua request ke /api/
 */

const API_KEY = process.env.API_SECRET_KEY || 'zaein-default-key-ganti-ini';

function requireApiKey(req, res, next) {
  const key =
    req.headers['x-api-key'] ||
    req.headers['authorization']?.replace('Bearer ', '') ||
    req.query.api_key;

  if (!key || key !== API_KEY) {
    return res.status(401).json({
      success: false,
      message: 'API Key tidak valid. Set header X-Api-Key.'
    });
  }

  next();
}

/**
 * Dashboard session auth (simple username/password via cookie)
 */
const sessions = new Map();

function requireDashboardAuth(req, res, next) {
  const token = req.headers.cookie
    ?.split(';')
    .find(c => c.trim().startsWith('zp_session='))
    ?.split('=')[1];

  if (token && sessions.has(token)) {
    req.admin = sessions.get(token);
    return next();
  }

  // Kalau request ke API dashboard, return 401
  if (req.path.startsWith('/api')) {
    return res.status(401).json({ success: false, message: 'Tidak terautentikasi' });
  }

  // Redirect ke login page
  res.redirect('/dashboard/login');
}

function createSession(username) {
  const { v4: uuidv4 } = require('uuid');
  const token = uuidv4();
  sessions.set(token, { username, login_at: new Date().toISOString() });
  // Auto expire 24 jam
  setTimeout(() => sessions.delete(token), 24 * 60 * 60 * 1000);
  return token;
}

function destroySession(token) {
  sessions.delete(token);
}

module.exports = { requireApiKey, requireDashboardAuth, createSession, destroySession };
