/**
 * Pepe Dashboard - Data Server
 * Lightweight, secure local data aggregator
 * 
 * Security features:
 * - Localhost only (127.0.0.1)
 * - Read-only file access
 * - No external network calls
 * - No sensitive data exposed (tokens, keys redacted)
 * - Sanitized output
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8097;
const OPENCLAW_DIR = path.join(require('os').homedir(), '.openclaw');

// CORS headers for local development
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'http://localhost:5173',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

/**
 * Safely read and parse JSON file
 */
function readJsonSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    console.error(`Error reading ${filePath}:`, e.message);
    return null;
  }
}

/**
 * Parse session JSONL and extract usage stats
 */
function parseSessionUsage(sessionDir) {
  const stats = {
    totalTokensIn: 0,
    totalTokensOut: 0,
    totalCacheRead: 0,
    totalCost: 0,
    messageCount: 0,
    modelUsage: {},
    toolUsage: {},
    sessions: []
  };

  try {
    const files = fs.readdirSync(sessionDir).filter(f => f.endsWith('.jsonl'));
    
    for (const file of files.slice(-50)) { // Last 50 sessions for performance
      const filePath = path.join(sessionDir, file);
      const stat = fs.statSync(filePath);
      
      // Skip files older than 7 days
      if (Date.now() - stat.mtimeMs > 7 * 24 * 60 * 60 * 1000) continue;
      
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.trim().split('\n');
      
      let sessionTokens = 0;
      let sessionCost = 0;
      let sessionModel = 'unknown';
      
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          
          if (entry.message?.role === 'assistant' && entry.message?.usage) {
            const usage = entry.message.usage;
            stats.totalTokensIn += usage.input || 0;
            stats.totalTokensOut += usage.output || 0;
            stats.totalCacheRead += usage.cacheRead || 0;
            stats.totalCost += usage.cost?.total || 0;
            stats.messageCount++;
            
            sessionTokens += usage.totalTokens || 0;
            sessionCost += usage.cost?.total || 0;
            
            const model = entry.message.model || 'unknown';
            sessionModel = model;
            stats.modelUsage[model] = (stats.modelUsage[model] || 0) + 1;
          }
          
          if (entry.message?.role === 'toolResult') {
            const toolName = entry.message.toolName;
            if (toolName) {
              stats.toolUsage[toolName] = (stats.toolUsage[toolName] || 0) + 1;
            }
          }
        } catch (e) {
          // Skip malformed lines
        }
      }
      
      stats.sessions.push({
        id: file.replace('.jsonl', '').slice(0, 8),
        tokens: sessionTokens,
        cost: sessionCost.toFixed(4),
        model: sessionModel.split('/').pop(),
        updated: new Date(stat.mtimeMs).toISOString()
      });
    }
  } catch (e) {
    console.error('Error parsing sessions:', e.message);
  }
  
  return stats;
}

/**
 * Get cron jobs status
 */
function getCronJobs() {
  const cronFile = path.join(OPENCLAW_DIR, 'cron', 'jobs.json');
  const data = readJsonSafe(cronFile);
  
  if (!data?.jobs) return [];
  
  return data.jobs.map(job => ({
    id: job.id.slice(0, 8),
    name: job.name,
    enabled: job.enabled,
    schedule: job.schedule?.expr || job.schedule?.kind || 'unknown',
    lastRun: job.state?.lastRunAtMs ? new Date(job.state.lastRunAtMs).toISOString() : null,
    lastStatus: job.state?.lastStatus || 'unknown',
    nextRun: job.state?.nextRunAtMs ? new Date(job.state.nextRunAtMs).toISOString() : null
  }));
}

/**
 * Get heartbeat config
 */
function getHeartbeatConfig() {
  const configFile = path.join(OPENCLAW_DIR, 'openclaw.json');
  const config = readJsonSafe(configFile);
  
  // Heartbeat settings (defaults if not set)
  return {
    enabled: true,
    intervalMinutes: config?.agents?.defaults?.heartbeat?.intervalMinutes || 30,
    lastBeat: null, // Would need to track this separately
    status: 'active'
  };
}

/**
 * Get current model config (sensitive data redacted)
 */
function getModelConfig() {
  const configFile = path.join(OPENCLAW_DIR, 'openclaw.json');
  const config = readJsonSafe(configFile);
  
  return {
    primary: config?.agents?.defaults?.model?.primary || 'unknown',
    fallbacks: config?.agents?.defaults?.model?.fallbacks || [],
    available: Object.keys(config?.agents?.defaults?.models || {})
  };
}

/**
 * Main API handler
 */
function handleRequest(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }
  
  // Only allow GET requests
  if (req.method !== 'GET') {
    res.writeHead(405, CORS_HEADERS);
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }
  
  const url = new URL(req.url, `http://localhost:${PORT}`);
  
  try {
    let data;
    
    switch (url.pathname) {
      case '/api/stats':
        const sessionDir = path.join(OPENCLAW_DIR, 'agents', 'main', 'sessions');
        data = parseSessionUsage(sessionDir);
        break;
        
      case '/api/crons':
        data = getCronJobs();
        break;
        
      case '/api/heartbeat':
        data = getHeartbeatConfig();
        break;
        
      case '/api/models':
        data = getModelConfig();
        break;
        
      case '/api/all':
        const sessDir = path.join(OPENCLAW_DIR, 'agents', 'main', 'sessions');
        data = {
          stats: parseSessionUsage(sessDir),
          crons: getCronJobs(),
          heartbeat: getHeartbeatConfig(),
          models: getModelConfig(),
          timestamp: new Date().toISOString()
        };
        break;
        
      case '/health':
        data = { status: 'ok', timestamp: new Date().toISOString() };
        break;
        
      default:
        res.writeHead(404, CORS_HEADERS);
        res.end(JSON.stringify({ error: 'Not found' }));
        return;
    }
    
    res.writeHead(200, CORS_HEADERS);
    res.end(JSON.stringify(data, null, 2));
    
  } catch (e) {
    console.error('Request error:', e.message);
    res.writeHead(500, CORS_HEADERS);
    res.end(JSON.stringify({ error: 'Internal error' }));
  }
}

// Create server - LOCALHOST ONLY for security
const server = http.createServer(handleRequest);

server.listen(PORT, '127.0.0.1', () => {
  console.log(`🐸 Pepe Dashboard Data Server`);
  console.log(`   Listening on http://127.0.0.1:${PORT}`);
  console.log(`   Endpoints:`);
  console.log(`     /api/all      - All data combined`);
  console.log(`     /api/stats    - Token usage & costs`);
  console.log(`     /api/crons    - Cron job status`);
  console.log(`     /api/heartbeat - Heartbeat config`);
  console.log(`     /api/models   - Model configuration`);
  console.log(`     /health       - Health check`);
  console.log(`   Security: Localhost only, read-only, no sensitive data`);
});
