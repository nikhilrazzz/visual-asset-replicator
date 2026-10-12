import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useInstall } from "@/lib/install";
import { currentSubscription, disablePush, enablePush, pushSupport, type PushState } from "@/lib/push";
import { sendTestPush } from "@/lib/push.functions";
import { meQuery } from "@/lib/data";

const CATS = [
  { key: "assignments", label: "Task assignments and reassignments" },
  { key: "comments", label: "Comments, replies and mentions" },
  { key: "status", label: "Status updates and completions" },
  { key: "deadlines", label: "Deadline and priority changes" },
  { key: "reviews", label: "Review, approval and revision requests" },
  { key: "projects", label: "Project updates" },
] as const;

type Prefs = Record<(typeof CATS)[number]["key"] | "push_enabled" | "sound", boolean>;
const DEFAULTS: Prefs = { push_enabled: true, assignments: true, comments: true, status: true, deadlines: true, reviews: true, projects: true, sound: false };

export function NotificationSettings() {
  const { data: me } = useQuery(meQuery);
  const qc = useQueryClient();
  const inst = useInstall();
  const [state, setState] = useState<PushState>("unsupported");
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: prefs = DEFAULTS } = useQuery({
    queryKey: ["prefs", me?.id],
    enabled: !!me,
    queryFn: async () => {
      const { data } = await supabase.from("notification_preferences").select("*").eq("user_id", me!.id).maybeSingle();
      return { ...DEFAULTS, ...(data ?? {}) } as Prefs;
    },
  });

  async function refreshState() {
    setState(pushSupport(inst.platform, inst.installed));
    setSubscribed(!!(await currentSubscription().catch(() => null)));
  }
  useEffect(() => { if (inst.ready) refreshState(); }, [inst.ready, inst.installed]);

  async function savePref(patch: Partial<Prefs>) {
    if (!me) return;
    const next = { ...prefs, ...patch };
    qc.setQueryData(["prefs", me.id], next);
    const { error } = await supabase.from("notification_preferences").upsert({ user_id: me.id, ...next, updated_at: new Date().toISOString() });
    if (error) toast.error(error.message);
  }

  async function enable() {
    setBusy(true);
    try {
      const r = await enablePush();
      if (r === "denied") toast.error("Notifications are blocked for Mafia in your browser settings.");
      else { toast.success("Push notifications enabled on this device"); if (!prefs.push_enabled) await savePref({ push_enabled: true }); }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't enable notifications");
    } finally { setBusy(false); refreshState(); }
  }
  async function disable() {
    setBusy(true);
    await disablePush().catch(() => {});
    setBusy(false);
    toast.success("This device will no longer receive push notifications");
    refreshState();
  }
  async function test() {
    setBusy(true);
    try {
      const r = await sendTestPush();
      if (r.sent > 0) toast.success(`Test sent to ${r.sent} device${r.sent > 1 ? "s" : ""}. It should appear in a few seconds.`);
      else toast.error(r.errors[0] ?? "No device received the test.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test failed");
    } finally { setBusy(false); refreshState(); }
  }

  const permLabel: Record<PushState, string> = {
    granted: "Allowed",
    denied: "Blocked",
    default: "Not asked yet",
    unsupported: "Not supported in this browser",
    "needs-install": "Install Mafia to your Home Screen first",
    iframe: "Open Mafia in its own tab to manage",
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-2 rounded-xl bg-muted/50 p-4 text-sm sm:grid-cols-2">
        <div><span className="text-muted-foreground">Permission: </span><b>{permLabel[state]}</b></div>
        <div><span className="text-muted-foreground">This device: </span><b>{subscribed ? "Receiving push" : "Not subscribed"}</b></div>
      </div>

      {state === "needs-install" && (
        <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">On iPhone and iPad (iOS 16.4+), push notifications only work after you add Mafia to your Home Screen and open it from there. Use “Install Mafia” above.</p>
      )}
      {state === "denied" && (
        <p className="rounded-lg bg-primary-soft px-3 py-2 text-sm text-destructive">
          Notifications are blocked. Click the lock icon next to the address bar → Site settings → Notifications → Allow, then reload. On iPhone: Settings → Notifications → Mafia → Allow. On Mac/Windows also check the system notification settings for your browser.
        </p>
      )}
      {state === "iframe" && <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">You're in an editor preview. Open mafia.inflooo.com in its own tab or the installed app to turn on notifications.</p>}
      {state === "unsupported" && <p className="text-sm text-muted-foreground">This browser can't receive push notifications. You'll still see everything in the notification centre.</p>}

      <div className="flex flex-wrap gap-2">
        {(state === "default" || (state === "granted" && !subscribed)) && (
          <Button onClick={enable} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />} Enable notifications</Button>
        )}
        {subscribed && <Button variant="outline" onClick={test} disabled={busy}>Send test notification</Button>}
        {subscribed && <Button variant="ghost" onClick={disable} disabled={busy}>Disable on this device</Button>}
      </div>

      <div className="divide-y divide-border rounded-xl border border-border">
        <Row label="Push notifications (all devices)" checked={prefs.push_enabled} onChange={(v) => savePref({ push_enabled: v })} />
        {CATS.map((c) => <Row key={c.key} label={c.label} checked={prefs[c.key]} onChange={(v) => savePref({ [c.key]: v } as Partial<Prefs>)} />)}
        <Row label="Play a sound for in-app alerts" checked={prefs.sound} onChange={(v) => savePref({ sound: v })} />
      </div>
      <p className="text-xs text-muted-foreground">Turning categories off only stops push alerts — everything stays in your notification centre. Email delivery isn't set up yet.</p>
    </div>
  );
}

function Row({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
      {label}
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}
