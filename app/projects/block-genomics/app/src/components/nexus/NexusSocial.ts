import { useEffect, useMemo, useRef, useState } from 'react';
import { TOTAL_BLOCKS } from './NexusBlockData';

export interface Visitor {
  id: string;
  username: string;
  blockHeight: number;
  avatar: string;
  genomeHash: string;
  blocksOwned: number;
  memberSince: string;
  color: string;
}

export interface ActivityEvent {
  id: string;
  message: string;
  timestamp: number;
}

export interface ChatMessage {
  id: string;
  height: number;
  username: string;
  text: string;
  timestamp: number;
}

const USERNAMES = [
  'Nova', 'Sable', 'Riven', 'Echo', 'Aster', 'Vega', 'Lyra', 'Orion', 'Sol', 'Nyx',
  'Kairo', 'Rune', 'Mira', 'Cobalt', 'Lux', 'Juno', 'Pax', 'Iris', 'Zen', 'Axiom',
  'Drift', 'Cipher', 'Kira', 'Atlas', 'Lumen', 'Quill', 'Vanta', 'Neon', 'Vesper', 'Aero',
];

const AVATARS = ['🧬', '🛰️', '🟣', '🟢', '🟦', '🔷', '✨', '🌌', '🚀', '🧿'];
const COLORS = ['#66ccff', '#a855f7', '#22c55e', '#f7931a', '#10b981'];

const ACTIVITY_TEMPLATES = [
  (u: string, h: number) => `${u} visited Block ${h.toLocaleString()}`,
  (u: string, h: number) => `${u} claimed Block ${h.toLocaleString()}`,
  (u: string, h: number) => `${u} is exploring Block ${h.toLocaleString()}`,
];

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomHash() {
  const chars = '0123456789abcdef';
  return Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function randomUser(index: number): Visitor {
  const name = USERNAMES[index % USERNAMES.length] + (index > USERNAMES.length ? `-${index}` : '');
  return {
    id: `${name}-${Math.random().toString(36).slice(2, 7)}`,
    username: name,
    blockHeight: randInt(0, TOTAL_BLOCKS - 1),
    avatar: AVATARS[index % AVATARS.length],
    genomeHash: randomHash(),
    blocksOwned: randInt(1, 128),
    memberSince: `${randInt(2016, 2025)}-${randInt(1, 12).toString().padStart(2, '0')}-01`,
    color: COLORS[index % COLORS.length],
  };
}

export function generateVisitors(count: number): Visitor[] {
  return Array.from({ length: count }, (_, i) => randomUser(i));
}

export function useNexusSocial() {
  const [visitors, setVisitors] = useState<Visitor[]>(() => generateVisitors(randInt(80, 160)));
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const activityId = useRef(0);
  const messageId = useRef(0);
  const visitorsRef = useRef<Visitor[]>(visitors);

  useEffect(() => {
    visitorsRef.current = visitors;
  }, [visitors]);

  const messagesByBlock = useMemo(() => {
    const grouped: Record<number, ChatMessage[]> = {};
    for (const msg of messages) {
      if (!grouped[msg.height]) grouped[msg.height] = [];
      grouped[msg.height].push(msg);
    }
    return grouped;
  }, [messages]);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisitors((prev) => {
        const next = [...prev];
        const moves = randInt(3, 8);
        for (let i = 0; i < moves; i++) {
          const idx = randInt(0, next.length - 1);
          next[idx] = { ...next[idx], blockHeight: randInt(0, TOTAL_BLOCKS - 1) };
        }
        return next;
      });

      setActivity((prev) => {
        const next = [...prev];
        const eventCount = randInt(1, 3);
        for (let i = 0; i < eventCount; i++) {
          const roster = visitorsRef.current;
          const visitor = roster[randInt(0, roster.length - 1)];
          if (!visitor) continue;
          const template = ACTIVITY_TEMPLATES[randInt(0, ACTIVITY_TEMPLATES.length - 1)];
          next.push({
            id: `evt-${activityId.current++}`,
            message: template(visitor.username, visitor.blockHeight),
            timestamp: Date.now(),
          });
        }
        if (Math.random() > 0.7) {
          next.push({
            id: `evt-${activityId.current++}`,
            message: `New block mined: #${(TOTAL_BLOCKS + randInt(1, 300)).toLocaleString()}`,
            timestamp: Date.now(),
          });
        }
        return next.slice(-50);
      });
    }, 3500);

    return () => clearInterval(interval);
  }, []);

  const sendMessage = (height: number, text: string, username = 'You') => {
    setMessages((prev) => [
      ...prev,
      {
        id: `msg-${messageId.current++}`,
        height,
        username,
        text,
        timestamp: Date.now(),
      },
    ]);
  };

  return {
    visitors,
    activity,
    messagesByBlock,
    sendMessage,
  };
}
