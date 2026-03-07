import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_DATABASE_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_DATABASE_SUPABASE_ANON_KEY!;

// Singleton client for browser use
let client: ReturnType<typeof createClient> | null = null;

export function getSupabaseClient() {
  if (!client) {
    client = createClient(supabaseUrl, supabaseAnonKey, {
      realtime: {
        params: { eventsPerSecond: 10 },
      },
    });
  }
  return client;
}
