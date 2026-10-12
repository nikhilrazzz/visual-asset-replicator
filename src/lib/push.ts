import { getVapidPublicKey, removePushSubscription, savePushSubscription } from "./push.functions";

export type PushState = "unsupported" | "needs-install" | "iframe" | "default" | "denied" | "granted";

function b64ToBytes(b64: string) {
  const s = atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

export function pushSupport(platform: string, installed: boolean): PushState {
  if (typeof window === "undefined") return "unsupported";
  if (window.top !== window.self) return "iframe";
  const ok = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!ok) return platform === "ios" && !installed ? "needs-install" : "unsupported";
  return Notification.permission as PushState;
}

export async function getRegistration() {
  return navigator.serviceWorker.register("/push-sw.js", { scope: "/" });
}

export async function currentSubscription() {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Must be called from a click. */
export async function enablePush(): Promise<"ok" | "denied"> {
  const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (perm !== "granted") return "denied";
  const reg = await getRegistration();
  await navigator.serviceWorker.ready;
  const { publicKey } = await getVapidPublicKey();
  let sub = await reg.pushManager.getSubscription();
  if (sub) {
    // re-subscribe if server key changed
    const k = sub.options.applicationServerKey;
    const same = k && btoa(String.fromCharCode(...new Uint8Array(k))) === btoa(String.fromCharCode(...b64ToBytes(publicKey)));
    if (!same) { await sub.unsubscribe(); sub = null; }
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
  const j = sub.toJSON();
  await savePushSubscription({ data: { endpoint: sub.endpoint, p256dh: j.keys?.["p256dh"] ?? "", auth: j.keys?.["auth"] ?? "", userAgent: navigator.userAgent.slice(0, 400) } });
  return "ok";
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  await removePushSubscription({ data: { endpoint: sub.endpoint } }).catch(() => {});
  await sub.unsubscribe();
}

/** Called on sign-out so the next person on this device doesn't get this user's pushes. */
export async function detachDeviceOnSignOut() {
  try { await disablePush(); } catch { /* ignore */ }
}
