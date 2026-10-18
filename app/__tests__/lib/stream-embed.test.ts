/**
 * lib/stream-embed — which stream URLs a block owner may publish, and the player
 * URL built from one. Hosts match exactly or as a dot-subdomain, never as a
 * substring (CodeQL #16-#21), and ids cannot smuggle path or query parts.
 */

import { getStreamEmbedUrl, streamPlatform } from '@/lib/stream-embed';

describe('streamPlatform', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube'],
    ['https://youtube.com/live/dQw4w9WgXcQ', 'youtube'],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube'],
    ['https://youtu.be/dQw4w9WgXcQ', 'youtube'],
    ['https://www.twitch.tv/somechannel', 'twitch'],
    ['https://twitch.tv/somechannel', 'twitch'],
    ['https://kick.com/somechannel', 'kick'],
    ['http://www.kick.com/somechannel', 'kick'],
    ['https://WWW.YOUTUBE.COM/watch?v=dQw4w9WgXcQ', 'youtube'],
  ])('%s is %s', (url, platform) => {
    expect(streamPlatform(new URL(url))).toBe(platform);
  });

  it.each([
    'https://youtube.com.attacker.example/watch?v=dQw4w9WgXcQ',
    'https://notyoutube.com/watch?v=dQw4w9WgXcQ',
    'https://attacker.example/youtube.com',
    'https://attacker.example/?u=youtube.com',
    'https://youtu.be.attacker.example/dQw4w9WgXcQ',
    'https://www.youtu.be/dQw4w9WgXcQ',
    'https://twitch.tv.attacker.example/somechannel',
    'https://eviltwitch.tv/somechannel',
    'https://kick.com.attacker.example/somechannel',
    'https://notkick.com/somechannel',
    'ftp://youtube.com/watch?v=dQw4w9WgXcQ',
    'javascript://youtube.com/%0aalert(1)',
  ])('%s is no platform', (url) => {
    expect(streamPlatform(new URL(url))).toBeNull();
  });
});

describe('getStreamEmbedUrl', () => {
  it('builds each player URL', () => {
    expect(getStreamEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
      'https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&mute=1',
    );
    expect(getStreamEmbedUrl('https://youtube.com/live/dQw4w9WgXcQ?feature=share')).toBe(
      'https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&mute=1',
    );
    expect(getStreamEmbedUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(
      'https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&mute=1',
    );
    expect(getStreamEmbedUrl('https://www.twitch.tv/some_channel')).toBe(
      'https://player.twitch.tv/?channel=some_channel&parent=blockgenomics.io&autoplay=true&muted=true',
    );
    expect(getStreamEmbedUrl('https://kick.com/some-channel')).toBe('https://player.kick.com/some-channel');
  });

  it('refuses a lookalike host even with a well-formed id', () => {
    expect(getStreamEmbedUrl('https://youtube.com.attacker.example/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(getStreamEmbedUrl('https://twitch.tv.attacker.example/somechannel')).toBeNull();
    expect(getStreamEmbedUrl('https://kick.com.attacker.example/somechannel')).toBeNull();
  });

  it('refuses ids that would add path segments or query parameters to the player URL', () => {
    expect(getStreamEmbedUrl('https://www.youtube.com/watch?v=../../redirect')).toBeNull();
    expect(getStreamEmbedUrl('https://www.youtube.com/watch?v=abc%3Fq%3D1')).toBeNull();
    expect(getStreamEmbedUrl('https://youtu.be/abc/def')).toBeNull();
    expect(getStreamEmbedUrl('https://www.twitch.tv/foo&parent=attacker.example')).toBeNull();
    expect(getStreamEmbedUrl('https://kick.com/..%2F..%2Fattacker')).toBeNull();
  });

  it('refuses a platform URL with no id, and junk', () => {
    expect(getStreamEmbedUrl('https://www.youtube.com/')).toBeNull();
    expect(getStreamEmbedUrl('https://www.twitch.tv/')).toBeNull();
    expect(getStreamEmbedUrl('not a url')).toBeNull();
  });
});
