-- ================================================
-- ZaeinPayment - Supabase Schema
-- Jalankan di Supabase SQL Editor
-- ================================================

create table if not exists zp_transactions (
  id              text primary key,          -- transaction_id dari GoPay
  order_id        text not null,             -- ZP-xxx format
  amount          integer not null,
  status          text default 'pending',    -- pending | settlement | expire | cancel
  qr_url          text,
  qr_string       text,
  buyer_email     text,
  product_id      text,
  metadata        jsonb default '{}',
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  expires_at      timestamptz,
  settlement_time timestamptz
);

-- Index untuk query cepat
create index if not exists idx_zp_trx_status on zp_transactions(status);
create index if not exists idx_zp_trx_created on zp_transactions(created_at desc);
create index if not exists idx_zp_trx_order on zp_transactions(order_id);

-- RLS (nonaktifkan dulu kalau pakai service key)
alter table zp_transactions disable row level security;
