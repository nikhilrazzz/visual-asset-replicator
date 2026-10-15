import { useRouter } from "@tanstack/react-router";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ArrowLeft, AtSign, Check, CheckCircle2, Circle, FolderPlus, Plus, SmilePlus, Trash2, X } from "lucide-react";
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
  const flaggedRef = useRef(false);
  // Browser back closes the panel instead of leaving the page.
  useEffect(() => {
    const onPop = () => {
      flaggedRef.current = !!window.history.state?.taskPanel;
      if (!flaggedRef.current) setTaskId(null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const open = useCallback((id: string) => {
    if (!flaggedRef.current) {
      router.history.push(window.location.pathname + window.location.search, { taskPanel: true });
      flaggedRef.current = true;
    }
    setTaskId(id);
  }, [router]);
  const close = () => {
    if (flaggedRef.current) router.history.back();
    else setTaskId(null);
  };
  // Swipe right to close (mobile).
  const touch = useRef<{ x: number; y: number } | null>(null);
  return (
    <Ctx.Provider value={{ open }}>
      {children}
      <Sheet open={!!taskId} onOpenChange={(o) => !o && close()}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto p-0 sm:max-w-xl [&>button.absolute]:hidden"
          onTouchStart={(e) => { const t = e.touches[0]; touch.current = t ? { x: t.clientX, y: t.clientY } : null; }}
          onTouchEnd={(e) => {
            const s = touch.current; touch.current = null;
            if (!s) return;
            const t = e.changedTouches[0]; if (!t) return;
            const dx = t.clientX - s.x, dy = Math.abs(t.clientY - s.y);
            if (dx > 90 && dy < 60) close();
          }}
        >
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
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-card/95 px-3 py-3 backdrop-blur sm:px-5">
        <Button size="icon" variant="ghost" aria-label="Back" onClick={onClose}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
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

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "✅"];

function Comments({ taskId }: { taskId: string }) {
  const { data = [] } = useQuery(commentsQuery(taskId));
  const { data: me } = useQuery(meQuery);
  const { byId, team } = useTeamMap();
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [mention, setMention] = useState<{ start: number; q: string } | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const ids = data.map((c) => c.id);
  const reactionsKey = ["comment_reactions", taskId, ids.join(",")];
  const { data: reactions = [] } = useQuery({
    queryKey: reactionsKey,
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("comment_reactions").select("*").in("comment_id", ids);
      if (error) throw error;
      return data;
    },
  });
  const react = useMutation({
    mutationFn: async ({ commentId, emoji }: { commentId: string; emoji: string }) => {
      if (!me) throw new Error("Not signed in");
      const mine = reactions.find((r) => r.comment_id === commentId && r.user_id === me.id && r.emoji === emoji);
      const q = mine
        ? supabase.from("comment_reactions").delete().match({ comment_id: commentId, user_id: me.id, emoji })
        : supabase.from("comment_reactions").insert({ comment_id: commentId, user_id: me.id, emoji });
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comment_reactions", taskId] }),
    onError: (e) => toast.error(e.message),
  });
  const post = useMutation({
    mutationFn: async () => {
      if (!me) throw new Error("Not signed in");
      const { error } = await supabase.from("comments").insert({ task_id: taskId, author_id: me.id, body: body.trim() });
      if (error) throw error;
    },
    onSuccess: () => { setBody(""); qc.invalidateQueries({ queryKey: ["comments", taskId] }); qc.invalidateQueries({ queryKey: ["activity", taskId] }); },
    onError: (e) => toast.error(e.message),
  });

  const onType = (value: string, caret: number) => {
    setBody(value);
    const m = value.slice(0, caret).match(/(?:^|\s)@([^\s@\[]*)$/);
    setMention(m ? { start: caret - m[1]!.length - 1, q: m[1]!.toLowerCase() } : null);
  };
  const matches = mention
    ? team.filter((p) => `${p.full_name ?? ""} ${p.email}`.toLowerCase().includes(mention.q)).slice(0, 6)
    : [];
  const pickMention = (id: string) => {
    if (!mention) return;
    const name = personName(byId.get(id));
    const caret = mention.start + 1 + mention.q.length;
    const next = `${body.slice(0, mention.start)}@[${name}](${id}) ${body.slice(caret)}`;
    setBody(next);
    setMention(null);
    requestAnimationFrame(() => taRef.current?.focus());
  };

  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold">Comments</h4>
      <div className="space-y-3">
        {data.map((c) => {
          const rs = reactions.filter((r) => r.comment_id === c.id);
          const grouped = [...new Set(rs.map((r) => r.emoji))].map((emoji) => {
            const who = rs.filter((r) => r.emoji === emoji);
            return { emoji, count: who.length, mine: who.some((r) => r.user_id === me?.id), names: who.map((r) => personName(byId.get(r.user_id))).join(", ") };
          });
          return (
            <div key={c.id} className="flex gap-2.5">
              <PersonAvatar person={byId.get(c.author_id)} size={28} />
              <div className="min-w-0 flex-1">
                <div className="rounded-xl bg-muted px-3 py-2">
                  <div className="text-xs"><span className="font-semibold">{personName(byId.get(c.author_id))}</span> <span className="text-muted-foreground">{formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}</span></div>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm">{renderBody(c.body)}</p>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {grouped.map((g) => (
                    <button
                      key={g.emoji}
                      title={g.names}
                      onClick={() => react.mutate({ commentId: c.id, emoji: g.emoji })}
                      className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs", g.mine ? "border-primary bg-primary-soft" : "border-border bg-card")}
                    >
                      <span>{g.emoji}</span><span>{g.count}</span>
                    </button>
                  ))}
                  <Popover>
                    <PopoverTrigger asChild>
                      <button aria-label="Add reaction" className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"><SmilePlus className="h-3.5 w-3.5" /></button>
                    </PopoverTrigger>
                    <PopoverContent className="flex w-auto gap-1 rounded-full p-1.5" align="start">
                      {QUICK_EMOJIS.map((e) => (
                        <button key={e} className="rounded-full p-1 text-lg transition hover:scale-125" onClick={() => react.mutate({ commentId: c.id, emoji: e })}>{e}</button>
                      ))}
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="relative mt-3 rounded-xl border border-border bg-card p-2">
        {mention && matches.length > 0 && (
          <div className="absolute bottom-full left-0 z-20 mb-1 w-72 max-w-full overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-lg">
            {matches.map((p) => (
              <button
                key={p.id}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); pickMention(p.id); }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted"
              >
                <PersonAvatar person={p} size={24} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{personName(p)}</div>
                  <div className="truncate text-xs text-muted-foreground">{p.email}</div>
                </div>
              </button>
            ))}
          </div>
        )}
        <Textarea
          ref={taRef}
          value={body}
          onChange={(e) => onType(e.target.value, e.target.selectionStart ?? e.target.value.length)}
          onBlur={() => setTimeout(() => setMention(null), 150)}
          placeholder="Write a comment… type @ to mention"
          className="min-h-16 border-0 shadow-none focus-visible:ring-0"
          onKeyDown={(e) => {
            if (mention && matches.length && (e.key === "Enter" || e.key === "Tab")) { e.preventDefault(); pickMention(matches[0]!.id); return; }
            if (e.key === "Escape") setMention(null);
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && body.trim()) post.mutate();
          }}
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
