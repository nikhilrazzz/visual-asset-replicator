import { useState } from "react";
import { CheckCircle2, Circle, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCreateTask, useUpdateTask, type TaskStatus, type TaskWithProjects } from "@/lib/data";
import { DuePicker, PersonPicker, PriorityPicker, StatusPicker } from "./bits";
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
        <DuePicker value={task.due_date} done={done} onChange={(d) => update.mutate({ id: task.id, due_date: d })} />
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
  projectId?: string;
  defaultAssignee?: string | null;
  status?: TaskStatus;
  placeholder?: string;
}) {
  const create = useCreateTask();
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState<string | null>(defaultAssignee ?? null);
  const [due, setDue] = useState<string | null>(null);
  return (
    <form
      className="flex items-center gap-2 px-4 py-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        create.mutate({ title, projectId, assignee_id: assignee, due_date: due, status });
        setTitle("");
        setDue(null);
      }}
    >
      <Plus className="h-[18px] w-[18px] text-primary" />
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
      <DuePicker value={due} onChange={setDue} />
      <PersonPicker compact value={assignee} onChange={setAssignee} />
    </form>
  );
}
