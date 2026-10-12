import { useMemo, useState } from "react";
import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { STATUSES, useUpdateTask, type TaskStatus, type TaskWithProjects } from "@/lib/data";
import { DuePicker, PersonAvatar, PersonPicker, PriorityPicker, useTeamMap } from "./bits";
import { QuickAdd, TaskRow } from "./TaskRow";
import { useTaskPanel } from "./TaskPanel";

export function ListView({ tasks, projectId }: { tasks: TaskWithProjects[]; projectId: string }) {
  return (
    <div className="space-y-6">
      {STATUSES.map((s) => {
        const list = tasks.filter((t) => t.status === s.value);
        if (!list.length && s.value !== "todo") return null;
        return (
          <section key={s.value}>
            <h3 className="mb-2 text-sm font-semibold">{s.label} <span className="font-normal text-muted-foreground">{list.length}</span></h3>
            <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
              {list.map((t) => <TaskRow key={t.id} task={t} showStatus={false} />)}
              {s.value === "todo" && <QuickAdd projectId={projectId} />}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function BoardView({ tasks, projectId }: { tasks: TaskWithProjects[]; projectId: string }) {
  const update = useUpdateTask();
  const { open } = useTaskPanel();
  const { byId } = useTeamMap();
  const [over, setOver] = useState<TaskStatus | null>(null);
  return (
    <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-4 md:-mx-10 md:px-10">
      {STATUSES.map((s) => {
        const list = tasks.filter((t) => t.status === s.value);
        return (
          <div
            key={s.value}
            onDragOver={(e) => { e.preventDefault(); setOver(s.value); }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              const id = e.dataTransfer.getData("text/task");
              const t = tasks.find((x) => x.id === id);
              if (t && t.status !== s.value) update.mutate({ id, status: s.value });
            }}
            className={cn("flex w-72 shrink-0 flex-col rounded-2xl bg-muted/70 p-2 transition", over === s.value && "ring-2 ring-primary")}
          >
            <div className="flex items-center justify-between px-2 py-1.5">
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", s.tone)}>{s.label}</span>
              <span className="text-xs text-muted-foreground">{list.length}</span>
            </div>
            <div className="flex flex-col gap-2">
              {list.map((t) => (
                <div
                  key={t.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/task", t.id)}
                  onClick={() => open(t.id)}
                  className="cursor-grab rounded-xl border border-border bg-card p-3 shadow-soft active:cursor-grabbing"
                >
                  <p className={cn("text-sm font-medium", t.status === "done" && "text-muted-foreground line-through")}>{t.title}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <PriorityPicker value={t.priority} onChange={(p) => update.mutate({ id: t.id, priority: p })} />
                      <DuePicker value={t.due_date} done={t.status === "done"} onChange={(d) => update.mutate({ id: t.id, due_date: d })} />
                    </div>
                    <PersonPicker compact value={t.assignee_id} onChange={(a) => update.mutate({ id: t.id, assignee_id: a })} />
                  </div>
                </div>
              ))}
              <div className="rounded-xl bg-card/60"><QuickAdd projectId={projectId} status={s.value} placeholder="Add task" /></div>
            </div>
          </div>
        );
      })}
      {byId.size === 0 && null}
    </div>
  );
}

export function CalendarView({ tasks }: { tasks: TaskWithProjects[] }) {
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const { open } = useTaskPanel();
  const days = eachDayOfInterval({ start: startOfWeek(month, { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }) });
  const byDay = useMemo(() => {
    const m = new Map<string, TaskWithProjects[]>();
    for (const t of tasks) if (t.due_date) m.set(t.due_date, [...(m.get(t.due_date) ?? []), t]);
    return m;
  }, [tasks]);
  const undated = tasks.filter((t) => !t.due_date && t.status !== "done");
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <h3 className="flex-1 font-display text-xl font-semibold">{format(month, "MMMM yyyy")}</h3>
        <Button size="icon" variant="outline" aria-label="Previous month" onClick={() => setMonth(subMonths(month, 1))}><ChevronLeft className="h-4 w-4" /></Button>
        <Button size="sm" variant="outline" onClick={() => setMonth(startOfMonth(new Date()))}>Today</Button>
        <Button size="icon" variant="outline" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight className="h-4 w-4" /></Button>
      </div>
      <div className="grid grid-cols-7 overflow-hidden rounded-2xl border border-border bg-border text-xs shadow-soft [&>*]:bg-card" style={{ gap: 1 }}>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="px-2 py-1.5 font-semibold text-muted-foreground">{d}</div>)}
        {days.map((d) => {
          const key = format(d, "yyyy-MM-dd");
          const list = byDay.get(key) ?? [];
          return (
            <div key={key} className={cn("min-h-24 p-1.5", !isSameMonth(d, month) && "opacity-40")}>
              <div className={cn("mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full", isToday(d) && "bg-primary font-semibold text-primary-foreground")}>{format(d, "d")}</div>
              <div className="space-y-1">
                {list.slice(0, 3).map((t) => (
                  <button key={t.id} onClick={() => open(t.id)} className={cn("block w-full truncate rounded-md px-1.5 py-0.5 text-left", t.status === "done" ? "bg-success-soft text-success line-through" : "bg-primary-soft text-accent-foreground")}>{t.title}</button>
                ))}
                {list.length > 3 && <div className="px-1 text-muted-foreground">+{list.length - 3} more</div>}
              </div>
            </div>
          );
        })}
      </div>
      {undated.length > 0 && <p className="mt-3 text-xs text-muted-foreground">{undated.length} open tasks have no due date.</p>}
    </div>
  );
}

export function TimelineView({ tasks }: { tasks: TaskWithProjects[] }) {
  const { open } = useTaskPanel();
  const { byId } = useTeamMap();
  const dated = tasks.filter((t) => t.due_date || t.start_date);
  const today = new Date();
  const start = addDays(startOfWeek(today, { weekStartsOn: 1 }), -7);
  const days = eachDayOfInterval({ start, end: addDays(start, 41) });
  const W = 32;
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-soft">
      <div style={{ width: 220 + days.length * W }}>
        <div className="flex border-b border-border text-[10px] text-muted-foreground">
          <div className="w-[220px] shrink-0 px-3 py-2 text-xs font-semibold">Task</div>
          {days.map((d) => (
            <div key={d.toISOString()} style={{ width: W }} className={cn("shrink-0 py-2 text-center", isToday(d) && "font-bold text-primary")}>
              {format(d, "d")}<br />{format(d, "EEEEE")}
            </div>
          ))}
        </div>
        {dated.length === 0 && <p className="p-6 text-sm text-muted-foreground">Add start or due dates to tasks to see them here.</p>}
        {dated.map((t) => {
          const s = parseISO(t.start_date ?? t.due_date!);
          const e = parseISO(t.due_date ?? t.start_date!);
          const off = differenceInCalendarDays(s, start);
          const len = Math.max(1, differenceInCalendarDays(e, s) + 1);
          return (
            <div key={t.id} className="flex items-center border-b border-border last:border-0">
              <button onClick={() => open(t.id)} className="flex w-[220px] shrink-0 items-center gap-2 truncate px-3 py-2 text-left text-sm hover:text-primary">
                <PersonAvatar person={t.assignee_id ? byId.get(t.assignee_id) : null} size={20} />
                <span className="truncate">{t.title}</span>
              </button>
              <div className="relative h-9" style={{ width: days.length * W }}>
                <div className="absolute inset-y-0 border-l-2 border-primary/40" style={{ left: differenceInCalendarDays(today, start) * W + W / 2 }} />
                {off + len > 0 && off < days.length && (
                  <button
                    onClick={() => open(t.id)}
                    className={cn("absolute top-1.5 h-6 truncate rounded-md px-2 text-left text-xs font-medium", t.status === "done" ? "bg-success-soft text-success" : "bg-primary text-primary-foreground")}
                    style={{ left: Math.max(0, off) * W + 2, width: Math.min(len, days.length - Math.max(0, off)) * W - 4 }}
                  >
                    {t.title}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
