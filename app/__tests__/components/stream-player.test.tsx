/** @jest-environment jsdom */
import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

let mockPlayersOn = true;
jest.mock('@/lib/stream-players-flag', () => ({ get STREAM_PLAYERS_ON() { return mockPlayersOn; } }));

import StreamPlayer, { PLAYER_ALLOW, PLAYER_SANDBOX } from '@/components/nexus/StreamPlayer';

const TWITCH = 'https://player.twitch.tv/?channel=somechannel&parent=blockgenomics.io&parent=www.blockgenomics.io&autoplay=true&muted=true';
const LINK = 'https://www.twitch.tv/somechannel';
const PLATFORM_HOSTS = /youtube\.com|youtu\.be|twitch\.tv|kick\.com/;

/** The player's box as the browser would measure it (jsdom measures 0 x 0). */
function boxOf(width: number, height: number) {
  return jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0, toJSON: () => ({}),
  } as DOMRect);
}

beforeEach(() => { boxOf(520, 325); });
afterEach(() => { mockPlayersOn = true; jest.restoreAllMocks(); });

/** Every element that would make the browser fetch something, with its address (a link is not one). */
function fetching(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('iframe, img, script, link, video, source, object, embed'))
    .map(e => e.getAttribute('src') ?? e.getAttribute('href') ?? e.getAttribute('data') ?? '');
}

