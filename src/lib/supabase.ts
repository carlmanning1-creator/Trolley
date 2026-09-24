import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// One browser client for the whole app. The session lives in localStorage so it survives
// restarts and works with no signal; nobody needs to sign in again after the first time.
let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error("Supabase settings are missing from the build.");
    client = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: "trolley-auth",
      },
      realtime: { params: { eventsPerSecond: 20 } },
    });
  }
  return client;
}
