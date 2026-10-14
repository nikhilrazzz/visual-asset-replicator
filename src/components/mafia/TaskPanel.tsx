import { useLocation, useRouter } from "@tanstack/react-router";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { AtSign, Check, CheckCircle2, Circle, FolderPlus, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  activityQuery,
  commentsQuery,
  meQuery,
  personName,
  projectsQuery,
  STATUSES,
  subtasksQuery,
  taskQuery,
  useCreateTask,
  useDeleteTask,
  useLinkProject,
  useUpdateTask,
} from "@/lib/data";
import { DuePicker, PersonAvatar, PersonPicker, PriorityPicker, StatusPicker, useTeamMap } from "./bits";

const Ctx = createContext<{ open: (id: string) => void }>({ open: () => {} });
export const useTaskPanel = () => useContext(Ctx);

export function TaskPanelProvider({ children }: { children: ReactNode }) {
  const [taskId, setTaskId] = useState<string | null>(null);
  const router = useRouter();
  const flagged = useLocation({ select: (l) => !!(l.state as Record<string, unknown> | undefined)?.taskPanel });
  // Browser back closes the panel instead of leaving the page.
  useEffect(() => { if (!flagged) setTaskId(null); }, [flagged]);
  const open = (id: string) => {
    if (!flagged) router.history.push(window.location.pathname + window.location.search, { taskPanel: true });
    setTaskId(id);
  };
  const close = () => {
    if (flagged) router.history.back();
    else setTaskId(null);
  };
  return (
    <Ctx.Provider value={{ open }}>
      {children}
      <Sheet open={!!taskId} onOpenChange={(o) => !o && close()}>
        <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-xl">
          {taskId && <TaskDetail id={taskId} onClose={close} onOpen={open} />}
        </SheetContent>
      </Sheet>
    </Ctx.Provider>
  );
}

function TaskDetail({ id, onClose, onOpen }: { id: string; onClose: () => void; onOpen: (id: string) => void }) {
  const { data: task, isLoading } = useQuery(taskQuery(id));
  const update = useUpdateTask();
  const del = useDeleteTask();
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  useEffect(() => {
    if (task) { setTitle(task.title); setDesc(task.description ?? ""); }
  }, [task?.id, task?.title, task?.description]);

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  if (!task)
    return (
      <div className="p-8">
        <SheetTitle>Task unavailable</SheetTitle>
        <p className="mt-2 text-sm text-muted-foreground">It may have been deleted, or you don't have access.</p>
      </div>
    );
  const done = task.status === "done";
  const set = (patch: Record<string, unknown>) => update.mutate({ id: task.id, ...patch });

  return (
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-card/95 px-5 py-3 backdrop-blur">
        <Button size="sm" variant={done ? "secondary" : "outline"} onClick={() => set({ status: done ? "todo" : "done" })}>
          <Check className="h-4 w-4" /> {done ? "Completed" : "Mark complete"}
        </Button>
        {task.parent_id && (
          <Button size="sm" variant="ghost" onClick={() => onOpen(task.parent_id!)}>← Parent task</Button>
        )}
        <div className="flex-1" />
        <Button size="icon" variant="ghost" aria-label="Delete task" onClick={() => { if (confirm("Delete this task?")) { del.mutate(task.id); onClose(); } }}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <div className="space-y-6 px-5 py-5">
        <SheetTitle asChild>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title !== task.title && set({ title: title.trim() })}
            className="w-full bg-transparent font-display text-2xl font-semibold outline-none"
          />
        </SheetTitle>
        <dl className="grid grid-cols-[110px_1fr] items-center gap-y-3 text-sm">
          <dt className="text-muted-foreground">Assignee</dt>
          <dd><PersonPicker value={task.assignee_id} onChange={(v) => set({ assignee_id: v })} /></dd>
          <dt className="text-muted-foreground">Status</dt>
          <dd><StatusPicker value={task.status} onChange={(v) => set({ status: v })} /></dd>
          <dt className="text-muted-foreground">Priority</dt>
          <dd><PriorityPicker value={task.priority} onChange={(v) => set({ priority: v })} /></dd>
          <dt className="text-muted-foreground">Start date</dt>
          <dd><DuePicker value={task.start_date} onChange={(v) => set({ start_date: v })} /></dd>
          <dt className="text-muted-foreground">Due date</dt>
          <dd><DuePicker value={task.due_date} done={done} onChange={(v) => set({ due_date: v })} /></dd>
          {!task.parent_id && (
            <>
              <dt className="text-muted-foreground">Projects</dt>
              <dd><ProjectLinks taskId={task.id} linked={task.task_projects.map((p) => p.project_id)} /></dd>
            </>
          )}
        </dl>
        <div>
          <h4 className="mb-1.5 text-sm font-semibold">Description</h4>
          <Textarea
            value={desc}
            placeholder="Add more detail…"
            onChange={(e) => setDesc(e.target.value)}
            onBlur={() => desc !== (task.description ?? "") && set({ description: desc })}
            className="min-h-24"
          />
        </div>
        {!task.parent_id && <Subtasks parentId={task.id} onOpen={onOpen} />}
        <Comments taskId={task.id} />
        <Activity taskId={task.id} />
      </div>
    </div>
  );
}

