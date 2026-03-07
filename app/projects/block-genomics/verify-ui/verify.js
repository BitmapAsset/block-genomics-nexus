/* ============================================
   Block Genomics — Verification Flow Engine
   ============================================ */

(function () {
  'use strict';

  // ── State ──────────────────────────────────
  const state = {
    currentStep: 0,
    totalSteps: 7,
    demoMode: false,
    walletConnected: false,
    walletAddress: '',
    walletType: '',
    selectedBitmap: null,
    bitmaps: [],
    blockData: null,
    genome: null,
    identity: 'human', // 'human' | 'ai'
    trustScore: 0,
    traits: [],
    genomeHash: '',
    animFrameIds: [],
    revealComplete: false,
  };

  // ── Mock Data ──────────────────────────────
  const MOCK = {
    address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
    bitmaps: [
      { blockHeight: 500000, inscriptionId: '8a3b2c1d...e4f5a6b7i0', inscriptionNum: 12847392 },
      { blockHeight: 21000, inscriptionId: '9f4c3d2e...b8a7c6d5i0', inscriptionNum: 8934201 },
      { blockHeight: 777777, inscriptionId: 'c6d5e4f3...a2b1c0d9i0', inscriptionNum: 15239847 },
      { blockHeight: 840000, inscriptionId: 'a1b2c3d4...e5f6a7b8i0', inscriptionNum: 18472956 },
    ],
    blockData: {
      height: 500000,
      hash: '00000000000000000024fb37364cbf81fd49cc2d51c09c75c35433c3a1945d04',
      timestamp: '2017-12-18T18:35:25Z',
      txCount: 2702,
      size: '1,062,254 bytes',
      difficulty: '1,873,105,475,221',
      nonce: 3_604_508_752,
      merkleRoot: '871148c57dad60c0cde06b027145e6df43bc6ef1413b9b75b6b5e5e2f456a4bc',
    },
    genome: {
      sequence: 'ATCGATCGTTACGGATCGATCGTACGATCGATCGATTCGATCGATCGTACGATCGATCGATTACG',
      hash: 'a7f3c9e1b4d2f8a6c0e5b3d7f1a9c4e2b6d0f8a3c7e1b5d9f2a4c8e6b0d3f7',
    },
    traits: [
      { name: 'Genesis Proximity', rarity: 'legendary', icon: '⚡' },
      { name: 'High Density', rarity: 'epic', icon: '🧬' },
      { name: 'Halving Witness', rarity: 'rare', icon: '✂️' },
      { name: 'Palindrome Block', rarity: 'rare', icon: '🔄' },
      { name: 'Prime Height', rarity: 'common', icon: '🔢' },
      { name: 'Satoshi Era', rarity: 'legendary', icon: '👁️' },
    ],
    trustScore: 87,
  };

  // ── DOM Cache ──────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);
  const steps = [];
  const dots = [];

  // ── Init ───────────────────────────────────
  function init() {
    cacheDom();
    bindEvents();
    goToStep(0, false);
  }

  function cacheDom() {
    for (let i = 0; i < state.totalSteps; i++) {
      steps.push($(`#step-${i}`));
    }
    $$('.step-dots .dot').forEach((d) => dots.push(d));
  }

  function bindEvents() {
    // Demo mode
    $('#btn-demo')?.addEventListener('click', startDemo);
    // Welcome CTA
    $('#btn-connect-start')?.addEventListener('click', () => goToStep(1));
    // Wallet cards
    $$('.wallet-card').forEach((card) => {
      card.addEventListener('click', () => connectWallet(card.dataset.wallet));
    });
    // Bitmap selection
    document.addEventListener('click', (e) => {
      const bc = e.target.closest('.bitmap-card');
      if (bc) selectBitmap(parseInt(bc.dataset.index, 10));
    });
    // Sign button
    $('#btn-sign')?.addEventListener('click', startSigning);
    // Identity toggle
    $$('.identity-option').forEach((opt) => {
      opt.addEventListener('click', () => setIdentity(opt.dataset.identity));
    });
    // Back button
    $('#back-btn')?.addEventListener('click', goBack);
    // Share buttons
    $('#btn-share-x')?.addEventListener('click', shareOnX);
    $('#btn-copy-link')?.addEventListener('click', copyLink);
    $('#btn-download')?.addEventListener('click', downloadBadge);
    // Bitmap continue
    $('#btn-bitmap-continue')?.addEventListener('click', () => {
      if (state.selectedBitmap !== null) goToStep(3);
    });
    // Explore
    $('#btn-explore')?.addEventListener('click', () => {
      showToast('Explorer coming soon — stay tuned!');
    });
  }

  // ── Navigation ─────────────────────────────
  function goToStep(idx, animate = true) {
    if (idx < 0 || idx >= state.totalSteps) return;

    const prev = state.currentStep;
    state.currentStep = idx;

    // Update progress bar
    const pct = ((idx) / (state.totalSteps - 1)) * 100;
    $('.progress-bar .fill').style.width = `${pct}%`;

    // Update dots
    dots.forEach((d, i) => {
      d.classList.remove('active', 'completed');
      if (i === idx) d.classList.add('active');
      else if (i < idx) d.classList.add('completed');
    });

    // Transition steps
    steps.forEach((s, i) => {
      s.classList.remove('active', 'exit-left');
      if (i === idx) {
        s.classList.add('active');
      } else if (i < idx) {
        s.classList.add('exit-left');
      }
    });

    // Back button visibility
    const backBtn = $('#back-btn');
    if (idx > 0 && idx < 5) {
      backBtn.classList.add('visible');
    } else {
      backBtn.classList.remove('visible');
    }

    // Step-specific actions
    if (idx === 3) populateBlockPreview();
    if (idx === 5) runRevealSequence();
    if (idx === 6) populateProfile();
  }

  function goBack() {
    if (state.currentStep > 0) {
      goToStep(state.currentStep - 1);
    }
  }

  // ── Demo Mode ──────────────────────────────
  async function startDemo() {
    state.demoMode = true;
    state.bitmaps = MOCK.bitmaps;
    $('.demo-banner').classList.add('visible');

    goToStep(1);
    await sleep(800);
    await simulateWalletConnect();
    await sleep(1200);
    goToStep(2);
    renderBitmaps();
    await sleep(800);
    selectBitmap(0);
    await sleep(1000);
    goToStep(3);
    await sleep(2000);
    goToStep(4);
    await sleep(1500);
    // Simulate signing
    await sleep(2000);
    prepareGenomeData();
    goToStep(5);
  }

  // ── Wallet Connection ──────────────────────
  async function connectWallet(type) {
    const card = $(`.wallet-card[data-wallet="${type}"]`);
    if (!card) return;

    // Check for real wallet or use mock
    let address = '';
    let connected = false;

    if (!state.demoMode) {
      try {
        if (type === 'unisat' && window.unisat) {
          const accounts = await window.unisat.requestAccounts();
          address = accounts[0];
          connected = true;
        } else if (type === 'xverse' && window.XverseProviders) {
          // Xverse uses a different API
          showToast('Xverse integration coming soon');
          return;
        } else if (type === 'leather' && window.LeatherProvider) {
          showToast('Leather integration coming soon');
          return;
        } else {
          // No wallet detected — offer install
          showToast(`${type} wallet not detected — install it first!`);
          return;
        }
      } catch (e) {
        showToast('Connection cancelled');
        return;
      }
    } else {
      address = MOCK.address;
      connected = true;
    }

    if (connected) {
      state.walletConnected = true;
      state.walletAddress = address;
      state.walletType = type;

      // Animate card
      card.classList.add('connected');
      card.querySelector('.status').textContent = truncateAddress(address);
      card.querySelector('.arrow').textContent = '✓';

      await sleep(800);

      // Load bitmaps (mock for now)
      if (state.demoMode || true) { // TODO: real bitmap fetch
        state.bitmaps = MOCK.bitmaps;
      }

      goToStep(2);
      renderBitmaps();
    }
  }

  async function simulateWalletConnect() {
    const card = $(`.wallet-card[data-wallet="unisat"]`);
    state.walletConnected = true;
    state.walletAddress = MOCK.address;
    state.walletType = 'unisat';
    card.classList.add('connected');
    card.querySelector('.status').textContent = truncateAddress(MOCK.address);
    card.querySelector('.arrow').textContent = '✓';
  }

  // ── Bitmap Selection ───────────────────────
  function renderBitmaps() {
    const grid = $('#bitmap-grid');
    if (!grid) return;
    grid.innerHTML = '';

    if (state.bitmaps.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column: 1/-1;">
          <div class="emoji-big">🗺️</div>
          <p>No Bitmap inscriptions found in this wallet.</p>
          <p>Bitmaps are Ordinals inscriptions that map to Bitcoin blocks.<br>
          <a href="https://bitmap.community" target="_blank">Learn more →</a></p>
        </div>`;
      return;
    }

    state.bitmaps.forEach((bm, i) => {
      const card = document.createElement('div');
      card.className = 'bitmap-card';
      card.dataset.index = i;
      card.innerHTML = `
        <div class="block-num">#${bm.blockHeight.toLocaleString()}</div>
        <div class="block-label">Block Height</div>
        <div class="inscription-id">${bm.inscriptionId}</div>`;
      grid.appendChild(card);

      // Stagger entrance
      card.style.opacity = '0';
      card.style.transform = 'translateY(20px)';
      setTimeout(() => {
        card.style.transition = 'all 0.4s var(--ease-spring)';
        card.style.opacity = '1';
        card.style.transform = 'translateY(0)';
      }, 100 + i * 80);
    });
  }

  function selectBitmap(index) {
    state.selectedBitmap = index;
    $$('.bitmap-card').forEach((c, i) => {
      c.classList.toggle('selected', i === index);
    });
    const btn = $('#btn-bitmap-continue');
    if (btn) {
      btn.style.opacity = '1';
      btn.style.pointerEvents = 'auto';
    }
  }

  // ── Block Preview ──────────────────────────
  function populateBlockPreview() {
    const data = state.demoMode ? MOCK.blockData : (state.blockData || MOCK.blockData);
    const bm = state.bitmaps[state.selectedBitmap || 0];

    $('#preview-height').textContent = `#${data.height.toLocaleString()}`;
    $('#preview-hash').textContent = data.hash.substring(0, 24) + '…';
    $('#preview-hash').title = data.hash;
    const age = getBlockAge(data.timestamp);
    $('#preview-age').textContent = age;
    $('#preview-txcount').textContent = data.txCount.toLocaleString();

    // Preview traits with stagger
    const traitContainer = $('#preview-traits');
    if (traitContainer) {
      traitContainer.innerHTML = '';
      const previewTraits = (state.demoMode ? MOCK.traits : MOCK.traits).slice(0, 4);
      previewTraits.forEach((t, i) => {
        const badge = document.createElement('span');
        badge.className = 'trait-badge';
        badge.textContent = `${t.icon} ${t.name}`;
        traitContainer.appendChild(badge);
        setTimeout(() => badge.classList.add('visible'), 300 + i * 150);
      });
    }

    // Mini DNA preview canvas
    drawMiniDNA();
  }

  function drawMiniDNA() {
    const canvas = $('#mini-dna-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * dpr;
    canvas.height = canvas.offsetHeight * dpr;
    ctx.scale(dpr, dpr);
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;

    const colors = ['#ff4757', '#2ed573', '#1e90ff', '#ffa502'];
    let t = 0;

    function draw() {
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < 60; i++) {
        const x = (i / 60) * w;
        const y1 = h / 2 + Math.sin((i * 0.3) + t) * 20;
        const y2 = h / 2 - Math.sin((i * 0.3) + t) * 20;
        const col = colors[i % 4];

        ctx.beginPath();
        ctx.arc(x, y1, 3, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.globalAlpha = 0.6;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x, y2, 3, 0, Math.PI * 2);
        ctx.fill();

        if (i % 4 === 0) {
          ctx.beginPath();
          ctx.moveTo(x, y1);
          ctx.lineTo(x, y2);
          ctx.strokeStyle = col;
          ctx.globalAlpha = 0.15;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      t += 0.02;
      state.animFrameIds.push(requestAnimationFrame(draw));
    }
    draw();
  }

  // ── Signing ────────────────────────────────
  async function startSigning() {
    goToStep(4);

    if (state.demoMode) {
      await sleep(2500);
      prepareGenomeData();
      goToStep(5);
    } else {
      // Real signing
      try {
        const message = `Block Genomics Verification\nBlock: ${state.bitmaps[state.selectedBitmap].blockHeight}\nTimestamp: ${Date.now()}`;
        if (state.walletType === 'unisat' && window.unisat) {
          await window.unisat.signMessage(message);
        }
        prepareGenomeData();
        goToStep(5);
      } catch (e) {
        showToast('Signing cancelled — try again');
        goToStep(3);
      }
    }
  }

  function prepareGenomeData() {
    // Generate genome from block data (mock derivation)
    const bases = ['A', 'T', 'C', 'G'];
    const hash = MOCK.blockData.hash;
    let sequence = '';
    for (let i = 0; i < hash.length; i++) {
      sequence += bases[parseInt(hash[i], 16) % 4];
    }

    state.genome = { sequence, hash: MOCK.genome.hash };
    state.traits = MOCK.traits;
    state.trustScore = MOCK.trustScore;
    state.genomeHash = MOCK.genome.hash;
  }

  // ── THE REVEAL ─────────────────────────────
  async function runRevealSequence() {
    state.revealComplete = false;

    // Flash effect
    const flash = $('#flash-overlay');
    flash.classList.add('flash');
    await sleep(100);
    flash.classList.remove('flash');
    await sleep(400);

    // 1. Particles burst
    spawnParticles(60);

    // 2. DNA Helix animation
    await sleep(300);
    startDNAHelix();

    // 3. Glow overlay
    await sleep(800);
    $('.dna-glow-overlay').classList.add('active');

    // 4. Trust score counter
    await sleep(1200);
    animateTrustScore(state.trustScore);

    // 5. Genome hash typewriter
    await sleep(800);
    typeGenomeHash(state.genomeHash);

    // 6. Traits reveal
    await sleep(1500);
    revealTraits(state.traits);

    // 7. Identity toggle appears
    await sleep(2000);
    const toggle = $('#identity-toggle');
    if (toggle) {
      toggle.style.opacity = '0';
      toggle.style.transform = 'translateY(20px)';
      toggle.style.transition = 'all 0.6s var(--ease-spring)';
      setTimeout(() => {
        toggle.style.opacity = '1';
        toggle.style.transform = 'translateY(0)';
      }, 100);
    }

    // 8. Continue button
    await sleep(1500);
    const continueBtn = $('#btn-reveal-continue');
    if (continueBtn) {
      continueBtn.style.opacity = '0';
      continueBtn.style.transform = 'translateY(20px)';
      continueBtn.style.transition = 'all 0.6s var(--ease-spring)';
      continueBtn.addEventListener('click', () => goToStep(6), { once: true });
      setTimeout(() => {
        continueBtn.style.opacity = '1';
        continueBtn.style.transform = 'translateY(0)';
      }, 100);
    }

    state.revealComplete = true;
  }

  // ── DNA Helix Canvas ───────────────────────
  function startDNAHelix() {
    const canvas = $('#dna-helix-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    function resize() {
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx.scale(dpr, dpr);
    }
    resize();

    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    const colors = [
      { a: '#ff4757', b: '#ff6b81' },  // A
      { a: '#2ed573', b: '#7bed9f' },  // T
      { a: '#1e90ff', b: '#70a1ff' },  // G
      { a: '#ffa502', b: '#ffc048' },  // C
    ];
    const sequence = state.genome?.sequence || MOCK.genome.sequence;
    const numPairs = 32;
    const helixRadius = Math.min(w * 0.28, 100);
    const verticalSpacing = h / (numPairs + 2);
    let revealProgress = 0;     // 0 → numPairs (how many revealed)
    let globalTime = 0;
    const revealSpeed = 0.4;    // pairs per frame at 60fps

    function draw() {
      ctx.clearRect(0, 0, w, h);
      globalTime += 0.015;

      // Slowly reveal pairs
      if (revealProgress < numPairs) {
        revealProgress += revealSpeed;
      }

      const centerX = w / 2;

      for (let i = 0; i < Math.min(Math.floor(revealProgress), numPairs); i++) {
        const pairAge = revealProgress - i;     // how long this pair has existed
        const fadeIn = Math.min(pairAge / 3, 1);
        const baseIndex = i % 4;
        const col = colors[baseIndex];
        const phase = (i / numPairs) * Math.PI * 4 + globalTime * 2;
        const y = verticalSpacing * (i + 1);

        // Left strand
        const x1 = centerX + Math.sin(phase) * helixRadius;
        // Right strand
        const x2 = centerX + Math.sin(phase + Math.PI) * helixRadius;

        // Z-depth for 3D effect
        const z1 = Math.cos(phase);
        const z2 = Math.cos(phase + Math.PI);

        const size1 = 3 + z1 * 2;
        const size2 = 3 + z2 * 2;
        const alpha1 = (0.4 + z1 * 0.4) * fadeIn;
        const alpha2 = (0.4 + z2 * 0.4) * fadeIn;

        // Connector (base pair bond)
        if (z1 > -0.3 || z2 > -0.3) {
          const gradient = ctx.createLinearGradient(x1, y, x2, y);
          gradient.addColorStop(0, col.a + Math.round(fadeIn * 40).toString(16).padStart(2, '0'));
          gradient.addColorStop(0.5, '#ffffff08');
          gradient.addColorStop(1, col.b + Math.round(fadeIn * 40).toString(16).padStart(2, '0'));
          ctx.beginPath();
          ctx.moveTo(x1, y);
          ctx.lineTo(x2, y);
          ctx.strokeStyle = gradient;
          ctx.lineWidth = 1 * fadeIn;
          ctx.stroke();
        }

        // Draw back strand node first (lower z)
        if (z2 < z1) {
          drawNode(ctx, x2, y, size2, col.b, alpha2);
          drawNode(ctx, x1, y, size1, col.a, alpha1);
        } else {
          drawNode(ctx, x1, y, size1, col.a, alpha1);
          drawNode(ctx, x2, y, size2, col.b, alpha2);
        }

        // Backbone lines
        if (i > 0) {
          const prevPhase = ((i - 1) / numPairs) * Math.PI * 4 + globalTime * 2;
          const prevY = verticalSpacing * i;
          const prevX1 = centerX + Math.sin(prevPhase) * helixRadius;
          const prevX2 = centerX + Math.sin(prevPhase + Math.PI) * helixRadius;

          ctx.beginPath();
          ctx.moveTo(prevX1, prevY);
          ctx.lineTo(x1, y);
          ctx.strokeStyle = col.a + '30';
          ctx.lineWidth = 1.5 * fadeIn;
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(prevX2, prevY);
          ctx.lineTo(x2, y);
          ctx.strokeStyle = col.b + '30';
          ctx.lineWidth = 1.5 * fadeIn;
          ctx.stroke();
        }
      }

      // Central glow
      const glowGrad = ctx.createRadialGradient(centerX, h / 2, 0, centerX, h / 2, helixRadius * 2);
      glowGrad.addColorStop(0, 'rgba(247,147,26,0.04)');
      glowGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = glowGrad;
      ctx.fillRect(0, 0, w, h);

      state.animFrameIds.push(requestAnimationFrame(draw));
    }

    draw();
  }

  function drawNode(ctx, x, y, size, color, alpha) {
    // Glow
    ctx.beginPath();
    ctx.arc(x, y, size * 2, 0, Math.PI * 2);
    ctx.fillStyle = color + Math.round(alpha * 30).toString(16).padStart(2, '0');
    ctx.fill();
    // Core
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // ── Trust Score Animation ──────────────────
  function animateTrustScore(target) {
    const el = $('#trust-number');
    const ring = $('.trust-score-ring .ring-fill');
    if (!el || !ring) return;

    const circumference = 377; // 2 * π * 60
    const offset = circumference - (target / 100) * circumference;

    // Set ring color based on score
    let color = 'var(--trust-high)';
    if (target < 50) color = 'var(--trust-low)';
    else if (target < 75) color = 'var(--trust-mid)';
    ring.style.stroke = color;

    // Animate ring
    ring.style.strokeDashoffset = offset;

    // Count up number
    let current = 0;
    const duration = 2000;
    const startTime = performance.now();

    function tick(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out expo
      const eased = 1 - Math.pow(2, -10 * progress);
      current = Math.round(eased * target);
      el.textContent = current;
      if (progress < 1) {
        requestAnimationFrame(tick);
      }
    }
    requestAnimationFrame(tick);
  }

  // ── Genome Hash Typewriter ─────────────────
  function typeGenomeHash(hash) {
    const el = $('#genome-hash-text');
    if (!el) return;
    el.innerHTML = '<span class="cursor"></span>';

    let i = 0;
    const speed = 30; // ms per char

    function type() {
      if (i < hash.length) {
        el.innerHTML = hash.substring(0, i + 1) + '<span class="cursor"></span>';
        i++;
        setTimeout(type, speed);
      } else {
        el.innerHTML = hash;
      }
    }
    type();
  }

  // ── Traits Reveal ──────────────────────────
  function revealTraits(traits) {
    const container = $('#reveal-traits');
    if (!container) return;
    container.innerHTML = '';

    traits.forEach((t, i) => {
      const badge = document.createElement('span');
      badge.className = `reveal-trait rarity-${t.rarity}`;
      badge.textContent = `${t.icon} ${t.name}`;
      container.appendChild(badge);

      setTimeout(() => {
        badge.classList.add('visible');
      }, i * 250);
    });
  }

  // ── Particles ──────────────────────────────
  function spawnParticles(count) {
    const container = $('#particles');
    if (!container) return;
    container.innerHTML = '';

    const colors = ['#ff4757', '#2ed573', '#1e90ff', '#ffa502', '#f7931a'];

    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      const color = colors[Math.floor(Math.random() * colors.length)];
      const x = 30 + Math.random() * 40; // center area
      const y = 30 + Math.random() * 40;
      const tx = (Math.random() - 0.5) * 300;
      const ty = (Math.random() - 0.5) * 300;
      const duration = 1.5 + Math.random() * 2;
      const delay = Math.random() * 0.5;
      const size = 2 + Math.random() * 4;

      p.style.cssText = `
        left: ${x}%;
        top: ${y}%;
        width: ${size}px;
        height: ${size}px;
        background: ${color};
        box-shadow: 0 0 ${size * 2}px ${color};
        animation: particle-fly ${duration}s ${delay}s ease-out forwards;
        --tx: ${tx}px;
        --ty: ${ty}px;
      `;
      container.appendChild(p);
    }

    // Add particle animation keyframes if not present
    if (!$('#particle-keyframes')) {
      const style = document.createElement('style');
      style.id = 'particle-keyframes';
      style.textContent = `
        @keyframes particle-fly {
          0% { opacity: 1; transform: translate(0, 0) scale(1); }
          100% { opacity: 0; transform: translate(var(--tx), var(--ty)) scale(0); }
        }
      `;
      document.head.appendChild(style);
    }
  }

  // ── Identity Toggle ────────────────────────
  function setIdentity(type) {
    state.identity = type;
    $$('.identity-option').forEach((opt) => {
      opt.classList.remove('selected-human', 'selected-ai');
      if (opt.dataset.identity === type) {
        opt.classList.add(type === 'human' ? 'selected-human' : 'selected-ai');
      }
    });
  }

  // ── Profile ────────────────────────────────
  function populateProfile() {
    const bm = state.bitmaps[state.selectedBitmap || 0];

    // Avatar
    const avatar = $('.profile-avatar');
    avatar.classList.remove('human', 'ai');
    avatar.classList.add(state.identity);
    avatar.textContent = state.identity === 'human' ? '🧬' : '🤖';

    // Name
    $('.profile-name').textContent = `Block #${bm.blockHeight.toLocaleString()}`;
    $('.profile-address').textContent = truncateAddress(state.walletAddress || MOCK.address);

    // Stats
    $('#profile-trust').textContent = state.trustScore;
    $('#profile-traits').textContent = state.traits.length;
    $('#profile-block').textContent = `#${bm.blockHeight.toLocaleString()}`;

    // Profile DNA canvas
    drawProfileDNA();
    drawProfileBanner();
  }

  function drawProfileDNA() {
    const canvas = $('#profile-dna-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * dpr;
    canvas.height = canvas.offsetHeight * dpr;
    ctx.scale(dpr, dpr);

    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    const colors = ['#ff4757', '#2ed573', '#1e90ff', '#ffa502'];
    let t = 0;

    function draw() {
      ctx.clearRect(0, 0, w, h);
      const centerY = h / 2;

      for (let i = 0; i < 80; i++) {
        const x = (i / 80) * w;
        const phase = (i * 0.25) + t;
        const y1 = centerY + Math.sin(phase) * (h * 0.3);
        const y2 = centerY - Math.sin(phase) * (h * 0.3);
        const col = colors[i % 4];
        const z = Math.cos(phase);
        const alpha = 0.3 + z * 0.4;
        const size = 2 + z;

        // Bond
        ctx.beginPath();
        ctx.moveTo(x, y1);
        ctx.lineTo(x, y2);
        ctx.strokeStyle = col + '18';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(x, y1, size, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x, y2, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      t += 0.015;
      state.animFrameIds.push(requestAnimationFrame(draw));
    }
    draw();
  }

  function drawProfileBanner() {
    const canvas = $('#profile-banner-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * dpr;
    canvas.height = canvas.offsetHeight * dpr;
    ctx.scale(dpr, dpr);

    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;

    // Gradient background with genome-derived colors
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#1a0a00');
    grad.addColorStop(0.5, '#0a0a1f');
    grad.addColorStop(1, '#0a1a0a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Random stars from genome hash
    const hash = state.genomeHash || MOCK.genome.hash;
    for (let i = 0; i < hash.length; i++) {
      const val = parseInt(hash[i], 16);
      const x = (i / hash.length) * w;
      const y = (val / 16) * h;
      const size = 0.5 + (val / 16) * 1.5;
      const colors = ['#ff4757', '#2ed573', '#1e90ff', '#ffa502'];
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fillStyle = colors[val % 4];
      ctx.globalAlpha = 0.3 + (val / 16) * 0.5;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ── Share Functions ────────────────────────
  function shareOnX() {
    const bm = state.bitmaps[state.selectedBitmap || 0];
    const text = `I just verified my Bitcoin block genome! 🧬\n\nBlock #${bm.blockHeight.toLocaleString()}\nTrust Score: ${state.trustScore}/100\n\nClaim yours at blockgenomics.xyz\n\n#BlockGenomics #Bitcoin #Ordinals #Bitmaps`;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  }

  function copyLink() {
    const bm = state.bitmaps[state.selectedBitmap || 0];
    const link = `https://blockgenomics.xyz/block/${bm.blockHeight}`;
    navigator.clipboard?.writeText(link).then(() => {
      showToast('Link copied! 🔗');
    }).catch(() => {
      showToast('Could not copy — try manually');
    });
  }

  function downloadBadge() {
    showToast('Badge download coming soon! 🎖️');
  }

  // ── Utilities ──────────────────────────────
  function truncateAddress(addr) {
    if (!addr) return '';
    return addr.substring(0, 8) + '…' + addr.substring(addr.length - 6);
  }

  function getBlockAge(timestamp) {
    const now = new Date();
    const then = new Date(timestamp);
    const years = Math.floor((now - then) / (365.25 * 24 * 60 * 60 * 1000));
    if (years > 0) return `${years} years ago`;
    const months = Math.floor((now - then) / (30 * 24 * 60 * 60 * 1000));
    return `${months} months ago`;
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function showToast(msg) {
    let toast = $('#toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast';
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('visible');
    clearTimeout(toast._tid);
    toast._tid = setTimeout(() => toast.classList.remove('visible'), 2500);
  }

  // ── Boot ───────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
