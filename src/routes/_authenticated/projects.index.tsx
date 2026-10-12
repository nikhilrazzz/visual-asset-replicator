import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderKanban, Lock, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/mafia/AppShell";
import { EmptyState, PersonAvatar, useTeamMap } from "@/components/mafia/bits";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { currentUserId, PROJECT_COLORS, projectsQuery } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/projects/")({
  head: () => ({
    meta: [
      { title: "Projects — Mafia" },
      { name: "description", content: "Browse and create projects across the Inflooo team." },
      { property: "og:title", content: "Projects — Mafia" },
      { property: "og:description", content: "Browse and create projects across the Inflooo team." },
    ],
  }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const { data: projects = [], isLoading } = useQuery(projectsQuery);
  const { byId } = useTeamMap();
  const [open, setOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const list = projects.filter((p) => p.archived === showArchived);
  return (
    <div className="mx-auto max-w-6xl pb-10">
      <PageHeader
        title="Projects"
        subtitle={`${projects.filter((p) => !p.archived).length} active`}
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => setShowArchived(!showArchived)}>{showArchived ? "Show active" : "Show archived"}</Button>
            <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New project</Button>
          </>
        }
      />
      <div className="px-5 md:px-10">
        {!isLoading && list.length === 0 ? (
          <EmptyState icon={<FolderKanban />} title={showArchived ? "No archived projects" : "No projects yet"} body="Create a project to start planning work with your team." action={!showArchived && <Button onClick={() => setOpen(true)}>Create project</Button>} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((p) => {
              const tasks = p.task_projects.map((tp) => tp.tasks).filter(Boolean);
              const done = tasks.filter((t) => t?.status === "done").length;
              const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
              return (
                <Link key={p.id} to="/projects/$projectId" params={{ projectId: p.id }} className="group rounded-2xl border border-border bg-card p-5 shadow-soft transition hover:-translate-y-0.5 hover:shadow-pop">
                  <div className="flex items-center gap-2">
                    <span className={cn("h-3 w-3 rounded-[4px]", PROJECT_COLORS[p.color] ?? "bg-primary")} />
                    <h3 className="flex-1 truncate font-semibold">{p.name}</h3>
                    {p.visibility === "private" && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
                  </div>
                  <p className="mt-2 line-clamp-2 min-h-10 text-sm text-muted-foreground">{p.description || "No description"}</p>
                  <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{done}/{tasks.length} tasks done</span><span>{pct}%</span>
                  </div>
                  <Progress value={pct} className="mt-1.5 h-1.5" />
                  <div className="mt-4 flex -space-x-2">
                    {p.project_members.slice(0, 6).map((m) => <span key={m.user_id} className="rounded-full ring-2 ring-card"><PersonAvatar person={byId.get(m.user_id)} size={26} /></span>)}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
      <NewProjectDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

function NewProjectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("coral");
  const [visibility, setVisibility] = useState<"team" | "private">("team");
  const create = useMutation({
    mutationFn: async () => {
      const uid = await currentUserId();
      if (!uid) throw new Error("Not signed in");
      const { data, error } = await supabase.from("projects").insert({ name: name.trim(), description, color, visibility, owner_id: uid }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      onOpenChange(false);
      setName(""); setDescription("");
      navigate({ to: "/projects/$projectId", params: { projectId: p.id } });
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>New project</DialogTitle></DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (name.trim()) create.mutate(); }}>
          <Input autoFocus placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)} required />
          <Textarea placeholder="What is this project about?" value={description} onChange={(e) => setDescription(e.target.value)} />
          <div className="flex items-center gap-2">
            {Object.entries(PROJECT_COLORS).map(([k, cls]) => (
              <button type="button" key={k} aria-label={k} onClick={() => setColor(k)} className={cn("h-7 w-7 rounded-lg", cls, color === k && "ring-2 ring-ring ring-offset-2")} />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {(["team", "private"] as const).map((v) => (
              <button type="button" key={v} onClick={() => setVisibility(v)} className={cn("rounded-xl border p-3 text-left", visibility === v ? "border-primary bg-primary-soft" : "border-border")}>
                <div className="font-medium">{v === "team" ? "Whole team" : "Private"}</div>
                <div className="text-xs text-muted-foreground">{v === "team" ? "Anyone at Inflooo can see it" : "Only invited members"}</div>
              </button>
            ))}
          </div>
          <Button type="submit" className="w-full" disabled={create.isPending}>Create project</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