function ProjectLinks({ taskId, linked }: { taskId: string; linked: string[] }) {
  const { data: projects = [] } = useQuery(projectsQuery);
  const link = useLinkProject();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {projects.filter((p) => linked.includes(p.id)).map((p) => (
        <span key={p.id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
          {p.name}
          <button aria-label={`Remove from ${p.name}`} onClick={() => link.mutate({ taskId, projectId: p.id, remove: true })}><X className="h-3 w-3" /></button>
        </span>
      ))}
      <Popover>
        <PopoverTrigger asChild>
          <button className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted"><FolderPlus className="h-3.5 w-3.5" /> Add</button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-1" align="start">
          {projects.filter((p) => !linked.includes(p.id) && !p.archived).map((p) => (
            <button key={p.id} onClick={() => link.mutate({ taskId, projectId: p.id })} className="block w-full truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted">{p.name}</button>
          ))}
          {projects.length === 0 && <p className="p-2 text-xs text-muted-foreground">No projects yet</p>}
        </PopoverContent>
      </Popover>
    </div>
  );
}

function Subtasks({ parentId, onOpen }: { parentId: string; onOpen: (id: string) => void }) {
  const { data = [] } = useQuery(subtasksQuery(parentId));
  const create = useCreateTask();
  const update = useUpdateTask();
  const [title, setTitle] = useState("");
  const doneCount = data.filter((s) => s.status === "done").length;
  return (
    <div>
      <h4 className="mb-1.5 text-sm font-semibold">Subtasks {data.length > 0 && <span className="font-normal text-muted-foreground">{doneCount}/{data.length}</span>}</h4>
      <div className="divide-y divide-border rounded-xl border border-border">
        {data.map((s) => (
          <div key={s.id} className="flex items-center gap-2 px-3 py-2 text-sm">
            <button aria-label="Toggle complete" onClick={() => update.mutate({ id: s.id, status: s.status === "done" ? "todo" : "done" })}>
              {s.status === "done" ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
            </button>
            <button className={cn("flex-1 truncate text-left", s.status === "done" && "text-muted-foreground line-through")} onClick={() => onOpen(s.id)}>{s.title}</button>
            <PersonPicker compact value={s.assignee_id} onChange={(v) => update.mutate({ id: s.id, assignee_id: v })} />
          </div>
        ))}
        <form
          className="flex items-center gap-2 px-3 py-2"
          onSubmit={(e) => { e.preventDefault(); if (!title.trim()) return; create.mutate({ title, parent_id: parentId }); setTitle(""); }}
        >
          <Plus className="h-4 w-4 text-muted-foreground" />
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a subtask" className="flex-1 bg-transparent text-sm outline-none" />
        </form>
      </div>
    </div>
  );
}

function renderBody(body: string) {
  const parts = body.split(/(@\[[^\]]*\]\([0-9a-f-]{36}\))/g);
  return parts.map((p, i) => {
    const m = p.match(/^@\[([^\]]*)\]/);
    return m ? <span key={i} className="font-semibold text-primary">@{m[1]}</span> : <span key={i}>{p}</span>;
  });
}

