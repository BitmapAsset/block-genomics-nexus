/**
 * Structural guard against soft 404s.
 *
 * `loading.tsx` wraps a route segment's page in a Suspense boundary, and Next
 * flushes that fallback — status line included — before the page finishes. A
 * `notFound()` thrown inside the page therefore lands after the response is
 * committed: the body becomes the 404 but the status stays 200, so crawlers
 * index the "not found" page as real content.
 *
 * This was measured, not assumed: with `loading.tsx` present `/block/abc`
 * answered 200; with the check moved into the segment's `layout.tsx` (which
 * renders above the boundary) it answers 404.
 *
 * Nothing in a unit test can catch this — it only shows up in a production HTTP
 * response — so this walks the route tree instead and fails on the shape.
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const APP_DIR = join(process.cwd(), 'src', 'app');

function segments(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (!statSync(full).isDirectory()) continue;
    found.push(full);
    segments(full, found);
  }
  return found;
}

const has = (dir: string, file: string) => {
  try {
    statSync(join(dir, file));
    return true;
  } catch {
    return false;
  }
};

const read = (dir: string, file: string) => {
  try {
    return readFileSync(join(dir, file), 'utf8');
  } catch {
    return '';
  }
};

describe('soft 404 guard', () => {
  it('never leaves notFound() inside a segment that has its own loading.tsx', () => {
    const offenders = segments(APP_DIR).filter((dir) => {
      if (!has(dir, 'loading.tsx')) return false;
      const page = read(dir, 'page.tsx');
      if (!page.includes('notFound(')) return false;
      // A layout in the same segment renders above the Suspense boundary, so a
      // check there still sets a real status.
      return !read(dir, 'layout.tsx').includes('notFound(');
    });

    expect(offenders.map((d) => d.replace(APP_DIR, 'src/app'))).toEqual([]);
  });

  it('validates the height of every public block route above the boundary', () => {
    const blockSegment = join(APP_DIR, 'block', '[height]');

    // The page keeps its own check as defence in depth, but the one that
    // actually decides the HTTP status lives in the layout.
    expect(read(blockSegment, 'layout.tsx')).toContain('notFound(');
    expect(read(blockSegment, 'layout.tsx')).toContain('parseBlockParam');
  });

  it('keeps public dynamic page segments free of client-rendered "invalid param" states', () => {
    // A client component cannot set a status code, so rendering an error message
    // for a bad param is a 200 by construction. These pages must validate on the
    // server and call notFound() instead.
    for (const segment of [
      join(APP_DIR, 'nexus', 'parcel', '[height]'),
      join(APP_DIR, 'agent', '[handle]'),
    ]) {
      const page = read(segment, 'page.tsx');
      expect(page).toContain('notFound(');
      expect(page.startsWith("'use client'")).toBe(false);
    }
  });
});
