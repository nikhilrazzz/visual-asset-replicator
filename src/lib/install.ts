import { useEffect, useState } from "react";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

let deferred: BIPEvent | null = null;
let installedFlag = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BIPEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installedFlag = true;
    emit();
  });
}

export type Platform = "ios" | "android" | "mac-safari" | "desktop" | "other";

export function detectPlatform(ua: string, maxTouchPoints = 0): Platform {
  const isIPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
  if (/iPhone|iPod/.test(ua) || isIPad) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|Edg|Firefox/.test(ua)) return "mac-safari";
  if (/Windows|Macintosh|Linux|CrOS/.test(ua)) return "desktop";
  return "other";
}

export function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: window-controls-overlay)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function useInstall() {
  const [, force] = useState(0);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const l = () => force((x) => x + 1);
    listeners.add(l);
    setReady(true);
    const mq = window.matchMedia("(display-mode: standalone)");
    mq.addEventListener("change", l);
    return () => { listeners.delete(l); mq.removeEventListener("change", l); };
  }, []);
  const platform: Platform = ready ? detectPlatform(navigator.userAgent, navigator.maxTouchPoints) : "other";
  const installed = ready && (installedFlag || isStandalone());
  return {
    ready,
    platform,
    installed,
    canPrompt: !!deferred,
    inIframe: ready && window.top !== window.self,
    async prompt() {
      if (!deferred) return "unavailable" as const;
      const e = deferred;
      await e.prompt();
      const { outcome } = await e.userChoice;
      deferred = null;
      emit();
      return outcome;
    },
  };
}
