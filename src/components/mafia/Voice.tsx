import { useEffect, useRef, useState } from "react";
import { Mic, Square, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

/** Voice notes live in text as [voice](path) tokens; path is in the voice-notes bucket. */
export const VOICE_RE = /\[voice\]\(([^)\s]+)\)/g;
export const voiceToken = (path: string) => `[voice](${path})`;

function pickMime() {
  const opts = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  return opts.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ?? "";
}

async function uploadVoice(blob: Blob): Promise<string> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Please sign in again");
  const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
  const path = `${u.user.id}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("voice-notes").upload(path, blob, { contentType: blob.type || "audio/webm" });
  if (error) throw error;
  return path;
}

/** Mic button: tap to record, tap again to stop & upload. Calls onDone with the token. */
export function VoiceRecorder({ onDone, className }: { onDone: (token: string) => void; className?: string }) {
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [secs, setSecs] = useState(0);
  const [busy, setBusy] = useState(false);
  const cancelled = useRef(false);
  useEffect(() => {
    if (!rec) return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [rec]);
  useEffect(() => () => { rec?.stream.getTracks().forEach((t) => t.stop()); }, [rec]);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickMime();
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      cancelled.current = false;
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRec(null);
        if (cancelled.current || !chunks.length) return;
        setBusy(true);
        try { onDone(voiceToken(await uploadVoice(new Blob(chunks, { type: r.mimeType || mime })))); }
        catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save voice note"); }
        finally { setBusy(false); }
      };
      r.start();
      setSecs(0);
      setRec(r);
    } catch {
      toast.error("Microphone access is needed to record a voice note");
    }
  };
  const fmt = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  if (rec)
    return (
      <span className={cn("inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-xs text-primary", className)}>
        <span className="h-2 w-2 animate-pulse rounded-full bg-primary" /> {fmt}
        <button type="button" aria-label="Stop and send voice note" onClick={() => rec.stop()} className="rounded-full p-1 hover:bg-primary/20"><Square className="h-3.5 w-3.5 fill-current" /></button>
        <button type="button" aria-label="Cancel recording" onClick={() => { cancelled.current = true; rec.stop(); }} className="rounded-full p-1 hover:bg-primary/20"><X className="h-3.5 w-3.5" /></button>
      </span>
    );
  return (
    <button type="button" aria-label="Record voice note" disabled={busy} onClick={start}
      className={cn("inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-primary disabled:opacity-50", className)}>
      {busy ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Mic className="h-4 w-4" />}
    </button>
  );
}

export function VoicePlayer({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    supabase.storage.from("voice-notes").createSignedUrl(path, 3600).then(({ data }) => alive && setUrl(data?.signedUrl ?? null));
    return () => { alive = false; };
  }, [path]);
  return url ? <audio controls preload="metadata" src={url} className="my-1 h-9 w-full max-w-xs" /> : <span className="text-xs text-muted-foreground">🎤 Voice note…</span>;
}

/** Splits text into plain parts and voice players. */
export function voiceParts(text: string): { text: string; voices: string[] } {
  const voices = [...text.matchAll(VOICE_RE)].map((m) => m[1]!);
  return { text: text.replace(VOICE_RE, "").trim(), voices };
}
