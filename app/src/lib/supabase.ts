import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Singleton client for browser use
let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!client) {
    const supabaseUrl = process.env.NEXT_PUBLIC_DATABASE_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_DATABASE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error(
        'Missing Supabase environment variables: NEXT_PUBLIC_DATABASE_SUPABASE_URL and NEXT_PUBLIC_DATABASE_SUPABASE_ANON_KEY must be set'
      );
    }

    client = createClient(supabaseUrl, supabaseAnonKey, {
      realtime: {
        params: { eventsPerSecond: 10 },
      },
    });
  }
  return client;
}
