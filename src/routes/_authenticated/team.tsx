import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/mafia/AppShell";
import { PersonAvatar, useTeamMap } from "@/components/mafia/bits";
import { personName } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({
    meta: [
      { title: "Team — Mafia" },
      { name: "description", content: "The Inflooo team directory." },
      { property: "og:title", content: "Team — Mafia" },
      { property: "og:description", content: "The Inflooo team directory." },
    ],
  }),
  component: Team,
});

function Team() {
  const { team } = useTeamMap();
  const [q, setQ] = useState("");
  const list = team.filter((p) => `${p.full_name} ${p.email} ${p.title ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="mx-auto max-w-5xl pb-10">
      <PageHeader title="Team" subtitle={`${team.length} people · new teammates appear here automatically when they sign up`} />
      <div className="px-5 md:px-10">
        <div className="relative mb-4 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or email" className="pl-9" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft">
              <PersonAvatar person={p} size={44} />
              <div className="min-w-0">
                <div className="truncate font-medium">{personName(p)}</div>
                <div className="truncate text-xs text-muted-foreground">{p.title || p.email}</div>
                {p.last_seen_at && <div className="text-[11px] text-muted-foreground">Active {formatDistanceToNow(new Date(p.last_seen_at), { addSuffix: true })}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
