/**
 * Livestream URLs: which hosts a block owner may broadcast from, and the
 * player URL the site embeds for one.
 *
 * A host is the platform's domain or a subdomain of it (`www.`, `m.`), matched
 * on `URL.hostname` exactly or after a dot, never as a substring. The checks
 * this replaces used `hostname.includes('youtube.com')`, which also accepted
 * `youtube.com.attacker.example`; the stored URL is then served to every
 * visitor of the block as its stream link (CodeQL
 * js/incomplete-url-substring-sanitization). The id spliced into a player URL
 * is limited to the characters the platform uses, so it cannot add a path
 * segment or a query parameter.
 *
 * Shared by `POST|GET /api/v1/livestream`, `GET /api/v1/livestream/active` and
 * the go-live form in ParcelView, so the client and both routes agree,
 * and by `components/nexus/StreamPlayer.tsx`, the only place a player frame is made.
 */

export type StreamPlatform = 'youtube' | 'twitch' | 'kick';

/** The three kinds of stream a holder can pick. */
export const STREAM_TYPES = ['broadcast', 'townhall', 'spatial'] as const;
export type StreamKind = (typeof STREAM_TYPES)[number];

/** One of the three stream types; anything else (another word, a long text, no string) reads as a broadcast. */
export function streamTypeOf(raw: unknown): StreamKind {
  return (STREAM_TYPES as readonly unknown[]).includes(raw) ? (raw as StreamKind) : 'broadcast';
}

/** A stream link is short: the start refuses a longer value before any signature or chain work. */
export const STREAM_URL_MAX = 500;

function isDomainOrSubdomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

/** The platform a stream URL belongs to, or null for any other host or scheme. */
export function streamPlatform(url: URL): StreamPlatform | null {
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname;
  if (isDomainOrSubdomain(host, 'youtube.com') || host === 'youtu.be') return 'youtube';
  if (isDomainOrSubdomain(host, 'twitch.tv')) return 'twitch';
  if (isDomainOrSubdomain(host, 'kick.com')) return 'kick';
  return null;
}

/**
 * The stream URL as stored and served: the WHATWG-normalised `href` of a
 * YouTube, Twitch or Kick URL, else null.
 *
 * Storing the caller's raw string is a parser differential. Browsers read
 * `https://www.youtube.com\@attacker.example/watch?v=…` as host
 * www.youtube.com (a backslash is a slash), so it passes the host check; other
 * parsers (Python's urllib, for one) read the same string as host
 * attacker.example. The normalised href (`https://www.youtube.com/@attacker.example/watch?v=…`)
 * names one host to every parser.
 */
export function normaliseStreamUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  return streamPlatform(u) ? u.href : null;
}

const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{1,64}$/;
const TWITCH_CHANNEL = /^[A-Za-z0-9_]{1,64}$/;
const KICK_CHANNEL = /^[A-Za-z0-9_-]{1,64}$/;
const TWITCH_NOT_A_CHANNEL = ['videos', 'directory'];

/** The embeddable player URL for a YouTube, Twitch or Kick stream URL, else null. */
export function getStreamEmbedUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }

  switch (streamPlatform(u)) {
    case 'youtube': {
      let videoId = u.searchParams.get('v');
      if (!videoId && u.hostname === 'youtu.be') videoId = u.pathname.slice(1);
      if (!videoId) {
        // YouTube live URL: youtube.com/live/VIDEO_ID
        const liveMatch = u.pathname.match(/\/live\/([a-zA-Z0-9_-]+)/);
        if (liveMatch) videoId = liveMatch[1];
      }
      if (!videoId || !YOUTUBE_VIDEO_ID.test(videoId)) return null;
      return `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1`;
    }
    case 'twitch': {
      const channel = u.pathname.split('/').filter(Boolean)[0];
      if (!channel || !TWITCH_CHANNEL.test(channel)) return null;
      // A clip, a past video and the directory are not a channel's live page.
      if (u.hostname === 'clips.twitch.tv' || TWITCH_NOT_A_CHANNEL.includes(channel.toLowerCase())) return null;
      return `https://player.twitch.tv/?channel=${channel}&parent=blockgenomics.io&parent=www.blockgenomics.io&autoplay=true&muted=true`;
    }
    case 'kick': {
      const channel = u.pathname.split('/').filter(Boolean)[0];
      if (!channel || !KICK_CHANNEL.test(channel)) return null;
      // kick.com/video/<id> is a past video, not a channel.
      if (channel.toLowerCase() === 'video') return null;
      return `https://player.kick.com/${channel}`;
    }
    default:
      return null;
  }
}

/** The only origins a player frame may load: the page policy's `frame-src` names exactly these. */
export const PLAYER_ORIGINS = ['https://www.youtube.com', 'https://player.twitch.tv', 'https://player.kick.com'] as const;

const PAGE_HOST = /^[a-z0-9.-]{1,253}$/;

/**
 * The address a player frame loads, or null when it is not a player address of the three platforms (another origin,
 * the site's own, a credential in it, not a URL). Twitch plays only on the pages its `parent` values name; the page's
 * own host is added when it is not one of them (a preview deployment), so the player works wherever the page is served.
 */
export function playerFrameSrc(embedUrl: string, pageHost: string): string | null {
  let u: URL;
  try { u = new URL(embedUrl); } catch { return null; }
  // Only https: a blob: address carries a player's origin inside it and is no player.
  if (u.protocol !== 'https:') return null;
  if (!(PLAYER_ORIGINS as readonly string[]).includes(u.origin)) return null;
  if (u.username !== '' || u.password !== '') return null;
  if (u.origin === 'https://player.twitch.tv') {
    const host = pageHost.toLowerCase();
    if (PAGE_HOST.test(host) && !u.searchParams.getAll('parent').includes(host)) u.searchParams.append('parent', host);
  }
  return u.href;
}
