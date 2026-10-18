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
 * the go-live form in ParcelView, so the client and both routes agree.
 */

export type StreamPlatform = 'youtube' | 'twitch' | 'kick';

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

const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{1,64}$/;
const TWITCH_CHANNEL = /^[A-Za-z0-9_]{1,64}$/;
const KICK_CHANNEL = /^[A-Za-z0-9_-]{1,64}$/;

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
      return `https://player.twitch.tv/?channel=${channel}&parent=blockgenomics.io&autoplay=true&muted=true`;
    }
    case 'kick': {
      const channel = u.pathname.split('/').filter(Boolean)[0];
      if (!channel || !KICK_CHANNEL.test(channel)) return null;
      return `https://player.kick.com/${channel}`;
    }
    default:
      return null;
  }
}
