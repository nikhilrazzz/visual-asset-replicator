import { useEffect, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, FolderKanban, Home, LogOut, Settings, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { meQuery, notificationsQuery, personName, projectsQuery, PROJECT_COLORS } from "@/lib/data";
import { PersonAvatar } from "./bits";
import { TaskPanelProvider } from "./TaskPanel";

const NAV = [
  { to: "/home", label: "Home", icon: Home },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/inbox", label: "Inbox", icon: Bell },
  { to: "/team", label: "Team", icon: Users },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: me } = useQuery(meQuery);
  const { data: notes = [] } = useQuery(notificationsQuery);
  const { data: projects = [] } = useQuery(projectsQuery);
  const unread = notes.filter((n) => !n.read_at).length;

  useEffect(() => {
    if (!me) return;
    supabase.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", me.id).then(() => {});
    const ch = supabase
      .channel(`mafia-${me.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${me.id}` }, (p) => {
        qc.invalidateQueries({ queryKey: ["notifications"] });
        toast((p.new as { message: string }).message);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => {
        qc.invalidateQueries({ queryKey: ["tasks"] });
        qc.invalidateQueries({ queryKey: ["task"] });
        qc.invalidateQueries({ queryKey: ["subtasks"] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "comments" }, () => {
        qc.invalidateQueries({ queryKey: ["comments"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [me?.id, qc]);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <TaskPanelProvider>
      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
          <div className="flex items-center gap-2 px-5 py-5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary font-display text-lg font-bold text-primary-foreground">M</span>
            <div>
              <div className="font-display text-lg font-bold leading-none">Mafia</div>
              <div className="text-[11px] text-muted-foreground">by Inflooo</div>
            </div>
          </div>
          <nav className="space-y-0.5 px-3">
            {NAV.map((n) => (
              <Link key={n.to} to={n.to} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground" activeProps={{ className: "bg-sidebar-accent !text-foreground" }}>
                <n.icon className="h-4 w-4" /> {n.label}
                {n.to === "/inbox" && unread > 0 && <span className="ml-auto rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">{unread}</span>}
              </Link>
            ))}
          </nav>
          <div className="mt-6 px-6 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Projects</div>
          <div className="mt-1 flex-1 space-y-0.5 overflow-y-auto px-3">
            {projects.filter((p) => !p.archived).slice(0, 20).map((p) => (
              <Link key={p.id} to="/projects/$projectId" params={{ projectId: p.id }} className="flex items-center gap-2.5 truncate rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground" activeProps={{ className: "bg-sidebar-accent !text-foreground" }}>
                <span className={cn("h-2.5 w-2.5 shrink-0 rounded-[4px]", PROJECT_COLORS[p.color] ?? "bg-primary")} />
                <span className="truncate">{p.name}</span>
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-2 border-t border-sidebar-border p-3">
            <PersonAvatar person={me} size={32} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{personName(me)}</div>
              <div className="truncate text-xs text-muted-foreground">{me?.email}</div>
            </div>
            <Link to="/settings" aria-label="Settings" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"><Settings className="h-4 w-4" /></Link>
            <button aria-label="Sign out" onClick={signOut} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"><LogOut className="h-4 w-4" /></button>
          </div>
        </aside>
        <main className="min-w-0 flex-1 pb-20 md:pb-0">{children}</main>
        <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
          {[...NAV, { to: "/settings", label: "Me", icon: Settings } as const].map((n) => (
            <Link key={n.to} to={n.to} className="relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground" activeProps={{ className: "!text-primary" }}>
              <n.icon className="h-5 w-5" />
              {n.label}
              {n.to === "/inbox" && unread > 0 && <span className="absolute right-1/4 top-1 h-2 w-2 rounded-full bg-primary" />}
            </Link>
          ))}
        </nav>
      </div>
    </TaskPanelProvider>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3 px-5 pb-4 pt-8 md:px-10">
      <div>
        <h1 className="text-3xl font-bold md:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
