/**
 * The block panel as a visitor meets it: an opaque panel on the site's tokens, a phone sheet that ends above the back
 * link and keeps a floor on a phone on its side, 44 px controls with the shared ring, and only what a visitor without a
 * wallet can read or use. Source is read here (no layout in jsdom); the browser probe measures the boxes.
 * The frame's behaviour is pressed in world-panel-frame.test.tsx; this file pins how the view wires it.
 */
import fs from 'fs';
import path from 'path';

const PV = fs.readFileSync(path.join(__dirname, '../../src/components/nexus/ParcelView.tsx'), 'utf8');

const between = (a: string, b: string) => { const i = PV.indexOf(a); const j = PV.indexOf(b, i); expect(i).toBeGreaterThan(-1); expect(j).toBeGreaterThan(i); return PV.slice(i, j); };
const PICT = /\p{Extended_Pictographic}/u; const LIT = /#[0-9a-fA-F]{3,8}\b|rgba?\(/;

describe('the block panel', () => {
  it('the panel root is opaque and takes its classes from the frame', () => {
    const r = between('{/* ═══ Right Panel ═══ */}', '{/* Panel resize controls */}');
    for (const s of ['className={panelRootClass(panelSize)}', 'ref={panelRef}', "inert={panelSize === 'hidden'}", 'data-world-panel']) {
      expect(r).toContain(s);
    }
    expect(r).not.toContain('style=');
    expect(r).not.toMatch(LIT);
  });

  it("the panel's top comes from the frame", () => {
    const h = between('{/* Panel resize controls */}', "{rightTab === 'properties' ? (");
    for (const s of ['<PanelBar', 'size={panelSize}', 'onSize={setPanelSize}', 'hideRef={panelHideRef}', 'tab={rightTab}',
      'onTab={setRightTab}', "label: 'PROPERTIES'", "label: 'CHAT'", "label: 'GAMING'"]) {
      expect(h).toContain(s);
    }
    expect(h).not.toContain('<button');
    expect(h).not.toMatch(PICT);
  });

  it('the owner row claims no check, and the fact rows print only what is known', () => {
    for (const s of ['blockOwner.verified &&', 'bp.verified ?? true', 'value={parcels.length.toLocaleString()}',
      "'\u{1F7E2} Live'", '`\u{1F441} ${realtimeViewerCount}`']) {
      expect(PV).not.toContain(s);
    }
    expect(PV).not.toMatch(/verified:\s*true\b/);
    for (const s of ['verified: bp.verified ?? false',
      "value={dataSource === 'real' && realBlock ? realBlock.txCount.toLocaleString() : NOT_FETCHED}",
      "(realBlock?.estimated ? 'Estimated' : 'Live')",
      "dataSource === 'loading' ? 'Loading…' : 'Generated sample'",
      '{realtimeViewerCount > 0 && <PropRow label="VISITORS" value={realtimeViewerCount.toLocaleString()} />}',
      'value={parcelCustomizations.size.toLocaleString()}']) {
      expect(PV).toContain(s);
    }
  });

  it("the estimated layout's button uses the shared secondary style, and no purchase is offered", () => {
    const k = PV.indexOf('onClick={retryBlockData}');
    expect(k).toBeGreaterThan(-1);
    const b = PV.slice(PV.lastIndexOf('<button', k), PV.indexOf('</button>', k));
    for (const s of ['${secondaryButton}', 'w-full', 'font-sans', '${worldRing}', 'Load real transaction data']) expect(b).toContain(s);
    expect(b).not.toContain('#f7931a');
    expect(b).not.toContain('⬇');
    expect(PV).toContain("import { secondaryButton } from '@/components/ui/button';");
    expect(PV).not.toContain('Get Tier 3 Access');
    expect(PV).not.toContain('setShowGetAccess(true)');
  });

  it("a visitor without a wallet gets one line and a way to connect instead of the holder's tools", () => {
    const v = PV.indexOf("{ownerLock === 'connect' ? (");
    const n = PV.indexOf(') : (<>', v);
    const o = PV.indexOf('Owner Actions', n);
    const p = PV.indexOf('{/* ─── Prepare for Transfer ─── */}', o);
    const e = PV.indexOf('</>)}', p);
    const l = PV.indexOf('{/* ─── Land Customization Panel ─── */}', p);
    expect(v).toBeGreaterThan(-1);
    expect(n).toBeGreaterThan(v);
    expect(o).toBeGreaterThan(n);
    expect(p).toBeGreaterThan(o);
    expect(e).toBeGreaterThan(p);
    expect(l).toBeGreaterThan(e);
    const note = PV.slice(v, n);
    for (const s of ['data-world-visitor-note', 'Owner tools open once the holder connects a wallet.', 'onClick={openWalletModal}',
      'Connect a wallet', '${secondaryButton}', 'w-full', 'font-sans', '${worldRing}']) {
      expect(note).toContain(s);
    }
    expect(note).not.toContain('style=');
    expect(note).not.toMatch(PICT);
    const m = PV.indexOf("console.log('[Estate] Manage:'");
    const g = PV.lastIndexOf("{ownerLock !== 'connect' && (", m);
    expect(g).toBeGreaterThan(-1);
    expect(m - g).toBeLessThan(120);
  });

  it('on a phone the parcel card stays away while the panel is open', () => {
    expect(PV).toContain("{hoveredParcel && viewMode !== 'dna' && !(phone && panelSize !== 'hidden') && (");
  });

  it('item 4: the count shows only when presence counts someone', () => {
    expect(PV).toContain('{realtimeViewerCount > 0 && <VisitorOverlay count={realtimeViewerCount} phone={phone} />}');
  });

  it("item 5: the scene's floating labels sit under the view's controls", () => {
    const tags = PV.match(/<Html\b[^>]*>/g) || [];
    expect(tags).toHaveLength(8);
    const labels = tags.filter((t) => !t.includes('fullscreen'));
    expect(labels).toHaveLength(7);
    for (const t of labels) expect(t).toContain('zIndexRange={[10, 0]}');
    const pinned = tags.filter((t) => t.includes('fullscreen'));
    expect(pinned).toHaveLength(1);
    expect(pinned[0]).not.toContain('zIndexRange');
  });

  it("the fact rows' labels are on the text-3 token", () => {
    const k = PV.indexOf('function PropRow(');
    expect(k).toBeGreaterThan(-1);
    const r = PV.slice(k);
    expect(r).toContain('<span className="text-xs text-text-3">{label}</span>');
    expect(r).not.toContain("style={{ color: '#64748b' }}");
  });

  it("the properties tab's dim rows are on tokens and show no pictograph", () => {
    for (const s of ['text-[10px] font-normal text-text-3">(child inscription)', '<span className="text-[11px] text-text-3">GLOW</span>',
      'tracking-wider mb-2 text-text-3">Height = BTC Value', 'justify-between text-[9px] text-text-3"><span>Low</span>',
      '<div className="mt-3 text-[9px] text-text-3">', "${highlight ? 'text-bitcoin' : 'text-text-1'}", 'max-w-[60%]']) {
      expect(PV).toContain(s);
    }
    for (const s of ["style={{ color: '#475569' }}>Height = BTC Value", "style={{ color: '#475569' }}><span>Low</span>",
      "style={{ color: '#475569' }}>(child inscription)", "style={{ color: '#64748b', fontSize: '11px' }}>GLOW", "maxWidth: '60%'",
      "'\u{26CF} Coinbase'", '\u{1F3F0} ESTATE', '\u{26CF} Coinbase (glowing)', '\u{1F5B1} Drag to rotate']) {
      expect(PV).not.toContain(s);
    }
  });

  it("the view's root says a world view is open", () => {
    expect(PV).toContain('<div ref={containerRef} data-world-view className="relative w-full h-full flex"');
  });
});
