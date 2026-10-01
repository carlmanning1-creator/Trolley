import "server-only";
import webpush, { WebPushError } from "web-push";
import { admin } from "@/lib/server/auth";
import { serverEnv } from "@/lib/server/env";

let configured = false;
function setup() {
  if (!configured) {
    webpush.setVapidDetails(serverEnv.vapidSubject(), serverEnv.vapidPublicKey(), serverEnv.vapidPrivateKey());
    configured = true;
  }
}

export type PushMessage = { title: string; body: string; tag?: string; url?: string };

// Sends to every device of the given people. Subscriptions the push service says are gone
// (404 or 410) are deleted so we stop trying them.
// `reached` lists the people at least one of whose devices took the message.
export async function sendToPeople(
  profileIds: string[],
  message: PushMessage,
): Promise<{ sent: number; removed: number; reached: string[] }> {
  if (profileIds.length === 0) return { sent: 0, removed: 0, reached: [] };
  setup();
  const { data: subs } = await admin()
    .from("push_subscriptions")
    .select("id, profile_id, endpoint, keys")
    .in("profile_id", profileIds);
  let sent = 0;
  const reached = new Set<string>();
  const gone: string[] = [];
  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: s.keys as { p256dh: string; auth: string } },
          JSON.stringify(message),
          { TTL: 60 * 60, urgency: "high", topic: message.tag?.slice(0, 32) },
        );
        sent++;
        reached.add(s.profile_id as string);
      } catch (err) {
        if (err instanceof WebPushError && (err.statusCode === 404 || err.statusCode === 410)) gone.push(s.id);
        else console.error("Push failed", err instanceof WebPushError ? err.statusCode : err);
      }
    }),
  );
  if (gone.length) await admin().from("push_subscriptions").delete().in("id", gone);
  return { sent, removed: gone.length, reached: [...reached] };
}
