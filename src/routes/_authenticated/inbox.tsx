import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/mafia/AppShell";
import { EmptyState, PersonAvatar, useTeamMap } from "@/components/mafia/bits";
import { useTaskPanel } from "@/components/mafia/TaskPanel";
import { notificationsQuery } from "@/lib/data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/inbox")({
  head: () => ({
    meta: [
      { title: "Inbox — Mafia" },
      { name: "description", content: "Assignments, mentions and updates from your teammates." },
      { property: "og:title", content: "Inbox — Mafia" },
      { property: "og:description", content: "Assignments, mentions and updates from your teammates." },
    ],
  }),
  component: Inbox,
});

function Inbox() {
  const { data = [] } = useQuery(notificationsQuery);
  const { byId } = useTeamMap();
  const { open } = useTaskPanel();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const unread = data.filter((n) => !n.read_at);
  const refresh = () => qc.invalidateQueries({ queryKey: ["notifications"] });
  async function markAll() {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
    refresh();
  }
  return (
    <div className="mx-auto max-w-3xl pb-10">
      <PageHeader title="Inbox" subtitle={`${unread.length} unread`} actions={unread.length > 0 && <Button variant="outline" size="sm" onClick={markAll}>Mark all read</Button>} />
      <div className="px-5 md:px-10">
        {data.length === 0 ? (
          <EmptyState icon={<Bell />} title="No notifications" body="When teammates assign you work, mention you, or comment on your tasks, it shows up here." />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
            {data.map((n) => (
              <li key={n.id}>
                <button
                  className={cn("flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-muted/60", !n.read_at && "bg-primary-soft/40")}
                  onClick={async () => {
                    if (!n.read_at) { await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id); refresh(); }
                    if (n.task_id) open(n.task_id);
                    else if (n.project_id) navigate({ to: "/projects/$projectId", params: { projectId: n.project_id } });
                  }}
                >
                  <PersonAvatar person={n.actor_id ? byId.get(n.actor_id) : null} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{n.message}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</p>
                  </div>
                  {!n.read_at && <span className="mt-2 h-2 w-2 rounded-full bg-primary" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
