'use client';

import { useState, useEffect, useCallback } from 'react';
import { generateGuardianBundle, GUARDIAN_PROTOCOL_VERSION } from '@/lib/guardian-templates';

interface AutoResponse {
  trigger: string;
  response: string;
}

interface GuardianConfig {
  id?: string;
  name: string;
  soulMd: string;
  agentMd: string;
  personality: string;
  llmProvider: string;
  llmModel: string;
  llmApiKey: string;
  llmEndpoint: string;
  selfHosted: boolean;
  agentEndpoint: string;
  endpointVerified: boolean;
  autoResponses: AutoResponse[];
  escalateTelegram: string;
  escalateEmail: string;
  autoApproveDelegationUnder: number | null;
  status: string;
}

const PROVIDERS: Record<string, { label: string; models: string[] }> = {
  openai: { label: 'OpenAI', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1-mini', 'o3-mini'] },
  anthropic: { label: 'Anthropic', models: ['claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022', 'claude-opus-4-20250514'] },
  google: { label: 'Google', models: ['gemini-2.0-flash', 'gemini-2.0-pro', 'gemini-1.5-pro'] },
  xai: { label: 'xAI', models: ['grok-3', 'grok-3-mini', 'grok-2'] },
  custom: { label: 'Custom Endpoint', models: [] },
};

interface Props {
  blockHeight: number;
  ownerAddress: string;
  onClose: () => void;
  walletSign: (message: string) => Promise<string>;
}

export default function GuardianConfigPanel({ blockHeight, ownerAddress, onClose, walletSign }: Props) {
  const [tab, setTab] = useState<'hosted' | 'selfhosted'>('hosted');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [detectingEndpoint, setDetectingEndpoint] = useState(false);
  const [showSoulEditor, setShowSoulEditor] = useState(false);
  const [showAgentEditor, setShowAgentEditor] = useState(false);
  const [newTrigger, setNewTrigger] = useState('');
  const [newResponse, setNewResponse] = useState('');
  const [monitorToken, setMonitorToken] = useState<string | null>(null);
  const [monitorConnected, setMonitorConnected] = useState(false);
  const [generatingToken, setGeneratingToken] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [revokingToken, setRevokingToken] = useState(false);

  const bundle = generateGuardianBundle(blockHeight);

  const [config, setConfig] = useState<GuardianConfig>({
    name: `Guardian #${blockHeight}`,
    soulMd: bundle.soulMd,
    agentMd: bundle.agentMd,
    personality: '',
    llmProvider: '',
    llmModel: '',
    llmApiKey: '',
    llmEndpoint: '',
    selfHosted: false,
    agentEndpoint: '',
    endpointVerified: false,
    autoResponses: [],
    escalateTelegram: '',
    escalateEmail: '',
    autoApproveDelegationUnder: null,
    status: 'active',
  });

  // Load existing config
  useEffect(() => {
    fetch(`/api/v1/guardian?blockHeight=${blockHeight}&ownerAddress=${ownerAddress}`)
      .then(r => r.json())
      .then(data => {
        if (data.guardians?.[0]) {
          const g = data.guardians[0];
          setConfig({
            ...g,
            autoResponses: g.autoResponses ? JSON.parse(g.autoResponses) : [],
            llmApiKey: '', // Never populate encrypted key
          });
          if (g.monitorTokenHash) setMonitorConnected(true);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [blockHeight, ownerAddress]);

  const update = useCallback((partial: Partial<GuardianConfig>) => {
    setConfig(prev => ({ ...prev, ...partial }));
  }, []);

  const handleSave = async (goLive = false) => {
    setSaving(true);
    try {
      const message = `guardian-config:${blockHeight}:${ownerAddress}:${Date.now()}`;
      const signature = await walletSign(message);

      const payload = {
        ...config,
        blockHeight,
        ownerAddress,
        signature,
        message,
        autoResponses: config.autoResponses,
        status: goLive ? 'active' : config.status,
      };
      // Don't send empty API key (would overwrite)
      if (!payload.llmApiKey) delete (payload as Record<string, unknown>).llmApiKey;

      const res = await fetch('/api/v1/guardian', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Save failed');
      const data = await res.json();
      if (data.guardian?.id) update({ id: data.guardian.id, status: data.guardian.status });
    } catch (err) {
      console.error('Failed to save guardian:', err);
    } finally {
      setSaving(false);
    }
  };

  const handlePause = async () => {
    if (!config.id) return;
    await fetch(`/api/v1/guardian/${config.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'paused' }),
    });
    update({ status: 'paused' });
  };

  const detectEndpoint = async () => {
    if (!config.agentEndpoint) return;
    setDetectingEndpoint(true);
    try {
      const res = await fetch(config.agentEndpoint + '/health', { signal: AbortSignal.timeout(5000) });
      update({ endpointVerified: res.ok });
    } catch {
      update({ endpointVerified: false });
    } finally {
      setDetectingEndpoint(false);
    }
  };

  const addAutoResponse = () => {
    if (!newTrigger || !newResponse) return;
    update({ autoResponses: [...config.autoResponses, { trigger: newTrigger, response: newResponse }] });
    setNewTrigger('');
    setNewResponse('');
  };

  const removeAutoResponse = (i: number) => {
    update({ autoResponses: config.autoResponses.filter((_, idx) => idx !== i) });
  };

  const handleGenerateToken = async () => {
    if (!config.id) return;
    setGeneratingToken(true);
    try {
      const message = `monitor-token:${config.id}:${ownerAddress}:${Date.now()}`;
      const signature = await walletSign(message);
      const res = await fetch('/api/v1/guardian/monitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guardianId: config.id, ownerAddress, signature, message }),
      });
      const data = await res.json();
      if (data.success && data.data?.token) {
        setMonitorToken(data.data.token);
        setMonitorConnected(true);
      }
    } catch (err) {
      console.error('Failed to generate token:', err);
    } finally {
      setGeneratingToken(false);
    }
  };

  const handleRevokeToken = async () => {
    if (!config.id) return;
    setRevokingToken(true);
    try {
      const message = `revoke-monitor:${config.id}:${ownerAddress}:${Date.now()}`;
      const signature = await walletSign(message);
      const res = await fetch('/api/v1/guardian/monitor', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guardianId: config.id, ownerAddress, signature, message }),
      });
      const data = await res.json();
      if (data.success) {
        setMonitorToken(null);
        setMonitorConnected(false);
      }
    } catch (err) {
      console.error('Failed to revoke token:', err);
    } finally {
      setRevokingToken(false);
    }
  };

  const copyToken = () => {
    if (!monitorToken) return;
    navigator.clipboard.writeText(monitorToken);
    setTokenCopied(true);
    setTimeout(() => setTokenCopied(false), 3000);
  };

  const models = config.llmProvider ? (PROVIDERS[config.llmProvider]?.models || []) : [];

  if (loading) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.8)' }}>
        <div className="text-center">
          <div className="text-2xl animate-pulse">🛡️</div>
          <div className="text-sm mt-2" style={{ color: '#64748b' }}>Loading Guardian...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.85)' }} onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl"
        style={{
          background: 'linear-gradient(135deg, #0a0e17 0%, #111827 100%)',
          border: '1px solid rgba(0,255,136,0.2)',
          boxShadow: '0 0 60px rgba(0,255,136,0.1), 0 0 120px rgba(0,255,136,0.05)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🛡️</span>
              <div>
                <h2 className="text-lg font-bold" style={{ color: '#e2e8f0' }}>Guardian Shell Agent</h2>
                <p className="text-xs" style={{ color: '#64748b' }}>Block #{blockHeight}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-1 rounded-full font-mono" style={{
                background: config.status === 'active' ? 'rgba(0,255,136,0.15)' : config.status === 'paused' ? 'rgba(255,200,0,0.15)' : 'rgba(100,100,100,0.15)',
                color: config.status === 'active' ? '#00ff88' : config.status === 'paused' ? '#ffc800' : '#64748b',
              }}>
                {config.status === 'active' ? '🟢 Active' : config.status === 'paused' ? '⏸ Paused' : '⚫ Stopped'}
              </span>
              <button onClick={onClose} className="text-lg" style={{ color: '#64748b' }}>✕</button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-2">
            {(['hosted', 'selfhosted'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="px-4 py-2 rounded-lg text-xs font-mono transition-all"
                style={{
                  background: tab === t ? 'rgba(0,255,136,0.12)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${tab === t ? 'rgba(0,255,136,0.3)' : 'rgba(255,255,255,0.06)'}`,
                  color: tab === t ? '#00ff88' : '#64748b',
                }}
              >
                {t === 'hosted' ? '🏠 Hosted (Guardian)' : '🔧 Self-Hosted'}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Name */}
          <Field label="Agent Name">
            <input
              value={config.name}
              onChange={e => update({ name: e.target.value })}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={inputStyle}
              placeholder="My Guardian"
            />
          </Field>

          {/* Personality */}
          <Field label="Personality">
            <textarea
              value={config.personality}
              onChange={e => update({ personality: e.target.value })}
              className="w-full px-3 py-2 rounded-lg text-sm resize-none"
              style={{ ...inputStyle, minHeight: 60 }}
              placeholder="Friendly, knowledgeable about Bitcoin history, slightly witty..."
            />
          </Field>

          {tab === 'hosted' ? (
            <>
              {/* Provider */}
              <Field label="AI Provider">
                <select
                  value={config.llmProvider}
                  onChange={e => update({ llmProvider: e.target.value, llmModel: '' })}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={inputStyle}
                >
                  <option value="">None (Template Only)</option>
                  {Object.entries(PROVIDERS).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </Field>

              {/* API Key */}
              {config.llmProvider && (
                <Field label="API Key">
                  <input
                    type="password"
                    value={config.llmApiKey}
                    onChange={e => update({ llmApiKey: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={inputStyle}
                    placeholder={config.id ? 'sk-•••••••• (saved — enter new to replace)' : 'sk-...'}
                  />
                </Field>
              )}

              {/* Model */}
              {config.llmProvider && models.length > 0 && (
                <Field label="Model">
                  <select
                    value={config.llmModel}
                    onChange={e => update({ llmModel: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={inputStyle}
                  >
                    <option value="">Select model...</option>
                    {models.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </Field>
              )}

              {/* Custom endpoint */}
              {config.llmProvider === 'custom' && (
                <Field label="Custom Endpoint URL">
                  <input
                    value={config.llmEndpoint}
                    onChange={e => update({ llmEndpoint: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={inputStyle}
                    placeholder="https://your-api.example.com/v1/chat/completions"
                  />
                </Field>
              )}

              {/* SOUL.md Editor */}
              <Field label="SOUL.md">
                <button
                  onClick={() => setShowSoulEditor(!showSoulEditor)}
                  className="text-xs px-3 py-1.5 rounded-lg mb-2"
                  style={{ background: 'rgba(0,255,136,0.08)', color: '#00ff88', border: '1px solid rgba(0,255,136,0.2)' }}
                >
                  {showSoulEditor ? '▼ Collapse' : '▶ Expand Editor'}
                </button>
                {showSoulEditor && (
                  <textarea
                    value={config.soulMd}
                    onChange={e => update({ soulMd: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg text-xs font-mono resize-y"
                    style={{ ...inputStyle, minHeight: 200 }}
                  />
                )}
              </Field>

              {/* AGENT.md Editor */}
              <Field label="AGENT.md (Operating Rules)">
                <button
                  onClick={() => setShowAgentEditor(!showAgentEditor)}
                  className="text-xs px-3 py-1.5 rounded-lg mb-2"
                  style={{ background: 'rgba(247,147,26,0.08)', color: '#f7931a', border: '1px solid rgba(247,147,26,0.2)' }}
                >
                  {showAgentEditor ? '▼ Collapse' : '▶ Expand Editor'}
                </button>
                {showAgentEditor && (
                  <textarea
                    value={config.agentMd}
                    onChange={e => update({ agentMd: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg text-xs font-mono resize-y"
                    style={{ ...inputStyle, minHeight: 200 }}
                  />
                )}
              </Field>

              {/* Protocol Version Badge */}
              <div className="flex items-center gap-2 text-[10px]" style={{ color: '#64748b' }}>
                <span>📋</span>
                <span>Protocol v{GUARDIAN_PROTOCOL_VERSION}</span>
                <span>•</span>
                <span>Moral Code: Inscription #{bundle.configJson.moralCodeInscription}</span>
              </div>

              {/* Auto-responses */}
              <Field label="Auto-Responses">
                <div className="space-y-2">
                  {config.autoResponses.map((ar, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="px-2 py-1 rounded" style={{ background: 'rgba(247,147,26,0.1)', color: '#f7931a' }}>{ar.trigger}</span>
                      <span style={{ color: '#64748b' }}>→</span>
                      <span className="flex-1 truncate" style={{ color: '#94a3b8' }}>{ar.response}</span>
                      <button onClick={() => removeAutoResponse(i)} className="text-red-400 hover:text-red-300">✕</button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <input
                      value={newTrigger}
                      onChange={e => setNewTrigger(e.target.value)}
                      placeholder="Trigger word..."
                      className="flex-1 px-2 py-1.5 rounded text-xs"
                      style={inputStyle}
                    />
                    <input
                      value={newResponse}
                      onChange={e => setNewResponse(e.target.value)}
                      placeholder="Response..."
                      className="flex-1 px-2 py-1.5 rounded text-xs"
                      style={inputStyle}
                    />
                    <button onClick={addAutoResponse} className="px-3 py-1.5 rounded text-xs" style={{ background: 'rgba(0,255,136,0.1)', color: '#00ff88' }}>+</button>
                  </div>
                </div>
              </Field>

              {/* Escalation */}
              <Field label="Escalation Settings">
                <div className="space-y-2">
                  <input
                    value={config.escalateTelegram}
                    onChange={e => update({ escalateTelegram: e.target.value })}
                    placeholder="Telegram Chat ID (for notifications)"
                    className="w-full px-3 py-2 rounded-lg text-xs"
                    style={inputStyle}
                  />
                  <input
                    value={config.escalateEmail}
                    onChange={e => update({ escalateEmail: e.target.value })}
                    placeholder="Email for escalations"
                    className="w-full px-3 py-2 rounded-lg text-xs"
                    style={inputStyle}
                  />
                  <input
                    type="number"
                    value={config.autoApproveDelegationUnder ?? ''}
                    onChange={e => update({ autoApproveDelegationUnder: e.target.value ? parseInt(e.target.value) : null })}
                    placeholder="Auto-approve delegations under X sats"
                    className="w-full px-3 py-2 rounded-lg text-xs"
                    style={inputStyle}
                  />
                </div>
              </Field>

              {/* Privacy box */}
              <div className="rounded-xl p-4" style={{ background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.1)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <span>🔒</span>
                  <span className="text-xs font-bold" style={{ color: '#00ff88' }}>Privacy Shield</span>
                </div>
                <ul className="text-[11px] space-y-1" style={{ color: '#64748b' }}>
                  <li>• API keys encrypted with AES-256-GCM before storage</li>
                  <li>• Keys decrypted only at call time, never logged</li>
                  <li>• Zero-knowledge: Block Genomics cannot read your keys</li>
                  <li>• You can delete your guardian and keys at any time</li>
                </ul>
              </div>

              {/* Connect OpenClaw Agent */}
              {config.id && (
                <div className="rounded-xl p-4" style={{
                  background: monitorConnected ? 'rgba(0,200,255,0.04)' : 'rgba(147,51,234,0.04)',
                  border: `1px solid ${monitorConnected ? 'rgba(0,200,255,0.15)' : 'rgba(147,51,234,0.15)'}`,
                }}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span>🤖</span>
                      <span className="text-xs font-bold" style={{ color: monitorConnected ? '#00c8ff' : '#9333ea' }}>
                        OpenClaw Agent Monitor
                      </span>
                    </div>
                    {monitorConnected && !monitorToken && (
                      <span className="flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full" style={{
                        background: 'rgba(0,255,136,0.1)',
                        color: '#00ff88',
                        border: '1px solid rgba(0,255,136,0.2)',
                      }}>
                        <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#00ff88', boxShadow: '0 0 4px #00ff88' }} />
                        Connected
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] mb-3" style={{ color: '#94a3b8' }}>
                    Connect your personal AI agent (OpenClaw) to monitor and command this Guardian remotely.
                    Your agent can read conversations, check events, update personality, and manage your Guardian through natural language.
                  </p>

                  {monitorToken ? (
                    /* Token just generated — show it once */
                    <div className="space-y-3">
                      <div className="rounded-lg p-3" style={{ background: 'rgba(255,200,0,0.06)', border: '1px solid rgba(255,200,0,0.2)' }}>
                        <div className="flex items-center gap-2 mb-2">
                          <span>⚠️</span>
                          <span className="text-[11px] font-bold" style={{ color: '#ffc800' }}>Save this token — it won&apos;t be shown again!</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 text-[10px] px-2 py-1.5 rounded break-all" style={{
                            background: 'rgba(0,0,0,0.3)',
                            color: '#e2e8f0',
                            border: '1px solid rgba(255,255,255,0.06)',
                          }}>
                            {monitorToken}
                          </code>
                          <button
                            onClick={copyToken}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-bold flex-shrink-0 transition-all"
                            style={{
                              background: tokenCopied ? 'rgba(0,255,136,0.15)' : 'rgba(0,200,255,0.1)',
                              border: `1px solid ${tokenCopied ? 'rgba(0,255,136,0.3)' : 'rgba(0,200,255,0.2)'}`,
                              color: tokenCopied ? '#00ff88' : '#00c8ff',
                            }}
                          >
                            {tokenCopied ? '✅ Copied!' : '📋 Copy'}
                          </button>
                        </div>
                      </div>
                      <p className="text-[10px]" style={{ color: '#64748b' }}>
                        Paste this token into your OpenClaw agent&apos;s TOOLS.md or workspace config to connect.
                      </p>
                    </div>
                  ) : monitorConnected ? (
                    /* Already connected — show status + revoke */
                    <div className="flex items-center gap-2">
                      <span className="text-[11px]" style={{ color: '#94a3b8' }}>Monitor token active</span>
                      <button
                        onClick={handleRevokeToken}
                        disabled={revokingToken}
                        className="px-3 py-1.5 rounded-lg text-[11px] transition-all hover:brightness-125"
                        style={{
                          background: 'rgba(239,68,68,0.08)',
                          border: '1px solid rgba(239,68,68,0.2)',
                          color: '#ef4444',
                          opacity: revokingToken ? 0.6 : 1,
                        }}
                      >
                        {revokingToken ? '⏳ Revoking...' : '🔓 Revoke & Regenerate'}
                      </button>
                    </div>
                  ) : (
                    /* Not connected — generate button */
                    <button
                      onClick={handleGenerateToken}
                      disabled={generatingToken}
                      className="w-full py-2.5 rounded-xl text-sm font-bold transition-all hover:brightness-125"
                      style={{
                        background: 'linear-gradient(135deg, rgba(147,51,234,0.15), rgba(0,200,255,0.1))',
                        border: '1.5px solid rgba(147,51,234,0.3)',
                        color: '#c084fc',
                        opacity: generatingToken ? 0.6 : 1,
                      }}
                    >
                      {generatingToken ? '⏳ Generating Token...' : '🔗 Connect OpenClaw Agent'}
                    </button>
                  )}

                  <ul className="text-[10px] space-y-0.5 mt-3" style={{ color: '#475569' }}>
                    <li>• Token is scoped to this guardian only</li>
                    <li>• Stored as SHA-256 hash — we never see the plaintext</li>
                    <li>• Revoke anytime with one click</li>
                  </ul>
                </div>
              )}
            </>
          ) : (
            /* Self-Hosted Tab */
            <>
              <Field label="Agent Endpoint URL">
                <div className="flex gap-2">
                  <input
                    value={config.agentEndpoint}
                    onChange={e => update({ agentEndpoint: e.target.value, selfHosted: true })}
                    placeholder="https://your-agent.example.com"
                    className="flex-1 px-3 py-2 rounded-lg text-sm"
                    style={inputStyle}
                  />
                  <button
                    onClick={detectEndpoint}
                    disabled={detectingEndpoint}
                    className="px-3 py-2 rounded-lg text-xs font-mono"
                    style={{ background: 'rgba(0,255,136,0.1)', color: '#00ff88', border: '1px solid rgba(0,255,136,0.2)' }}
                  >
                    {detectingEndpoint ? '⏳' : '🔍'} Detect
                  </button>
                </div>
              </Field>

              {/* Verification status */}
              <div className="flex items-center gap-2 text-xs" style={{ color: config.endpointVerified ? '#00ff88' : '#f7931a' }}>
                <span>{config.endpointVerified ? '✅' : '⚠️'}</span>
                <span>{config.endpointVerified ? 'Endpoint verified and responding' : 'Endpoint not yet verified'}</span>
              </div>

              {/* Privacy notice */}
              <div className="rounded-xl p-4" style={{ background: 'rgba(147,51,234,0.04)', border: '1px solid rgba(147,51,234,0.15)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <span>🌐</span>
                  <span className="text-xs font-bold" style={{ color: '#9333ea' }}>Proxied Connection</span>
                </div>
                <ul className="text-[11px] space-y-1" style={{ color: '#64748b' }}>
                  <li>• All traffic proxied through Block Genomics — your real endpoint is never exposed</li>
                  <li>• Heartbeat pings verify liveness every 5 minutes</li>
                  <li>• Full control: pause or disconnect at any time</li>
                </ul>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 pt-4 flex gap-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <button
            onClick={() => handleSave(true)}
            disabled={saving}
            className="flex-1 py-3 rounded-xl text-sm font-bold transition-all hover:brightness-125"
            style={{
              background: 'linear-gradient(135deg, rgba(0,255,136,0.2), rgba(0,200,100,0.15))',
              border: '1.5px solid rgba(0,255,136,0.4)',
              color: '#00ff88',
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? '⏳ Saving...' : '🚀 Go Live'}
          </button>
          {config.status === 'active' && config.id && (
            <button
              onClick={handlePause}
              className="px-6 py-3 rounded-xl text-sm font-bold transition-all hover:brightness-125"
              style={{
                background: 'rgba(255,200,0,0.08)',
                border: '1.5px solid rgba(255,200,0,0.3)',
                color: '#ffc800',
              }}
            >
              ⏸ Pause
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-mono mb-1.5" style={{ color: '#94a3b8' }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  color: '#e2e8f0',
  outline: 'none',
};
