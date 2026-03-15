import { readFileSync } from 'fs';
import { join } from 'path';
import { NextResponse } from 'next/server';

/**
 * RuneBolt Static File Route Handler
 * Serves static files from /public/runebolt/ with proper content types
 */

export const dynamic = 'force-static';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.otf': 'font/otf',
};

function getMimeType(filename: string): string {
  const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  const { path } = await params;
  let filePath = path?.join('/') || 'index.html';
  
  // Ensure file path doesn't escape the runebolt directory
  if (filePath.includes('..') || filePath.startsWith('/')) {
    return new NextResponse('Not Found', { status: 404 });
  }
  
  // Default to index.html for directory requests
  if (!filePath.includes('.')) {
    filePath = filePath + '/index.html';
  }
  
  try {
    const fullPath = join(process.cwd(), 'public', 'runebolt', filePath);
    const content = readFileSync(fullPath);
    const mimeType = getMimeType(filePath);
    
    return new NextResponse(content, {
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    // Try index.html for SPA routing
    if (!filePath.endsWith('index.html')) {
      try {
        const indexPath = join(process.cwd(), 'public', 'runebolt', 'index.html');
        const content = readFileSync(indexPath);
        return new NextResponse(content, {
          headers: {
            'Content-Type': 'text/html',
            'Cache-Control': 'public, max-age=0, s-maxage=60',
          },
        });
      } catch {
        return new NextResponse('Not Found', { status: 404 });
      }
    }
    
    return new NextResponse('Not Found', { status: 404 });
  }
}
