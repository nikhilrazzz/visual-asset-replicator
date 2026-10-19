import { VoiceRecorder } from "./Voice";
import { useState } from "react";
import { CheckCircle2, Circle, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { personName, useCreateTask, useUpdateTask, type TaskPriority, type TaskStatus, type TaskWithProjects } from "@/lib/data";
import { DuePicker, PersonAvatar, PersonPicker, PriorityPicker, StatusPicker, useTeamMap } from "./bits";
import { useTaskPanel } from "./TaskPanel";

export function TaskRow({ task, showStatus = true }: { task: TaskWithProjects; showStatus?: boolean }) {
  const update = useUpdateTask();
  const { open } = useTaskPanel();
  const done = task.status === "done";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => open(task.id)}
      onKeyDown={(e) => e.key === "Enter" && open(task.id)}
      className="group flex cursor-pointer items-center gap-3 px-4 py-2.5 transition hover:bg-muted/60"
    >
      <button
        aria-label={done ? "Mark incomplete" : "Mark complete"}
        onClick={(e) => { e.stopPropagation(); update.mutate({ id: task.id, status: done ? "todo" : "done" }); }}
      >
        {done ? <CheckCircle2 className="h-[18px] w-[18px] text-success" /> : <Circle className="h-[18px] w-[18px] text-muted-foreground group-hover:text-primary" />}
      </button>
      <span className={cn("min-w-0 flex-1 truncate text-sm", done && "text-muted-foreground line-through")}>{task.title}</span>
      <div className="flex shrink-0 items-center gap-1.5">
        {showStatus && <span className="hidden sm:inline"><StatusPicker value={task.status} onChange={(s) => update.mutate({ id: task.id, status: s })} /></span>}
        <PriorityPicker value={task.priority} onChange={(p) => update.mutate({ id: task.id, priority: p })} />
        <DuePicker value={task.due_date} done={done} onChange={(d) => update.mutate({ id: task.id, due_date: d })} timeValue={task.due_time} onTimeChange={(t) => update.mutate({ id: task.id, due_time: t })} />
        <PersonPicker compact value={task.assignee_id} onChange={(a) => update.mutate({ id: task.id, assignee_id: a })} />
      </div>
    </div>
  );
}

export function QuickAdd({
  projectId,
  defaultAssignee,
  status,
  placeholder = "Add a task — press Enter",
}: {
  projectId?: string | undefined;
  defaultAssignee?: string | null | undefined;
  status?: TaskStatus | undefined;
  placeholder?: string;
}) {
  const create = useCreateTask();
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState<string | null>(defaultAssignee ?? null);
  const [due, setDue] = useState<string | null>(null);
  const [priority, setPriority] = useState<TaskPriority>("none");
  const [st, setSt] = useState<TaskStatus>(status ?? "todo");
  const [voice, setVoice] = useState<string | null>(null);
  const { team } = useTeamMap();
  const [mention, setMention] = useState<{ start: number; q: string } | null>(null);
  const matches = mention
    ? team.filter((p) => `${p.full_name ?? ""} ${p.email}`.toLowerCase().includes(mention.q)).slice(0, 6)
    : [];
  const onType = (value: string, caret: number) => {
    setTitle(value);
    const m = value.slice(0, caret).match(/(?:^|\s)@([^\s@]*)$/);
    setMention(m ? { start: caret - m[1]!.length - 1, q: m[1]!.toLowerCase() } : null);
  };
  const pick = (id: string) => {
    if (!mention) return;
    const end = mention.start + 1 + mention.q.length;
    setTitle(`${title.slice(0, mention.start)}${title.slice(end)}`.replace(/\s{2,}/g, " ").trimStart());
    setAssignee(id);
    setMention(null);
  };
  return (
    <form
      className="relative flex flex-wrap items-center gap-2 px-4 py-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        create.mutate({ title, projectId, assignee_id: assignee ?? defaultAssignee ?? null, due_date: due, status: st, priority, description: voice });
        setTitle("");
        setVoice(null);
        setDue(null);
        setPriority("none");
      }}
    >
      <Plus className="h-[18px] w-[18px] text-primary" />
      {mention && matches.length > 0 && (
        <div className="order-last w-full overflow-hidden rounded-xl border border-border bg-popover p-1">
          {matches.map((p) => (
            <button key={p.id} type="button" onMouseDown={(e) => { e.preventDefault(); pick(p.id); }} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted">
              <PersonAvatar person={p} size={24} />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{personName(p)}</div>
                <div className="truncate text-xs text-muted-foreground">{p.email}</div>
              </div>
            </button>
          ))}
        </div>
      )}
      <input value={title} onChange={(e) => onType(e.target.value, e.target.selectionStart ?? e.target.value.length)}
        onBlur={() => setTimeout(() => setMention(null), 150)}
        onKeyDown={(e) => {
          if (mention && matches.length && (e.key === "Enter" || e.key === "Tab")) { e.preventDefault(); pick(matches[0]!.id); }
          else if (e.key === "Escape") setMention(null);
        }}
        placeholder={placeholder} className="min-w-0 flex-1 basis-40 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
      <div className="flex items-center gap-1.5">
        <StatusPicker value={st} onChange={setSt} />
        <PriorityPicker value={priority} onChange={setPriority} />
        {voice ? (
          <button type="button" title="Voice note attached — tap to remove" onClick={() => setVoice(null)} className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-xs text-primary">🎤 <X className="h-3 w-3" /></button>
        ) : <VoiceRecorder onDone={setVoice} />}
        <DuePicker value={due} onChange={setDue} />
        <PersonPicker compact value={assignee ?? defaultAssignee ?? null} onChange={setAssignee} />
        <button type="submit" className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground">Add</button>
      </div>
    </form>
  );
}
