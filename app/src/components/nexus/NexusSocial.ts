import { useMemo, useRef, useState } from 'react';

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

export function useNexusSocial() {
  // No fabricated presence. Real visitors/activity will come from a live presence
  // feed; until then the map shows no fake people, counts, or "claimed" events.
  const [visitors] = useState<Visitor[]>([]);
  const [activity] = useState<ActivityEvent[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messageId = useRef(0);

  const messagesByBlock = useMemo(() => {
    const grouped: Record<number, ChatMessage[]> = {};
    for (const msg of messages) {
      if (!grouped[msg.height]) grouped[msg.height] = [];
      grouped[msg.height].push(msg);
    }
    return grouped;
  }, [messages]);

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
