/**
 * RuneBolt API Server
 * REST API for the RuneBolt Bridge
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const LndClient = require('./lnd');
const RuneBoltBridge = require('./bridge');

const app = express();
// SECURITY: Restrict CORS to known origins only
const ALLOWED_ORIGINS = [
  'https://blockgenomics.io',
  'https://www.blockgenomics.io',
  'https://runebolt.blockgenomics.io',
];
if (process.env.NODE_ENV !== 'production') {
  ALLOWED_ORIGINS.push('http://localhost:3000', 'http://localhost:3141');
}
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, curl, etc.)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
}));
app.use(express.json());

// SECURITY: Admin authentication middleware
function requireAdminAuth(req, res, next) {
  const apiKey = req.headers['x-admin-key'];
  if (!process.env.RUNEBOLT_ADMIN_KEY) {
    return res.status(503).json({ error: 'Admin key not configured' });
  }
  if (apiKey !== process.env.RUNEBOLT_ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Initialize LND client & bridge
const lnd = new LndClient(
  process.env.VOLTAGE_REST_URL,
  process.env.VOLTAGE_MACAROON
);

const bridge = new RuneBoltBridge(lnd, {
  feeRate: parseFloat(process.env.RUNEBOLT_FEE_RATE || '0.003'),
});

// ── Health & Status ──────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'runebolt', timestamp: new Date().toISOString() });
});

app.get('/api/status', async (req, res) => {
  try {
    const status = await bridge.getStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Lightning Direct ─────────────────────────────────────────────

// Create invoice (receive sats)
app.post('/api/lightning/invoice', async (req, res) => {
  try {
    const { amount, memo, expiry } = req.body;
    if (!amount) return res.status(400).json({ error: 'amount required' });
    const invoice = await lnd.createInvoice(amount, memo || '', expiry || 3600);
    res.json({
      paymentRequest: invoice.payment_request,
      paymentHash: Buffer.from(invoice.r_hash, 'base64').toString('hex'),
      expiresAt: new Date(Date.now() + (expiry || 3600) * 1000).toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Pay invoice (send sats)
app.post('/api/lightning/pay', async (req, res) => {
  try {
    const { paymentRequest, feeLimit } = req.body;
    if (!paymentRequest) return res.status(400).json({ error: 'paymentRequest required' });
    const result = await lnd.payInvoice(paymentRequest, feeLimit || 100);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Decode invoice
app.get('/api/lightning/decode/:payreq', async (req, res) => {
  try {
    const decoded = await lnd.decodeInvoice(req.params.payreq);
    res.json(decoded);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Node info
app.get('/api/lightning/info', async (req, res) => {
  try {
    const info = await lnd.getInfo();
    res.json({
      alias: info.alias,
      pubkey: info.identity_pubkey,
      channels: info.num_active_channels,
      peers: info.num_peers,
      blockHeight: info.block_height,
      synced: info.synced_to_chain,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── RuneBolt Bridge — DOG & Bitmap ───────────────────────────────

const { AssetRegistry } = require('./assets');

// List supported assets (DOG + Bitmap)
app.get('/api/bridge/assets', (req, res) => {
  res.json(AssetRegistry.list());
});

// Calculate transfer fee
app.post('/api/bridge/fee', (req, res) => {
  try {
    const { asset, amount } = req.body;
    if (!asset || !amount) return res.status(400).json({ error: 'asset (DOG or BITMAP) and amount required' });
    const fee = AssetRegistry.calculateFee(asset, amount, bridge.feeRate);
    res.json(fee);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Transfer DOG
app.post('/api/bridge/transfer/dog', async (req, res) => {
  try {
    const { amount, senderAddress, receiverAddress } = req.body;
    if (!amount || !senderAddress || !receiverAddress) {
      return res.status(400).json({ error: 'amount, senderAddress, receiverAddress required' });
    }
    const result = await bridge.transferDog(amount, senderAddress, receiverAddress);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Transfer Bitmap
app.post('/api/bridge/transfer/bitmap', async (req, res) => {
  try {
    const { blockNumber, senderAddress, receiverAddress } = req.body;
    if (!blockNumber || !senderAddress || !receiverAddress) {
      return res.status(400).json({ error: 'blockNumber, senderAddress, receiverAddress required' });
    }
    const result = await bridge.transferBitmap(blockNumber, senderAddress, receiverAddress);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check transfer status
app.get('/api/bridge/transfer/:id', async (req, res) => {
  try {
    const result = await bridge.checkTransfer(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// List transfers (filter by ?asset=DOG|BITMAP&status=complete)
app.get('/api/bridge/transfers', (req, res) => {
  res.json(bridge.listTransfers(req.query.asset || null, req.query.status || null));
});

// Get inventory
app.get('/api/bridge/inventory', (req, res) => {
  res.json(bridge.getInventory());
});

// Add DOG inventory (admin — requires x-admin-key header)
app.post('/api/bridge/inventory/dog', requireAdminAuth, (req, res) => {
  const { amount } = req.body;
  if (!amount) return res.status(400).json({ error: 'amount required' });
  res.json(bridge.addDogInventory(amount));
});

// Add Bitmap inventory (admin — requires x-admin-key header)
app.post('/api/bridge/inventory/bitmap', requireAdminAuth, (req, res) => {
  const { blockNumber } = req.body;
  if (!blockNumber) return res.status(400).json({ error: 'blockNumber required' });
  res.json(bridge.addBitmapInventory(blockNumber));
});

// ── Start ────────────────────────────────────────────────────────

const PORT = process.env.RUNEBOLT_PORT || 3141;

app.listen(PORT, () => {
  console.log(`⚡ RuneBolt Bridge running on port ${PORT}`);
  console.log(`  LND: ${process.env.VOLTAGE_REST_URL}`);
  console.log(`  Fee Rate: ${process.env.RUNEBOLT_FEE_RATE || '0.3%'}`);
  
  // Verify LND connection on startup
  lnd.getInfo().then(info => {
    console.log(`  Node: ${info.alias} (${info.identity_pubkey.slice(0, 12)}...)`);
    console.log(`  Channels: ${info.num_active_channels} active`);
    console.log(`  Synced: ${info.synced_to_chain}`);
    console.log(`  ✅ Connected to Voltage LND`);
  }).catch(err => {
    console.error(`  ❌ LND connection failed: ${err.message}`);
  });
});
