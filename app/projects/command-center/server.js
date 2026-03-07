#!/usr/bin/env node
// Pepe Command Center v2 — HTTP Server
// Serves the dashboard on localhost:8099 with read/write API

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8099;
const PROJECTS_DIR = path.join(__dirname, '..');
const COMMAND_CENTER_DIR = __dirname;
const DATA_FILE = path.join(COMMAND_CENTER_DIR, 'dashboard-data.json');
const SYNC_FILE = path.join(PROJECTS_DIR, 'dashboard-data.json');

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function readData() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function writeData(data) {
  data.lastUpdated = new Date().toISOString();
  const json = JSON.stringify(data, null, 2);
  fs.writeFileSync(DATA_FILE, json);
  // Sync copy
  try { fs.writeFileSync(SYNC_FILE, json); } catch(e) {}
}

function recalcStats(data) {
  const projects = data.projects || [];
  let totalTasks = 0, tasksComplete = 0, active = 0, planning = 0, completed = 0;
  projects.forEach(p => {
    if (p.status === 'active') active++;
    else if (p.status === 'planning') planning++;
    else if (p.status === 'complete') completed++;
    (p.tasks || []).forEach(t => {
      totalTasks++;
      if (t.done) tasksComplete++;
    });
  });
  data.stats = {
    totalProjects: projects.length,
    active, planning, completed,
    totalTasks, tasksComplete,
    overallProgress: totalTasks > 0 ? Math.round((tasksComplete / totalTasks) * 100) : 0,
  };
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch(e) { reject(e); }
    });
  });
}

