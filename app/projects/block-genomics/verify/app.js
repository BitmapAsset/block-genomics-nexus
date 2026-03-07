/**
 * Block Genomics Verify — Core Application Logic
 * Handles wallet connection, bitmap detection, verification, and agent management.
 */

const BG = {
  API: 'https://mempool.space/api',
  HIRO_API: 'https://api.hiro.so/ordinals/v1',
  
  // State
  wallet: {
    connected: false,
    provider: null,  // 'unisat' | 'xverse' | 'leather'
    address: null,
    ordinalsAddress: null,
    paymentAddress: null,
    publicKey: null,
    inscriptions: [],
    bitmaps: [],
  },
  
  currentAgent: null,
  verificationResult: null,

  // ============================================
  // WALLET DETECTION
  // ============================================
  
  detectWallets() {
    const wallets = [];
    if (typeof window.unisat !== 'undefined') {
      wallets.push({ id: 'unisat', name: 'Unisat', icon: '🟡', available: true });
    } else {
      wallets.push({ id: 'unisat', name: 'Unisat', icon: '🟡', available: false, 
        installUrl: 'https://unisat.io/download' });
    }
    
    // Xverse via sats-connect
    if (typeof window.XverseProviders !== 'undefined' || typeof window.BitcoinProvider !== 'undefined') {
      wallets.push({ id: 'xverse', name: 'Xverse', icon: '🔵', available: true });
    } else {
      wallets.push({ id: 'xverse', name: 'Xverse', icon: '🔵', available: false,
        installUrl: 'https://www.xverse.app/download' });
    }
    
    // Leather
    if (typeof window.LeatherProvider !== 'undefined' || typeof window.btc !== 'undefined') {
      wallets.push({ id: 'leather', name: 'Leather', icon: '🟤', available: true });
    } else {
      wallets.push({ id: 'leather', name: 'Leather', icon: '🟤', available: false,
        installUrl: 'https://leather.io/install-extension' });
    }
    
    return wallets;
  },

  // ============================================
  // WALLET CONNECTION
  // ============================================
  
  async connectUnisat() {
    try {
      const accounts = await window.unisat.requestAccounts();
      const address = accounts[0];
      const publicKey = await window.unisat.getPublicKey();
      const balance = await window.unisat.getBalance();
      
      this.wallet.connected = true;
      this.wallet.provider = 'unisat';
      this.wallet.address = address;
      this.wallet.ordinalsAddress = address;
      this.wallet.paymentAddress = address;
      this.wallet.publicKey = publicKey;
      this.wallet.balance = balance;
      
      // Fetch inscriptions
      await this.fetchUnisatInscriptions();
      
      return { success: true, address, publicKey, balance };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },
  
  async connectXverse() {
    try {
      const response = await window.sats?.request?.('wallet_connect', {
        addresses: ['ordinals', 'payment'],
        message: 'Block Genomics Verify — Connect to prove Bitmap ownership'
      });
      
      if (response?.status === 'success') {
        const ordinals = response.result.addresses.find(a => a.purpose === 'ordinals');
        const payment = response.result.addresses.find(a => a.purpose === 'payment');
        
        this.wallet.connected = true;
        this.wallet.provider = 'xverse';
        this.wallet.ordinalsAddress = ordinals?.address;
        this.wallet.paymentAddress = payment?.address;
        this.wallet.address = ordinals?.address || payment?.address;
        this.wallet.publicKey = ordinals?.publicKey;
        
        await this.fetchHiroInscriptions(this.wallet.ordinalsAddress);
        
        return { success: true, address: this.wallet.address };
      }
      return { success: false, error: 'Connection rejected' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },
  
  async connectWallet(providerId) {
    switch (providerId) {
      case 'unisat': return this.connectUnisat();
      case 'xverse': return this.connectXverse();
      default: return { success: false, error: 'Unsupported wallet' };
    }
  },
  
  disconnectWallet() {
    this.wallet = {
      connected: false, provider: null, address: null,
      ordinalsAddress: null, paymentAddress: null, publicKey: null,
      inscriptions: [], bitmaps: [],
    };
  },

  // ============================================
  // BITMAP DETECTION
  // ============================================
  
  async fetchUnisatInscriptions() {
    try {
      let allInscriptions = [];
      let cursor = 0;
      const pageSize = 100;
      
      // Paginate through all inscriptions
      while (true) {
        const result = await window.unisat.getInscriptions(cursor, pageSize);
        if (!result || !result.list || result.list.length === 0) break;
        allInscriptions = allInscriptions.concat(result.list);
        cursor += result.list.length;
        if (allInscriptions.length >= result.total) break;
        if (cursor >= 1000) break; // Safety limit
      }
      
      this.wallet.inscriptions = allInscriptions;
      this.wallet.bitmaps = this.detectBitmaps(allInscriptions);
      
      return this.wallet.bitmaps;
    } catch (e) {
      console.error('Failed to fetch inscriptions:', e);
      return [];
    }
  },
  
  async fetchHiroInscriptions(address) {
    try {
      let allInscriptions = [];
      let offset = 0;
      const limit = 60;
      
      while (true) {
        const resp = await fetch(
          `${this.HIRO_API}/inscriptions?address=${address}&limit=${limit}&offset=${offset}`
        );
        const data = await resp.json();
        if (!data.results || data.results.length === 0) break;
        allInscriptions = allInscriptions.concat(data.results);
        offset += data.results.length;
        if (allInscriptions.length >= data.total || offset >= 500) break;
      }
      
      this.wallet.inscriptions = allInscriptions;
      this.wallet.bitmaps = this.detectBitmapsHiro(allInscriptions);
      
      return this.wallet.bitmaps;
    } catch (e) {
      console.error('Failed to fetch inscriptions from Hiro:', e);
      return [];
    }
  },
  
  detectBitmaps(inscriptions) {
    return inscriptions.filter(insc => {
      // Bitmap format: "{blockheight}.bitmap"
      const content = insc.content || '';
      if (typeof content === 'string' && /^\d+\.bitmap$/.test(content)) return true;
      // Also check content type
      if (insc.contentType === 'text/plain' || insc.contentType?.startsWith('text/')) {
        // Try to fetch content if needed
        return /^\d+\.bitmap$/.test(content);
      }
      return false;
    }).map(insc => {
      const match = (insc.content || '').match(/^(\d+)\.bitmap$/);
      return {
        inscriptionId: insc.inscriptionId,
        inscriptionNumber: insc.inscriptionNumber,
        blockHeight: match ? parseInt(match[1]) : null,
        address: insc.address,
        content: insc.content,
        timestamp: insc.timestamp,
      };
    });
  },
  
  detectBitmapsHiro(inscriptions) {
    // For Hiro API, we need to check content_type and potentially fetch content
    return inscriptions.filter(insc => {
      return insc.mime_type === 'text/plain' && insc.content_length < 100;
    }).map(insc => ({
      inscriptionId: insc.id,
      inscriptionNumber: insc.number,
      blockHeight: null, // Need to fetch content to determine
      address: insc.address,
      genesis_block_height: insc.genesis_block_height,
    }));
  },
  
  async fetchInscriptionContent(inscriptionId) {
    try {
      const resp = await fetch(`${this.HIRO_API}/inscriptions/${inscriptionId}/content`);
      const text = await resp.text();
      return text;
    } catch (e) {
      return null;
    }
  },

  // ============================================
  // CHALLENGE GENERATION & SIGNING
  // ============================================
  
  generateChallenge(blockHeight, agentName) {
    const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    const timestamp = new Date().toISOString();
    
    const message = [
      'Block Genomics Agent Verification',
      '===================================',
      `Action: register_agent`,
      `Block: ${blockHeight}`,
      `Agent: ${agentName}`,
      `Timestamp: ${timestamp}`,
      `Nonce: ${nonce}`,
      `Chain: bitcoin-mainnet`,
      '===================================',
      `Sign this message to verify you own Bitmap #${blockHeight}`,
    ].join('\n');
    
    return { message, nonce, timestamp, blockHeight, agentName };
  },
  
  async signChallenge(message) {
    try {
      if (this.wallet.provider === 'unisat') {
        const signature = await window.unisat.signMessage(message, 'bip322-simple');
        return { success: true, signature };
      } else if (this.wallet.provider === 'xverse') {
        const response = await window.sats.request('signMessage', {
          address: this.wallet.ordinalsAddress,
          message: message,
          protocol: 'BIP322',
        });
        if (response.status === 'success') {
          return { success: true, signature: response.result.signature };
        }
        return { success: false, error: 'Signing rejected' };
      }
      return { success: false, error: 'No wallet connected' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  // ============================================
  // GENOME GENERATION
  // ============================================
  
  async sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0')).join('');
  },
  
  async generateGenome(blockHeight) {
    // Fetch block data
    const hashResp = await fetch(`${this.API}/block-height/${blockHeight}`);
    if (!hashResp.ok) throw new Error('Block not found');
    const blockHash = await hashResp.text();
    
    const blockResp = await fetch(`${this.API}/block/${blockHash}`);
    const block = await blockResp.json();
    
    // Fetch transactions (up to 200 for richer genome)
    const txPages = Math.min(Math.ceil(block.tx_count / 25), 8);
    let transactions = [];
    for (let i = 0; i < txPages; i++) {
      const txResp = await fetch(`${this.API}/block/${blockHash}/txs/${i * 25}`);
      const txs = await txResp.json();
      transactions = transactions.concat(txs);
    }
    
    // Build genome data
    const genomeData = {
      version: 1,
      height: block.height,
      hash: block.id,
      merkleRoot: block.merkle_root,
      previousHash: block.previousblockhash,
      timestamp: block.timestamp,
      nonce: block.nonce,
      bits: block.bits,
      difficulty: block.difficulty,
      txCount: block.tx_count,
      size: block.size,
      weight: block.weight,
      // Transaction fingerprints
      txFingerprints: transactions.map(tx => ({
        id: tx.txid.slice(0, 16),
        ins: tx.vin.length,
        outs: tx.vout.length,
        fee: tx.fee || 0,
        size: tx.size || 0,
        outputTypes: tx.vout.map(o => o.scriptpubkey_type).join(','),
        totalValue: tx.vout.reduce((s, o) => s + o.value, 0),
      })),
    };
    
    const genomeString = JSON.stringify(genomeData);
    const genomeHash = await this.sha256(genomeString);
    
    // Generate DNA sequence
    const dnaSequence = this.generateDNASequence(block, transactions);
    
    // Calculate trust score components
    const trustComponents = this.calculateTrustScore(block, transactions);
    
    // Analyze block characteristics
    const analysis = this.analyzeBlock(block, transactions);
    
    return {
      genome: genomeHash,
      block,
      transactions,
      dnaSequence,
      trustComponents,
      analysis,
      genomeData,
    };
  },
  
  generateDNASequence(block, txs) {
    const bases = ['A', 'T', 'G', 'C'];
    const fullData = block.id + block.merkle_root;
    let sequence = '';
    
    for (let i = 0; i < fullData.length; i++) {
      const val = parseInt(fullData[i], 16);
      if (!isNaN(val)) sequence += bases[val % 4];
    }
    
    // Add transaction-derived bases
    txs.forEach(tx => {
      const fee = tx.fee || 0;
      sequence += bases[fee % 4];
      sequence += bases[tx.vin.length % 4];
      sequence += bases[tx.vout.length % 4];
    });
    
    return sequence;
  },
  
  calculateTrustScore(block, txs) {
    const now = Date.now() / 1000;
    const years = (now - block.timestamp) / (365.25 * 24 * 3600);
    
    const ageFactor = Math.min(years / 10, 1) * 25;
    const txDensity = Math.min(block.tx_count / 4000, 1);
    const sizeDensity = Math.min(block.size / 4000000, 1);
    const richnessFactor = ((txDensity + sizeDensity) / 2) * 25;
    const diffFactor = Math.min(block.difficulty / 100e12, 1) * 20;
    const ownershipFactor = 20; // Full score for verified owner
    const historyFactor = 10; // Default for new registration
    
    const total = Math.round(ageFactor + richnessFactor + diffFactor + ownershipFactor + historyFactor);
    
    return {
      total: Math.min(total, 100),
      age: { score: Math.round(ageFactor), max: 25, years: years.toFixed(1) },
      richness: { score: Math.round(richnessFactor), max: 25, txCount: block.tx_count, size: block.size },
      security: { score: Math.round(diffFactor), max: 20, difficulty: block.difficulty },
      ownership: { score: ownershipFactor, max: 20 },
      history: { score: historyFactor, max: 10 },
    };
  },
  
  analyzeBlock(block, txs) {
    // Script type distribution
    const typeCounts = {};
    let totalOutputs = 0;
    let totalValue = 0;
    let totalFees = 0;
    
    txs.forEach(tx => {
      totalFees += tx.fee || 0;
      tx.vout.forEach(o => {
        const t = o.scriptpubkey_type || 'unknown';
        typeCounts[t] = (typeCounts[t] || 0) + 1;
        totalOutputs++;
        totalValue += o.value;
      });
    });
    
    // Notable characteristics
    const notable = [];
    if (block.height === 0) notable.push('Genesis Block');
    if (block.height === 170) notable.push('First Bitcoin Transaction');
    if (block.height % 210000 === 0) notable.push('Halving Block');
    if (block.height === 709632) notable.push('Taproot Activation');
    if (block.height === 767430) notable.push('Ordinals Protocol Birth');
    if (block.tx_count > 3000) notable.push('High Transaction Count');
    if (block.size > 3000000) notable.push('Near-Maximum Block Size');
    
    const hasTaproot = typeCounts['v1_p2tr'] > 0;
    const hasOpReturn = typeCounts['op_return'] > 0;
    if (hasTaproot) notable.push('Contains Taproot Transactions');
    if (hasOpReturn) notable.push('Contains OP_RETURN Data');
    
    return {
      typeCounts,
      totalOutputs,
      totalValue,
      totalFees,
      sampledTxCount: txs.length,
      notable,
      hasTaproot,
      hasOpReturn,
    };
  },

  // ============================================
  // FULL VERIFICATION FLOW
  // ============================================
  
  async verifyAgent(blockHeight, agentName, tier = 1) {
    const steps = [];
    
    // Step 1: Generate genome
    steps.push({ step: 'genome', status: 'processing' });
    const genomeResult = await this.generateGenome(blockHeight);
    steps[0].status = 'done';
    steps[0].data = genomeResult;
    
    // Step 2: Generate challenge
    steps.push({ step: 'challenge', status: 'processing' });
    const challenge = this.generateChallenge(blockHeight, agentName);
    steps[1].status = 'done';
    steps[1].data = challenge;
    
    // Step 3: Sign (if wallet connected)
    if (this.wallet.connected) {
      steps.push({ step: 'sign', status: 'processing' });
      const signResult = await this.signChallenge(challenge.message);
      steps[2].status = signResult.success ? 'done' : 'failed';
      steps[2].data = signResult;
    }
    
    // Step 4: Create agent record
    const agent = {
      id: 'bg_' + genomeResult.genome.slice(0, 16),
      name: agentName,
      blockHeight: blockHeight,
      blockHash: genomeResult.block.id,
      genome: genomeResult.genome,
      tier: tier,
      trustScore: genomeResult.trustComponents.total,
      trustComponents: genomeResult.trustComponents,
      analysis: genomeResult.analysis,
      dnaSequence: genomeResult.dnaSequence,
      verified: this.wallet.connected,
      walletAddress: this.wallet.address,
      provider: this.wallet.provider,
      registeredAt: new Date().toISOString(),
      block: genomeResult.block,
    };
    
    this.currentAgent = agent;
    return { agent, steps, genomeResult };
  },
  
  // ============================================
  // BADGE GENERATION
  // ============================================
  
  generateBadgeSVG(agent, theme = 'dark') {
    const tierColors = {
      1: { bg: '#1a1508', border: '#f7931a', text: '#f7931a', label: 'Block Owner' },
      2: { bg: '#121218', border: '#94a3b8', text: '#94a3b8', label: 'TX Anchor' },
      3: { bg: '#1a1410', border: '#cd7f32', text: '#cd7f32', label: 'Delegated' },
    };
    const t = tierColors[agent.tier] || tierColors[1];
    
    return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="56" viewBox="0 0 320 56">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${t.bg}"/>
          <stop offset="100%" stop-color="#0c0c14"/>
        </linearGradient>
      </defs>
      <rect width="320" height="56" rx="12" fill="url(#bg)" stroke="${t.border}" stroke-width="1" stroke-opacity="0.4"/>
      <text x="40" y="22" font-family="system-ui,sans-serif" font-size="12" font-weight="700" fill="${t.text}">
        ✓ Verified • Block #${agent.blockHeight.toLocaleString()}
      </text>
      <text x="40" y="38" font-family="monospace" font-size="9" fill="#71717a">
        Genome: ${agent.genome.slice(0, 16)}… • Trust: ${agent.trustScore}/100
      </text>
      <text x="16" y="34" font-size="20">🧬</text>
    </svg>`;
  },
  
  generateEmbedCode(agent) {
    return `<!-- Block Genomics Verification Badge -->
<a href="https://verify.blockgenomics.io/agent/${agent.id}" 
   target="_blank" rel="noopener"
   title="Verified by Block Genomics | Trust: ${agent.trustScore}/100">
  <img src="https://verify.blockgenomics.io/api/v1/badge/${agent.id}.svg"
       alt="✓ Verified by Block Genomics"
       width="320" height="56" />
</a>`;
  },
  
  // ============================================
  // DELEGATION 
  // ============================================
  
  async createDelegation(parentAgent, childAgentName, tier = 3) {
    if (tier < 2 || tier > 3) throw new Error('Delegation tier must be 2 or 3');
    if (!parentAgent || parentAgent.tier !== 1) throw new Error('Only Tier 1 agents can delegate');
    
    const delegationId = 'del_' + await this.sha256(
      parentAgent.id + childAgentName + Date.now()
    );
    
    const delegation = {
      delegationId: delegationId.slice(0, 20),
      parentAgentId: parentAgent.id,
      parentBlockHeight: parentAgent.blockHeight,
      childAgentName,
      tier,
      grantedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'active',
    };
    
    // Calculate delegated trust score (reduced from parent)
    const trustReduction = tier === 2 ? 0.8 : 0.6;
    const childTrustScore = Math.round(parentAgent.trustScore * trustReduction);
    
    const childAgent = {
      id: 'bg_' + delegationId.slice(4, 20),
      name: childAgentName,
      blockHeight: parentAgent.blockHeight,
      genome: parentAgent.genome,
      tier,
      trustScore: childTrustScore,
      delegation,
      verified: true,
      registeredAt: new Date().toISOString(),
    };
    
    return { delegation, childAgent };
  },

  // ============================================
  // STORAGE (Local for PoC)
  // ============================================
  
  saveAgent(agent) {
    const agents = this.getAgents();
    agents[agent.id] = agent;
    localStorage.setItem('bg_agents', JSON.stringify(agents));
  },
  
  getAgents() {
    try {
      return JSON.parse(localStorage.getItem('bg_agents') || '{}');
    } catch { return {}; }
  },
  
  getAgent(id) {
    return this.getAgents()[id] || null;
  },
  
  searchAgents(query) {
    const agents = Object.values(this.getAgents());
    const q = query.toLowerCase();
    return agents.filter(a => 
      a.name.toLowerCase().includes(q) || 
      String(a.blockHeight).includes(q) ||
      a.genome.includes(q) ||
      a.id.includes(q)
    );
  },
};

// Export for use
window.BG = BG;