function Comments({ taskId }: { taskId: string }) {
  const { data = [] } = useQuery(commentsQuery(taskId));
  const { data: me } = useQuery(meQuery);
  const { byId } = useTeamMap();
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const post = useMutation({
    mutationFn: async () => {
      if (!me) throw new Error("Not signed in");
      const { error } = await supabase.from("comments").insert({ task_id: taskId, author_id: me.id, body: body.trim() });
      if (error) throw error;
    },
    onSuccess: () => { setBody(""); qc.invalidateQueries({ queryKey: ["comments", taskId] }); qc.invalidateQueries({ queryKey: ["activity", taskId] }); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold">Comments</h4>
      <div className="space-y-3">
        {data.map((c) => (
          <div key={c.id} className="flex gap-2.5">
            <PersonAvatar person={byId.get(c.author_id)} size={28} />
            <div className="min-w-0 flex-1 rounded-xl bg-muted px-3 py-2">
              <div className="text-xs"><span className="font-semibold">{personName(byId.get(c.author_id))}</span> <span className="text-muted-foreground">{formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}</span></div>
              <p className="mt-0.5 whitespace-pre-wrap text-sm">{renderBody(c.body)}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-xl border border-border bg-card p-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a comment…"
          className="min-h-16 border-0 shadow-none focus-visible:ring-0"
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && body.trim()) post.mutate(); }}
        />
        <div className="flex items-center justify-between">
          <MentionButton onPick={(name, id) => setBody((b) => `${b}${b && !b.endsWith(" ") ? " " : ""}@[${name}](${id}) `)} />
          <Button size="sm" disabled={!body.trim() || post.isPending} onClick={() => post.mutate()}>Comment</Button>
        </div>
      </div>
    </div>
  );
}

function MentionButton({ onPick }: { onPick: (name: string, id: string) => void }) {
  const { byId } = useTeamMap();
  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <AtSign className="h-3.5 w-3.5" />
      <PersonPicker value={null} placeholder="Mention" onChange={(id) => id && onPick(personName(byId.get(id)), id)} />
    </div>
  );
}

const ACTION_LABEL: Record<string, (d: Record<string, unknown>) => string> = {
  created: () => "created this task",
  commented: () => "commented",
  status_changed: (d) => `changed status to ${STATUSES.find((s) => s.value === d['to'])?.label ?? d['to']}`,
  assignee_changed: () => "changed the assignee",
  due_changed: (d) => (d['to'] ? `set due date to ${d['to']}` : "removed the due date"),
  priority_changed: (d) => `set priority to ${d['to']}`,
  renamed: () => "renamed the task",
  added_to_project: () => "added this to a project",
};

function Activity({ taskId }: { taskId: string }) {
  const { data = [] } = useQuery(activityQuery(taskId));
  const { byId } = useTeamMap();
  if (!data.length) return null;
  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold">Activity</h4>
      <ul className="space-y-1.5 text-xs text-muted-foreground">
        {data.map((a) => (
          <li key={a.id}>
            <span className="font-medium text-foreground">{personName(byId.get(a.actor_id ?? ""))}</span>{" "}
            {(ACTION_LABEL[a.action] ?? (() => a.action))(a.details as Record<string, unknown>)} ·{" "}
            {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
          </li>
        ))}
      </ul>
    </div>
  );
}
