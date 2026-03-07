import { useState, useEffect, useCallback } from 'react'
import { 
  Activity, Cpu, MessageSquare, DollarSign, Clock, 
  Zap, Terminal, Calendar, TrendingUp, Heart,
  Bot, Sparkles, ChevronRight, Circle, RefreshCw, AlertCircle
} from 'lucide-react'
import { 
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts'

const DATA_SERVER = 'http://127.0.0.1:8097'
const REFRESH_INTERVAL = 30000 // 30 seconds

// Types
interface ApiData {
  stats: {
    totalTokensIn: number
    totalTokensOut: number
    totalCacheRead: number
    totalCost: number
    messageCount: number
    modelUsage: Record<string, number>
    toolUsage: Record<string, number>
    sessions: Array<{ id: string; tokens: number; cost: string; model: string; updated: string }>
  }
  crons: Array<{
    id: string
    name: string
    enabled: boolean
    schedule: string
    lastRun: string | null
    lastStatus: string
    nextRun: string | null
  }>
  heartbeat: {
    enabled: boolean
    intervalMinutes: number
    lastBeat: string | null
    status: string
  }
  models: {
    primary: string
    fallbacks: string[]
    available: string[]
  }
  timestamp: string
}

// Color palette
const MODEL_COLORS: Record<string, string> = {
  'claude-opus-4-5': '#a855f7',
  'claude-opus-4-6': '#8b5cf6',
  'claude-sonnet': '#3b82f6',
  'gemini-3-pro-preview': '#f59e0b',
  'gpt-4o': '#22c55e',
  'default': '#6b7280'
}

function StatCard({ icon: Icon, label, value, subValue, color, pulse }: {
  icon: any, label: string, value: string, subValue?: string, color: string, pulse?: boolean
}) {
  return (
    <div className={`bg-[#1a1a24] rounded-xl p-5 border border-[#2a2a3a] hover:border-${color}-500/50 transition-all`}>
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2 rounded-lg`} style={{ backgroundColor: `${color}20` }}>
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
        <span className="text-sm text-zinc-500">{label}</span>
        {pulse && <span className="relative flex h-2 w-2 ml-auto">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: color }}></span>
          <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: color }}></span>
        </span>}
      </div>
      <div className="text-3xl font-bold tracking-tight">{value}</div>
      {subValue && <div className="text-sm text-zinc-500 mt-1">{subValue}</div>}
    </div>
  )
}

function formatNumber(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return n.toString()
}

function formatCost(n: number): string {
  return '$' + n.toFixed(2)
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function App() {
  const [data, setData] = useState<ApiData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${DATA_SERVER}/api/all`)
      if (!res.ok) throw new Error('Server error')
      const json = await res.json()
      setData(json)
      setError(null)
      setLastUpdate(new Date())
    } catch (e) {
      setError('Data server offline. Run: node data-server.cjs')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, REFRESH_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchData])

  // Prepare chart data
  const modelChartData = data ? Object.entries(data.stats.modelUsage).map(([name, value]) => ({
    name: name.replace('claude-', '').replace('-4-5', ' 4.5').replace('-4-6', ' 4.6'),
    value,
    color: MODEL_COLORS[name] || MODEL_COLORS.default
  })) : []

  const toolChartData = data ? Object.entries(data.stats.toolUsage)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({ name, count })) : []

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d0d12] flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin text-purple-500 mx-auto mb-4" />
          <p className="text-zinc-500">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0d0d12] text-white p-6">
      {/* Grid background */}
      <div className="fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:50px_50px] pointer-events-none" />
      
      <div className="relative max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="text-4xl">🐸</div>
            <div>
              <h1 className="text-2xl font-bold">Pepe Dashboard</h1>
              <p className="text-zinc-500 text-sm">Real-time OpenClaw Monitoring</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm text-zinc-500">
              Updated {timeAgo(lastUpdate.toISOString())}
            </div>
            <button 
              onClick={fetchData}
              className="p-2 rounded-lg bg-[#1a1a24] hover:bg-[#2a2a34] transition-all"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/30">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              <span className="text-sm text-green-500">Live</span>
            </div>
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <span className="text-red-400">{error}</span>
          </div>
        )}

        {data && (
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <StatCard
                icon={MessageSquare}
                label="Messages"
                value={data.stats.messageCount.toString()}
                subValue="Total API calls"
                color="#a855f7"
                pulse
              />
              <StatCard
                icon={Zap}
                label="Tokens Used"
                value={formatNumber(data.stats.totalTokensIn + data.stats.totalTokensOut)}
                subValue={`${formatNumber(data.stats.totalCacheRead)} cached`}
                color="#3b82f6"
              />
              <StatCard
                icon={DollarSign}
                label="Total Cost"
                value={formatCost(data.stats.totalCost)}
                subValue="Last 7 days"
                color="#22c55e"
              />
              <StatCard
                icon={Cpu}
                label="Active Model"
                value={data.models.primary.split('/').pop()?.replace('-4-5', ' 4.5') || 'Unknown'}
                subValue={`${data.models.available.length} available`}
                color="#f59e0b"
              />
            </div>

            {/* Main Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
              {/* Model Usage */}
              <div className="bg-[#1a1a24] rounded-xl p-6 border border-[#2a2a3a]">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Bot className="w-5 h-5 text-purple-500" />
                  Model Usage
                </h3>
                {modelChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={modelChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {modelChartData.map((entry, index) => (
                          <Cell key={index} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1a1a24', border: '1px solid #2a2a3a', borderRadius: '8px' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[200px] flex items-center justify-center text-zinc-500">
                    No model data yet
                  </div>
                )}
                <div className="mt-4 space-y-2">
                  {modelChartData.map((m, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: m.color }} />
                        <span className="text-zinc-400">{m.name}</span>
                      </div>
                      <span className="font-mono">{m.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tool Usage */}
              <div className="bg-[#1a1a24] rounded-xl p-6 border border-[#2a2a3a]">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Terminal className="w-5 h-5 text-blue-500" />
                  Tool Usage
                </h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={toolChartData} layout="vertical">
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" width={60} tick={{ fill: '#71717a', fontSize: 12 }} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1a1a24', border: '1px solid #2a2a3a', borderRadius: '8px' }}
                    />
                    <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Heartbeat Monitor */}
              <div className="bg-[#1a1a24] rounded-xl p-6 border border-[#2a2a3a]">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Heart className="w-5 h-5 text-red-500" />
                  Heartbeat Monitor
                </h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-[#0d0d12]">
                    <span className="text-zinc-400">Status</span>
                    <span className={`px-2 py-1 rounded text-sm ${
                      data.heartbeat.status === 'active' 
                        ? 'bg-green-500/10 text-green-500' 
                        : 'bg-yellow-500/10 text-yellow-500'
                    }`}>
                      {data.heartbeat.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-[#0d0d12]">
                    <span className="text-zinc-400">Interval</span>
                    <span className="font-mono">{data.heartbeat.intervalMinutes} min</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-[#0d0d12]">
                    <span className="text-zinc-400">Last Beat</span>
                    <span className="text-sm">{timeAgo(data.heartbeat.lastBeat)}</span>
                  </div>
                  <div className="pt-2 text-xs text-zinc-600 text-center">
                    Edit HEARTBEAT.md to configure tasks
                  </div>
                </div>
              </div>
            </div>

            {/* Model Usage Monitoring — Role Assignments */}
            <div className="bg-[#1a1a24] rounded-xl p-6 border border-[#2a2a3a] mb-8">
              <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-400" />
                Model Usage Monitoring
                <span className="ml-auto text-xs text-zinc-500 font-normal">4 providers · 5 models · always online</span>
              </h3>
              <p className="text-sm text-zinc-500 mb-5">Which brain handles what — at a glance.</p>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Opus 4.6 */}
                <div className="relative overflow-hidden rounded-xl border border-purple-500/30 bg-gradient-to-br from-purple-500/5 to-transparent p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 rounded-lg bg-purple-500/15">
                      <Bot className="w-5 h-5 text-purple-400" />
                    </div>
                    <div>
                      <div className="font-semibold text-purple-300">Claude Opus 4.6</div>
                      <div className="text-xs text-zinc-500">Anthropic · Primary</div>
                    </div>
                    <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-500/20 text-purple-300 border border-purple-500/30">ACTIVE</span>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-purple-400">🏗️</span>
                      <span className="text-zinc-300">Architect & Lead Reasoning</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-purple-400">🔍</span>
                      <span className="text-zinc-300">Code Review & Quality Gates</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-purple-400">💬</span>
                      <span className="text-zinc-300">Conversation & Planning</span>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-zinc-600">alias: <span className="font-mono text-purple-400/60">opus</span></div>
                </div>

                {/* GPT-5.2 Codex */}
                <div className="relative overflow-hidden rounded-xl border border-green-500/30 bg-gradient-to-br from-green-500/5 to-transparent p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 rounded-lg bg-green-500/15">
                      <Terminal className="w-5 h-5 text-green-400" />
                    </div>
                    <div>
                      <div className="font-semibold text-green-300">GPT-5.2 / 5.3 Codex</div>
                      <div className="text-xs text-zinc-500">OpenAI · Coding</div>
                    </div>
                    <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-500/20 text-green-300 border border-green-500/30">READY</span>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-green-400">💪</span>
                      <span className="text-zinc-300">Coding Muscle & Generation</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-green-400">🔧</span>
                      <span className="text-zinc-300">Refactoring & Implementation</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-green-400">🎙️</span>
                      <span className="text-zinc-300">Voice / Audio / TTS</span>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-zinc-600">alias: <span className="font-mono text-green-400/60">gpt52</span></div>
                </div>

                {/* Claude Code */}
                <div className="relative overflow-hidden rounded-xl border border-indigo-500/30 bg-gradient-to-br from-indigo-500/5 to-transparent p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 rounded-lg bg-indigo-500/15">
                      <Cpu className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div>
                      <div className="font-semibold text-indigo-300">Claude Code</div>
                      <div className="text-xs text-zinc-500">Anthropic · Autonomous</div>
                    </div>
                    <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">READY</span>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-indigo-400">🤖</span>
                      <span className="text-zinc-300">Autonomous Coding Agent</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-indigo-400">📦</span>
                      <span className="text-zinc-300">Full-Stack Feature Building</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-indigo-400">🧪</span>
                      <span className="text-zinc-300">Testing & Debugging</span>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-zinc-600">via: <span className="font-mono text-indigo-400/60">coding-agent skill</span></div>
                </div>

                {/* Gemini */}
                <div className="relative overflow-hidden rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-transparent p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 rounded-lg bg-amber-500/15">
                      <TrendingUp className="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                      <div className="font-semibold text-amber-300">Gemini 3 Pro</div>
                      <div className="text-xs text-zinc-500">Google · Research</div>
                    </div>
                    <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">READY</span>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-amber-400">🌐</span>
                      <span className="text-zinc-300">Web Search & Research</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-amber-400">📊</span>
                      <span className="text-zinc-300">Data Analysis & Summaries</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-amber-400">🔗</span>
                      <span className="text-zinc-300">Google Ecosystem Tasks</span>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-zinc-600">fallback: <span className="font-mono text-amber-400/60">gemini-3-pro</span></div>
                </div>

                {/* Grok */}
                <div className="relative overflow-hidden rounded-xl border border-sky-500/30 bg-gradient-to-br from-sky-500/5 to-transparent p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 rounded-lg bg-sky-500/15">
                      <Zap className="w-5 h-5 text-sky-400" />
                    </div>
                    <div>
                      <div className="font-semibold text-sky-300">Grok 4</div>
                      <div className="text-xs text-zinc-500">xAI · Social Intel</div>
                    </div>
                    <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-medium bg-sky-500/20 text-sky-300 border border-sky-500/30">READY</span>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-sky-400">🐦</span>
                      <span className="text-zinc-300">X / Twitter Intelligence</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-sky-400">📰</span>
                      <span className="text-zinc-300">Trending & News Monitoring</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-sky-400">🔥</span>
                      <span className="text-zinc-300">Real-Time Social Research</span>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-zinc-600">alias: <span className="font-mono text-sky-400/60">grok</span></div>
                </div>

                {/* Failover Info Card */}
                <div className="relative overflow-hidden rounded-xl border border-zinc-700/50 bg-gradient-to-br from-zinc-500/5 to-transparent p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 rounded-lg bg-zinc-500/15">
                      <RefreshCw className="w-5 h-5 text-zinc-400" />
                    </div>
                    <div>
                      <div className="font-semibold text-zinc-300">Failover Chain</div>
                      <div className="text-xs text-zinc-500">Auto-redundancy</div>
                    </div>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-5 text-center text-purple-400 font-mono text-xs">1</span>
                      <ChevronRight className="w-3 h-3 text-zinc-600" />
                      <span className="text-zinc-300">Opus 4.6</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-5 text-center text-zinc-400 font-mono text-xs">2</span>
                      <ChevronRight className="w-3 h-3 text-zinc-600" />
                      <span className="text-zinc-400">Opus 4.5</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-5 text-center text-zinc-400 font-mono text-xs">3</span>
                      <ChevronRight className="w-3 h-3 text-zinc-600" />
                      <span className="text-zinc-400">GPT-5.2 Codex</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-5 text-center text-zinc-400 font-mono text-xs">4</span>
                      <ChevronRight className="w-3 h-3 text-zinc-600" />
                      <span className="text-zinc-400">Grok 4</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-5 text-center text-zinc-400 font-mono text-xs">5</span>
                      <ChevronRight className="w-3 h-3 text-zinc-600" />
                      <span className="text-zinc-400">Gemini 3 Pro</span>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-zinc-600">4 providers · never go offline</div>
                </div>
              </div>
            </div>

            {/* Cron Jobs */}
            <div className="bg-[#1a1a24] rounded-xl p-6 border border-[#2a2a3a] mb-8">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-yellow-500" />
                Cron Jobs
                <span className="ml-auto text-sm text-zinc-500">{data.crons.length} total</span>
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-sm text-zinc-500 border-b border-[#2a2a3a]">
                      <th className="pb-3">Name</th>
                      <th className="pb-3">Schedule</th>
                      <th className="pb-3">Last Run</th>
                      <th className="pb-3">Status</th>
                      <th className="pb-3">Next Run</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.crons.map((cron, i) => (
                      <tr key={i} className="border-b border-[#2a2a3a]/50 hover:bg-[#2a2a3a]/20">
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <Circle className={`w-2 h-2 ${cron.enabled ? 'text-green-500' : 'text-zinc-600'}`} fill="currentColor" />
                            <span className={!cron.enabled ? 'text-zinc-500' : ''}>{cron.name}</span>
                          </div>
                        </td>
                        <td className="py-3 font-mono text-sm text-zinc-400">{cron.schedule}</td>
                        <td className="py-3 text-sm text-zinc-400">{timeAgo(cron.lastRun)}</td>
                        <td className="py-3">
                          <span className={`px-2 py-1 rounded text-xs ${
                            cron.lastStatus === 'ok' ? 'bg-green-500/10 text-green-500' :
                            cron.lastStatus === 'error' ? 'bg-red-500/10 text-red-500' :
                            'bg-zinc-500/10 text-zinc-500'
                          }`}>
                            {cron.lastStatus}
                          </span>
                        </td>
                        <td className="py-3 text-sm text-zinc-400">{timeAgo(cron.nextRun)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Recent Sessions */}
            <div className="bg-[#1a1a24] rounded-xl p-6 border border-[#2a2a3a]">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Activity className="w-5 h-5 text-cyan-500" />
                Recent Sessions
                <span className="ml-auto text-sm text-zinc-500">{data.stats.sessions.length} loaded</span>
              </h3>
              <div className="space-y-2">
                {data.stats.sessions.slice(0, 8).map((session, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-[#0d0d12] hover:bg-[#1a1a24] transition-all">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm text-zinc-400">{session.id}</span>
                      <span className="px-2 py-0.5 rounded text-xs bg-purple-500/10 text-purple-400">
                        {session.model}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-zinc-500">{formatNumber(session.tokens)} tokens</span>
                      <span className="text-green-500">${session.cost}</span>
                      <span className="text-zinc-600">{timeAgo(session.updated)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-zinc-600">
          Pepe Dashboard v1.0 • Data refreshes every 30s • 🐸
        </div>
      </div>
    </div>
  )
}

export default App
