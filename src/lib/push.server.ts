import { buildPushPayload, type VapidKeys } from "@block65/webcrypto-web-push";
import { p256 } from "@noble/curves/nist.js";

const b64url = (b: Uint8Array) => {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

let cached: VapidKeys | null = null;

/** VAPID keypair derived deterministically from the VAPID_SEED secret. */
export async function getVapid(): Promise<VapidKeys> {
  if (cached) return cached;
  const seed = process.env.VAPID_SEED;
  if (!seed) throw new Error("VAPID_SEED is not configured");
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("mafia-vapid:" + seed)));
  const pub = p256.getPublicKey(d, false);
  cached = { subject: "mailto:admin@inflooo.com", publicKey: b64url(pub), privateKey: b64url(d) };
  return cached;
}

export type PushContent = { title: string; body: string; url: string; tag?: string };
type Sub = { id: string; endpoint: string; p256dh: string; auth: string };

/** Sends to each subscription (max 6 at a time). Returns ids to delete (expired) and counts. */
export async function sendToSubs(subs: Sub[], content: PushContent) {
  const vapid = await getVapid();
  const expired: string[] = [];
  const ok: string[] = [];
  const errors: string[] = [];
  for (let i = 0; i < subs.length; i += 6) {
    await Promise.all(
      subs.slice(i, i + 6).map(async (s) => {
        try {
          const payload = await buildPushPayload(
            { data: JSON.stringify(content), options: { ttl: 60 * 60 * 24, urgency: "high", topic: content.tag?.slice(0, 32) } },
            { endpoint: s.endpoint, expirationTime: null, keys: { p256dh: s.p256dh, auth: s.auth } },
            vapid,
          );
          const res = await fetch(s.endpoint, payload);
          if (res.status === 404 || res.status === 410) expired.push(s.id);
          else if (res.ok) ok.push(s.id);
          else errors.push(`${res.status}: ${(await res.text()).slice(0, 200)}`);
        } catch (e) {
          errors.push(e instanceof Error ? e.message : String(e));
        }
      }),
    );
  }
  return { expired, ok, errors };
}
