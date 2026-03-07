#!/usr/bin/env node
// File inventory scanner for Pepe Command Center v2
// Generates file-inventory.json from project directories

const fs = require('fs');
const path = require('path');

const PROJECTS_DIR = path.join(__dirname, '..');
const OUTPUT = path.join(PROJECTS_DIR, 'file-inventory.json');

const IGNORE = new Set(['.git', 'node_modules', '.DS_Store', '.next', 'dist', '.cache']);

function scanDir(dirPath, depth = 0, maxDepth = 3) {
  if (depth > maxDepth) return [];
  
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    return entries
      .filter(e => !IGNORE.has(e.name) && !e.name.startsWith('.'))
      .sort((a, b) => {
        // Directories first
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .map(e => {
        const fullPath = path.join(dirPath, e.name);
        if (e.isDirectory()) {
          return {
            name: e.name,
            type: 'directory',
            children: scanDir(fullPath, depth + 1, maxDepth)
          };
        } else {
          const stat = fs.statSync(fullPath);
          return {
            name: e.name,
            type: 'file',
            size: stat.size,
            modified: stat.mtime.toISOString()
          };
        }
      });
  } catch (e) {
    return [];
  }
}

// Scan project directories
const projectDirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
  .filter(e => e.isDirectory() && !IGNORE.has(e.name))
  .sort((a, b) => a.name.localeCompare(b.name));

const trees = projectDirs.map(d => ({
  name: d.name,
  children: scanDir(path.join(PROJECTS_DIR, d.name))
}));

// Also scan top-level files
const topFiles = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
  .filter(e => e.isFile() && !IGNORE.has(e.name))
  .map(e => {
    const stat = fs.statSync(path.join(PROJECTS_DIR, e.name));
    return { name: e.name, type: 'file', size: stat.size, modified: stat.mtime.toISOString() };
  });

if (topFiles.length > 0) {
  trees.unshift({ name: 'Root Files', children: topFiles });
}

const inventory = {
  scannedAt: new Date().toISOString(),
  trees
};

fs.writeFileSync(OUTPUT, JSON.stringify(inventory, null, 2));
console.log(`✅ File inventory written to ${OUTPUT}`);
console.log(`   ${trees.length} directories scanned`);
