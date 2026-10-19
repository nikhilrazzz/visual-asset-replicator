import { useEffect, useRef, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, FolderKanban, Home, LogOut, Settings, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { meQuery, notificationsQuery, personName, projectsQuery, PROJECT_COLORS } from "@/lib/data";
import { detachDeviceOnSignOut } from "@/lib/push";
import { PersonAvatar } from "./bits";
import { TaskPanelProvider, useTaskPanel } from "./TaskPanel";
import { BellButton } from "./NotificationCenter";
import { InstallButton } from "./InstallMafia";

const NAV = [
  { to: "/home", label: "Home", icon: Home },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/inbox", label: "Inbox", icon: Bell },
  { to: "/team", label: "Team", icon: Users },
] as const;

export async function signOutEverywhere(qc: ReturnType<typeof useQueryClient>) {
  await detachDeviceOnSignOut();
  await qc.cancelQueries();
  qc.clear();
  await supabase.auth.signOut();
}

function beep() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.08, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.25);
  } catch { /* ignore */ }
}

/** Realtime subscriptions, toasts and deep links. Lives inside the task panel provider. */
function Live() {
  const qc = useQueryClient();
  const { open } = useTaskPanel();
  const navigate = useNavigate();
  const { data: me } = useQuery(meQuery);
  const seen = useRef(new Set<string>());

  // Deep link from push notifications: ?task=<id>
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const t = p.get("task");
    if (t && /^[0-9a-f-]{36}$/.test(t)) {
      open(t);
      p.delete("task");
      const qs = p.toString();
      window.history.replaceState(window.history.state, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === "open" && typeof e.data.url === "string") window.location.assign(e.data.url);
    };
    navigator.serviceWorker?.addEventListener("message", onMsg);
    return () => navigator.serviceWorker?.removeEventListener("message", onMsg);
  }, [open]);

  useEffect(() => {
    if (!me) return;
    supabase.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", me.id).then(() => {});
    const sync = () => qc.invalidateQueries({ queryKey: ["notifications"] });
    const ch = supabase
      .channel(`mafia-${me.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${me.id}` }, (p) => {
        const n = p.new as { id: string; message: string; task_id: string | null; project_id: string | null };
        sync();
        if (seen.current.has(n.id)) return;
        seen.current.add(n.id);
        const prefs = qc.getQueryData<{ sound?: boolean }>(["prefs", me.id]);
        if (prefs?.sound) beep();
        toast(n.message, {
          id: n.id,
          action: n.task_id || n.project_id ? {
            label: "Open",
            onClick: async () => {
              await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
              sync();
              if (n.task_id) open(n.task_id);
              else if (n.project_id) navigate({ to: "/projects/$projectId", params: { projectId: n.project_id } });
            },
          } : undefined,
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => {
        qc.invalidateQueries({ queryKey: ["tasks"] });
        qc.invalidateQueries({ queryKey: ["task"] });
        qc.invalidateQueries({ queryKey: ["subtasks"] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "comments" }, () => {
        qc.invalidateQueries({ queryKey: ["comments"] });
      })
      .subscribe((status) => {
        // (re)connected: pull anything missed while offline
        if (status === "SUBSCRIBED") sync();
      });
    const onVisible = () => document.visibilityState === "visible" && sync();
    window.addEventListener("online", sync);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      supabase.removeChannel(ch);
      window.removeEventListener("online", sync);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [me?.id, qc, open, navigate]);
  return null;
}

export function AppShell({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: me } = useQuery(meQuery);
  const { data: notes = [] } = useQuery(notificationsQuery);
  const { data: projects = [] } = useQuery(projectsQuery);
  const unread = notes.filter((n) => !n.read_at).length;

  async function signOut() {
    await signOutEverywhere(qc);
    navigate({ to: "/auth", replace: true });
  }

  return (
    <TaskPanelProvider>
      <Live />
      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
          <div className="flex items-center gap-2 px-5 py-5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary font-display text-lg font-bold text-primary-foreground">M</span>
            <div className="flex-1">
              <div className="font-display text-lg font-bold leading-none">Mafia</div>
              <div className="text-[11px] text-muted-foreground">by Inflooo</div>
            </div>
            <BellButton />
          </div>
          <nav className="space-y-0.5 px-3">
            {NAV.map((n) => (
              <Link key={n.to} to={n.to} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground" activeProps={{ className: "bg-sidebar-accent !text-foreground" }}>
                <n.icon className="h-4 w-4" /> {n.label}
                {n.to === "/inbox" && unread > 0 && <span className="ml-auto rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">{unread}</span>}
              </Link>
            ))}
            <InstallButton variant="sidebar" />
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
        <main className="min-w-0 flex-1 pb-20 md:pb-0">
          <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-card/95 px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur md:hidden">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary font-display text-sm font-bold text-primary-foreground">M</span>
            <span className="flex-1 font-display text-base font-bold">Mafia</span>
            <InstallButton variant="icon" />
            <BellButton />
          </header>
          {children}
        </main>
        <nav
          aria-label="Main navigation"
          className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:hidden"
        >
          <div className="pointer-events-auto flex w-[90%] max-w-[440px] items-center justify-between gap-1 rounded-full border border-white/[0.18] bg-[rgba(20,20,23,0.78)] p-2 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.75),0_4px_12px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-2xl">
            {[...NAV, { to: "/settings", label: "Me", icon: Settings } as const].map((n) => (
              <Link
                key={n.to}
                to={n.to}
                aria-label={n.label}
                className="group relative flex h-14 flex-1 items-center justify-center rounded-full text-muted-foreground transition-transform duration-200 active:scale-90"
                activeProps={{ className: "!text-primary" }}
              >
                {({ isActive }) => (
                  <>
                    <span
                      aria-hidden
                      className={cn(
                        "absolute inset-x-1 inset-y-1.5 rounded-full border border-white/10 bg-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] transition-all duration-300 ease-out motion-reduce:transition-none",
                        isActive ? "scale-100 opacity-100" : "scale-75 opacity-0",
                      )}
                    />
                    <span className="relative flex flex-col items-center gap-0.5">
                      <n.icon className={cn("h-6 w-6 transition-transform duration-200 motion-reduce:transition-none", isActive && "scale-105")} />
                      <span className={cn("text-[10px] font-medium", isActive ? "text-primary" : "text-muted-foreground/80")}>{n.label}</span>
                      {n.to === "/inbox" && unread > 0 && (
                        <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-primary ring-2 ring-[rgba(20,20,23,0.9)]" />
                      )}
                    </span>
                  </>
                )}
              </Link>
            ))}
          </div>
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
