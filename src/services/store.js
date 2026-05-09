/**
 * Transaction Store
 * Simpan transaksi di memory (cepat) + Supabase (persistent, opsional)
 */

let supabase = null;

// Coba inisialisasi Supabase kalau env tersedia
if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    console.log('[DB] Supabase terhubung');
  } catch (e) {
    console.log('[DB] Supabase tidak tersedia, pakai memory saja');
  }
}

// In-memory store (hilang saat restart, tapi cukup untuk session pendek)
const memStore = new Map();

/**
 * Simpan transaksi baru
 */
async function saveTransaction(data) {
  const trx = {
    id: data.transaction_id,
    order_id: data.order_id,
    amount: data.amount,
    status: data.status || 'pending',
    qr_url: data.qr_url || null,
    qr_string: data.qr_string || null,
    buyer_email: data.buyer_email || null,
    product_id: data.product_id || null,
    metadata: data.metadata || {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    expires_at: data.expiry_time || new Date(Date.now() + 15 * 60 * 1000).toISOString()
  };

  // Simpan ke memory
  memStore.set(trx.id, trx);

  // Simpan ke Supabase kalau ada
  if (supabase) {
    try {
      await supabase.from('zp_transactions').insert(trx);
    } catch (e) {
      console.error('[DB] Gagal simpan ke Supabase:', e.message);
    }
  }

  return trx;
}

/**
 * Update status transaksi
 */
async function updateStatus(transactionId, status, extra = {}) {
  const update = {
    status,
    updated_at: new Date().toISOString(),
    ...extra
  };

  // Update memory
  const existing = memStore.get(transactionId);
  if (existing) {
    memStore.set(transactionId, { ...existing, ...update });
  }

  // Update Supabase
  if (supabase) {
    try {
      await supabase
        .from('zp_transactions')
        .update(update)
        .eq('id', transactionId);
    } catch (e) {
      console.error('[DB] Gagal update Supabase:', e.message);
    }
  }

  return memStore.get(transactionId);
}

/**
 * Ambil satu transaksi
 */
async function getTransaction(transactionId) {
  // Cek memory dulu (lebih cepat)
  if (memStore.has(transactionId)) {
    return memStore.get(transactionId);
  }

  // Fallback ke Supabase
  if (supabase) {
    try {
      const { data } = await supabase
        .from('zp_transactions')
        .select('*')
        .eq('id', transactionId)
        .single();

      if (data) {
        memStore.set(transactionId, data); // Cache ke memory
        return data;
      }
    } catch (e) {}
  }

  return null;
}

/**
 * Ambil semua transaksi (untuk dashboard)
 */
async function getAllTransactions({ limit = 50, status = null } = {}) {
  // Dari Supabase kalau ada
  if (supabase) {
    try {
      let query = supabase
        .from('zp_transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (status) query = query.eq('status', status);

      const { data } = await query;
      if (data) return data;
    } catch (e) {}
  }

  // Fallback dari memory
  const all = Array.from(memStore.values())
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, limit);

  return status ? all.filter(t => t.status === status) : all;
}

/**
 * Stats untuk dashboard
 */
async function getStats() {
  const all = await getAllTransactions({ limit: 1000 });
  const paid = all.filter(t => t.status === 'settlement' || t.status === 'PAID');
  const pending = all.filter(t => t.status === 'pending');
  const totalRevenue = paid.reduce((sum, t) => sum + (t.amount || 0), 0);

  // Today
  const today = new Date().toDateString();
  const todayPaid = paid.filter(t => new Date(t.updated_at).toDateString() === today);
  const todayRevenue = todayPaid.reduce((sum, t) => sum + (t.amount || 0), 0);

  return {
    total_transactions: all.length,
    total_paid: paid.length,
    total_pending: pending.length,
    total_revenue: totalRevenue,
    today_transactions: todayPaid.length,
    today_revenue: todayRevenue,
    success_rate: all.length > 0 ? ((paid.length / all.length) * 100).toFixed(1) : '0'
  };
}

module.exports = { saveTransaction, updateStatus, getTransaction, getAllTransactions, getStats };