const PLAY = '▶ Play';
const TWITCH_STREAM = { blockHeight: 840000, streamUrl: LINK, embedUrl: TWITCH };
const YOUTUBE_EMBED = 'https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&mute=1';
const YOUTUBE_STREAM = { blockHeight: 840000, streamUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', embedUrl: YOUTUBE_EMBED };
const KICK_STREAM = { blockHeight: 840000, streamUrl: 'https://kick.com/somechannel', embedUrl: 'https://player.kick.com/somechannel' };

function playButton(): HTMLElement | null {
  return screen.queryByRole('button', { name: PLAY });
}

describe('StreamPlayer', () => {
  it('P1 before the visitor\'s click nothing is fetched from the platform', () => {
    const { container } = render(<StreamPlayer {...TWITCH_STREAM} status="live" />);
    expect(fetching(container)).toEqual([]);
    expect(fetching(container).filter((src) => PLATFORM_HOSTS.test(src))).toEqual([]);
    expect(container.textContent).toContain('Plays from Twitch; its terms and cookies apply. Ads there may open other sites.');
    expect(playButton()).not.toBeNull();
  });

  it('P2 the click makes one sandboxed frame without top navigation', () => {
    const onPlay = jest.fn();
    const { container } = render(<StreamPlayer {...TWITCH_STREAM} status="live" onPlay={onPlay} />);
    fireEvent.click(playButton()!);
    const frames = container.querySelectorAll('iframe');
    expect(frames).toHaveLength(1);
    const f = frames[0];
    expect(f.getAttribute('sandbox')).toBe(PLAYER_SANDBOX);
    expect(f.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin allow-presentation allow-popups');
    expect(f.getAttribute('sandbox')).not.toContain('allow-top-navigation');
    expect(f.getAttribute('sandbox')).not.toContain('allow-popups-to-escape-sandbox');
    expect(f.getAttribute('referrerpolicy')).toBe('strict-origin-when-cross-origin');
    expect(f.getAttribute('allow')).toBe(PLAYER_ALLOW);
    expect(f.getAttribute('title')).toBe('Live stream on block 840000 from Twitch');
    expect(f.getAttribute('src')).toBe(TWITCH + '&parent=localhost');
    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  it('P3 our own Watch link sits outside the frame and opens without a referrer', () => {
    const { container } = render(<StreamPlayer {...TWITCH_STREAM} status="live" />);
    const check = () => {
      const links = container.querySelectorAll('a');
      expect(links).toHaveLength(1);
      const link = links[0];
      expect(link.textContent).toBe('Watch on Twitch ↗');
      expect(link.getAttribute('href')).toBe(LINK);
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
      return link;
    };
    check();
    fireEvent.click(playButton()!);
    const link = check();
    const iframe = container.querySelector('iframe')!;
    expect(iframe).not.toBeNull();
    expect(link.contains(iframe)).toBe(false);
    expect(iframe.contains(link)).toBe(false);
  });

  it('P4 a player address of another origin gets no Play button and no frame', () => {
    for (const embedUrl of ['https://blockgenomics.io/embed/x', 'https://evil.example/embed', 'http://www.youtube.com/embed/dQw4w9WgXcQ']) {
      const r = render(<StreamPlayer {...TWITCH_STREAM} embedUrl={embedUrl} status="live" />);
      expect(playButton()).toBeNull();
      expect(r.container.querySelector('iframe')).toBeNull();
      expect(r.container.querySelector('a')).not.toBeNull();
      r.unmount();
    }
  });

  it('P5 a frame that ended never comes back without a click', () => {
    const { container, rerender } = render(<StreamPlayer {...TWITCH_STREAM} status="live" />);
    fireEvent.click(playButton()!);
    const frame = container.querySelector('iframe')!;
    const src = frame.getAttribute('src');
    rerender(<StreamPlayer {...TWITCH_STREAM} status="unconfirmed" />);
    expect(container.querySelector('iframe')).toBe(frame);
    expect(frame.getAttribute('src')).toBe(src);
    expect(container.querySelector('a')).not.toBeNull();
    expect(container.querySelector('button')).toBeNull();
    rerender(<StreamPlayer {...TWITCH_STREAM} status="ended" />);
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.textContent).toContain('This stream has ended.');
    expect(container.querySelector('a')).toBeNull();
    rerender(<StreamPlayer {...TWITCH_STREAM} status="live" />);
    expect(container.querySelector('iframe')).toBeNull();
    expect(playButton()).not.toBeNull();
    rerender(<StreamPlayer {...TWITCH_STREAM} status="ended" />);
    rerender(<StreamPlayer {...TWITCH_STREAM} status="unconfirmed" />);
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
  });

  it('P6 a stream being checked offers no Play button and no link before a click', () => {
    const { container } = render(<StreamPlayer {...TWITCH_STREAM} status="unconfirmed" />);
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toContain('Checking who holds this block');
  });

  it('P7 with the switch off every player is a plain link', () => {
    mockPlayersOn = false;
    const check = (container: HTMLElement) => {
      expect(container.querySelector('button')).toBeNull();
      expect(container.querySelector('iframe')).toBeNull();
      expect(container.textContent).not.toContain('Plays from');
      expect(container.textContent).not.toContain('needs a wider screen');
      expect(container.querySelector('a')?.getAttribute('href')).toBe(LINK);
    };
    const a = render(<StreamPlayer {...TWITCH_STREAM} status="live" />);
    check(a.container);
    a.unmount();
    boxOf(400, 250);
    const b = render(<StreamPlayer {...TWITCH_STREAM} status="live" />);
    check(b.container);
  });

  it('P8 a link that is not one of the three platforms renders nothing', () => {
    for (const streamUrl of ['', 'https://evil.example/x']) {
      const r = render(<StreamPlayer {...TWITCH_STREAM} streamUrl={streamUrl} status="live" />);
      expect(r.container.innerHTML).toBe('');
      r.unmount();
    }
  });

  it('P9 YouTube\'s address is used as the server built it', () => {
    const { container } = render(<StreamPlayer {...YOUTUBE_STREAM} status="live" />);
    fireEvent.click(playButton()!);
    expect(container.querySelector('iframe')?.getAttribute('src')).toBe(YOUTUBE_EMBED);
    expect(container.querySelector('a')?.textContent).toBe('Watch on YouTube ↗');
  });

  it('P10 Twitch gets a frame only in a box of at least 480 x 300', () => {
    boxOf(479, 300);
    const a = render(<StreamPlayer {...TWITCH_STREAM} status="live" />);
    expect(playButton()).toBeNull();
    expect(a.container.querySelector('iframe')).toBeNull();
    expect(a.container.textContent).toContain("Twitch's player needs a wider screen. Watch it on Twitch.");
    expect(a.container.querySelector('a')).not.toBeNull();
    boxOf(520, 325);
    fireEvent(window, new Event('resize'));
    expect(playButton()).not.toBeNull();
    a.unmount();
    boxOf(520, 325);
    const c = render(<StreamPlayer {...TWITCH_STREAM} status="live" />);
    boxOf(400, 250);
    fireEvent.click(playButton()!);
    expect(c.container.querySelector('iframe')).toBeNull();
  });

  it('P11 YouTube and Kick are not bound by Twitch\'s size', () => {
    for (const stream of [YOUTUBE_STREAM, KICK_STREAM]) {
      boxOf(300, 187);
      const r = render(<StreamPlayer {...stream} status="live" />);
      expect(playButton()).not.toBeNull();
      fireEvent.click(playButton()!);
      expect(r.container.querySelectorAll('iframe')).toHaveLength(1);
      r.unmount();
    }
    void React;
  });

  it('P12 the frame may autoplay, play protected video, go fullscreen and float, and nothing else', () => {
    expect(PLAYER_ALLOW).toBe('autoplay; encrypted-media; fullscreen; picture-in-picture');
    const { container } = render(<StreamPlayer {...YOUTUBE_STREAM} status="live" />);
    fireEvent.click(playButton()!);
    const f = container.querySelector('iframe')!;
    expect(f.getAttribute('allow')).toBe('autoplay; encrypted-media; fullscreen; picture-in-picture');
    expect(f.hasAttribute('allowfullscreen')).toBe(true);
  });

  it('P13 a click in a box that has become too small for Twitch makes no frame and says so', () => {
    const { container } = render(<StreamPlayer {...TWITCH_STREAM} status="live" />);
    expect(playButton()).not.toBeNull();
    boxOf(400, 250);
    fireEvent.click(playButton()!);
    expect(container.querySelector('iframe')).toBeNull();
    expect(playButton()).toBeNull();
    expect(container.textContent).toContain("Twitch's player needs a wider screen. Watch it on Twitch.");
    expect(container.querySelector('a')?.getAttribute('href')).toBe(LINK);
  });
});
