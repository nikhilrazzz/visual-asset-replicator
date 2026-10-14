import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArrowLeft, CalendarDays, GanttChart, KanbanSquare, List, Lock, Trash2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { meQuery, personName, PROJECT_COLORS, projectQuery, projectTasksQuery, type ProjectRole } from "@/lib/data";
import { PersonAvatar, PersonPicker, useTeamMap } from "@/components/mafia/bits";
import { BoardView, CalendarView, ListView, TimelineView } from "@/components/mafia/Views";

export const Route = createFileRoute("/_authenticated/projects/$projectId")({
  head: () => ({
    meta: [
      { title: "Project — Mafia" },
      { name: "description", content: "Project tasks in list, board, calendar and timeline views." },
      { property: "og:title", content: "Project — Mafia" },
      { property: "og:description", content: "Project tasks in list, board, calendar and timeline views." },
    ],
  }),
  component: ProjectPage,
});

const VIEWS = [
  { id: "list", label: "List", icon: List },
  { id: "board", label: "Board", icon: KanbanSquare },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "timeline", label: "Timeline", icon: GanttChart },
] as const;

function ProjectPage() {
  const { projectId } = Route.useParams();
  const { data: project, isLoading } = useQuery(projectQuery(projectId));
  const { data: tasks = [] } = useQuery(projectTasksQuery(projectId));
  const { data: me } = useQuery(meQuery);
  const { byId } = useTeamMap();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [view, setView] = useState<(typeof VIEWS)[number]["id"]>("list");
  const [membersOpen, setMembersOpen] = useState(false);

  const archive = useMutation({
    mutationFn: async (archived: boolean) => {
      const { error } = await supabase.from("projects").update({ archived }).eq("id", projectId);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["project", projectId] }); qc.invalidateQueries({ queryKey: ["projects"] }); toast.success("Project updated"); },
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("projects").delete().eq("id", projectId);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["projects"] }); navigate({ to: "/projects" }); toast.success("Project deleted"); },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return <div className="p-10 text-sm text-muted-foreground">Loading…</div>;
  if (!project)
    return (
      <div className="p-10">
        <h1 className="text-2xl font-bold">Project not found</h1>
        <p className="mt-1 text-sm text-muted-foreground">It may be private or deleted.</p>
        <Link to="/projects" className="mt-4 inline-block text-sm text-primary">Back to projects</Link>
      </div>
    );

  const isOwner = project.owner_id === me?.id || project.project_members.some((m) => m.user_id === me?.id && m.role === "owner");
  const done = tasks.filter((t) => t.status === "done").length;

  return (
    <div className="pb-10">
      <header className="px-5 pt-8 md:px-10">
        <Link to="/projects" className="mb-3 inline-flex items-center gap-1 rounded-md py-1 pr-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Projects
        </Link>
        <div className="flex flex-wrap items-start gap-3">
          <span className={cn("mt-2 h-4 w-4 rounded-md", PROJECT_COLORS[project.color] ?? "bg-primary")} />
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 text-3xl font-bold md:text-4xl">
              {project.name} {project.visibility === "private" && <Lock className="h-5 w-5 text-muted-foreground" />}
              {project.archived && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Archived</span>}
            </h1>
            {project.description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{project.description}</p>}
            <p className="mt-1 text-xs text-muted-foreground">{done}/{tasks.length} tasks complete</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setMembersOpen(true)} className="flex -space-x-2 rounded-full p-1 hover:bg-muted" aria-label="Members">
              {project.project_members.slice(0, 5).map((m) => <span key={m.user_id} className="rounded-full ring-2 ring-background"><PersonAvatar person={byId.get(m.user_id)} size={28} /></span>)}
            </button>
            <Button size="sm" variant="outline" onClick={() => setMembersOpen(true)}><Users className="h-4 w-4" /> Share</Button>
            <Button size="icon" variant="ghost" aria-label={project.archived ? "Unarchive" : "Archive"} onClick={() => archive.mutate(!project.archived)}><Archive className="h-4 w-4" /></Button>
            {isOwner && <Button size="icon" variant="ghost" aria-label="Delete project" onClick={() => confirm("Delete this project? Tasks only in this project stay accessible to their assignees.") && remove.mutate()}><Trash2 className="h-4 w-4" /></Button>}
          </div>
        </div>
        <div className="mt-6 flex gap-1 border-b border-border">
          {VIEWS.map((v) => (
            <button key={v.id} onClick={() => setView(v.id)} className={cn("-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition", view === v.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
              <v.icon className="h-4 w-4" /> {v.label}
            </button>
          ))}
        </div>
      </header>
      <div className="px-5 pt-6 md:px-10">
        {view === "list" && <ListView tasks={tasks} projectId={projectId} />}
        {view === "board" && <BoardView tasks={tasks} projectId={projectId} />}
        {view === "calendar" && <CalendarView tasks={tasks} />}
        {view === "timeline" && <TimelineView tasks={tasks} />}
      </div>
      <MembersDialog open={membersOpen} onOpenChange={setMembersOpen} projectId={projectId} members={project.project_members} canManage={isOwner} />
    </div>
  );
}

function MembersDialog({ open, onOpenChange, projectId, members, canManage }: { open: boolean; onOpenChange: (o: boolean) => void; projectId: string; members: { user_id: string; role: ProjectRole }[]; canManage: boolean }) {
  const qc = useQueryClient();
  const { byId } = useTeamMap();
  const refresh = () => { qc.invalidateQueries({ queryKey: ["project", projectId] }); qc.invalidateQueries({ queryKey: ["projects"] }); };
  const run = async (p: PromiseLike<{ error: { message: string } | null }>) => { const { error } = await p; if (error) toast.error(error.message); else refresh(); };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Project members</DialogTitle></DialogHeader>
        {canManage && (
          <div className="flex items-center gap-2 rounded-xl bg-muted p-3 text-sm">
            <UserPlus className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1 text-muted-foreground">Add a teammate</span>
            <PersonPicker value={null} placeholder="Choose" exclude={members.map((m) => m.user_id)} onChange={(id) => id && run(supabase.from("project_members").insert({ project_id: projectId, user_id: id, role: "editor" }))} />
          </div>
        )}
        <ul className="divide-y divide-border">
          {members.map((m) => {
            const p = byId.get(m.user_id);
            return (
              <li key={m.user_id} className="flex items-center gap-3 py-2.5">
                <PersonAvatar person={p} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{personName(p)}</div>
                  <div className="truncate text-xs text-muted-foreground">{p?.email}</div>
                </div>
                {canManage && m.role !== "owner" ? (
                  <>
                    <select value={m.role} onChange={(e) => run(supabase.from("project_members").update({ role: e.target.value as ProjectRole }).eq("project_id", projectId).eq("user_id", m.user_id))} className="rounded-md border border-border bg-card px-2 py-1 text-xs">
                      {(["owner", "editor", "commenter", "viewer"] as const).map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <button className="text-xs text-muted-foreground hover:text-destructive" onClick={() => run(supabase.from("project_members").delete().eq("project_id", projectId).eq("user_id", m.user_id))}>Remove</button>
                  </>
                ) : (
                  <span className="text-xs capitalize text-muted-foreground">{m.role}</span>
                )}
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
