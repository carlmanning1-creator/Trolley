import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/server/env";

let adminClient: SupabaseClient | null = null;

// Full-access database client. Only for server routes, after checking who is calling.
export function admin(): SupabaseClient {
  if (!adminClient) {
    adminClient = createClient(serverEnv.supabaseUrl(), serverEnv.supabaseSecretKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}

export type Caller = { userId: string; householdId: string; displayName: string; token: string };

// Reads "Authorization: Bearer <access token>", checks it with Supabase, and looks up the
// caller's household. Returns null for anyone who isn't a signed-in household member.
export async function getCaller(req: Request): Promise<Caller | null> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data.user) return null;
  const { data: profile } = await admin()
    .from("profiles")
    .select("household_id, display_name")
    .eq("id", data.user.id)
    .maybeSingle();
  if (!profile) return null;
  return { userId: data.user.id, householdId: profile.household_id, displayName: profile.display_name, token };
}

// A database client that acts as the caller, so row level security still applies.
export function asCaller(caller: Caller): SupabaseClient {
  return createClient(serverEnv.supabaseUrl(), serverEnv.supabasePublishableKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${caller.token}` } },
  });
}

export function unauthorised() {
  return Response.json({ error: "Please sign in again." }, { status: 401 });
}
