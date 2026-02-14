'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface RealtimeChatMessage {
  id: string;
  blockHeight: number;
  senderAddress: string;
  senderHandle: string | null;
  text: string;
  type: string;
  channel: string;
  mediaUrl: string | null;
  replyToId: string | null;
  createdAt: string;
}

interface UseRealtimeChatOptions {
  /** Block height for block/dm channels, ignored for global */
  blockHeight: number;
  /** Chat channel: block, dm, or global */
  channel: 'block' | 'dm' | 'global';
  /** Whether to subscribe (set false to pause) */
  enabled?: boolean;
  /** Callback when a new message arrives via realtime */
  onMessage?: (msg: RealtimeChatMessage) => void;
}

/**
 * Subscribe to real-time chat messages via Supabase Realtime.
 * Listens for INSERT events on the ChatMessage table filtered by channel + blockHeight.
 */
export function useRealtimeChat({ blockHeight, channel, enabled = true, onMessage }: UseRealtimeChatOptions) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (!enabled) return;

    const supabase = getSupabaseClient();
    
    // Build filter based on channel type
    // Global chat: filter by channel only
    // Block/DM chat: filter by channel AND blockHeight
    const filterParts = [`channel=eq.${channel}`];
    if (channel !== 'global') {
      filterParts.push(`blockHeight=eq.${blockHeight}`);
    }
    const filter = filterParts.join(',');
    
    // Channel name must be unique per subscription
    const channelName = channel === 'global' 
      ? `chat:global` 
      : `chat:${channel}:${blockHeight}`;

    const sub = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ChatMessage',
          filter,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          const msg: RealtimeChatMessage = {
            id: row.id as string,
            blockHeight: row.blockHeight as number,
            senderAddress: row.senderAddress as string,
            senderHandle: row.senderHandle as string | null,
            text: row.text as string,
            type: row.type as string,
            channel: row.channel as string,
            mediaUrl: row.mediaUrl as string | null,
            replyToId: row.replyToId as string | null,
            createdAt: row.createdAt as string,
          };
          onMessageRef.current?.(msg);
        }
      )
      .subscribe();

    channelRef.current = sub;

    return () => {
      sub.unsubscribe();
      channelRef.current = null;
    };
  }, [blockHeight, channel, enabled]);
}

/**
 * Hook for Supabase Presence — tracks who's online in a block/channel.
 * Provides typing indicators and viewer counts.
 */
export function usePresence({
  blockHeight,
  channel,
  userHandle,
  userAddress,
  enabled = true,
}: {
  blockHeight: number;
  channel: string;
  userHandle?: string;
  userAddress?: string;
  enabled?: boolean;
}) {
  const [viewers, setViewers] = useState<{ handle: string; address: string }[]>([]);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const typingTimeoutRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    if (!enabled || !userAddress) return;

    const supabase = getSupabaseClient();
    const presenceChannel = supabase.channel(`presence:${channel}:${blockHeight}`, {
      config: { presence: { key: userAddress } },
    });

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        const users: { handle: string; address: string }[] = [];
        for (const [address, presences] of Object.entries(state)) {
          const p = (presences as { handle?: string }[])[0];
          users.push({ handle: p?.handle || address.slice(0, 8), address });
        }
        setViewers(users);
      })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        const handle = (payload as { handle?: string })?.handle;
        if (!handle || handle === userHandle) return;
        
        setTypingUsers(prev => prev.includes(handle) ? prev : [...prev, handle]);
        
        // Clear typing after 3s
        const existing = typingTimeoutRef.current.get(handle);
        if (existing) clearTimeout(existing);
        typingTimeoutRef.current.set(handle, setTimeout(() => {
          setTypingUsers(prev => prev.filter(h => h !== handle));
          typingTimeoutRef.current.delete(handle);
        }, 3000));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({
            handle: userHandle || userAddress.slice(0, 8),
            online_at: new Date().toISOString(),
          });
        }
      });

    channelRef.current = presenceChannel;

    return () => {
      presenceChannel.unsubscribe();
      channelRef.current = null;
      // Clear all typing timeouts
      for (const t of typingTimeoutRef.current.values()) clearTimeout(t);
      typingTimeoutRef.current.clear();
    };
  }, [blockHeight, channel, userAddress, userHandle, enabled]);

  const sendTyping = useCallback(() => {
    if (channelRef.current && userHandle) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: { handle: userHandle },
      });
    }
  }, [userHandle]);

  return { viewers, typingUsers, sendTyping, viewerCount: viewers.length };
}
