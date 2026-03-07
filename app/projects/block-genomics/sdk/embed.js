/**
 * Block Genomics — Embeddable Badge Widget
 * 
 * Drop-in JavaScript widget. Zero external dependencies.
 * 
 * Usage:
 *   <script src="https://cdn.blockgenomics.io/embed.js" data-genome="abc123"></script>
 *   <script src="bg-embed.js" data-genome="abc123" data-style="standard" data-theme="dark"></script>
 * 
 * Attributes:
 *   data-genome   — (required) Genome ID or agent ID
 *   data-style    — Badge style: minimal | standard | detailed | icon-only (default: standard)
 *   data-theme    — Theme: dark | light | transparent (default: dark)
 *   data-animate  — Enable animations: true | false (default: true)
 *   data-target   — Render target selector (default: renders in-place)
 * 
 * @version 1.0.0
 * @license MIT
 */
;(function(window, document) {
  'use strict';

  // ─── Constants ───────────────────────────────────────────────────────

  var API_BASE = 'https://verify.blockgenomics.io/api/v1';
  var VERIFY_BASE = 'https://verify.blockgenomics.io/agent';
  var NAMESPACE = 'BlockGenomicsBadge';
  var VERSION = '1.0.0';

  // ─── Color Palettes ─────────────────────────────────────────────────

  var TIERS = {
    1: { primary: '#f7931a', glow: 'rgba(247,147,26,0.25)', label: 'Block Owner' },
    2: { primary: '#94a3b8', glow: 'rgba(148,163,184,0.25)', label: 'TX Anchor' },
    3: { primary: '#cd7f32', glow: 'rgba(205,127,50,0.25)', label: 'Delegated' }
  };

  var THEMES = {
    dark: {
      bg: '#0a0a0f', bgAlt: '#0c0c14', surface: '#111118',
      text: '#f0f0f5', muted: '#a0a0b0', dim: '#606070',
      border: '#1e1e2e', borderAlpha: 'rgba(255,255,255,0.06)',
      glass: 'rgba(255,255,255,0.03)', glassStroke: 'rgba(255,255,255,0.08)'
    },
    light: {
      bg: '#ffffff', bgAlt: '#f8f9fc', surface: '#f0f1f5',
      text: '#111118', muted: '#555566', dim: '#888899',
      border: '#d0d5dd', borderAlpha: 'rgba(0,0,0,0.08)',
      glass: 'rgba(0,0,0,0.02)', glassStroke: 'rgba(0,0,0,0.06)'
    },
    transparent: {
      bg: 'transparent', bgAlt: 'transparent', surface: 'rgba(10,10,15,0.6)',
      text: '#f0f0f5', muted: '#a0a0b0', dim: '#606070',
      border: 'rgba(255,255,255,0.1)', borderAlpha: 'rgba(255,255,255,0.05)',
      glass: 'rgba(255,255,255,0.04)', glassStroke: 'rgba(255,255,255,0.1)'
    }
  };

  var ACCENT = { cyan: '#66ccff', purple: '#a855f7', gold: '#f7931a' };

  var DNA_PALETTE = [
    ACCENT.cyan, ACCENT.purple, ACCENT.gold,
    '#22c55e', '#ef4444', '#3b82f6', '#ec4899', '#14b8a6'
  ];

  // ─── Utilities ───────────────────────────────────────────────────────

  function esc(s) {
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(s));
    return d.innerHTML;
  }

  function fmtNum(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function truncGenome(g, len) {
    return g.slice(0, len || 16) + '\u2026';
  }

  function genomeColors(genome, count) {
    var colors = [];
    for (var i = 0; i < (count || 24); i++) {
      var idx = parseInt(genome[i % genome.length], 16);
      colors.push(DNA_PALETTE[idx % DNA_PALETTE.length]);
    }
    return colors;
  }

  function trustArcPath(cx, cy, r, score, max) {
    max = max || 100;
    var angle = (score / max) * 360;
    var rad = (angle - 90) * (Math.PI / 180);
    var x = cx + r * Math.cos(rad);
    var y = cy + r * Math.sin(rad);
    var large = angle > 180 ? 1 : 0;
    return 'M ' + cx + ' ' + (cy - r) + ' A ' + r + ' ' + r + ' 0 ' + large + ' 1 ' + x + ' ' + y;
  }

  // ─── SVG Generators ─────────────────────────────────────────────────

  function svgIconOnly(agent, thm, tier, anim) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"' +
      ' role="img" aria-label="Verified by Block Genomics \u2014 Trust ' + agent.trustScore + '/100">' +
      '<title>Verified by Block Genomics</title>' +
      '<circle cx="12" cy="12" r="11" fill="' + tier.primary + '" fill-opacity="0.15" stroke="' + tier.primary + '" stroke-width="1.5"/>' +
      '<path d="M7.5 12.5L10.5 15.5L16.5 9" stroke="' + tier.primary + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>' +
      '</svg>';
  }

  function svgMinimal(agent, thm, tier, anim) {
    var w = 320, h = 28;
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '"' +
      ' role="img" aria-label="Block Genomics Verified: ' + esc(agent.name) + ' \u2014 Block #' + fmtNum(agent.blockHeight) + ' \u2014 Trust ' + agent.trustScore + '/100">' +
      '<title>Block Genomics Verified: ' + esc(agent.name) + '</title>' +
      '<defs>' +
        '<linearGradient id="mbg" x1="0" y1="0" x2="1" y2="0">' +
          '<stop offset="0%" stop-color="' + (thm.bg === 'transparent' ? '#0a0a0f' : thm.bg) + '"/>' +
          '<stop offset="100%" stop-color="' + (thm.bgAlt === 'transparent' ? '#0c0c14' : thm.bgAlt) + '"/>' +
        '</linearGradient>' +
      '</defs>' +
      '<rect width="' + w + '" height="' + h + '" rx="6" fill="' + (thm.bg === 'transparent' ? 'none' : 'url(#mbg)') + '"/>' +
      '<rect width="' + w + '" height="' + h + '" rx="6" fill="none" stroke="' + tier.primary + '" stroke-width="1" stroke-opacity="0.3"/>' +
      '<rect x="0" y="0" width="90" height="' + h + '" rx="6" fill="' + tier.primary + '" fill-opacity="0.12"/>' +
      '<circle cx="16" cy="14" r="7" fill="' + tier.primary + '" fill-opacity="0.15" stroke="' + tier.primary + '" stroke-width="1"/>' +
      '<path d="M13 14.5L15 16.5L19 12" stroke="' + tier.primary + '" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none" transform="translate(-2,-0.5)"/>' +
      '<text x="28" y="18" font-family="system-ui,-apple-system,sans-serif" font-size="11" font-weight="600" fill="' + tier.primary + '">Verified</text>' +
      '<text x="100" y="18" font-family="ui-monospace,monospace" font-size="10" fill="' + thm.text + '">Block #' + fmtNum(agent.blockHeight) + '</text>' +
      '<text x="190" y="18" font-family="ui-monospace,monospace" font-size="9" fill="' + thm.dim + '">' + truncGenome(agent.genome, 12) + '</text>' +
      '<rect x="' + (w - 56) + '" y="4" width="48" height="20" rx="4" fill="' + tier.primary + '" fill-opacity="0.1"/>' +
      '<text x="' + (w - 32) + '" y="18" font-family="system-ui,-apple-system,sans-serif" font-size="10" font-weight="700" fill="' + tier.primary + '" text-anchor="middle">' + agent.trustScore + '/100</text>' +
      '</svg>';
  }

  function svgStandard(agent, thm, tier, anim) {
    var w = 360, h = 80;
    var dna = genomeColors(agent.genome, 24);
    var dnaBar = '';
    for (var i = 0; i < dna.length; i++) {
      dnaBar += '<rect x="' + (i * 7) + '" y="0" width="5" height="4" rx="1" fill="' + dna[i] + '" opacity="0.7"/>';
    }

    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '"' +
      ' role="img" aria-label="Block Genomics Verified Agent: ' + esc(agent.name) + ', Block #' + fmtNum(agent.blockHeight) + ', Tier ' + agent.tier + ' ' + tier.label + ', Trust Score ' + agent.trustScore + ' out of 100">' +
      '<title>Block Genomics \u2014 ' + esc(agent.name) + ' \u2014 Tier ' + agent.tier + ' ' + tier.label + '</title>' +
      '<defs>' +
        '<linearGradient id="sbg" x1="0" y1="0" x2="1" y2="1">' +
          '<stop offset="0%" stop-color="' + (thm.bg === 'transparent' ? '#0a0a0f' : thm.bg) + '"/>' +
          '<stop offset="100%" stop-color="' + (thm.bgAlt === 'transparent' ? '#0c0c14' : thm.bgAlt) + '"/>' +
        '</linearGradient>' +
        '<filter id="gs"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
      '</defs>' +
      '<g clip-path="url(#srr)">' +
        '<clipPath id="srr"><rect width="' + w + '" height="' + h + '" rx="12"/></clipPath>' +
        '<rect width="' + w + '" height="' + h + '" fill="' + (thm.bg === 'transparent' ? 'none' : 'url(#sbg)') + '"/>' +
        '<rect x="1" y="1" width="' + (w - 2) + '" height="' + (h - 2) + '" rx="11" fill="' + thm.glass + '" stroke="' + thm.glassStroke + '" stroke-width="1"/>' +
        '<rect x="0" y="0" width="3" height="' + h + '" fill="' + tier.primary + '" opacity="0.6"/>' +
        // DNA icon
        '<g transform="translate(14,26)">' +
          '<path d="M6 2C6 2 6 6 10 10C14 14 14 18 14 18" stroke="' + tier.primary + '" stroke-width="1.5" stroke-linecap="round" fill="none" opacity="0.8"/>' +
          '<path d="M14 2C14 2 14 6 10 10C6 14 6 18 6 18" stroke="' + tier.primary + '" stroke-width="1.5" stroke-linecap="round" fill="none" opacity="0.8"/>' +
          '<line x1="7" y1="5" x2="13" y2="5" stroke="' + tier.primary + '" stroke-width="1" opacity="0.4"/>' +
          '<line x1="6.5" y1="10" x2="13.5" y2="10" stroke="' + tier.primary + '" stroke-width="1" opacity="0.4"/>' +
          '<line x1="7" y1="15" x2="13" y2="15" stroke="' + tier.primary + '" stroke-width="1" opacity="0.4"/>' +
        '</g>' +
        // Name
        '<text x="52" y="26" font-family="system-ui,-apple-system,sans-serif" font-size="14" font-weight="700" fill="' + thm.text + '">' + esc(agent.name) + '</text>' +
        // Tier label
        '<rect x="52" y="30" width="' + (70 + tier.label.length * 5) + '" height="16" rx="3" fill="' + tier.primary + '" fill-opacity="0.1"/>' +
        '<text x="58" y="42" font-family="system-ui,-apple-system,sans-serif" font-size="9" font-weight="600" fill="' + tier.primary + '" letter-spacing="0.5">TIER ' + agent.tier + ' \u00B7 ' + tier.label.toUpperCase() + '</text>' +
        // Meta
        '<text x="52" y="58" font-family="ui-monospace,monospace" font-size="10" fill="' + thm.muted + '">Block #' + fmtNum(agent.blockHeight) + ' \u00B7 ' + truncGenome(agent.genome) + '</text>' +
        // DNA bar
        '<g transform="translate(52,64)">' + dnaBar + '</g>' +
        // Trust ring
        '<g transform="translate(' + (w - 50) + ',' + (h / 2) + ')">' +
          '<circle cx="0" cy="0" r="22" fill="none" stroke="' + thm.border + '" stroke-width="3"/>' +
          '<path d="' + trustArcPath(0, 0, 22, agent.trustScore) + '" fill="none" stroke="' + tier.primary + '" stroke-width="3" stroke-linecap="round"/>' +
          '<text x="0" y="3" font-family="system-ui,-apple-system,sans-serif" font-size="13" font-weight="800" fill="' + thm.text + '" text-anchor="middle">' + agent.trustScore + '</text>' +
          '<text x="0" y="14" font-family="system-ui,-apple-system,sans-serif" font-size="7" fill="' + thm.dim + '" text-anchor="middle">TRUST</text>' +
        '</g>' +
        // Border
        '<rect x="0.5" y="0.5" width="' + (w - 1) + '" height="' + (h - 1) + '" rx="12" fill="none" stroke="' + tier.primary + '" stroke-width="1" stroke-opacity="0.2"/>' +
      '</g>' +
      '</svg>';
  }

  function svgDetailed(agent, thm, tier, anim) {
    var w = 420, h = 220;
    var dna = genomeColors(agent.genome, 48);
    var tc = agent.trustComponents;

    // DNA bars
    var dnaBars = '';
    for (var i = 0; i < dna.length; i++) {
      var barH = 6 + (parseInt(agent.genome[(i * 2) % agent.genome.length], 16) / 15) * 14;
      dnaBars += '<rect x="' + (i * 8) + '" y="' + (20 - barH) + '" width="6" height="' + barH + '" rx="1.5" fill="' + dna[i] + '" opacity="0.75"/>';
    }

    // Trust breakdown
    var breakdown = '';
    if (tc) {
      var rows = [
        { label: 'Block Age', score: tc.age.score, max: tc.age.max },
        { label: 'Richness', score: tc.richness.score, max: tc.richness.max },
        { label: 'Security', score: tc.security.score, max: tc.security.max },
        { label: 'Ownership', score: tc.ownership.score, max: tc.ownership.max },
        { label: 'History', score: tc.history.score, max: tc.history.max }
      ];
      for (var j = 0; j < rows.length; j++) {
        var y = 142 + j * 14;
        var filled = (rows[j].score / rows[j].max) * 120;
        breakdown +=
          '<text x="16" y="' + (y + 9) + '" font-family="system-ui,-apple-system,sans-serif" font-size="9" fill="' + thm.muted + '">' + rows[j].label + '</text>' +
          '<rect x="85" y="' + (y + 1) + '" width="120" height="8" rx="4" fill="' + thm.border + '" opacity="0.4"/>' +
          '<rect x="85" y="' + (y + 1) + '" width="' + filled + '" height="8" rx="4" fill="' + tier.primary + '" opacity="0.7"/>' +
          '<text x="210" y="' + (y + 9) + '" font-family="ui-monospace,monospace" font-size="8" fill="' + thm.dim + '">' + rows[j].score + '/' + rows[j].max + '</text>';
      }
    }

    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '"' +
      ' role="img" aria-label="Block Genomics Detailed Badge for ' + esc(agent.name) + '. Block ' + fmtNum(agent.blockHeight) + ', Tier ' + agent.tier + ' ' + tier.label + ', Trust ' + agent.trustScore + '/100.">' +
      '<title>Block Genomics \u2014 ' + esc(agent.name) + ' \u2014 Full Verification</title>' +
      '<defs>' +
        '<linearGradient id="dbg" x1="0" y1="0" x2="0.3" y2="1">' +
          '<stop offset="0%" stop-color="' + (thm.bg === 'transparent' ? '#0a0a0f' : thm.bg) + '"/>' +
          '<stop offset="50%" stop-color="' + (thm.bgAlt === 'transparent' ? '#0c0c14' : thm.bgAlt) + '"/>' +
          '<stop offset="100%" stop-color="' + (thm.bg === 'transparent' ? '#0a0a0f' : thm.bg) + '"/>' +
        '</linearGradient>' +
        '<linearGradient id="dtier" x1="0" y1="0" x2="1" y2="0">' +
          '<stop offset="0%" stop-color="' + tier.primary + '" stop-opacity="0.2"/>' +
          '<stop offset="100%" stop-color="' + tier.primary + '" stop-opacity="0"/>' +
        '</linearGradient>' +
        '<filter id="gd"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
        '<clipPath id="drr"><rect width="' + w + '" height="' + h + '" rx="16"/></clipPath>' +
      '</defs>' +
      '<g clip-path="url(#drr)">' +
        '<rect width="' + w + '" height="' + h + '" fill="' + (thm.bg === 'transparent' ? 'none' : 'url(#dbg)') + '"/>' +
        '<rect x="1" y="1" width="' + (w - 2) + '" height="' + (h - 2) + '" rx="15" fill="' + thm.glass + '" stroke="' + thm.glassStroke + '" stroke-width="1"/>' +
        '<rect x="0" y="0" width="' + w + '" height="50" fill="url(#dtier)" opacity="0.5"/>' +
        // Header: DNA icon
        '<g transform="translate(16,12)">' +
          '<path d="M6 2C6 2 6 6 10 10C14 14 14 18 14 18" stroke="' + tier.primary + '" stroke-width="1.5" stroke-linecap="round" fill="none" opacity="0.8"/>' +
          '<path d="M14 2C14 2 14 6 10 10C6 14 6 18 6 18" stroke="' + tier.primary + '" stroke-width="1.5" stroke-linecap="round" fill="none" opacity="0.8"/>' +
          '<line x1="7" y1="5" x2="13" y2="5" stroke="' + tier.primary + '" stroke-width="1" opacity="0.4"/>' +
          '<line x1="6.5" y1="10" x2="13.5" y2="10" stroke="' + tier.primary + '" stroke-width="1" opacity="0.4"/>' +
          '<line x1="7" y1="15" x2="13" y2="15" stroke="' + tier.primary + '" stroke-width="1" opacity="0.4"/>' +
        '</g>' +
        // Name
        '<text x="48" y="28" font-family="system-ui,-apple-system,sans-serif" font-size="16" font-weight="800" fill="' + thm.text + '">' + esc(agent.name) + '</text>' +
        // Checkmark
        '<g transform="translate(' + (48 + agent.name.length * 9.5) + ',14)">' +
          '<circle cx="9" cy="9" r="8" fill="' + tier.primary + '" fill-opacity="0.15" stroke="' + tier.primary + '" stroke-width="1"/>' +
          '<path d="M6 9.5L8.5 12L13 7" stroke="' + tier.primary + '" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>' +
        '</g>' +
        // Tier label
        '<rect x="48" y="34" width="' + (70 + tier.label.length * 5) + '" height="18" rx="4" fill="' + tier.primary + '" fill-opacity="0.1" stroke="' + tier.primary + '" stroke-width="0.5" stroke-opacity="0.3"/>' +
        '<text x="56" y="47" font-family="system-ui,-apple-system,sans-serif" font-size="9" font-weight="700" fill="' + tier.primary + '" letter-spacing="0.8">TIER ' + agent.tier + ' \u00B7 ' + tier.label.toUpperCase() + '</text>' +
        // Block info top-right
        '<text x="' + (w - 16) + '" y="24" font-family="ui-monospace,monospace" font-size="11" fill="' + thm.muted + '" text-anchor="end">Block #' + fmtNum(agent.blockHeight) + '</text>' +
        '<text x="' + (w - 16) + '" y="40" font-family="ui-monospace,monospace" font-size="9" fill="' + thm.dim + '" text-anchor="end">' + truncGenome(agent.genome, 20) + '</text>' +
        // Separator
        '<line x1="16" y1="60" x2="' + (w - 16) + '" y2="60" stroke="' + thm.border + '" stroke-width="0.5" opacity="0.5"/>' +
        // Genome section title
        '<text x="16" y="78" font-family="system-ui,-apple-system,sans-serif" font-size="9" font-weight="600" fill="' + thm.dim + '" letter-spacing="1">GENOME SIGNATURE</text>' +
        '<g transform="translate(16,84)">' + dnaBars + '</g>' +
        // Trust breakdown title
        '<text x="16" y="132" font-family="system-ui,-apple-system,sans-serif" font-size="9" font-weight="600" fill="' + thm.dim + '" letter-spacing="1">TRUST BREAKDOWN</text>' +
        breakdown +
        // Large trust ring
        '<g transform="translate(' + (w - 80) + ',100)">' +
          '<circle cx="0" cy="0" r="42" fill="none" stroke="' + thm.border + '" stroke-width="4" opacity="0.3"/>' +
          '<path d="' + trustArcPath(0, 0, 42, agent.trustScore) + '" fill="none" stroke="' + tier.primary + '" stroke-width="4" stroke-linecap="round"' + (agent.trustScore >= 70 ? ' filter="url(#gd)"' : '') + '/>' +
          '<text x="0" y="4" font-family="system-ui,-apple-system,sans-serif" font-size="28" font-weight="900" fill="' + thm.text + '" text-anchor="middle">' + agent.trustScore + '</text>' +
          '<text x="0" y="18" font-family="system-ui,-apple-system,sans-serif" font-size="8" font-weight="600" fill="' + thm.dim + '" text-anchor="middle" letter-spacing="1.5">TRUST</text>' +
        '</g>' +
        // Footer
        '<line x1="16" y1="' + (h - 28) + '" x2="' + (w - 16) + '" y2="' + (h - 28) + '" stroke="' + thm.border + '" stroke-width="0.5" opacity="0.3"/>' +
        '<text x="16" y="' + (h - 10) + '" font-family="system-ui,-apple-system,sans-serif" font-size="8" fill="' + thm.dim + '">Verified by Block Genomics \u00B7 blockgenomics.io</text>' +
        '<rect x="0.5" y="0.5" width="' + (w - 1) + '" height="' + (h - 1) + '" rx="16" fill="none" stroke="' + tier.primary + '" stroke-width="1" stroke-opacity="0.15"/>' +
      '</g>' +
      '</svg>';
  }

  // ─── Core Renderer ──────────────────────────────────────────────────

  function renderBadge(agent, opts) {
    var style = opts.style || 'standard';
    var theme = opts.theme || 'dark';
    var animate = opts.animate !== false;
    var thm = THEMES[theme] || THEMES.dark;
    var tier = TIERS[agent.tier] || TIERS[1];

    var svg;
    switch (style) {
      case 'icon-only': svg = svgIconOnly(agent, thm, tier, animate); break;
      case 'minimal':   svg = svgMinimal(agent, thm, tier, animate); break;
      case 'detailed':  svg = svgDetailed(agent, thm, tier, animate); break;
      default:          svg = svgStandard(agent, thm, tier, animate); break;
    }
    return svg;
  }

  // ─── API Fetcher ────────────────────────────────────────────────────

  function fetchAgent(genomeId, callback) {
    var url = API_BASE + '/verify/' + encodeURIComponent(genomeId);
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4) {
        if (xhr.status === 200) {
          try {
            callback(null, JSON.parse(xhr.responseText));
          } catch (e) {
            callback(e, null);
          }
        } else {
          callback(new Error('API returned ' + xhr.status), null);
        }
      }
    };
    xhr.onerror = function() { callback(new Error('Network error'), null); };
    xhr.send();
  }

  // ─── Noscript / Fallback Badge ──────────────────────────────────────

  function fallbackBadge(genomeId) {
    return '<a href="' + VERIFY_BASE + '/' + esc(genomeId) + '" target="_blank" rel="noopener" ' +
      'style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;' +
      'background:#0a0a0f;border:1px solid rgba(255,255,255,0.1);border-radius:8px;' +
      'color:#f0f0f5;font-family:system-ui,sans-serif;font-size:12px;text-decoration:none;">' +
      '<span style="font-size:16px">🧬</span>' +
      '<span>Verified by <strong>Block Genomics</strong></span>' +
      '</a>';
  }

  // ─── Widget Container ───────────────────────────────────────────────

  function createContainer(genomeId, style) {
    var wrapper = document.createElement('div');
    wrapper.className = 'bg-embed-widget';
    wrapper.setAttribute('data-bg-genome', genomeId);
    wrapper.style.display = 'inline-block';

    // Loading state
    var dims = {
      'icon-only': { w: '24px', h: '24px' },
      'minimal':   { w: '320px', h: '28px' },
      'standard':  { w: '360px', h: '80px' },
      'detailed':  { w: '420px', h: '220px' }
    };
    var d = dims[style] || dims.standard;
    wrapper.style.minWidth = d.w;
    wrapper.style.minHeight = d.h;

    return wrapper;
  }

  // ─── Main Init ──────────────────────────────────────────────────────

  function initWidget(scriptEl) {
    var genomeId = scriptEl.getAttribute('data-genome');
    if (!genomeId) return;

    var style   = scriptEl.getAttribute('data-style') || 'standard';
    var theme   = scriptEl.getAttribute('data-theme') || 'dark';
    var animate = scriptEl.getAttribute('data-animate') !== 'false';
    var target  = scriptEl.getAttribute('data-target');

    // Create container
    var container = createContainer(genomeId, style);
    container.innerHTML = '<span style="color:#606070;font-size:10px;font-family:system-ui,sans-serif">Loading badge\u2026</span>';

    // Insert container
    if (target) {
      var targetEl = document.querySelector(target);
      if (targetEl) {
        targetEl.appendChild(container);
      } else {
        scriptEl.parentNode.insertBefore(container, scriptEl.nextSibling);
      }
    } else {
      scriptEl.parentNode.insertBefore(container, scriptEl.nextSibling);
    }

    // Fetch agent data and render
    fetchAgent(genomeId, function(err, agent) {
      if (err || !agent) {
        // Fallback to static badge
        container.innerHTML = fallbackBadge(genomeId);
        return;
      }

      var svg = renderBadge(agent, { style: style, theme: theme, animate: animate });

      // Wrap in verification link
      var link = document.createElement('a');
      link.href = VERIFY_BASE + '/' + encodeURIComponent(agent.id || genomeId);
      link.target = '_blank';
      link.rel = 'noopener';
      link.title = 'Verified by Block Genomics \u2014 Trust: ' + agent.trustScore + '/100';
      link.style.textDecoration = 'none';
      link.style.display = 'inline-block';
      link.innerHTML = svg;

      container.innerHTML = '';
      container.appendChild(link);
    });

    // Add noscript fallback
    var noscript = document.createElement('noscript');
    noscript.innerHTML = fallbackBadge(genomeId);
    container.appendChild(noscript);
  }

  // ─── Auto-Initialize ───────────────────────────────────────────────

  function autoInit() {
    // Find all script tags with data-genome
    var scripts = document.querySelectorAll('script[data-genome]');
    for (var i = 0; i < scripts.length; i++) {
      // Skip already-initialized
      if (scripts[i].getAttribute('data-bg-init')) continue;
      scripts[i].setAttribute('data-bg-init', '1');
      initWidget(scripts[i]);
    }
  }

  // ─── Public API ─────────────────────────────────────────────────────

  var BGB = {
    version: VERSION,

    /**
     * Render a badge into a target element.
     * @param {string} genomeId - Agent/genome ID
     * @param {HTMLElement} target - DOM element to render into
     * @param {Object} opts - { style, theme, animate }
     */
    render: function(genomeId, target, opts) {
      opts = opts || {};
      var container = createContainer(genomeId, opts.style || 'standard');
      target.appendChild(container);
      container.innerHTML = '<span style="color:#606070;font-size:10px;font-family:system-ui,sans-serif">Loading\u2026</span>';

      fetchAgent(genomeId, function(err, agent) {
        if (err || !agent) {
          container.innerHTML = fallbackBadge(genomeId);
          return;
        }
        var svg = renderBadge(agent, opts);
        var link = document.createElement('a');
        link.href = VERIFY_BASE + '/' + encodeURIComponent(agent.id || genomeId);
        link.target = '_blank';
        link.rel = 'noopener';
        link.title = 'Verified by Block Genomics \u2014 Trust: ' + agent.trustScore + '/100';
        link.style.textDecoration = 'none';
        link.style.display = 'inline-block';
        link.innerHTML = svg;
        container.innerHTML = '';
        container.appendChild(link);
      });
    },

    /**
     * Render a badge synchronously from existing agent data.
     * @param {Object} agent - Agent data object
     * @param {HTMLElement} target - DOM element to render into
     * @param {Object} opts - { style, theme, animate }
     */
    renderSync: function(agent, target, opts) {
      opts = opts || {};
      var svg = renderBadge(agent, opts);
      var link = document.createElement('a');
      link.href = VERIFY_BASE + '/' + encodeURIComponent(agent.id);
      link.target = '_blank';
      link.rel = 'noopener';
      link.title = 'Verified by Block Genomics \u2014 Trust: ' + agent.trustScore + '/100';
      link.style.textDecoration = 'none';
      link.style.display = 'inline-block';
      link.innerHTML = svg;
      target.innerHTML = '';
      target.appendChild(link);
    },

    /**
     * Generate badge SVG string without rendering.
     * @param {Object} agent - Agent data object
     * @param {Object} opts - { style, theme, animate }
     * @returns {string} SVG string
     */
    svg: function(agent, opts) {
      return renderBadge(agent, opts || {});
    },

    /**
     * Re-scan the page for new data-genome script tags and initialize them.
     */
    refresh: autoInit
  };

  // Expose globally
  window[NAMESPACE] = BGB;
  window.BGB = BGB;

  // Auto-init on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }

})(window, document);
