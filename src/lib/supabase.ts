import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// One browser client for the whole app. The session lives in localStorage so it survives
// restarts and works with no signal; nobody needs to sign in again after the first time.
let client: SupabaseClient | null = null;

// On weak signal a request can hang without ever failing. Give up after 20 seconds (uploads
// get longer) so the sync queue retries instead of sitting on "Syncing".
function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const body = init?.body;
  const isUpload =
    (typeof Blob !== "undefined" && body instanceof Blob) ||
    (typeof FormData !== "undefined" && body instanceof FormData) ||
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body);
  const timeout = AbortSignal.timeout(isUpload ? 90_000 : 20_000);
  const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  return fetch(input, { ...init, signal });
}

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
      global: { fetch: fetchWithTimeout },
    });
  }
  return client;
}
