/**
 * LND Client — Direct Voltage REST API connection
 * No LNbits needed. Talks directly to the LND node.
 */

const https = require('https');
const http = require('http');

class LndClient {
  constructor(restUrl, macaroon) {
    this.restUrl = restUrl.replace(/\/$/, '');
    if (!this.restUrl.startsWith('http')) {
      this.restUrl = `https://${this.restUrl}`;
    }
    this.macaroon = macaroon;
  }

  async request(method, path, body = null) {
    const url = `${this.restUrl}${path}`;
    const headers = {
      'Grpc-Metadata-macaroon': this.macaroon,
      'Content-Type': 'application/json',
    };

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await res.json();
    if (data.code && data.message) {
      throw new Error(`LND Error (${data.code}): ${data.message}`);
    }
    return data;
  }

  // Node info
  async getInfo() {
    return this.request('GET', '/v1/getinfo');
  }

  // Wallet balance (on-chain)
  async getWalletBalance() {
    return this.request('GET', '/v1/balance/blockchain');
  }

  // Channel balance (off-chain)
  async getChannelBalance() {
    return this.request('GET', '/v1/balance/channels');
  }

  // List channels
  async listChannels() {
    return this.request('GET', '/v1/channels');
  }

  // Create invoice (receive payment)
  async createInvoice(amountSats, memo = '', expirySeconds = 3600) {
    return this.request('POST', '/v1/invoices', {
      value: String(amountSats),
      memo,
      expiry: String(expirySeconds),
    });
  }

  // Pay invoice (send payment)
  async payInvoice(paymentRequest, feeLimitSats = 100) {
    return this.request('POST', '/v1/channels/transactions', {
      payment_request: paymentRequest,
      fee_limit: { fixed: String(feeLimitSats) },
    });
  }

  // Decode invoice (inspect before paying)
  async decodeInvoice(paymentRequest) {
    return this.request('GET', `/v1/payreq/${paymentRequest}`);
  }

  // Lookup invoice by payment hash
  async lookupInvoice(paymentHash) {
    return this.request('GET', `/v1/invoice/${paymentHash}`);
  }

  // List invoices
  async listInvoices(pendingOnly = false, numMaxInvoices = 100) {
    return this.request('GET', `/v1/invoices?pending_only=${pendingOnly}&num_max_invoices=${numMaxInvoices}`);
  }

  // List payments
  async listPayments(includeIncomplete = false) {
    return this.request('GET', `/v1/payments?include_incomplete=${includeIncomplete}`);
  }

  // New on-chain address
  async newAddress(type = 'WITNESS_PUBKEY_HASH') {
    return this.request('GET', `/v1/newaddress?type=${type}`);
  }

  // Send on-chain
  async sendCoins(address, amountSats, satPerVbyte = 2) {
    return this.request('POST', '/v1/transactions', {
      addr: address,
      amount: String(amountSats),
      sat_per_vbyte: String(satPerVbyte),
    });
  }

  // Subscribe to invoices (polling-based for REST)
  async getSettledInvoices(indexOffset = 0) {
    return this.request('GET', `/v1/invoices?index_offset=${indexOffset}&num_max_invoices=100`);
  }
}

module.exports = LndClient;
