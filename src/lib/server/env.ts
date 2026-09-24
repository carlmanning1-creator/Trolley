import "server-only";

// Server-only settings. Importing this from browser code fails the build.
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing server setting ${name}`);
  return value;
}

export const serverEnv = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL"),
  supabasePublishableKey: () => required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  supabaseSecretKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),
  anthropicKey: () => required("ANTHROPIC_API_KEY"),
  receiptModel: () => process.env.ANTHROPIC_RECEIPT_MODEL || "claude-haiku-4-5-20251001",
  categoryModel: () => process.env.ANTHROPIC_CATEGORY_MODEL || "claude-haiku-4-5-20251001",
  offUserAgent: () => required("OFF_USER_AGENT"),
  vapidPublicKey: () => required("NEXT_PUBLIC_VAPID_PUBLIC_KEY"),
  vapidPrivateKey: () => required("VAPID_PRIVATE_KEY"),
  vapidSubject: () => required("VAPID_SUBJECT"),
};
