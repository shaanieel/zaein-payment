# ZaeinPayment 🟢

**Self-hosted GoPay QRIS Payment Gateway** untuk ZaeinStore.  
Tidak perlu VMP, tidak ada biaya withdrawal — uang langsung masuk ke saldo GoPay Merchant kamu.

---

## Cara Kerja

```
User checkout ZaeinStore
        ↓
Cloudflare Worker → POST /api/qris/generate ke ZaeinPayment
        ↓
ZaeinPayment → request QRIS ke GoPay Merchant API
        ↓
Tampilkan QR ke user (15 menit)
        ↓
User bayar via GoPay / QRIS
        ↓
GoPay kirim callback → ZaeinPayment webhook
        ↓
ZaeinPayment forward ke Cloudflare Worker ZaeinStore
        ↓
Worker kirim Google Drive file ke buyer ✅
```

## Fitur

- ✅ Generate QRIS dinamis per transaksi via GoPay Merchant API
- ✅ Webhook callback real-time ke ZaeinStore Worker
- ✅ Dashboard monitoring transaksi
- ✅ Polling endpoint untuk countdown timer frontend
- ✅ Simpan history ke Supabase (opsional)
- ✅ HMAC signature verification
- ✅ Rate limiting & helmet security
- ✅ Deploy-ready di Railway (gratis)

## Setup

### 1. Clone & Install
```bash
git clone https://github.com/kamu/zaein-payment
cd zaein-payment
npm install
```

### 2. Konfigurasi
```bash
cp .env.example .env
# Edit .env sesuai konfigurasi kamu
```

### 3. Jalankan
```bash
npm start          # Production
npm run dev        # Development (nodemon)
```

### 4. Hubungkan GoPay
1. Buka `http://localhost:3000/dashboard`
2. Login dengan username/password dari `.env`
3. Klik **Koneksi GoPay** → masukkan nomor HP GoPay Merchant
4. Verifikasi OTP yang dikirim ke HP
5. Done! GoPay terhubung ✅

### 5. Set Webhook URL
Di `.env`, set `ZAEINSTORE_WEBHOOK_URL` ke endpoint Cloudflare Worker ZaeinStore kamu.

## Deploy ke Railway

1. Push repo ke GitHub (private repo aman)
2. Buka [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Pilih repo ini
4. Di Railway → Variables, tambahkan semua isi `.env`
5. Deploy otomatis jalan

## API

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| POST | `/api/qris/generate` | Generate QRIS baru |
| POST | `/api/qris/status` | Cek status transaksi |
| GET | `/api/qris/poll/:id` | Polling untuk frontend |
| POST | `/webhook/gopay` | Callback dari GoPay |
| GET | `/health` | Health check |

Header auth: `X-Api-Key: YOUR_API_SECRET_KEY`

## Lihat juga

- [`docs/integration.md`](docs/integration.md) — Cara integrasi ke ZaeinStore Worker
- [`docs/supabase-schema.sql`](docs/supabase-schema.sql) — Schema database

---

Built for ZaeinStore 🎬
