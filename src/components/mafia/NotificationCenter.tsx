import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, isYesterday } from "date-fns";
import { Bell, Check, CheckCheck, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { notificationsQuery, type Notification } from "@/lib/data";
import { cn } from "@/lib/utils";
import { EmptyState, PersonAvatar, useTeamMap } from "./bits";
import { useTaskPanel } from "./TaskPanel";

export function relTime(iso: string, now = Date.now()) {
  const d = new Date(iso);
  const s = Math.max(0, (now - d.getTime()) / 1000);
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400 && !isYesterday(d)) return `${Math.floor(s / 3600)} h ago`;
  if (isYesterday(d)) return "Yesterday";
  return format(d, s < 7 * 86400 ? "EEEE" : "d MMM");
}

const FILTERS = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "assignments", label: "Assignments" },
  { id: "collab", label: "Collaboration" },
] as const;
type Filter = (typeof FILTERS)[number]["id"];

function matches(n: Notification, f: Filter) {
  if (f === "unread") return !n.read_at;
  if (f === "assignments") return n.category === "assignments";
  if (f === "collab") return n.category !== "assignments";
  return true;
}

/** Collapse adjacent notifications for the same task + type, keeping each record. */
export function groupNotifications(list: Notification[]) {
  const groups: Notification[][] = [];
  for (const n of list) {
    const last = groups[groups.length - 1];
    if (last && n.task_id && last[0]!.task_id === n.task_id && last[0]!.type === n.type) last.push(n);
    else groups.push([n]);
  }
  return groups;
}

export function useOpenNotification() {
  const { open } = useTaskPanel();
  const navigate = useNavigate();
  const qc = useQueryClient();
  return async (ns: Notification[]) => {
    const unread = ns.filter((n) => !n.read_at).map((n) => n.id);
    if (unread.length) {
      await supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", unread);
      qc.invalidateQueries({ queryKey: ["notifications"] });
    }
    const n = ns[0]!;
    if (n.task_id) open(n.task_id);
    else if (n.project_id) navigate({ to: "/projects/$projectId", params: { projectId: n.project_id } });
  };
}

export function NotificationList({ onNavigate }: { onNavigate?: () => void }) {
  const { data = [], isLoading, isError, refetch } = useQuery(notificationsQuery);
  const { byId } = useTeamMap();
  const qc = useQueryClient();
  const openN = useOpenNotification();
  const [filter, setFilter] = useState<Filter>("all");
  const groups = useMemo(() => groupNotifications(data.filter((n) => matches(n, filter))), [data, filter]);
  const unread = data.filter((n) => !n.read_at).length;
  const refresh = () => qc.invalidateQueries({ queryKey: ["notifications"] });

  async function markAll() {
    const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
    if (error) toast.error(error.message);
    refresh();
  }
  async function setRead(ids: string[], read: boolean) {
    await supabase.from("notifications").update({ read_at: read ? new Date().toISOString() : null }).in("id", ids);
    refresh();
  }
  async function dismiss(ids: string[]) {
    await supabase.from("notifications").update({ dismissed_at: new Date().toISOString(), read_at: new Date().toISOString() }).in("id", ids);
    refresh();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-1.5 pb-3">
        {FILTERS.map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)} className={cn("rounded-full px-3 py-1 text-xs font-medium transition", filter === f.id ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground")}>
            {f.label}{f.id === "unread" && unread > 0 ? ` · ${unread}` : ""}
          </button>
        ))}
        {unread > 0 && (
          <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs" onClick={markAll}><CheckCheck className="h-3.5 w-3.5" /> Mark all read</Button>
        )}
      </div>
      {isLoading ? (
        <div className="flex justify-center py-10 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : isError ? (
        <div className="py-10 text-center text-sm text-muted-foreground">Couldn't load notifications. <button className="text-primary underline" onClick={() => refetch()}>Retry</button></div>
      ) : groups.length === 0 ? (
        <EmptyState icon={<Bell />} title={filter === "unread" ? "You're all caught up" : "No notifications"} body="Assignments, comments, mentions and status updates from teammates show up here." />
      ) : (
        <ul className="divide-y divide-border overflow-y-auto rounded-2xl border border-border bg-card">
          {groups.map((g) => {
            const n = g[0]!;
            const ids = g.map((x) => x.id);
            const isUnread = g.some((x) => !x.read_at);
            return (
              <li key={n.id} className={cn("group relative flex items-start gap-3 px-4 py-3 transition hover:bg-muted/60", isUnread && "bg-primary-soft/40")}>
                <button className="flex min-w-0 flex-1 items-start gap-3 text-left" onClick={() => { openN(g); onNavigate?.(); }}>
                  <PersonAvatar person={n.actor_id ? byId.get(n.actor_id) : null} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{n.message}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {relTime(n.created_at)}
                      {g.length > 1 && <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold">+{g.length - 1} more</span>}
                    </p>
                  </div>
                </button>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button aria-label={isUnread ? "Mark as read" : "Mark as unread"} title={isUnread ? "Mark as read" : "Mark as unread"} onClick={() => setRead(ids, isUnread)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                    {isUnread ? <Check className="h-4 w-4" /> : <span className="block h-2 w-2 rounded-full border border-muted-foreground" />}
                  </button>
                  <button aria-label="Dismiss" title="Dismiss" onClick={() => dismiss(ids)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
                </div>
                {isUnread && <span className="absolute left-1.5 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-primary" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function BellButton({ className }: { className?: string }) {
  const { data = [] } = useQuery(notificationsQuery);
  const unread = data.filter((n) => !n.read_at).length;
  const [open, setOpen] = useState(false);
  return (
    <>
      <button aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} onClick={() => setOpen(true)} className={cn("relative rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground", className)}>
        <Bell className="h-5 w-5" />
        {unread > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-primary px-1 text-center text-[10px] font-bold leading-[18px] text-primary-foreground">{unread > 99 ? "99+" : unread}</span>}
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
          <SheetHeader><SheetTitle>Notifications</SheetTitle></SheetHeader>
          <NotificationList onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}