function jsonResponse(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-cache');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const urlPath = url.pathname;

  // ─── API ROUTES ───
  try {
    // GET /api/data — full dashboard data
    if (urlPath === '/api/data' && req.method === 'GET') {
      return jsonResponse(res, 200, readData());
    }

    // POST /api/data — save full dashboard data
    if (urlPath === '/api/data' && req.method === 'POST') {
      const body = await parseBody(req);
      recalcStats(body);
      writeData(body);
      return jsonResponse(res, 200, { ok: true });
    }

    // POST /api/project/:id/task — add task
    if (urlPath.match(/^\/api\/project\/[^/]+\/task$/) && req.method === 'POST') {
      const id = urlPath.split('/')[3];
      const body = await parseBody(req);
      const data = readData();
      const project = data.projects.find(p => p.id === id);
      if (!project) return jsonResponse(res, 404, { error: 'Project not found' });
      if (!project.tasks) project.tasks = [];
      const task = { name: body.name, done: false, priority: body.priority || 'medium', dueDate: body.dueDate || null, labels: body.labels || [], createdAt: new Date().toISOString() };
      project.tasks.push(task);
      recalcStats(data);
      writeData(data);
      return jsonResponse(res, 200, { ok: true, task });
    }

    // PUT /api/project/:id/task/:idx — update task
    if (urlPath.match(/^\/api\/project\/[^/]+\/task\/\d+$/) && req.method === 'PUT') {
      const parts = urlPath.split('/');
      const id = parts[3], idx = parseInt(parts[5]);
      const body = await parseBody(req);
      const data = readData();
      const project = data.projects.find(p => p.id === id);
      if (!project || !project.tasks[idx]) return jsonResponse(res, 404, { error: 'Not found' });
      Object.assign(project.tasks[idx], body);
      recalcStats(data);
      writeData(data);
      return jsonResponse(res, 200, { ok: true });
    }

    // DELETE /api/project/:id/task/:idx — delete task
    if (urlPath.match(/^\/api\/project\/[^/]+\/task\/\d+$/) && req.method === 'DELETE') {
      const parts = urlPath.split('/');
      const id = parts[3], idx = parseInt(parts[5]);
      const data = readData();
      const project = data.projects.find(p => p.id === id);
      if (!project) return jsonResponse(res, 404, { error: 'Not found' });
      project.tasks.splice(idx, 1);
      recalcStats(data);
      writeData(data);
      return jsonResponse(res, 200, { ok: true });
    }

    // POST /api/project/:id/note — add daily note
    if (urlPath.match(/^\/api\/project\/[^/]+\/note$/) && req.method === 'POST') {
      const id = urlPath.split('/')[3];
      const body = await parseBody(req);
      const data = readData();
      const project = data.projects.find(p => p.id === id);
      if (!project) return jsonResponse(res, 404, { error: 'Not found' });
      if (!project.notes) project.notes = [];
      const note = { text: body.text, date: new Date().toISOString(), id: Date.now().toString(36) };
      project.notes.unshift(note);
      recalcStats(data);
      writeData(data);
      return jsonResponse(res, 200, { ok: true, note });
    }

    // DELETE /api/project/:id/note/:noteId
    if (urlPath.match(/^\/api\/project\/[^/]+\/note\/[^/]+$/) && req.method === 'DELETE') {
      const parts = urlPath.split('/');
      const id = parts[3], noteId = parts[5];
      const data = readData();
      const project = data.projects.find(p => p.id === id);
      if (!project) return jsonResponse(res, 404, { error: 'Not found' });
      project.notes = (project.notes || []).filter(n => n.id !== noteId);
      writeData(data);
      return jsonResponse(res, 200, { ok: true });
    }

    // POST /api/project/:id/timeline — add timeline event
    if (urlPath.match(/^\/api\/project\/[^/]+\/timeline$/) && req.method === 'POST') {
      const id = urlPath.split('/')[3];
      const body = await parseBody(req);
      const data = readData();
      const project = data.projects.find(p => p.id === id);
      if (!project) return jsonResponse(res, 404, { error: 'Not found' });
      if (!project.timeline) project.timeline = [];
      const event = { date: body.date || new Date().toISOString().slice(0, 10), type: body.type || 'milestone', title: body.title, detail: body.detail || '' };
      project.timeline.push(event);
      writeData(data);
      return jsonResponse(res, 200, { ok: true, event });
    }

    // PUT /api/project/:id — update project fields
    if (urlPath.match(/^\/api\/project\/[^/]+$/) && req.method === 'PUT') {
      const id = urlPath.split('/')[3];
      const body = await parseBody(req);
      const data = readData();
      const project = data.projects.find(p => p.id === id);
      if (!project) return jsonResponse(res, 404, { error: 'Not found' });
      // Allow updating: name, description, status, priority, category
      ['name', 'description', 'status', 'priority', 'category'].forEach(k => {
        if (body[k] !== undefined) project[k] = body[k];
      });
      recalcStats(data);
      writeData(data);
      return jsonResponse(res, 200, { ok: true });
    }

    // POST /api/project — create new project
    if (urlPath === '/api/project' && req.method === 'POST') {
      const body = await parseBody(req);
      const data = readData();
      const id = (body.name || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
      const project = {
        id, name: body.name, status: body.status || 'planning', priority: body.priority || 'medium',
        category: body.category || 'general', description: body.description || '',
        created: new Date().toISOString().slice(0, 10), progress: 0,
        techStack: body.techStack || [], links: {}, timeline: [
          { date: new Date().toISOString().slice(0, 10), type: 'created', title: 'Project created', detail: '' }
        ], testing: [], tasks: [], notes: []
      };
      data.projects.push(project);
      recalcStats(data);
      writeData(data);
      return jsonResponse(res, 200, { ok: true, project });
    }
  } catch(e) {
    console.error('API error:', e);
    return jsonResponse(res, 500, { error: e.message });
  }

  // ─── STATIC FILES ───
  let filePath;
  if (urlPath === '/' || urlPath === '/index.html') {
    filePath = path.join(COMMAND_CENTER_DIR, 'index.html');
  } else if (urlPath.startsWith('/command-center/')) {
    filePath = path.join(COMMAND_CENTER_DIR, urlPath.replace('/command-center/', ''));
  } else {
    filePath = path.join(COMMAND_CENTER_DIR, urlPath.slice(1));
    if (!fs.existsSync(filePath)) {
      filePath = path.join(PROJECTS_DIR, urlPath.slice(1));
    }
  }

  const realProjects = fs.realpathSync(PROJECTS_DIR);
  try {
    const realFile = fs.realpathSync(filePath);
    if (!realFile.startsWith(realProjects)) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
  } catch(e) {
    res.writeHead(404); res.end('Not found'); return;
  }

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  } catch(e) {
    res.writeHead(404); res.end('Not found');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`🐸 Pepe Command Center v2 running at http://localhost:${PORT}`);
});
