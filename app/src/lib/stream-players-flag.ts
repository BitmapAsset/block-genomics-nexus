/**
 * Stream players switch, read at build time from NEXT_PUBLIC_BG_STREAM_PLAYERS.
 *
 * Unset or exactly "on": a visitor's click plays a stream in its player. "off", or any other value: every player is a
 * plain link to the stream on its platform. The switch only hides players: it starts, changes and ends no stream.
 * Read here, and used in components/nexus/StreamPlayer.tsx only (a test reads every file under src).
 */
const RAW = process.env.NEXT_PUBLIC_BG_STREAM_PLAYERS;

export const STREAM_PLAYERS_ON = RAW === undefined || RAW === 'on';
